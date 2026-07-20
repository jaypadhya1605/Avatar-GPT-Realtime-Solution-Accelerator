import type { ApiClient } from './api'
import type { ProtocolEvent } from './protocol'
import type {
  Difficulty,
  GroundingSummary,
  LearnerDeliveryObservation,
  LiveSessionMetadata,
  Scenario,
} from './types'

export const VOICE_LIVE_PATH = '/api/voice-live'

export const voiceLiveSocketUrl = (location: { protocol: string; host: string }) =>
  `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${VOICE_LIVE_PATH}`

export const RESPONSE_AUDIO_SAMPLE_RATE = 24_000

export const pcm16ToFloat32 = (buffer: ArrayBuffer): Float32Array => {
  const view = new DataView(buffer)
  const samples = new Float32Array(Math.floor(buffer.byteLength / 2))
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = view.getInt16(index * 2, true) / 32768
  }
  return samples
}

interface ConnectionCallbacks {
  dispatch: (event: ProtocolEvent) => void
  onAudioLevel: (level: number) => void
  onViseme: (visemeId: number) => void
  onRemoteStream: (stream: MediaStream | null) => void
  onDebugEvent: (eventName: string) => void
  onDeliveryObservation: (observation: LearnerDeliveryObservation) => void
}

type VoiceLiveMessage = Record<string, unknown> & { type?: string }

interface VisemeCue {
  visemeId: number
  audioOffsetMs: number
  responseId: string
}

const boundedString = (value: unknown, maximum = 4000) =>
  typeof value === 'string' ? value.slice(0, maximum) : ''

interface AvatarSessionConfig {
  iceServers: RTCIceServer[]
}

export const parseAvatarSession = (value: unknown): AvatarSessionConfig | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Record<string, unknown>
  if (candidate.enabled !== true || !Array.isArray(candidate.iceServers)) return undefined
  const iceServers = candidate.iceServers.slice(0, 8).flatMap((server) => {
    if (!server || typeof server !== 'object') return []
    const item = server as Record<string, unknown>
    const rawUrls = typeof item.urls === 'string'
      ? [item.urls]
      : Array.isArray(item.urls)
        ? item.urls
        : []
    const urls = rawUrls.slice(0, 8).filter(
      (url): url is string =>
        typeof url === 'string'
        && url.length <= 2048
        && /^(stun|stuns|turn|turns):/.test(url),
    )
    if (!urls.length) return []
    const parsed: RTCIceServer = { urls }
    const username = boundedString(item.username, 1024)
    const credential = boundedString(item.credential, 2048)
    if (username) parsed.username = username
    if (credential) parsed.credential = credential
    return [parsed]
  })
  return { iceServers }
}

interface PcmSummary {
  sumSquares: number
  sampleCount: number
  peak: number
}

export const summarizePcm16 = (buffer: ArrayBuffer): PcmSummary => {
  const samples = new Int16Array(buffer)
  let sumSquares = 0
  let peak = 0
  for (const sample of samples) {
    const normalized = sample / 32768
    sumSquares += normalized * normalized
    peak = Math.max(peak, Math.abs(normalized))
  }
  return { sumSquares, sampleCount: samples.length, peak }
}

const toDbfs = (amplitude: number) =>
  amplitude > 0 ? Math.max(-96, 20 * Math.log10(amplitude)) : null

export const parseGroundingSummary = (value: unknown): GroundingSummary | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Record<string, unknown>
  const mode = boundedString(candidate.mode, 40)
  const datasetId = boundedString(candidate.datasetId, 120)
  const queryBasis = boundedString(candidate.queryBasis, 40)
  if (
    mode !== 'synthetic-local' ||
    !datasetId ||
    (queryBasis !== 'scenario' && queryBasis !== 'learner-turns') ||
    !Array.isArray(candidate.sources)
  ) return undefined
  const sources = candidate.sources.slice(0, 3).flatMap((source) => {
    if (!source || typeof source !== 'object') return []
    const item = source as Record<string, unknown>
    const id = boundedString(item.id, 80)
    const title = boundedString(item.title, 160)
    return id && title ? [{ id, title }] : []
  })
  return { mode, datasetId, queryBasis, sources }
}

export class VoiceLiveConnection {
  private readonly api: ApiClient
  private readonly callbacks: ConnectionCallbacks
  private socket: WebSocket | null = null
  private avatarPeer: RTCPeerConnection | null = null
  private avatarRemoteStream: MediaStream | null = null
  private avatarEnabled = false
  private localStream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private audioSource: MediaStreamAudioSourceNode | null = null
  private worklet: AudioWorkletNode | null = null
  private silentGain: GainNode | null = null
  private playbackGain: GainNode | null = null
  private playbackCursor = 0
  private readonly playbackSources = new Set<AudioBufferSourceNode>()
  private session: LiveSessionMetadata | null = null
  private readyResolve: ((session: LiveSessionMetadata) => void) | null = null
  private readyReject: ((error: Error) => void) | null = null
  private readyTimer: number | null = null
  private activeLearnerId: string | null = null
  private activeResponseId: string | null = null
  private pendingOutputStopId: string | null = null
  private interruptedResponseIds = new Set<string>()
  private assistantItems = new Set<string>()
  private sequence = 0
  private generation = 1
  private muted = false
  private readySent = false
  private closed = false
  private pendingResponseAudioAt: number | null = null
  private pendingResponseSignalAt: number | null = null
  private visemePlaybackStartedAt: number | null = null
  private visemeResponseId: string | null = null
  private readonly pendingVisemes: VisemeCue[] = []
  private readonly visemeTimers = new Set<number>()
  private activeDelivery: {
    itemId: string
    startedAt: number
    sumSquares: number
    sampleCount: number
    peak: number
  } | null = null

  constructor(api: ApiClient, callbacks: ConnectionCallbacks) {
    this.api = api
    this.callbacks = callbacks
  }

  async connect(
    scenario: Scenario,
    difficulty: Difficulty,
  ): Promise<LiveSessionMetadata> {
    this.closed = false
    this.callbacks.dispatch({
      type: 'connection-state',
      generation: this.generation,
      status: 'preparing',
    })
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    for (const track of this.localStream.getAudioTracks()) track.enabled = false

    this.callbacks.dispatch({
      type: 'connection-state',
      generation: this.generation,
      status: 'connecting',
    })
    const socket = new WebSocket(voiceLiveSocketUrl(window.location))
    socket.binaryType = 'arraybuffer'
    this.socket = socket
    socket.addEventListener('message', this.handleSocketMessage)
    socket.addEventListener('close', this.handleSocketClose)
    socket.addEventListener('error', this.handleSocketError)
    await this.waitForSocket(socket)

    const ready = new Promise<LiveSessionMetadata>((resolve, reject) => {
      this.readyResolve = resolve
      this.readyReject = reject
      this.readyTimer = window.setTimeout(
        () => this.fail(new Error('The Azure voice session took too long to connect.')),
        45_000,
      )
    })
    socket.send(
      JSON.stringify({
        type: 'start_session',
        scenarioId: scenario.id,
        scenarioVersion: scenario.version,
        difficulty,
      }),
    )
    return ready
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    if (!this.readySent) return
    for (const track of this.localStream?.getAudioTracks() ?? []) track.enabled = !muted
  }

  releaseForNavigation(): void {
    void this.close()
    void this.api.resetVoiceSession(true)
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: 'stop_session' }))
      this.socket.close(1000)
    }
    this.socket?.removeEventListener('message', this.handleSocketMessage)
    this.socket?.removeEventListener('close', this.handleSocketClose)
    this.socket?.removeEventListener('error', this.handleSocketError)
    this.socket = null
    this.closeAvatarMedia()
    if (this.readyTimer !== null) window.clearTimeout(this.readyTimer)
    this.readyTimer = null
    this.readyReject?.(new Error('Voice session closed.'))
    this.readyResolve = null
    this.readyReject = null

    this.worklet?.disconnect()
    if (this.worklet) this.worklet.port.onmessage = null
    this.worklet = null
    this.audioSource?.disconnect()
    this.audioSource = null
    this.silentGain?.disconnect()
    this.silentGain = null
    this.stopResponseAudio()
    this.playbackGain?.disconnect()
    this.playbackGain = null
    if (this.audioContext && this.audioContext.state !== 'closed') await this.audioContext.close()
    this.audioContext = null
    for (const track of this.localStream?.getTracks() ?? []) track.stop()
    this.localStream = null
    this.callbacks.onAudioLevel(0)
    this.resetVisemes()
    this.activeDelivery = null
    this.pendingResponseAudioAt = null
    this.pendingResponseSignalAt = null
    this.pendingOutputStopId = null
    this.interruptedResponseIds.clear()
    this.generation += 1
  }

  private async waitForSocket(socket: WebSocket): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const opened = () => {
        socket.removeEventListener('error', failed)
        resolve()
      }
      const failed = () => {
        socket.removeEventListener('open', opened)
        reject(new Error('The secure voice connection could not open.'))
      }
      socket.addEventListener('open', opened, { once: true })
      socket.addEventListener('error', failed, { once: true })
    })
  }

  private readonly handleSocketMessage = (event: MessageEvent) => {
    if (event.data instanceof ArrayBuffer) {
      if (!this.avatarEnabled) this.playResponseAudio(event.data)
      return
    }
    if (event.data instanceof Blob) {
      if (this.avatarEnabled) return
      void event.data
        .arrayBuffer()
        .then((buffer) => this.playResponseAudio(buffer))
        .catch(() => this.fail(new Error('The Azure voice audio could not be read.')))
      return
    }
    if (typeof event.data !== 'string' || event.data.length > 128_000) return
    void this.processMessage(event.data).catch((error: unknown) => {
      this.fail(error instanceof Error ? error : new Error('Invalid avatar response.'))
    })
  }

  private async processMessage(raw: string): Promise<void> {
    const message = JSON.parse(raw) as VoiceLiveMessage
    const messageType = boundedString(message.type, 120)
    if (!messageType) return
    this.callbacks.onDebugEvent(`voice-live.${messageType}`)

    if (messageType === 'session_started') {
      const avatarRequested = Boolean(
        message.avatar
        && typeof message.avatar === 'object'
        && (message.avatar as Record<string, unknown>).enabled === true,
      )
      const avatar = parseAvatarSession(message.avatar)
      if (avatarRequested && !avatar) throw new Error('The avatar connection details were invalid.')
      this.avatarEnabled = Boolean(avatar)
      this.session = {
        sessionId: boundedString(message.sessionId, 160),
        modelDeployment: boundedString(message.model, 160) || 'gpt-realtime-1.5',
        transcriptionDeployment:
          boundedString(message.transcriptionModel, 160) || 'azure-speech',
        avatarOutput: avatar ? 'webrtc' : 'viseme',
        grounding: parseGroundingSummary(message.grounding),
      }
      if (avatar) await this.startAvatarConnection(avatar)
      else await this.completeConnection()
    } else if (messageType === 'avatar_answer') {
      await this.acceptAvatarAnswer(message)
    } else if (messageType === 'speech_started') {
      this.sequence += 1
      this.activeLearnerId =
        boundedString(message.itemId, 160) || `voice-live-learner-${this.sequence}`
      this.activeDelivery = {
        itemId: this.activeLearnerId,
        startedAt: performance.now(),
        sumSquares: 0,
        sampleCount: 0,
        peak: 0,
      }
      this.callbacks.dispatch({
        type: 'speech-started',
        generation: this.generation,
        itemId: this.activeLearnerId,
      })
      if (this.playbackSources.size > 0) {
        const interruptionStartedAt = performance.now()
        const interruptedResponseId = this.activeResponseId || this.pendingOutputStopId
        this.stopResponseAudio()
        if (interruptedResponseId) {
          this.rememberInterruptedResponse(interruptedResponseId)
          if (this.activeResponseId === interruptedResponseId) this.activeResponseId = null
          if (this.pendingOutputStopId === interruptedResponseId) this.pendingOutputStopId = null
        }
        this.callbacks.dispatch({
          type: 'interruption-stop-latency',
          generation: this.generation,
          valueMs: performance.now() - interruptionStartedAt,
        })
      }
    } else if (messageType === 'speech_stopped') {
      const itemId =
        this.activeLearnerId ||
        boundedString(message.itemId, 160) ||
        `voice-live-learner-${this.sequence}`
      this.callbacks.dispatch({
        type: 'speech-stopped',
        generation: this.generation,
        itemId,
      })
      this.finishDeliveryObservation(itemId)
      this.pendingResponseAudioAt = performance.now()
      this.pendingResponseSignalAt = this.pendingResponseAudioAt
    } else if (messageType === 'transcript_done' && message.role === 'user') {
      const itemId =
        this.activeLearnerId ||
        boundedString(message.itemId, 160) ||
        `voice-live-learner-${this.sequence}`
      this.callbacks.dispatch({
        type: 'learner-transcript',
        generation: this.generation,
        itemId,
        transcript: boundedString(message.transcript),
      })
      this.activeLearnerId = null
    } else if (messageType === 'transcript_delta' && message.role === 'assistant') {
      this.relayAssistantTranscript(message)
    } else if (messageType === 'transcript_done' && message.role === 'assistant') {
      const itemId = boundedString(message.itemId, 160)
      if (itemId && !this.assistantItems.has(itemId)) {
        this.relayAssistantTranscript({ ...message, delta: message.transcript })
      }
    } else if (messageType === 'viseme') {
      this.queueViseme(message)
    } else if (messageType === 'response_done') {
      const responseId = boundedString(message.responseId, 160) || this.activeResponseId
      if (responseId && this.interruptedResponseIds.delete(responseId)) {
        return
      }
      if (responseId && this.playbackSources.size > 0) {
        this.pendingOutputStopId = responseId
      } else {
        this.finishResponseOutput(responseId)
      }
    } else if (messageType === 'session_error') {
      throw new Error(boundedString(message.error) || 'The Azure voice session failed.')
    }
  }

  private relayAssistantTranscript(message: VoiceLiveMessage): void {
    this.sequence += 1
    const responseId =
      boundedString(message.responseId, 160) ||
      this.activeResponseId ||
      `voice-live-response-${this.sequence}`
    const itemId =
      boundedString(message.itemId, 160) || `voice-live-avatar-${this.sequence}`
    this.assistantItems.add(itemId)
    if (this.activeResponseId !== responseId && this.pendingResponseSignalAt !== null) {
      this.callbacks.dispatch({
        type: 'response-signal-latency',
        generation: this.generation,
        valueMs: performance.now() - this.pendingResponseSignalAt,
      })
      this.pendingResponseSignalAt = null
    }
    this.callbacks.dispatch({
      type: 'avatar-transcript-delta',
      generation: this.generation,
      itemId,
      responseId,
      delta: boundedString(message.delta),
    })
    if (this.activeResponseId !== responseId) {
      this.activeResponseId = responseId
      this.callbacks.dispatch({
        type: 'avatar-output-started',
        generation: this.generation,
        responseId,
      })
    }
  }

  private async completeConnection(): Promise<void> {
    if (this.readySent || this.closed) return
    this.readySent = true
    await this.startAudioCapture()
    for (const track of this.localStream?.getAudioTracks() ?? []) track.enabled = !this.muted
    if (this.socket?.readyState !== WebSocket.OPEN) {
      throw new Error('The secure voice connection closed during audio setup.')
    }
    this.socket.send(JSON.stringify({ type: 'client_ready' }))
    this.callbacks.dispatch({
      type: 'connection-state',
      generation: this.generation,
      status: 'listening',
    })
    const session = this.session ?? {
      sessionId: 'voice-live',
      modelDeployment: 'gpt-realtime-1.5',
      transcriptionDeployment: 'azure-speech',
      avatarOutput: 'viseme',
    }
    if (this.readyTimer !== null) window.clearTimeout(this.readyTimer)
    this.readyTimer = null
    this.readyResolve?.(session)
    this.readyResolve = null
    this.readyReject = null
  }

  private async startAudioCapture(): Promise<void> {
    if (!this.localStream || this.audioContext) return
    const context = new AudioContext()
    this.audioContext = context
    await context.audioWorklet.addModule('/pcm-capture-worklet.js')
    const source = context.createMediaStreamSource(this.localStream)
    const worklet = new AudioWorkletNode(context, 'pcm16-capture')
    const silentGain = context.createGain()
    const playbackGain = this.avatarEnabled ? null : context.createGain()
    silentGain.gain.value = 0
    source.connect(worklet)
    worklet.connect(silentGain)
    silentGain.connect(context.destination)
    playbackGain?.connect(context.destination)
    worklet.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      this.recordPcmSummary(event.data)
      if (
        this.socket?.readyState === WebSocket.OPEN &&
        this.socket.bufferedAmount < 256_000 &&
        event.data.byteLength > 0
      ) {
        this.socket.send(event.data)
      }
    }
    this.audioSource = source
    this.worklet = worklet
    this.silentGain = silentGain
    this.playbackGain = playbackGain
    if (context.state === 'suspended') await context.resume()
  }

  private async startAvatarConnection(config: AvatarSessionConfig): Promise<void> {
    if (this.avatarPeer || this.closed) return
    const socket = this.socket
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error('The secure voice connection closed during avatar setup.')
    }
    const peer = new RTCPeerConnection({ iceServers: config.iceServers })
    this.avatarPeer = peer
    peer.addEventListener('track', this.handleAvatarTrack)
    peer.addEventListener('connectionstatechange', this.handleAvatarConnectionState)
    peer.addTransceiver('video', { direction: 'recvonly' })
    peer.addTransceiver('audio', { direction: 'recvonly' })
    const offer = await peer.createOffer()
    await peer.setLocalDescription(offer)
    await this.waitForIceGathering(peer)
    const clientSdp = peer.localDescription?.sdp
    if (!clientSdp || clientSdp.length > 65_536) {
      throw new Error('The avatar SDP offer was unavailable.')
    }
    const encodedClientSdp = globalThis.btoa(JSON.stringify({ type: 'offer', sdp: clientSdp }))
    if (encodedClientSdp.length > 65_536) {
      throw new Error('The avatar SDP offer was unavailable.')
    }
    socket.send(JSON.stringify({ type: 'avatar_connect', clientSdp: encodedClientSdp }))
  }

  private async acceptAvatarAnswer(message: VoiceLiveMessage): Promise<void> {
    const serverSdp = typeof message.serverSdp === 'string' ? message.serverSdp : ''
    if (!this.avatarEnabled || !this.avatarPeer || !serverSdp || serverSdp.length > 65_536) {
      throw new Error('The avatar SDP answer was invalid.')
    }
    const answer = JSON.parse(globalThis.atob(serverSdp)) as Record<string, unknown>
    if (
      answer.type !== 'answer'
      || typeof answer.sdp !== 'string'
      || !answer.sdp
      || answer.sdp.length > 65_536
    ) {
      throw new Error('The avatar SDP answer was invalid.')
    }
    await this.avatarPeer.setRemoteDescription({ type: 'answer', sdp: answer.sdp })
    await this.completeConnection()
  }

  private async waitForIceGathering(peer: RTCPeerConnection): Promise<void> {
    if (peer.iceGatheringState === 'complete') return
    await new Promise<void>((resolve, reject) => {
      const finished = () => {
        if (peer.iceGatheringState !== 'complete') return
        cleanup()
        resolve()
      }
      const timer = window.setTimeout(() => {
        cleanup()
        reject(new Error('The avatar connection could not gather network candidates.'))
      }, 10_000)
      const cleanup = () => {
        window.clearTimeout(timer)
        peer.removeEventListener('icegatheringstatechange', finished)
      }
      peer.addEventListener('icegatheringstatechange', finished)
    })
  }

  private readonly handleAvatarTrack = (event: RTCTrackEvent) => {
    const stream = this.avatarRemoteStream ?? new MediaStream()
    this.avatarRemoteStream = stream
    const tracks = event.streams[0]?.getTracks() ?? [event.track]
    for (const track of tracks) {
      if (!stream.getTracks().some((current) => current.id === track.id)) stream.addTrack(track)
    }
    this.callbacks.onRemoteStream(stream)
  }

  private readonly handleAvatarConnectionState = () => {
    const state = this.avatarPeer?.connectionState
    this.callbacks.onDebugEvent(`avatar-peer.${state ?? 'unknown'}`)
    if (state === 'disconnected') {
      this.callbacks.dispatch({
        type: 'connection-state',
        generation: this.generation,
        status: 'reconnecting',
      })
    } else if (state === 'failed') {
      this.fail(new Error('The Azure avatar media connection failed.'))
    }
  }

  private closeAvatarMedia(): void {
    this.avatarPeer?.removeEventListener('track', this.handleAvatarTrack)
    this.avatarPeer?.removeEventListener(
      'connectionstatechange',
      this.handleAvatarConnectionState,
    )
    this.avatarPeer?.close()
    this.avatarPeer = null
    for (const track of this.avatarRemoteStream?.getTracks() ?? []) track.stop()
    this.avatarRemoteStream = null
    this.avatarEnabled = false
    this.callbacks.onRemoteStream(null)
  }

  private playResponseAudio(buffer: ArrayBuffer): void {
    if (this.avatarEnabled) return
    const context = this.audioContext
    const output = this.playbackGain
    if (!context || !output || buffer.byteLength === 0 || buffer.byteLength % 2 !== 0) return

    const samples = pcm16ToFloat32(buffer)
    if (!samples.length) return
    const audio = context.createBuffer(1, samples.length, RESPONSE_AUDIO_SAMPLE_RATE)
    audio.getChannelData(0).set(samples)
    const source = context.createBufferSource()
    source.buffer = audio
    source.connect(output)
    const startAt = Math.max(context.currentTime + 0.015, this.playbackCursor)
    this.playbackCursor = startAt + audio.duration
    if (this.visemePlaybackStartedAt === null) {
      this.visemePlaybackStartedAt = performance.now()
        + Math.max(0, startAt - context.currentTime) * 1000
      this.flushVisemes()
    }
    this.playbackSources.add(source)
    source.addEventListener('ended', () => {
      this.handlePlaybackSourceEnded(source)
    })
    source.start(startAt)

    const summary = summarizePcm16(buffer)
    const rms = summary.sampleCount
      ? Math.sqrt(summary.sumSquares / summary.sampleCount)
      : 0
    this.callbacks.onAudioLevel(Math.min(1, rms * 4))
    if (this.pendingResponseAudioAt !== null) {
      this.callbacks.dispatch({
        type: 'response-audio-latency',
        generation: this.generation,
        valueMs: performance.now() - this.pendingResponseAudioAt,
      })
      this.pendingResponseAudioAt = null
    }
  }

  private stopResponseAudio(): void {
    for (const source of this.playbackSources) {
      try {
        source.stop()
      } catch {
        // Already stopped sources are harmless during interruption and cleanup.
      }
      source.disconnect()
    }
    this.playbackSources.clear()
    this.playbackCursor = this.audioContext?.currentTime ?? 0
    this.callbacks.onAudioLevel(0)
    this.resetVisemes()
  }

  private handlePlaybackSourceEnded(source: AudioBufferSourceNode): void {
    source.disconnect()
    this.playbackSources.delete(source)
    if (this.playbackSources.size > 0) return
    this.callbacks.onAudioLevel(0)
    this.resetVisemes()
    this.finishResponseOutput(this.pendingOutputStopId)
  }

  private queueViseme(message: VoiceLiveMessage): void {
    const visemeId = Number(message.visemeId)
    const audioOffsetMs = Number(message.audioOffsetMs)
    if (
      !Number.isInteger(visemeId) || visemeId < 0 || visemeId > 21
      || !Number.isFinite(audioOffsetMs) || audioOffsetMs < 0 || audioOffsetMs > 600_000
    ) return
    const responseId = boundedString(message.responseId, 160)
    if (this.visemeResponseId && responseId && responseId !== this.visemeResponseId) {
      this.resetVisemes()
    }
    if (!this.visemeResponseId && responseId) this.visemeResponseId = responseId
    this.pendingVisemes.push({ visemeId, audioOffsetMs, responseId })
    this.flushVisemes()
  }

  private flushVisemes(): void {
    const playbackStartedAt = this.visemePlaybackStartedAt
    if (playbackStartedAt === null) return
    for (const cue of this.pendingVisemes.splice(0)) {
      const delay = Math.max(0, playbackStartedAt + cue.audioOffsetMs - performance.now())
      if (delay === 0) {
        this.callbacks.onViseme(cue.visemeId)
        continue
      }
      const timer = window.setTimeout(() => {
        this.visemeTimers.delete(timer)
        if (
          !this.closed
          && (!cue.responseId || cue.responseId === this.visemeResponseId)
        ) this.callbacks.onViseme(cue.visemeId)
      }, delay)
      this.visemeTimers.add(timer)
    }
  }

  private resetVisemes(): void {
    for (const timer of this.visemeTimers) window.clearTimeout(timer)
    this.visemeTimers.clear()
    this.pendingVisemes.splice(0)
    this.visemePlaybackStartedAt = null
    this.visemeResponseId = null
    this.callbacks.onViseme(0)
  }

  private finishResponseOutput(responseId: string | null): void {
    if (!responseId) return
    this.callbacks.dispatch({
      type: 'avatar-output-stopped',
      generation: this.generation,
      responseId,
    })
    if (this.activeResponseId === responseId) this.activeResponseId = null
    if (this.pendingOutputStopId === responseId) this.pendingOutputStopId = null
  }

  private rememberInterruptedResponse(responseId: string): void {
    this.interruptedResponseIds.add(responseId)
    if (this.interruptedResponseIds.size <= 50) return
    const oldestResponseId = this.interruptedResponseIds.values().next().value
    if (oldestResponseId) this.interruptedResponseIds.delete(oldestResponseId)
  }

  private recordPcmSummary(buffer: ArrayBuffer): void {
    const active = this.activeDelivery
    if (!active) return
    const summary = summarizePcm16(buffer)
    active.sumSquares += summary.sumSquares
    active.sampleCount += summary.sampleCount
    active.peak = Math.max(active.peak, summary.peak)
  }

  private finishDeliveryObservation(itemId: string): void {
    const active = this.activeDelivery
    if (!active) return
    const rms = active.sampleCount
      ? Math.sqrt(active.sumSquares / active.sampleCount)
      : 0
    this.callbacks.onDeliveryObservation({
      itemId,
      durationMs: Math.max(0, Math.round(performance.now() - active.startedAt)),
      meanDbfs: toDbfs(rms),
      peakDbfs: toDbfs(active.peak),
    })
    this.activeDelivery = null
  }

  private readonly handleSocketClose = () => {
    if (!this.closed) this.fail(new Error('The secure voice connection closed.'))
  }

  private readonly handleSocketError = () => {
    if (!this.closed) this.fail(new Error('The secure voice connection failed.'))
  }

  private fail(error: Error): void {
    if (this.closed) return
    if (this.readyTimer !== null) window.clearTimeout(this.readyTimer)
    this.readyTimer = null
    this.readyReject?.(error)
    this.readyResolve = null
    this.readyReject = null
    this.callbacks.dispatch({
      type: 'connection-state',
      generation: this.generation,
      status: 'error',
    })
    void this.close()
  }
}