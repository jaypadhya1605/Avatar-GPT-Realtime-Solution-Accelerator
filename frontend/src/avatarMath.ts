export interface AvatarMotion {
  level: number
  mouthOpen: number
}

export interface VisemeMouthShape {
  open: number
  wide: number
  round: number
}

const VISEME_MOUTH_SHAPES: readonly VisemeMouthShape[] = [
  { open: 0, wide: 0.72, round: 0.1 },
  { open: 0.55, wide: 1, round: 0.05 },
  { open: 0.85, wide: 0.9, round: 0.05 },
  { open: 0.7, wide: 0.68, round: 0.5 },
  { open: 0.45, wide: 0.95, round: 0.05 },
  { open: 0.35, wide: 0.76, round: 0.2 },
  { open: 0.28, wide: 1, round: 0.02 },
  { open: 0.62, wide: 0.48, round: 1 },
  { open: 0.75, wide: 0.55, round: 0.9 },
  { open: 0.8, wide: 0.65, round: 0.65 },
  { open: 0.72, wide: 0.9, round: 0.08 },
  { open: 0.65, wide: 0.92, round: 0.08 },
  { open: 0.35, wide: 0.74, round: 0.25 },
  { open: 0.28, wide: 0.74, round: 0.22 },
  { open: 0.26, wide: 0.86, round: 0.05 },
  { open: 0.18, wide: 0.9, round: 0.02 },
  { open: 0.3, wide: 0.82, round: 0.08 },
  { open: 0.2, wide: 0.84, round: 0.04 },
  { open: 0.12, wide: 0.9, round: 0.02 },
  { open: 0.22, wide: 0.82, round: 0.05 },
  { open: 0.26, wide: 0.7, round: 0.12 },
  { open: 0.04, wide: 0.72, round: 0.02 },
]

const clamp = (value: number, minimum = 0, maximum = 1) =>
  Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum))

export const visemeMouthShape = (visemeId: number): VisemeMouthShape =>
  VISEME_MOUTH_SHAPES[Number.isInteger(visemeId) ? visemeId : 0] ?? VISEME_MOUTH_SHAPES[0]

export function computeAvatarMotion(
  previous: AvatarMotion,
  samples: readonly number[],
  reducedMotion = false,
): AvatarMotion {
  if (samples.length === 0) return { level: 0, mouthOpen: 0 }
  const energy = samples.reduce((sum, sample) => {
    const centered = clamp((sample - 128) / 128, -1, 1)
    return sum + centered * centered
  }, 0)
  const rms = clamp(Math.sqrt(energy / samples.length) * 2.8)
  const smoothing = rms > previous.level ? 0.72 : 0.2
  const level = clamp(previous.level + (rms - previous.level) * smoothing)
  return {
    level,
    mouthOpen: reducedMotion ? (level > 0.08 ? 0.55 : 0) : clamp(level * 1.1),
  }
}