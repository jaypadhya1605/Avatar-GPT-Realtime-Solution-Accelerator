import type { ProtocolEvent } from './protocol'
import type { Scenario } from './types'

const OPENINGS: Record<Scenario['id'], string> = {
  'SCN-001':
    "I'm trying to hold it together, but I'm scared. What happens next? Am I going to suffer?",
  'SCN-002':
    "I don't have much energy left for all these conversations. I feel worn down, and I need someone to be honest with me.",
  'SCN-003':
    "I nodded before, but honestly, I didn't understand most of that explanation. Could you start over in plain language?",
}

const JARGON = /\b(prognosis|morbidity|palliative|intubation|differential|metastatic|comorbidity|clinical pathway)\b/i
const EMPATHY = /\b(hear|understand|scared|afraid|hard|makes sense|sorry|with you|together)\b/i
const MOCK_VISEMES = [21, 1, 19, 4, 15, 7, 20, 2, 14, 8, 0] as const

export const mockReplyFor = (scenario: Scenario, learnerText: string, turn: number) => {
  if (JARGON.test(learnerText)) {
    return scenario.id === 'SCN-003'
      ? "That's one of the words I didn't understand. Could you say what it means in everyday language?"
      : "I'm not sure I understand that term. Could you explain it more simply?"
  }
  if (EMPATHY.test(learnerText)) {
    if (scenario.id === 'SCN-001') {
      return turn > 1
        ? "Thank you for not rushing past that. I feel a little less alone when you say we'll take this one step at a time."
        : "Yes, scared is exactly it. It helps that you're willing to talk about it directly with me."
    }
    if (scenario.id === 'SCN-002') {
      return "Thank you. I don't need you to make this sound better. Could we pause, then talk honestly about what happens next?"
    }
    return "That helps. I was worried I'd sound foolish asking again, but plain words make this feel manageable."
  }
  if (scenario.id === 'SCN-001') return "I hear the information, but I'm still not sure what it means for what I'll feel day to day."
  if (scenario.id === 'SCN-002') return "That feels like more information to carry. I need you to slow down and be honest about what happens next."
  return "I think I need you to slow down and explain that another way. I'm still getting lost."
}

export const mockOpeningFor = (scenarioId: Scenario['id']) => OPENINGS[scenarioId]

interface MockCallbacks {
  dispatch: (event: ProtocolEvent) => void
  onAudioLevel: (level: number) => void
  onViseme: (visemeId: number) => void
  onDebugEvent: (eventName: string) => void
}

export class MockConversation {
  private readonly scenario: Scenario
  private readonly callbacks: MockCallbacks
  private responseTimer: number | null = null
  private levelTimer: number | null = null
  private activeResponse: { itemId: string; responseId: string } | null = null
  private turn = 0
  private sequence = 0
  private closed = false

  constructor(scenario: Scenario, callbacks: MockCallbacks) {
    this.scenario = scenario
    this.callbacks = callbacks
  }

  start(): void {
    this.closed = false
    this.callbacks.dispatch({ type: 'connection-state', generation: 1, status: 'connecting' })
    window.setTimeout(() => {
      if (this.closed) return
      this.callbacks.dispatch({ type: 'connection-state', generation: 1, status: 'listening' })
      this.speak(mockOpeningFor(this.scenario.id))
    }, 300)
  }

  submit(learnerText: string): void {
    const text = learnerText.trim().slice(0, 4000)
    if (!text || this.closed) return
    this.sequence += 1
    const learnerId = `mock-learner-${this.sequence}`
    this.callbacks.dispatch({ type: 'speech-started', generation: 1, itemId: learnerId })
    if (this.activeResponse) this.stopActiveResponse(true)
    this.callbacks.dispatch({
      type: 'learner-transcript',
      generation: 1,
      itemId: learnerId,
      transcript: text,
    })
    this.callbacks.dispatch({ type: 'speech-stopped', generation: 1, itemId: learnerId })
    this.turn += 1
    const response = mockReplyFor(this.scenario, text, this.turn)
    this.responseTimer = window.setTimeout(() => {
      this.callbacks.dispatch({
        type: 'response-audio-latency',
        generation: 1,
        valueMs: 500,
      })
      this.callbacks.dispatch({
        type: 'response-signal-latency',
        generation: 1,
        valueMs: 500,
      })
      this.speak(response)
    }, 500)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.stopActiveResponse()
    if (this.responseTimer !== null) window.clearTimeout(this.responseTimer)
    this.responseTimer = null
    window.speechSynthesis?.cancel()
    this.callbacks.onAudioLevel(0)
    this.callbacks.onViseme(0)
  }

  private speak(text: string): void {
    if (this.closed) return
    this.sequence += 1
    const itemId = `mock-avatar-${this.sequence}`
    const responseId = `mock-response-${this.sequence}`
    this.activeResponse = { itemId, responseId }
    this.callbacks.onDebugEvent('mock.response.created')
    this.callbacks.dispatch({
      type: 'avatar-transcript-delta',
      generation: 1,
      itemId,
      responseId,
      delta: text,
    })
    this.callbacks.dispatch({ type: 'avatar-output-started', generation: 1, responseId })
    const started = performance.now()
    this.levelTimer = window.setInterval(() => {
      const elapsed = performance.now() - started
      this.callbacks.onAudioLevel(0.2 + Math.abs(Math.sin(elapsed / 95)) * 0.58)
      this.callbacks.onViseme(MOCK_VISEMES[Math.floor(elapsed / 90) % MOCK_VISEMES.length])
    }, 50)
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 0.92
      utterance.pitch = this.scenario.id === 'SCN-002' ? 0.88 : 1
      window.speechSynthesis.speak(utterance)
    }
    const duration = Math.min(6200, Math.max(1800, text.length * 38))
    this.responseTimer = window.setTimeout(() => this.finishActiveResponse(), duration)
  }

  private stopActiveResponse(interrupted = false): void {
    if (!this.activeResponse) return
    window.speechSynthesis?.cancel()
    if (interrupted) {
      this.callbacks.dispatch({
        type: 'interruption-stop-latency',
        generation: 1,
        valueMs: 80,
      })
    }
    this.finishActiveResponse()
  }

  private finishActiveResponse(): void {
    if (!this.activeResponse) return
    const { responseId } = this.activeResponse
    if (this.levelTimer !== null) window.clearInterval(this.levelTimer)
    if (this.responseTimer !== null) window.clearTimeout(this.responseTimer)
    this.levelTimer = null
    this.responseTimer = null
    this.callbacks.onAudioLevel(0)
    this.callbacks.onViseme(0)
    this.callbacks.dispatch({ type: 'avatar-output-stopped', generation: 1, responseId })
    this.activeResponse = null
  }
}