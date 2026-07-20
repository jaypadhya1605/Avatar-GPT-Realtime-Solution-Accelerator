import type { CSSProperties } from 'react'
import persona1Portrait from './assets/personas/synthetic-patient-01.png'
import persona2Portrait from './assets/personas/synthetic-patient-02.png'
import persona3Portrait from './assets/personas/synthetic-patient-03.png'
import { visemeMouthShape } from './avatarMath'
import type { ConversationStatus, Expression, Scenario } from './types'

const PORTRAITS: Record<string, string> = {
  'Persona 1': persona1Portrait,
  'Persona 3': persona2Portrait,
  'Persona 4': persona3Portrait,
}

interface AvatarProps {
  persona: Scenario['persona']
  expression: Expression
  status: ConversationStatus
  mouthOpen?: number
  visemeId?: number
  compact?: boolean
}

export function Avatar({
  persona,
  expression,
  status,
  mouthOpen = 0,
  visemeId = 0,
  compact = false,
}: AvatarProps) {
  const safeMouth = Math.min(1, Math.max(0, Number.isFinite(mouthOpen) ? mouthOpen : 0))
  const mouthShape = visemeMouthShape(visemeId)
  const speechWeight = safeMouth > 0.04 ? Math.max(0.45, safeMouth) : 0
  const shapedMouthOpen = Math.max(safeMouth * 0.38, mouthShape.open * speechWeight)
  const portrait = PORTRAITS[persona] ?? persona1Portrait
  const personaClass = persona.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  const style = {
    '--audio-level': `${safeMouth}`,
    '--mouth-open': `${shapedMouthOpen}`,
    '--mouth-round': `${mouthShape.round}`,
    '--mouth-wide': `${mouthShape.wide}`,
  } as CSSProperties

  return (
    <div
      className={`avatar avatar--${personaClass} ${compact ? 'avatar--compact' : ''}`}
      data-expression={expression}
      data-speaking={safeMouth > 0.04 ? 'true' : 'false'}
      data-status={status}
      data-viseme={visemeId}
      style={style}
    >
      <div className="avatar__halo" aria-hidden="true" />
      <div className="avatar__portrait-frame">
        <img
          className="avatar__portrait"
          src={portrait}
          alt={`Synthetic patient portrait for ${persona}`}
          draggable={false}
        />
        <span className="avatar__mouth-cavity" aria-hidden="true" />
        <img
          className="avatar__jaw"
          src={portrait}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
      </div>
      <div className="avatar__voice-meter" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      {!compact && <span className="avatar__name">{persona}</span>}
    </div>
  )
}