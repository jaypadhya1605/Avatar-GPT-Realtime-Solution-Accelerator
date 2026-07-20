import type {
  Evaluation,
  PublicConfig,
  Scenario,
} from './types'

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export class ApiClient {
  async config(): Promise<PublicConfig> {
    return this.request<PublicConfig>('/api/config')
  }

  async scenarios(): Promise<Scenario[]> {
    return this.request<Scenario[]>('/api/scenarios')
  }

  async evaluate(
    scenarioId: Scenario['id'],
    learnerTurns: string[],
    avatarTurns: string[],
    interruptedCount: number,
    transcriptionFailures: number,
    estimatedAvatarSegments: number,
  ): Promise<Evaluation> {
    return this.request<Evaluation>('/api/evaluations', {
      method: 'POST',
      body: JSON.stringify({
        scenarioId,
        learnerTurns,
        avatarTurns,
        interruptedCount,
        transcriptionFailures,
        estimatedAvatarSegments,
      }),
    })
  }

  async resetVoiceSession(keepalive = false): Promise<void> {
    await this.request<void>('/api/voice-live/reset', { method: 'POST', keepalive })
  }

  private async request<T>(
    url: string,
    init: RequestInit = {},
  ): Promise<T> {
    const headers = new Headers(init.headers)
    if (init.body) headers.set('Content-Type', 'application/json')
    const response = await fetch(url, { ...init, headers })
    if (!response.ok) {
      let message = `Request failed (${response.status}).`
      try {
        const payload = (await response.json()) as { detail?: string }
        if (payload.detail) message = payload.detail
      } catch {
        // Stable fallback intentionally avoids exposing an upstream body.
      }
      throw new ApiError(message, response.status)
    }
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }
}