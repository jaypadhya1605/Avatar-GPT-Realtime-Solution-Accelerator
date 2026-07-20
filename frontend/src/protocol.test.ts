import { describe, expect, it } from 'vitest'
import { initialProtocolState, reduceProtocol, sortedSegments } from './protocol'

describe('Realtime protocol reducer', () => {
  it('reconciles out-of-order learner transcripts by the turn sequence', () => {
    let state = initialProtocolState()
    state = reduceProtocol(state, { type: 'speech-started', generation: 1, itemId: 'first' })
    state = reduceProtocol(state, { type: 'speech-stopped', generation: 1, itemId: 'first' })
    state = reduceProtocol(state, { type: 'speech-started', generation: 1, itemId: 'second' })
    state = reduceProtocol(state, {
      type: 'learner-transcript',
      generation: 1,
      itemId: 'second',
      transcript: 'Second turn',
    })
    state = reduceProtocol(state, {
      type: 'learner-transcript',
      generation: 1,
      itemId: 'first',
      transcript: 'First turn',
    })
    expect(sortedSegments(state.segments).map((segment) => segment.text)).toEqual([
      'First turn',
      'Second turn',
    ])
  })

  it('does not mark generated avatar text as played until output stops', () => {
    let state = initialProtocolState()
    state = reduceProtocol(state, {
      type: 'avatar-transcript-delta',
      generation: 1,
      itemId: 'avatar-1',
      responseId: 'response-1',
      delta: 'I hear you.',
    })
    expect(state.segments[0].playbackStatus).toBe('generated')
    state = reduceProtocol(state, {
      type: 'avatar-output-started',
      generation: 1,
      responseId: 'response-1',
    })
    expect(state.segments[0].playbackStatus).toBe('playing')
    state = reduceProtocol(state, {
      type: 'avatar-output-stopped',
      generation: 1,
      responseId: 'response-1',
    })
    expect(state.segments[0].playbackStatus).toBe('played')
  })

  it('marks active avatar output interrupted and ignores duplicate and late events', () => {
    let state = initialProtocolState()
    state = reduceProtocol(state, {
      type: 'avatar-transcript-delta',
      generation: 1,
      itemId: 'avatar-1',
      responseId: 'response-1',
      delta: 'Let me finish this thought.',
    })
    state = reduceProtocol(state, {
      type: 'avatar-output-started',
      generation: 1,
      responseId: 'response-1',
    })
    const interruption = {
      type: 'speech-started' as const,
      eventId: 'event-1',
      generation: 1,
      itemId: 'learner-1',
    }
    state = reduceProtocol(state, interruption)
    state = reduceProtocol(state, interruption)
    state = reduceProtocol(state, { ...interruption, eventId: 'event-2', generation: 0 })
    expect(state.interruptionCount).toBe(1)
    expect(state.segments[0].playbackStatus).toBe('interrupted')
  })

  it('counts an interruption handled only after stop evidence and a new response', () => {
    let state = initialProtocolState()
    state = reduceProtocol(state, {
      type: 'avatar-transcript-delta',
      generation: 1,
      itemId: 'avatar-1',
      responseId: 'response-1',
      delta: 'Let me finish this thought.',
    })
    state = reduceProtocol(state, {
      type: 'avatar-output-started',
      generation: 1,
      responseId: 'response-1',
    })
    state = reduceProtocol(state, {
      type: 'speech-started',
      generation: 1,
      itemId: 'learner-1',
    })
    state = reduceProtocol(state, {
      type: 'interruption-stop-latency',
      generation: 1,
      valueMs: 84.6,
    })
    state = reduceProtocol(state, {
      type: 'avatar-output-stopped',
      generation: 1,
      responseId: 'response-1',
    })
    expect(state.interruptionHandledCount).toBe(0)
    state = reduceProtocol(state, {
      type: 'avatar-transcript-delta',
      generation: 1,
      itemId: 'avatar-2',
      responseId: 'response-2',
      delta: 'I heard your interruption.',
    })
    state = reduceProtocol(state, {
      type: 'avatar-output-started',
      generation: 1,
      responseId: 'response-2',
    })
    expect(state.interruptionHandledCount).toBe(1)
    expect(state.interruptionStopLatenciesMs).toEqual([85])
  })

  it('keeps bounded response-signal latency observations', () => {
    let state = initialProtocolState()
    state = reduceProtocol(state, {
      type: 'response-audio-latency',
      generation: 1,
      valueMs: 910.6,
    })
    state = reduceProtocol(state, {
      type: 'response-signal-latency',
      generation: 1,
      valueMs: 842.4,
    })
    state = reduceProtocol(state, {
      type: 'response-signal-latency',
      generation: 1,
      valueMs: -1,
    })
    expect(state.responseAudioLatenciesMs).toEqual([911])
    expect(state.responseSignalLatenciesMs).toEqual([842])
  })
})