import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApiClient } from './api'
import {
  parseAvatarSession,
  parseGroundingSummary,
  pcm16ToFloat32,
  RESPONSE_AUDIO_SAMPLE_RATE,
  summarizePcm16,
  VOICE_LIVE_PATH,
  VoiceLiveConnection,
  voiceLiveSocketUrl,
} from './voiceLive'

describe('Voice Live signaling', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses a same-origin secure WebSocket in production', () => {
    expect(
      voiceLiveSocketUrl({ protocol: 'https:', host: 'app.example.test' }),
    ).toBe('wss://app.example.test/api/voice-live')
    expect(VOICE_LIVE_PATH).toBe('/api/voice-live')
  })

  it('converts Voice Live PCM16 into normalized browser audio samples', () => {
    const pcm = Int16Array.from([-32768, -16384, 0, 16384, 32767])
    const samples = pcm16ToFloat32(pcm.buffer)

    expect(RESPONSE_AUDIO_SAMPLE_RATE).toBe(24_000)
    expect([...samples]).toEqual([-1, -0.5, 0, 0.5, 32767 / 32768])
  })

  it('accepts only bounded public RAG source metadata', () => {
    const grounding = parseGroundingSummary({
      mode: 'synthetic-local',
      datasetId: 'avatar-gpt-realtime-synthetic-v1',
      queryBasis: 'scenario',
      sources: [
        { id: 'REF-SCN001-001', title: 'Naming fear before explaining next steps' },
        { id: 'REF-SCN001-002', title: 'Generic reassurance leaves the concern unanswered' },
        { id: 'REF-SCN001-003', title: 'Repairing prognosis and palliative jargon' },
        { id: 'REF-SCN001-004', title: 'Must be dropped' },
      ],
      rawTranscript: 'must not be retained',
    })

    expect(grounding?.sources).toHaveLength(3)
    expect(grounding?.sources[0]).toEqual({
      id: 'REF-SCN001-001',
      title: 'Naming fear before explaining next steps',
    })
    expect(grounding).not.toHaveProperty('rawTranscript')
    expect(parseGroundingSummary({ mode: 'other', sources: [] })).toBeUndefined()
  })

  it('accepts only bounded WebRTC ICE server metadata', () => {
    const avatar = parseAvatarSession({
      enabled: true,
      iceServers: [
        {
          urls: ['turn:relay.example.test:3478', 'https://not-an-ice-server.test'],
          username: 'avatar-user',
          credential: 'avatar-credential',
        },
        { urls: ['stun:stun.example.test:3478'] },
      ],
    })

    expect(avatar).toEqual({
      iceServers: [
        {
          urls: ['turn:relay.example.test:3478'],
          username: 'avatar-user',
          credential: 'avatar-credential',
        },
        { urls: ['stun:stun.example.test:3478'] },
      ],
    })
    expect(parseAvatarSession({ enabled: true })).toBeUndefined()
  })

  it('reduces PCM to aggregate energy without retaining samples', () => {
    const pcm = Int16Array.from([0, 16384, -16384, 32767])
    const summary = summarizePcm16(pcm.buffer)

    expect(summary.sampleCount).toBe(4)
    expect(summary.peak).toBeGreaterThan(0.99)
    expect(summary.sumSquares).toBeGreaterThan(1.4)
    expect(summary).not.toHaveProperty('samples')
  })

  it('stops queued response audio when learner speech starts after response completion', async () => {
    const dispatch = vi.fn()
    const onAudioLevel = vi.fn()
    const connection = new VoiceLiveConnection({} as ApiClient, {
      dispatch,
      onAudioLevel,
      onViseme: vi.fn(),
      onRemoteStream: vi.fn(),
      onDebugEvent: vi.fn(),
      onDeliveryObservation: vi.fn(),
    })
    const source = {
      stop: vi.fn(),
      disconnect: vi.fn(),
    } as unknown as AudioBufferSourceNode
    const harness = connection as unknown as {
      playbackSources: Set<AudioBufferSourceNode>
      processMessage: (raw: string) => Promise<void>
    }
    harness.playbackSources.add(source)

    await harness.processMessage(JSON.stringify({ type: 'speech_started', itemId: 'learner-1' }))

    expect(source.stop).toHaveBeenCalledOnce()
    expect(source.disconnect).toHaveBeenCalledOnce()
    expect(harness.playbackSources).toHaveProperty('size', 0)
    expect(onAudioLevel).toHaveBeenLastCalledWith(0)
    expect(dispatch.mock.calls.map(([event]) => event.type)).toEqual([
      'speech-started',
      'interruption-stop-latency',
    ])
  })

  it('reports response completion only after queued browser audio finishes', async () => {
    const dispatch = vi.fn()
    const onViseme = vi.fn()
    const connection = new VoiceLiveConnection({} as ApiClient, {
      dispatch,
      onAudioLevel: vi.fn(),
      onViseme,
      onRemoteStream: vi.fn(),
      onDebugEvent: vi.fn(),
      onDeliveryObservation: vi.fn(),
    })
    const source = {
      disconnect: vi.fn(),
    } as unknown as AudioBufferSourceNode
    const harness = connection as unknown as {
      activeResponseId: string | null
      playbackSources: Set<AudioBufferSourceNode>
      processMessage: (raw: string) => Promise<void>
      handlePlaybackSourceEnded: (source: AudioBufferSourceNode) => void
    }
    harness.activeResponseId = 'response-1'
    harness.playbackSources.add(source)

    await harness.processMessage(JSON.stringify({
      type: 'response_done',
      responseId: 'response-1',
    }))

    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'avatar-output-stopped',
    }))
    expect(harness.activeResponseId).toBe('response-1')

    harness.handlePlaybackSourceEnded(source)

    expect(dispatch).toHaveBeenCalledWith({
      type: 'avatar-output-stopped',
      generation: 1,
      responseId: 'response-1',
    })
    expect(harness.activeResponseId).toBeNull()
  })

  it('applies bounded viseme cues against the response playback timeline', async () => {
    const onViseme = vi.fn()
    const connection = new VoiceLiveConnection({} as ApiClient, {
      dispatch: vi.fn(),
      onAudioLevel: vi.fn(),
      onViseme,
      onRemoteStream: vi.fn(),
      onDebugEvent: vi.fn(),
      onDeliveryObservation: vi.fn(),
    })
    const harness = connection as unknown as {
      visemePlaybackStartedAt: number | null
      processMessage: (raw: string) => Promise<void>
    }
    harness.visemePlaybackStartedAt = performance.now() - 500

    await harness.processMessage(JSON.stringify({
      type: 'viseme',
      visemeId: 7,
      audioOffsetMs: 100,
      responseId: 'response-1',
    }))
    await harness.processMessage(JSON.stringify({
      type: 'viseme',
      visemeId: 99,
      audioOffsetMs: 100,
      responseId: 'response-1',
    }))

    expect(onViseme).toHaveBeenCalledOnce()
    expect(onViseme).toHaveBeenCalledWith(7)
  })

  it('negotiates avatar SDP and closes the session when the peer fails', async () => {
    const peer = Object.assign(new EventTarget(), {
      iceGatheringState: 'complete' as RTCIceGatheringState,
      connectionState: 'new' as RTCPeerConnectionState,
      localDescription: null as RTCSessionDescription | null,
      remoteDescription: null as RTCSessionDescriptionInit | null,
      addTransceiver: vi.fn(),
      createOffer: vi.fn(async () => ({ type: 'offer' as const, sdp: 'client-offer' })),
      setLocalDescription: vi.fn(async (description: RTCSessionDescriptionInit) => {
        peer.localDescription = description as RTCSessionDescription
      }),
      setRemoteDescription: vi.fn(async (description: RTCSessionDescriptionInit) => {
        peer.remoteDescription = description
      }),
      close: vi.fn(),
    })
    function FakeRTCPeerConnection() {
      return peer
    }
    vi.stubGlobal('RTCPeerConnection', FakeRTCPeerConnection)
    const dispatch = vi.fn()
    const onRemoteStream = vi.fn()
    const connection = new VoiceLiveConnection({} as ApiClient, {
      dispatch,
      onAudioLevel: vi.fn(),
      onViseme: vi.fn(),
      onRemoteStream,
      onDebugEvent: vi.fn(),
      onDeliveryObservation: vi.fn(),
    })
    const send = vi.fn()
    const socket = {
      readyState: WebSocket.OPEN,
      send,
      close: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as WebSocket
    const harness = connection as unknown as {
      socket: WebSocket
      processMessage: (raw: string) => Promise<void>
    }
    harness.socket = socket

    await harness.processMessage(JSON.stringify({
      type: 'session_started',
      sessionId: 'azure-session',
      avatar: {
        enabled: true,
        iceServers: [{ urls: ['turn:relay.example.test:3478'] }],
      },
    }))

    expect(peer.addTransceiver).toHaveBeenNthCalledWith(1, 'video', { direction: 'recvonly' })
    expect(peer.addTransceiver).toHaveBeenNthCalledWith(2, 'audio', { direction: 'recvonly' })
    const avatarConnect = JSON.parse(send.mock.calls[0][0] as string) as {
      type: string
      clientSdp: string
    }
    expect(avatarConnect.type).toBe('avatar_connect')
    expect(JSON.parse(globalThis.atob(avatarConnect.clientSdp))).toEqual({
      type: 'offer',
      sdp: 'client-offer',
    })

    const encodedServerSdp = globalThis.btoa(JSON.stringify({
      type: 'answer',
      sdp: 'server-answer',
    }))
    await harness.processMessage(JSON.stringify({
      type: 'avatar_answer',
      serverSdp: encodedServerSdp,
    }))

    expect(peer.remoteDescription).toEqual({ type: 'answer', sdp: 'server-answer' })
    expect(JSON.parse(send.mock.calls[1][0] as string)).toEqual({ type: 'client_ready' })
    expect(dispatch).toHaveBeenCalledWith({
      type: 'connection-state',
      generation: 1,
      status: 'listening',
    })

    peer.connectionState = 'failed'
    peer.dispatchEvent(new Event('connectionstatechange'))

    await vi.waitFor(() => expect(peer.close).toHaveBeenCalledOnce())
    expect(send).toHaveBeenLastCalledWith(JSON.stringify({ type: 'stop_session' }))
    expect(socket.close).toHaveBeenCalledWith(1000)
    expect(peer.close).toHaveBeenCalledOnce()
    expect(onRemoteStream).toHaveBeenLastCalledWith(null)
  })
})