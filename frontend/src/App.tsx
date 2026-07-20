import { useEffect, useReducer, useRef, useState } from 'react'
import {
  ArrowLeft,
  BookOpenCheck,
  Check,
  ChevronDown,
  CircleStop,
  FileText,
  Mic,
  MicOff,
  Play,
  RotateCcw,
  Send,
  Settings2,
  X,
} from 'lucide-react'
import './App.css'
import { ApiClient } from './api'
import { Avatar } from './Avatar'
import { computeAvatarMotion, type AvatarMotion } from './avatarMath'
import { MockConversation } from './mock'
import { initialProtocolState, reduceProtocol, sortedSegments } from './protocol'
import { summarizeInteractionMetrics } from './reportMetrics'
import { VoiceLiveConnection } from './voiceLive'
import type {
  AppMode,
  Difficulty,
  Evaluation,
  InteractionMetrics,
  LearnerDeliveryObservation,
  PublicConfig,
  LiveSessionMetadata,
  Scenario,
  Screen,
  TranscriptSegment,
} from './types'

const api = new ApiClient()

const STATUS_LABELS = {
  preparing: 'Preparing',
  connecting: 'Connecting',
  listening: 'Listening',
  'user-speaking': 'Listening to you',
  thinking: 'Responding',
  'avatar-speaking': 'Speaking',
  interrupted: 'Interrupted',
  reconnecting: 'Reconnecting',
  ending: 'Ending session',
  complete: 'Complete',
  error: 'Connection issue',
} as const

const formatDuration = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

interface ReportData {
  evaluation: Evaluation
  durationSeconds: number
  segments: TranscriptSegment[]
  interaction: InteractionMetrics
}

function App() {
  const [config, setConfig] = useState<PublicConfig | null>(null)
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [selectedId, setSelectedId] = useState<Scenario['id'] | null>(null)
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [acknowledged, setAcknowledged] = useState(false)
  const [screen, setScreen] = useState<Screen>('scenarios')
  const [report, setReport] = useState<ReportData | null>(null)
  const [modeOverride, setModeOverride] = useState<AppMode | null>(null)
  const [loading, setLoading] = useState(true)
  const [startupError, setStartupError] = useState('')
  const debugEnabled = new URLSearchParams(window.location.search).get('debug') === '1'

  const loadScenarios = async () => {
    setScenarios(await api.scenarios())
  }

  useEffect(() => {
    let active = true
    const initialize = async () => {
      try {
        const nextConfig = await api.config()
        if (!active) return
        setConfig(nextConfig)
        await loadScenarios()
      } catch (error) {
        if (active) setStartupError(error instanceof Error ? error.message : 'The demo could not start.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void initialize()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 })
  }, [screen])

  const selectedScenario = scenarios.find((scenario) => scenario.id === selectedId) ?? null
  const effectiveMode = modeOverride ?? config?.mode ?? 'mock'

  const restart = () => {
    setReport(null)
    setScreen('scenarios')
    setSelectedId(null)
    setAcknowledged(false)
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <button className="brand" type="button" onClick={restart} aria-label="Return to scenarios">
          <span className="brand__mark" aria-hidden="true">A</span>
          <span>
            <strong>Avatar GPT Realtime</strong>
            <small>Solution Accelerator</small>
          </span>
        </button>
        <div className="header-actions">
          <span className={`mode-badge mode-badge--${effectiveMode}`}>
            <span aria-hidden="true" />
            {effectiveMode === 'mock' ? 'Mock' : 'Azure live'}
          </span>
        </div>
      </header>

      {loading ? (
        <main className="center-state" aria-live="polite">
          <span className="progress-ring" aria-hidden="true" />
          <p>Preparing the training space</p>
        </main>
      ) : startupError ? (
        <main className="center-state">
          <h1>Unable to open the demo</h1>
          <p>{startupError}</p>
          <button className="primary-button" type="button" onClick={() => window.location.reload()}>
            <RotateCcw size={18} aria-hidden="true" />
            Try again
          </button>
        </main>
      ) : screen === 'scenarios' && config ? (
        <ScenarioSelection
          scenarios={scenarios}
          selectedId={selectedId}
          difficulty={difficulty}
          acknowledged={acknowledged}
          onSelect={setSelectedId}
          onDifficulty={setDifficulty}
          onAcknowledge={setAcknowledged}
          onStart={() => setScreen('conversation')}
        />
      ) : screen === 'conversation' && config && selectedScenario ? (
        <Conversation
          key={`${selectedScenario.id}-${effectiveMode}`}
          api={api}
          config={{ ...config, mode: effectiveMode }}
          scenario={selectedScenario}
          difficulty={difficulty}
          debugEnabled={debugEnabled}
          onComplete={(evaluation, durationSeconds, segments, interaction) => {
            setReport({ evaluation, durationSeconds, segments, interaction })
            setScreen('report')
          }}
          onMockFallback={() => {
            setModeOverride('mock')
            setScreen('scenarios')
          }}
        />
      ) : screen === 'report' && selectedScenario && report ? (
        <EmpathyReport scenario={selectedScenario} report={report} onRestart={restart} />
      ) : (
        <main className="center-state">
          <p>The selected scenario is unavailable.</p>
          <button className="primary-button" type="button" onClick={restart}>
            <ArrowLeft size={18} aria-hidden="true" />
            Return to scenarios
          </button>
        </main>
      )}

      <footer className="app-footer">
        <span>Synthetic training only. Do not enter patient-identifying or clinical data.</span>
        <span>{config?.buildLabel ?? 'local'}</span>
      </footer>
    </div>
  )
}

interface ScenarioSelectionProps {
  scenarios: Scenario[]
  selectedId: Scenario['id'] | null
  difficulty: Difficulty
  acknowledged: boolean
  onSelect: (id: Scenario['id']) => void
  onDifficulty: (difficulty: Difficulty) => void
  onAcknowledge: (value: boolean) => void
  onStart: () => void
}

function ScenarioSelection({
  scenarios,
  selectedId,
  difficulty,
  acknowledged,
  onSelect,
  onDifficulty,
  onAcknowledge,
  onStart,
}: ScenarioSelectionProps) {
  return (
    <main className="selection-page">
      <section className="selection-intro">
        <p className="eyebrow">Communication practice</p>
        <h1>Choose a conversation</h1>
        <p>Practice responding to emotion, uncertainty, and difficult questions in a synthetic scenario.</p>
      </section>

      <div className="scenario-grid" role="radiogroup" aria-label="Training scenario">
          {scenarios.map((scenario) => {
            const selected = scenario.id === selectedId
            return (
              <button
                key={scenario.id}
                className={`scenario-card ${selected ? 'scenario-card--selected' : ''}`}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onSelect(scenario.id)}
              >
                <div className="scenario-card__portrait">
                  <Avatar
                    persona={scenario.persona}
                    expression={scenario.expression}
                    status="listening"
                    compact
                  />
                  {selected && (
                    <span className="selected-check" aria-label="Selected">
                      <Check size={15} aria-hidden="true" />
                    </span>
                  )}
                </div>
                <div className="scenario-card__content">
                  <div className="scenario-card__heading">
                    <span>
                      <strong>{scenario.persona}</strong>
                      <small>{scenario.role}</small>
                    </span>
                    <span className="duration">{scenario.estimatedMinutes} min</span>
                  </div>
                  <p>{scenario.context}</p>
                  <dl>
                    <div>
                      <dt>Starting state</dt>
                      <dd>{scenario.startingEmotion}</dd>
                    </div>
                    <div>
                      <dt>Practice focus</dt>
                      <dd>{scenario.trainingFocus}</dd>
                    </div>
                  </dl>
                </div>
              </button>
            )
          })}
      </div>

      <section className="selection-controls">
          <fieldset>
            <legend>Difficulty</legend>
            <div className="segmented-control">
              {(['easy', 'medium', 'hard'] as const).map((option) => (
                <label key={option}>
                  <input
                    type="radio"
                    name="difficulty"
                    value={option}
                    checked={difficulty === option}
                    onChange={() => onDifficulty(option)}
                  />
                  <span>{option[0].toUpperCase() + option.slice(1)}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="safety-check">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => onAcknowledge(event.target.checked)}
            />
            <span>
              I understand this is a synthetic training simulation and will not enter real patient or clinical data.
            </span>
          </label>
          <button
            className="primary-button start-button"
            type="button"
            disabled={!selectedId || !acknowledged}
            onClick={onStart}
          >
            <Play size={19} fill="currentColor" aria-hidden="true" />
            Start scenario
          </button>
      </section>
    </main>
  )
}

interface ConversationProps {
  api: ApiClient
  config: PublicConfig
  scenario: Scenario
  difficulty: Difficulty
  debugEnabled: boolean
  onComplete: (
    evaluation: Evaluation,
    durationSeconds: number,
    segments: TranscriptSegment[],
    interaction: InteractionMetrics,
  ) => void
  onMockFallback: () => void
}

function Conversation({
  api,
  config,
  scenario,
  difficulty,
  debugEnabled,
  onComplete,
  onMockFallback,
}: ConversationProps) {
  const [protocol, dispatch] = useReducer(reduceProtocol, undefined, () => initialProtocolState())
  const [motion, setMotion] = useState<AvatarMotion>({ level: 0, mouthOpen: 0 })
  const [visemeId, setVisemeId] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [muted, setMuted] = useState(false)
  const [transcriptOpen, setTranscriptOpen] = useState(true)
  const [debugOpen, setDebugOpen] = useState(false)
  const [debugEvents, setDebugEvents] = useState<string[]>([])
  const [sessionMeta, setSessionMeta] = useState<LiveSessionMetadata | null>(null)
  const [mockInput, setMockInput] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [connectionAttempt, setConnectionAttempt] = useState(0)
  const [retrying, setRetrying] = useState(false)
  const [ending, setEnding] = useState(false)
  const [learnerDelivery, setLearnerDelivery] = useState<LearnerDeliveryObservation[]>([])
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [remoteFrameReady, setRemoteFrameReady] = useState(false)
  const azureRef = useRef<VoiceLiveConnection | null>(null)
  const mockRef = useRef<MockConversation | null>(null)
  const avatarVideoRef = useRef<HTMLVideoElement | null>(null)
  const startTime = useRef(Date.now())

  useEffect(() => {
    const timer = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - startTime.current) / 1000)),
      1000,
    )
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const video = avatarVideoRef.current
    if (!video) return
    setRemoteFrameReady(false)
    video.srcObject = remoteStream
    if (remoteStream) {
      void video.play().catch(() => {
        setErrorMessage('The Azure avatar media could not start in this browser.')
        dispatch({ type: 'connection-state', generation: 1, status: 'error' })
        void azureRef.current?.close()
      })
    }
    return () => {
      video.pause()
      if (video.srcObject === remoteStream) video.srcObject = null
    }
  }, [remoteStream])

  useEffect(() => {
    let active = true
    setRemoteStream(null)
    setRemoteFrameReady(false)
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const callbacks = {
      dispatch,
      onAudioLevel: (level: number) => {
        const sample = Math.round(128 + Math.min(1, Math.max(0, level)) * 127)
        setMotion((previous) => computeAvatarMotion(previous, [sample, 256 - sample], reducedMotion))
      },
      onViseme: setVisemeId,
      onRemoteStream: (stream: MediaStream | null) => {
        if (active) setRemoteStream(stream)
      },
      onDebugEvent: (eventName: string) =>
        setDebugEvents((events) => [...events.slice(-39), eventName.slice(0, 120)]),
      onDeliveryObservation: (observation: LearnerDeliveryObservation) =>
        setLearnerDelivery((items) => [
          ...items.filter((item) => item.itemId !== observation.itemId),
          observation,
        ]),
    }
    const releaseOnPageHide = (event: PageTransitionEvent) => {
      if (!event.persisted) azureRef.current?.releaseForNavigation()
    }
    window.addEventListener('pagehide', releaseOnPageHide)
    if (config.mode === 'mock') {
      const mock = new MockConversation(scenario, callbacks)
      mockRef.current = mock
      mock.start()
    } else {
      const connection = new VoiceLiveConnection(api, callbacks)
      azureRef.current = connection
      void connection
        .connect(scenario, difficulty)
        .then((session) => {
          if (active) {
            setSessionMeta(session)
            setErrorMessage('')
            setRetrying(false)
          }
        })
        .catch((error: unknown) => {
          if (!active) return
          setRetrying(false)
          if (error instanceof DOMException && error.name === 'NotAllowedError') {
            setErrorMessage('Microphone access is blocked. Allow microphone access or open the mock demo.')
          } else {
            setErrorMessage(error instanceof Error ? error.message : 'The live connection could not start.')
          }
          dispatch({ type: 'connection-state', generation: 1, status: 'error' })
          void connection.close()
        })
    }
    return () => {
      active = false
      window.removeEventListener('pagehide', releaseOnPageHide)
      mockRef.current?.close()
      mockRef.current = null
      void azureRef.current?.close()
      azureRef.current = null
    }
  }, [api, config.mode, connectionAttempt, difficulty, scenario])

  const retryLiveConnection = async () => {
    if (retrying) return
    setRetrying(true)
    try {
      await api.resetVoiceSession()
      setConnectionAttempt((attempt) => attempt + 1)
    } catch (error: unknown) {
      setRetrying(false)
      setErrorMessage(error instanceof Error ? error.message : 'The live connection could not restart.')
    }
  }

  const submitMock = () => {
    if (!mockInput.trim()) return
    mockRef.current?.submit(mockInput)
    setMockInput('')
  }

  const setMute = () => {
    const next = !muted
    setMuted(next)
    azureRef.current?.setMuted(next)
  }

  const endSession = async () => {
    const learnerTurns = protocol.segments.filter(
      (segment) => segment.speaker === 'learner' && segment.playbackStatus === 'final',
    )
    const avatarTurns = protocol.segments.filter(
      (segment) => segment.speaker === 'avatar' && segment.playbackStatus === 'played',
    )
    if (learnerTurns.length > 0 && !window.confirm('End this conversation and view your feedback?')) return
    setEnding(true)
    dispatch({ type: 'connection-state', generation: 1, status: 'ending' })
    mockRef.current?.close()
    await azureRef.current?.close()
    try {
      const estimatedAvatarSegments = protocol.segments.filter(
        (segment) =>
          segment.speaker === 'avatar' &&
          (segment.playbackStatus === 'estimated' || segment.playbackStatus === 'interrupted'),
      ).length
      const evaluation = await api.evaluate(
        scenario.id,
        learnerTurns.map((segment) => segment.text),
        avatarTurns.map((segment) => segment.text),
        protocol.interruptionCount,
        protocol.transcriptionFailures,
        estimatedAvatarSegments,
      )
      onComplete(evaluation, elapsed, sortedSegments(protocol.segments), {
        interruptionCount: protocol.interruptionCount,
        interruptionHandledCount: protocol.interruptionHandledCount,
        interruptionStopLatenciesMs: protocol.interruptionStopLatenciesMs,
        responseAudioLatenciesMs: protocol.responseAudioLatenciesMs,
        responseSignalLatenciesMs: protocol.responseSignalLatenciesMs,
        learnerDelivery,
      })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Feedback could not be generated.')
      dispatch({ type: 'connection-state', generation: 1, status: 'error' })
      setEnding(false)
    }
  }

  const transcript = sortedSegments(protocol.segments)

  return (
    <main className={`conversation-page ${transcriptOpen ? '' : 'conversation-page--wide'}`}>
      <section className="conversation-main">
        <div className="conversation-heading">
          <div>
            <span className="persona-role">{scenario.role}</span>
            <h1>{scenario.persona}</h1>
          </div>
          <div className="session-meta">
            {sessionMeta?.grounding && (
              <span
                className="rag-status"
                title={sessionMeta.grounding.sources.map((source) => source.title).join('; ')}
              >
                <BookOpenCheck size={15} aria-hidden="true" />
                RAG grounded · {sessionMeta.grounding.sources.length}
              </span>
            )}
            <span className={`status status--${protocol.status}`} aria-live="polite">
              <span aria-hidden="true" />
              {config.mode === 'mock' ? `Mock · ${STATUS_LABELS[protocol.status]}` : STATUS_LABELS[protocol.status]}
            </span>
            <time aria-label={`Elapsed time ${formatDuration(elapsed)}`}>{formatDuration(elapsed)}</time>
          </div>
        </div>

        <div className={`avatar-stage ${config.mode === 'azure' ? 'avatar-stage--live' : ''}`}>
          <div
            className={`avatar-stage__fallback ${remoteFrameReady ? 'avatar-stage__fallback--hidden' : ''}`}
            aria-hidden={remoteFrameReady}
          >
            <Avatar
              persona={scenario.persona}
              expression={scenario.expression}
              status={protocol.status}
              mouthOpen={motion.mouthOpen}
              visemeId={visemeId}
            />
          </div>
          {config.mode === 'azure' && (
            <video
              ref={avatarVideoRef}
              className="avatar-stage__remote"
              data-ready={remoteFrameReady ? 'true' : 'false'}
              aria-label={`Live synthetic patient avatar for ${scenario.persona}`}
              aria-hidden={!remoteFrameReady}
              autoPlay
              playsInline
              onLoadedData={() => setRemoteFrameReady(true)}
              onPlaying={() => setRemoteFrameReady(true)}
              onError={() => {
                setErrorMessage('The Azure avatar video could not be played.')
                dispatch({ type: 'connection-state', generation: 1, status: 'error' })
                void azureRef.current?.close()
              }}
            />
          )}
          <div className="stage-caption">
            <strong>{scenario.startingEmotion}</strong>
            <span>{difficulty[0].toUpperCase() + difficulty.slice(1)} difficulty</span>
          </div>
        </div>

        {errorMessage && (
          <div className="error-band" role="alert">
            <div>
              <strong>Connection issue</strong>
              <span>{errorMessage}</span>
            </div>
            <div>
              <button
                className="secondary-button"
                type="button"
                disabled={retrying}
                aria-busy={retrying}
                onClick={() => void retryLiveConnection()}
              >
                <RotateCcw size={17} aria-hidden="true" />
                {retrying ? 'Reconnecting...' : 'Retry'}
              </button>
              {config.mode === 'azure' && (
                <button className="primary-button" type="button" onClick={onMockFallback}>
                  <Play size={17} aria-hidden="true" />
                  Open mock demo
                </button>
              )}
            </div>
          </div>
        )}

        {config.mode === 'mock' && !ending && (
          <form
            className="mock-composer"
            onSubmit={(event) => {
              event.preventDefault()
              submitMock()
            }}
          >
            <label htmlFor="mock-response">Your response</label>
            <div>
              <textarea
                id="mock-response"
                value={mockInput}
                onChange={(event) => setMockInput(event.target.value)}
                placeholder="Type a synthetic practice response"
                rows={2}
                maxLength={1000}
              />
              <button className="icon-button icon-button--send" type="submit" title="Send response" disabled={!mockInput.trim()}>
                <Send size={20} aria-hidden="true" />
                <span className="sr-only">Send response</span>
              </button>
            </div>
            <small>Sending while {scenario.persona} is speaking exercises interruption.</small>
          </form>
        )}

        <div className="control-dock" aria-label="Conversation controls">
          <button
            className={`icon-button ${muted ? 'icon-button--active' : ''}`}
            type="button"
            onClick={setMute}
            title={muted ? 'Unmute microphone' : 'Mute microphone'}
            aria-pressed={muted}
            disabled={config.mode === 'mock' || ending}
          >
            {muted ? <MicOff size={21} aria-hidden="true" /> : <Mic size={21} aria-hidden="true" />}
            <span className="sr-only">{muted ? 'Unmute microphone' : 'Mute microphone'}</span>
          </button>
          <button
            className={`icon-button ${transcriptOpen ? 'icon-button--active' : ''}`}
            type="button"
            onClick={() => setTranscriptOpen((open) => !open)}
            title={transcriptOpen ? 'Hide transcript' : 'Show transcript'}
            aria-pressed={transcriptOpen}
          >
            <FileText size={21} aria-hidden="true" />
            <span className="sr-only">{transcriptOpen ? 'Hide transcript' : 'Show transcript'}</span>
          </button>
          {debugEnabled && (
            <button
              className={`icon-button ${debugOpen ? 'icon-button--active' : ''}`}
              type="button"
              onClick={() => setDebugOpen((open) => !open)}
              title="Developer trace"
              aria-pressed={debugOpen}
            >
              <Settings2 size={21} aria-hidden="true" />
              <span className="sr-only">Developer trace</span>
            </button>
          )}
          <div className="dock-spacer" />
          <button className="end-button" type="button" onClick={() => void endSession()} disabled={ending}>
            <CircleStop size={20} aria-hidden="true" />
            {ending ? 'Ending' : 'End session'}
          </button>
        </div>
      </section>

      {transcriptOpen && (
        <aside className="transcript-panel" aria-label="Conversation transcript">
          <div className="panel-heading">
            <div>
              <span>Live transcript</span>
              <small>Approximate</small>
            </div>
            <button className="icon-button icon-button--small" type="button" onClick={() => setTranscriptOpen(false)} title="Close transcript">
              <X size={18} aria-hidden="true" />
              <span className="sr-only">Close transcript</span>
            </button>
          </div>
          <div className="transcript-list" aria-live="polite">
            {transcript.length === 0 ? (
              <p className="empty-transcript">The conversation will appear here.</p>
            ) : (
              transcript.map((segment) => (
                <article key={segment.id} className={`transcript-turn transcript-turn--${segment.speaker}`}>
                  <header>
                    <strong>{segment.speaker === 'learner' ? 'You' : scenario.persona}</strong>
                    {segment.playbackStatus === 'playing' && <span>Playing</span>}
                    {segment.playbackStatus === 'interrupted' && <span>Partially heard</span>}
                    {segment.playbackStatus === 'estimated' && <span>Playback estimate</span>}
                    {segment.playbackStatus === 'failed' && <span>Transcript unavailable</span>}
                  </header>
                  <p>{segment.text || (segment.playbackStatus === 'failed' ? 'No text available.' : '…')}</p>
                </article>
              ))
            )}
          </div>
        </aside>
      )}

      {debugOpen && (
        <aside className="debug-drawer" aria-label="Developer trace">
          <div className="panel-heading">
            <div>
              <span>Developer trace</span>
              <small>Redacted</small>
            </div>
            <button className="icon-button icon-button--small" type="button" onClick={() => setDebugOpen(false)} title="Close developer trace">
              <X size={18} aria-hidden="true" />
              <span className="sr-only">Close developer trace</span>
            </button>
          </div>
          <dl className="debug-facts">
            <div><dt>Mode</dt><dd>{config.mode}</dd></div>
            <div><dt>Session</dt><dd>{sessionMeta?.sessionId ?? 'local-mock'}</dd></div>
            <div><dt>Model</dt><dd>{sessionMeta?.modelDeployment ?? 'scripted-v1'}</dd></div>
            <div><dt>Transcription</dt><dd>{sessionMeta?.transcriptionDeployment ?? 'typed-input'}</dd></div>
            <div><dt>Avatar output</dt><dd>{sessionMeta?.avatarOutput ?? 'local portrait'}</dd></div>
            <div><dt>RAG dataset</dt><dd>{sessionMeta?.grounding?.datasetId ?? 'report-only in mock'}</dd></div>
            <div><dt>RAG sources</dt><dd>{sessionMeta?.grounding?.sources.map((source) => source.id).join(', ') || 'pending'}</dd></div>
            <div><dt>State</dt><dd>{protocol.status}</dd></div>
            <div><dt>Interruptions</dt><dd>{protocol.interruptionCount}</dd></div>
          </dl>
          <ol className="event-list">
            {debugEvents.map((eventName, index) => <li key={`${eventName}-${index}`}>{eventName}</li>)}
          </ol>
        </aside>
      )}
    </main>
  )
}

function EmpathyReport({
  scenario,
  report,
  onRestart,
}: {
  scenario: Scenario
  report: ReportData
  onRestart: () => void
}) {
  const { evaluation } = report
  const interactionSummary = summarizeInteractionMetrics(report.interaction, report.segments)
  return (
    <main className="report-page">
      <header className="report-header">
        <div>
          <p className="eyebrow">Practice feedback · {scenario.persona}</p>
          <h1>Empathy report</h1>
          <p>{formatDuration(report.durationSeconds)} conversation · {evaluation.confidence} confidence</p>
        </div>
        <div className="overall-score" aria-label={evaluation.overallScore === null ? 'Score withheld' : `Overall score ${evaluation.overallScore} out of 10`}>
          <strong>{evaluation.overallScore ?? '—'}</strong>
          <span>/10</span>
        </div>
      </header>

      {evaluation.limitations.length > 0 && (
        <section className="limitations" aria-label="Report limitations">
          {evaluation.limitations.map((limitation) => <p key={limitation}>{limitation}</p>)}
        </section>
      )}

      <section className="coaching-scorecard" aria-labelledby="coaching-scorecard-heading">
        <div className="report-section-heading">
          <div>
            <p className="eyebrow">Conversation coaching dimensions</p>
            <h2 id="coaching-scorecard-heading">Session coaching scorecard</h2>
          </div>
          <span>POC implementation</span>
        </div>
        <p className="section-boundary">
          Deterministic transcript and interaction heuristics for this synthetic practice session.
          These coaching signals are not clinical assessments or validated performance thresholds.
        </p>
        <div className="coaching-metric-grid">
          {evaluation.coachingMetrics.map((metric) => (
            <article className="coaching-metric" key={metric.id}>
              <header>
                <h3>{metric.label}</h3>
                {metric.score10 !== null && <span>{metric.score10}/10</span>}
              </header>
              <strong>{metric.value}</strong>
              <p>{metric.evidence}</p>
              <small>Transcript + interaction indicators</small>
            </article>
          ))}
        </div>
      </section>

      <section className="realtime-evidence" aria-labelledby="realtime-evidence-heading">
        <div className="report-section-heading">
          <div>
            <p className="eyebrow">Realtime experience KPIs</p>
            <h2 id="realtime-evidence-heading">Interaction quality</h2>
          </div>
          <span>Technical POC</span>
        </div>
        <div className="realtime-kpi-grid">
          {[interactionSummary.interruptions, interactionSummary.latency].map((metric) => (
            <article className="realtime-kpi" key={metric.label}>
              <h3>{metric.label}</h3>
              <strong>{metric.value}</strong>
              <p>{metric.evidence}</p>
            </article>
          ))}
        </div>
        <div className="delivery-observation-grid">
          {[
            interactionSummary.pace,
            interactionSummary.voiceEnergy,
            interactionSummary.transcriptPlayback,
            {
              label: 'Patient emotion target',
              value: scenario.startingEmotion,
              evidence: 'Prompted persona state; voice-expression accuracy is not independently classified.',
            },
            {
              label: 'Persona continuity',
              value: `${scenario.persona} · ${scenario.role}`,
              evidence: 'Server-owned role, scenario, and emotional arc remain fixed for the session; consistency is confirmed by human review of the transcript and voice.',
            },
          ].map((metric) => (
            <article className="delivery-observation" key={metric.label}>
              <h3>{metric.label}</h3>
              <strong>{metric.value}</strong>
              <p>{metric.evidence}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="score-section" aria-labelledby="score-heading">
        <h2 id="score-heading">Five-part rubric</h2>
        <div className="score-list">
          {evaluation.categories.map((category) => (
            <article className="score-row" key={category.id}>
              <div>
                <strong>{category.label}</strong>
                <span>{category.evidence}</span>
              </div>
              <div className="score-meter" aria-label={`${category.score} out of 2`}>
                {[1, 2].map((point) => <span key={point} className={point <= category.score ? 'filled' : ''} />)}
                <strong>{category.score}/2</strong>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="report-columns">
        <section>
          <h2>What worked</h2>
          {evaluation.strengths.length ? (
            <ul className="check-list">
              {evaluation.strengths.map((strength) => <li key={strength}><Check size={18} aria-hidden="true" />{strength}</li>)}
            </ul>
          ) : (
            <p>Complete more turns to establish consistent strengths.</p>
          )}
        </section>
        <section>
          <h2>Try next</h2>
          <ol className="coaching-list">
            {evaluation.coaching.map((item) => <li key={item}>{item}</li>)}
          </ol>
        </section>
      </div>

      {evaluation.rewriteExamples.length > 0 && (
        <section className="rewrite-section">
          <h2>Suggested language</h2>
          <div className="evidence-grid">
            {evaluation.rewriteExamples.map((example) => (
              <blockquote key={example}>“{example}”</blockquote>
            ))}
          </div>
        </section>
      )}

      <section className="grounding-section" aria-labelledby="grounding-heading">
        <div className="grounding-heading">
          <div>
            <p className="eyebrow">Retrieved reference moments</p>
            <h2 id="grounding-heading">RAG grounding</h2>
          </div>
          <span>{evaluation.grounding.sources.length} synthetic sources</span>
        </div>
        <p>
          These curated communication examples were retrieved from finalized learner language.
          They ground context and coaching, while the five-part score remains deterministic.
        </p>
        <div className="grounding-source-list">
          {evaluation.grounding.sources.map((source) => (
            <article key={source.id}>
              <BookOpenCheck size={18} aria-hidden="true" />
              <div>
                <strong>{source.title}</strong>
                <span>{source.id}</span>
              </div>
            </article>
          ))}
        </div>
        <small>Dataset: {evaluation.grounding.datasetId} · Synthetic demo data only</small>
      </section>

      <section className="diagnostic-section">
        <button
          className="disclosure-button"
          type="button"
          onClick={(event) => {
            const details = event.currentTarget.nextElementSibling
            details?.toggleAttribute('hidden')
            event.currentTarget.setAttribute(
              'aria-expanded',
              String(details?.hasAttribute('hidden') === false),
            )
          }}
          aria-expanded="false"
        >
          <span>Diagnostic indicators</span>
          <ChevronDown size={18} aria-hidden="true" />
        </button>
        <ul hidden>
          {evaluation.diagnostics.map((diagnostic) => <li key={diagnostic}>{diagnostic}</li>)}
        </ul>
      </section>

      <section className="report-disclaimer">
        <p>This is practice feedback from a limited deterministic rubric, not a competency or performance assessment.</p>
        <button className="primary-button" type="button" onClick={onRestart}>
          <RotateCcw size={18} aria-hidden="true" />
          Start another scenario
        </button>
      </section>
    </main>
  )
}

export default App