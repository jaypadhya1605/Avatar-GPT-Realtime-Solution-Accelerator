import { describe, expect, it } from 'vitest'
import { mockOpeningFor, mockReplyFor } from './mock'
import type { Scenario } from './types'

const scenario: Scenario = {
  id: 'SCN-002',
  version: '1.0',
  persona: 'Persona 3',
  role: 'Synthetic patient',
  context: 'Synthetic context',
  startingEmotion: 'Withdrawn, discouraged, and emotionally exhausted',
  estimatedMinutes: 6,
  trainingFocus: 'Recognizing withdrawal, allowing silence, and avoiding false reassurance',
  expression: 'guarded',
}

describe('SCN-002 mock narrative', () => {
  it('keeps its opening and replies aligned with the withdrawn patient scenario', () => {
    const dialogue = [
      mockOpeningFor('SCN-002'),
      mockReplyFor(scenario, 'I hear how exhausted you feel.', 1),
      mockReplyFor(scenario, 'Here is more information.', 2),
    ]

    expect(dialogue.join(' ')).toMatch(/energy|worn down/)
    expect(dialogue.join(' ')).toMatch(/pause|honest/)
    expect(dialogue.join(' ')).not.toMatch(/family|parent/i)
  })
})