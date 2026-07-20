export type AppMode = 'mock' | 'azure'
export type Difficulty = 'easy' | 'medium' | 'hard'
export type Screen = 'scenarios' | 'conversation' | 'report'

export type ConversationStatus =
  | 'preparing'
  | 'connecting'
  | 'listening'
  | 'user-speaking'
  | 'thinking'
  | 'avatar-speaking'
  | 'interrupted'
  | 'reconnecting'
  | 'ending'
  | 'complete'
  | 'error'

export type Expression =
  | 'sad-composed'
  | 'anxious'
  | 'guarded'
  | 'frustrated'
  | 'reflective'
  | 'relieved'
  | 'neutral'

export interface PublicConfig {
  mode: AppMode
  buildLabel: string
  sessionMaxMinutes: number
}

export interface Scenario {
  id: 'SCN-001' | 'SCN-002' | 'SCN-003'
  version: '1.0'
  persona: string
  role: string
  context: string
  startingEmotion: string
  estimatedMinutes: number
  trainingFocus: string
  expression: Expression
}

export type LearnerPlaybackStatus = 'transcribing' | 'final' | 'failed'
export type AvatarPlaybackStatus =
  | 'generated'
  | 'playing'
  | 'played'
  | 'interrupted'
  | 'estimated'

export interface TranscriptSegment {
  id: string
  responseId?: string
  speaker: 'learner' | 'avatar'
  text: string
  sequence: number
  createdAt: string
  playbackStatus: LearnerPlaybackStatus | AvatarPlaybackStatus
}

export interface LearnerDeliveryObservation {
  itemId: string
  durationMs: number
  meanDbfs: number | null
  peakDbfs: number | null
}

export interface InteractionMetrics {
  interruptionCount: number
  interruptionHandledCount: number
  interruptionStopLatenciesMs: number[]
  responseAudioLatenciesMs: number[]
  responseSignalLatenciesMs: number[]
  learnerDelivery: LearnerDeliveryObservation[]
}

export interface CategoryScore {
  id: string
  label: string
  score: number
  evidence: string
}

export interface CoachingMetric {
  id:
    | 'tone-compassion'
    | 'clarity'
    | 'empathy-language'
    | 'shared-decision-making'
    | 'question-responsiveness'
    | 'medical-jargon'
  label: string
  value: string
  score10: number | null
  evidence: string
  basis: 'transcript-and-interaction'
}

export interface GroundingSource {
  id: string
  title: string
}

export interface GroundingSummary {
  mode: 'synthetic-local'
  datasetId: string
  queryBasis: 'scenario' | 'learner-turns'
  sources: GroundingSource[]
}

export interface Evaluation {
  rubricVersion: '1.0'
  overallScore: number | null
  confidence: 'high' | 'medium' | 'low'
  categories: CategoryScore[]
  diagnostics: string[]
  strengths: string[]
  coaching: string[]
  rewriteExamples: string[]
  limitations: string[]
  coachingMetrics: CoachingMetric[]
  grounding: GroundingSummary
}

export interface LiveSessionMetadata {
  sessionId: string
  modelDeployment: string
  transcriptionDeployment: string
  avatarOutput?: 'webrtc' | 'viseme'
  grounding?: GroundingSummary
}