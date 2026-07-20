import { describe, expect, it } from 'vitest'
import { summarizeInteractionMetrics } from './reportMetrics'
import type { InteractionMetrics, TranscriptSegment } from './types'

const segments: TranscriptSegment[] = [
  {
    id: 'learner-1',
    speaker: 'learner',
    text: 'I hear how frightening this feels and we can decide together.',
    sequence: 1,
    createdAt: '2026-05-01T00:00:00.000Z',
    playbackStatus: 'final',
  },
  {
    id: 'avatar-1',
    responseId: 'response-1',
    speaker: 'avatar',
    text: 'What happens next?',
    sequence: 2,
    createdAt: '2026-05-01T00:00:01.000Z',
    playbackStatus: 'played',
  },
]

const interaction: InteractionMetrics = {
  interruptionCount: 2,
  interruptionHandledCount: 2,
  interruptionStopLatenciesMs: [120, 180],
  responseAudioLatenciesMs: [900, 1300, 1100],
  responseSignalLatenciesMs: [600, 700, 650],
  learnerDelivery: [
    { itemId: 'learner-1', durationMs: 5000, meanDbfs: -24.4, peakDbfs: -5 },
  ],
}

describe('report interaction summaries', () => {
  it('prefers audible response latency and reports median and worst turns', () => {
    const summary = summarizeInteractionMetrics(interaction, segments)

    expect(summary.latency.value).toBe('1.1 s median')
    expect(summary.latency.evidence).toContain('worst 1.3 s')
    expect(summary.latency.evidence).toContain('T1 900 ms · T2 1.3 s · T3 1.1 s')
    expect(summary.interruptions.value).toBe('2 of 2 handled')
    expect(summary.interruptions.evidence).toContain('worst 180 ms')
    expect(summary.interruptions.evidence).toContain('Semantic incorporation remains human-reviewed')
  })

  it('derives delivery context without assigning an emotion label', () => {
    const summary = summarizeInteractionMetrics(interaction, segments)

    expect(summary.pace.value).toBe('132 wpm')
    expect(summary.voiceEnergy.value).toBe('-24 dBFS median')
    expect(summary.voiceEnergy.evidence).toContain('not classified as emotion')
    expect(summary.transcriptPlayback.label).toBe('Audio/text reconciliation')
    expect(summary.transcriptPlayback.value).toBe('Protocol pass')
    expect(summary.transcriptPlayback.evidence).toContain('1 complete · 0 interrupted · 0 uncertain')
    expect(summary.transcriptPlayback.evidence).toContain('human-reviewed')
  })

  it('labels transcript-event timing as a proxy when audio onset is unavailable', () => {
    const summary = summarizeInteractionMetrics(
      { ...interaction, responseAudioLatenciesMs: [] },
      segments,
    )

    expect(summary.latency.label).toBe('Response latency proxy')
    expect(summary.latency.evidence).toContain('Audio onset was unavailable')
  })
})