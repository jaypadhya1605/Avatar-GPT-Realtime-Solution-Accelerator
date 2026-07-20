import type { InteractionMetrics, TranscriptSegment } from './types'

export interface ReportObservation {
  label: string
  value: string
  evidence: string
}

export interface InteractionSummary {
  interruptions: ReportObservation
  latency: ReportObservation
  pace: ReportObservation
  voiceEnergy: ReportObservation
  transcriptPlayback: ReportObservation
}

const median = (values: number[]) => {
  if (!values.length) return null
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

const formatLatency = (milliseconds: number) =>
  milliseconds < 1000
    ? `${Math.round(milliseconds)} ms`
    : `${(milliseconds / 1000).toFixed(1)} s`

const wordCount = (text: string) => text.match(/[A-Za-z0-9']+/g)?.length ?? 0

export const summarizeInteractionMetrics = (
  interaction: InteractionMetrics,
  segments: TranscriptSegment[],
): InteractionSummary => {
  const hasAudioLatency = interaction.responseAudioLatenciesMs.length > 0
  const latencyValues = hasAudioLatency
    ? interaction.responseAudioLatenciesMs
    : interaction.responseSignalLatenciesMs
  const medianLatency = median(latencyValues)
  const worstLatency = latencyValues.length ? Math.max(...latencyValues) : null
  const turnLatencies = latencyValues
    .slice(0, 8)
    .map((value, index) => `T${index + 1} ${formatLatency(value)}`)
    .join(' · ')
  const remainingLatencyCount = Math.max(0, latencyValues.length - 8)
  const latency = medianLatency === null || worstLatency === null
    ? {
        label: 'Response latency',
        value: 'Not measured',
        evidence: 'Complete a microphone turn to observe end-of-speech to avatar response time.',
      }
    : {
        label: hasAudioLatency ? 'Response latency' : 'Response latency proxy',
        value: `${formatLatency(medianLatency)} median`,
        evidence: hasAudioLatency
          ? `End of caregiver speech to first audible avatar output; worst ${formatLatency(worstLatency)} across ${latencyValues.length} measured turn${latencyValues.length === 1 ? '' : 's'}. Turn observations: ${turnLatencies}${remainingLatencyCount ? ` · +${remainingLatencyCount} more` : ''}. POC target: under 1.5 s, not a production SLA.`
          : `End of caregiver speech to first assistant transcript signal; worst ${formatLatency(worstLatency)}. Turn observations: ${turnLatencies}${remainingLatencyCount ? ` · +${remainingLatencyCount} more` : ''}. Audio onset was unavailable for this session.`,
      }

  const interruptions = interaction.interruptionCount
  const handledInterruptions = Math.min(
    interaction.interruptionHandledCount,
    interruptions,
  )
  const stopLatencyValues = interaction.interruptionStopLatenciesMs
  const medianStopLatency = median(stopLatencyValues)
  const worstStopLatency = stopLatencyValues.length
    ? Math.max(...stopLatencyValues)
    : null
  const stopLatencyEvidence = medianStopLatency === null || worstStopLatency === null
    ? 'Audible stop latency was not available for this session.'
    : `Audible stop median ${formatLatency(medianStopLatency)}; worst ${formatLatency(worstStopLatency)} across ${stopLatencyValues.length} measured interruption${stopLatencyValues.length === 1 ? '' : 's'}.`
  const interruptionSummary = {
    label: 'Interruptions handled',
    value: interruptions
      ? `${handledInterruptions} of ${interruptions} handled`
      : '0 observed',
    evidence: interruptions
      ? `Handled means active playback stopped and a new avatar response began. ${stopLatencyEvidence} Semantic incorporation remains human-reviewed from the transcript.`
      : 'No caregiver speech onset was detected while avatar output was active.',
  }

  const learnerSegments = new Map(
    segments
      .filter((segment) => segment.speaker === 'learner' && segment.playbackStatus === 'final')
      .map((segment) => [segment.id, segment]),
  )
  const measuredTurns = interaction.learnerDelivery.filter(
    (observation) => observation.durationMs >= 250 && learnerSegments.has(observation.itemId),
  )
  const measuredDurationMs = measuredTurns.reduce(
    (total, observation) => total + observation.durationMs,
    0,
  )
  const measuredWords = measuredTurns.reduce(
    (total, observation) => total + wordCount(learnerSegments.get(observation.itemId)?.text ?? ''),
    0,
  )
  const wordsPerMinute = measuredDurationMs > 0
    ? Math.round(measuredWords / (measuredDurationMs / 60_000))
    : null
  const pace = {
    label: 'Caregiver speaking pace',
    value: wordsPerMinute === null ? 'Not observed' : `${wordsPerMinute} wpm`,
    evidence: wordsPerMinute === null
      ? 'Available for microphone turns; typed mock responses do not create acoustic observations.'
      : `Observed across ${measuredTurns.length} microphone turn${measuredTurns.length === 1 ? '' : 's'}; shown as delivery context and not scored.`,
  }

  const energyValues = measuredTurns
    .map((observation) => observation.meanDbfs)
    .filter((value): value is number => value !== null)
  const medianEnergy = median(energyValues)
  const voiceEnergy = {
    label: 'Caregiver voice energy',
    value: medianEnergy === null ? 'Not observed' : `${Math.round(medianEnergy)} dBFS median`,
    evidence: medianEnergy === null
      ? 'Available for microphone turns; no raw audio or PCM samples are retained.'
      : 'Relative signal level only. It is device-dependent, retained as a numeric summary, and not classified as emotion.',
  }

  const avatarSegments = segments.filter((segment) => segment.speaker === 'avatar')
  const played = avatarSegments.filter((segment) => segment.playbackStatus === 'played').length
  const partial = avatarSegments.filter((segment) => segment.playbackStatus === 'interrupted').length
  const uncertain = avatarSegments.filter((segment) =>
    segment.playbackStatus === 'estimated' || segment.playbackStatus === 'failed',
  ).length
  const transcriptPlayback = {
    label: 'Audio/text reconciliation',
    value: avatarSegments.length
      ? uncertain
        ? 'Review required'
        : 'Protocol pass'
      : 'No avatar turns',
    evidence: avatarSegments.length
      ? `${played} complete · ${partial} interrupted · ${uncertain} uncertain. Transcript/output completion reconciliation only; audible content and lip-sync remain human-reviewed.`
      : 'No avatar transcript/output pairs were available to reconcile.',
  }

  return {
    interruptions: interruptionSummary,
    latency,
    pace,
    voiceEnergy,
    transcriptPlayback,
  }
}