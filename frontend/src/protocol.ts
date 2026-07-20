import type { ConversationStatus, TranscriptSegment } from './types'

export interface ProtocolState {
  generation: number
  status: ConversationStatus
  segments: TranscriptSegment[]
  seenEventIds: string[]
  activeAvatarId: string | null
  interruptionCount: number
  interruptionHandledCount: number
  interruptionStopLatenciesMs: number[]
  pendingInterruptions: { responseId: string; stopped: boolean }[]
  transcriptionFailures: number
  responseAudioLatenciesMs: number[]
  responseSignalLatenciesMs: number[]
}

export type ProtocolEvent =
  | { type: 'speech-started'; eventId?: string; generation: number; itemId: string }
  | { type: 'speech-stopped'; eventId?: string; generation: number; itemId: string }
  | {
      type: 'learner-transcript'
      eventId?: string
      generation: number
      itemId: string
      transcript: string
    }
  | { type: 'learner-transcript-failed'; eventId?: string; generation: number; itemId: string }
  | {
      type: 'avatar-transcript-delta'
      eventId?: string
      generation: number
      itemId: string
      responseId: string
      delta: string
    }
  | { type: 'response-audio-latency'; eventId?: string; generation: number; valueMs: number }
  | { type: 'response-signal-latency'; eventId?: string; generation: number; valueMs: number }
  | {
      type: 'avatar-output-started'
      eventId?: string
      generation: number
      responseId: string
    }
  | {
      type: 'avatar-output-stopped'
      eventId?: string
      generation: number
      responseId: string
    }
  | { type: 'interruption-stop-latency'; eventId?: string; generation: number; valueMs: number }
  | { type: 'connection-state'; eventId?: string; generation: number; status: ConversationStatus }

export const initialProtocolState = (generation = 1): ProtocolState => ({
  generation,
  status: 'preparing',
  segments: [],
  seenEventIds: [],
  activeAvatarId: null,
  interruptionCount: 0,
  interruptionHandledCount: 0,
  interruptionStopLatenciesMs: [],
  pendingInterruptions: [],
  transcriptionFailures: 0,
  responseAudioLatenciesMs: [],
  responseSignalLatenciesMs: [],
})

const now = () => new Date().toISOString()

const nextSequence = (segments: TranscriptSegment[]) =>
  segments.reduce((maximum, segment) => Math.max(maximum, segment.sequence), 0) + 1

const rememberEvent = (state: ProtocolState, eventId?: string): string[] => {
  if (!eventId) return state.seenEventIds
  return [...state.seenEventIds.slice(-199), eventId]
}

const updateSegment = (
  segments: TranscriptSegment[],
  id: string,
  update: (segment: TranscriptSegment) => TranscriptSegment,
) => segments.map((segment) => (segment.id === id ? update(segment) : segment))

const ensureLearnerSegment = (segments: TranscriptSegment[], itemId: string) => {
  if (segments.some((segment) => segment.id === itemId)) return segments
  return [
    ...segments,
    {
      id: itemId,
      speaker: 'learner' as const,
      text: '',
      sequence: nextSequence(segments),
      createdAt: now(),
      playbackStatus: 'transcribing' as const,
    },
  ]
}

export function reduceProtocol(state: ProtocolState, event: ProtocolEvent): ProtocolState {
  if (event.generation !== state.generation) return state
  if (event.eventId && state.seenEventIds.includes(event.eventId)) return state

  const remembered = rememberEvent(state, event.eventId)

  if (event.type === 'connection-state') {
    return { ...state, status: event.status, seenEventIds: remembered }
  }

  if (event.type === 'speech-started') {
    let segments = ensureLearnerSegment(state.segments, event.itemId)
    let interruptionCount = state.interruptionCount
    let pendingInterruptions = state.pendingInterruptions
    if (state.activeAvatarId) {
      const interruptedSegment = segments.find(
        (segment) => segment.id === state.activeAvatarId,
      )
      segments = updateSegment(segments, state.activeAvatarId, (segment) => ({
        ...segment,
        playbackStatus: 'interrupted',
      }))
      interruptionCount += 1
      if (interruptedSegment?.responseId) {
        pendingInterruptions = [
          ...pendingInterruptions.slice(-9),
          { responseId: interruptedSegment.responseId, stopped: false },
        ]
      }
    }
    return {
      ...state,
      status: 'user-speaking',
      segments,
      activeAvatarId: null,
      interruptionCount,
      pendingInterruptions,
      seenEventIds: remembered,
    }
  }

  if (event.type === 'speech-stopped') {
    return {
      ...state,
      status: 'thinking',
      segments: ensureLearnerSegment(state.segments, event.itemId),
      seenEventIds: remembered,
    }
  }

  if (event.type === 'learner-transcript') {
    const segments = ensureLearnerSegment(state.segments, event.itemId)
    return {
      ...state,
      segments: updateSegment(segments, event.itemId, (segment) => ({
        ...segment,
        text: event.transcript.slice(0, 4000),
        playbackStatus: 'final',
      })),
      seenEventIds: remembered,
    }
  }

  if (event.type === 'learner-transcript-failed') {
    const segments = ensureLearnerSegment(state.segments, event.itemId)
    return {
      ...state,
      segments: updateSegment(segments, event.itemId, (segment) => ({
        ...segment,
        playbackStatus: 'failed',
      })),
      transcriptionFailures: state.transcriptionFailures + 1,
      seenEventIds: remembered,
    }
  }

  if (event.type === 'interruption-stop-latency') {
    if (!Number.isFinite(event.valueMs) || event.valueMs < 0 || event.valueMs > 60_000) {
      return state
    }
    const pendingIndex = state.pendingInterruptions.findIndex(
      (interruption) => !interruption.stopped,
    )
    return {
      ...state,
      interruptionStopLatenciesMs: [
        ...state.interruptionStopLatenciesMs.slice(-49),
        Math.round(event.valueMs),
      ],
      pendingInterruptions: state.pendingInterruptions.map((interruption, index) =>
        index === pendingIndex ? { ...interruption, stopped: true } : interruption,
      ),
      seenEventIds: remembered,
    }
  }

  if (event.type === 'response-audio-latency' || event.type === 'response-signal-latency') {
    if (!Number.isFinite(event.valueMs) || event.valueMs < 0 || event.valueMs > 60_000) {
      return state
    }
    const key = event.type === 'response-audio-latency'
      ? 'responseAudioLatenciesMs'
      : 'responseSignalLatenciesMs'
    return {
      ...state,
      [key]: [
        ...state[key].slice(-49),
        Math.round(event.valueMs),
      ],
      seenEventIds: remembered,
    }
  }

  if (event.type === 'avatar-transcript-delta') {
    const existing = state.segments.find((segment) => segment.id === event.itemId)
    const segments = existing
      ? updateSegment(state.segments, event.itemId, (segment) => ({
          ...segment,
          text: `${segment.text}${event.delta}`.slice(0, 8000),
        }))
      : [
          ...state.segments,
          {
            id: event.itemId,
            responseId: event.responseId,
            speaker: 'avatar' as const,
            text: event.delta.slice(0, 8000),
            sequence: nextSequence(state.segments),
            createdAt: now(),
            playbackStatus: 'generated' as const,
          },
        ]
    return { ...state, segments, seenEventIds: remembered }
  }

  if (event.type === 'avatar-output-started') {
    const handledIndex = state.pendingInterruptions.findIndex(
      (interruption) => interruption.stopped && interruption.responseId !== event.responseId,
    )
    const interruptionHandledCount = handledIndex >= 0
      ? state.interruptionHandledCount + 1
      : state.interruptionHandledCount
    const pendingInterruptions = handledIndex >= 0
      ? state.pendingInterruptions.filter((_, index) => index !== handledIndex)
      : state.pendingInterruptions
    const segment = state.segments.find(
      (candidate) => candidate.speaker === 'avatar' && candidate.responseId === event.responseId,
    )
    if (!segment) {
      return {
        ...state,
        status: 'avatar-speaking',
        interruptionHandledCount,
        pendingInterruptions,
        seenEventIds: remembered,
      }
    }
    return {
      ...state,
      status: 'avatar-speaking',
      activeAvatarId: segment.id,
      interruptionHandledCount,
      pendingInterruptions,
      segments: updateSegment(state.segments, segment.id, (candidate) => ({
        ...candidate,
        playbackStatus: 'playing',
      })),
      seenEventIds: remembered,
    }
  }

  const activeSegment = state.segments.find(
    (candidate) => candidate.speaker === 'avatar' && candidate.responseId === event.responseId,
  )
  const pendingInterruptions = state.pendingInterruptions.map((interruption) =>
    interruption.responseId === event.responseId
      ? { ...interruption, stopped: true }
      : interruption,
  )
  if (!activeSegment) {
    return {
      ...state,
      status: 'listening',
      activeAvatarId: null,
      pendingInterruptions,
      seenEventIds: remembered,
    }
  }
  return {
    ...state,
    status: 'listening',
    activeAvatarId: null,
    pendingInterruptions,
    segments: updateSegment(state.segments, activeSegment.id, (candidate) => ({
      ...candidate,
      playbackStatus: candidate.playbackStatus === 'interrupted' ? 'interrupted' : 'played',
    })),
    seenEventIds: remembered,
  }
}

export const sortedSegments = (segments: TranscriptSegment[]) =>
  [...segments].sort((left, right) => left.sequence - right.sequence)