import { describe, expect, it } from 'vitest'
import { computeAvatarMotion, visemeMouthShape } from './avatarMath'

describe('avatar motion', () => {
  it('renders silence and absent input as a neutral pose', () => {
    expect(computeAvatarMotion({ level: 0, mouthOpen: 0 }, [])).toEqual({ level: 0, mouthOpen: 0 })
    expect(computeAvatarMotion({ level: 0, mouthOpen: 0 }, [128, 128, 128]).mouthOpen).toBe(0)
  })

  it('clamps transients and releases more slowly than it attacks', () => {
    const opened = computeAvatarMotion({ level: 0, mouthOpen: 0 }, [0, 255, 0, 255])
    const released = computeAvatarMotion(opened, [128, 128, 128, 128])
    expect(opened.mouthOpen).toBeGreaterThan(0.5)
    expect(opened.mouthOpen).toBeLessThanOrEqual(1)
    expect(released.mouthOpen).toBeGreaterThan(0)
    expect(released.mouthOpen).toBeLessThan(opened.mouthOpen)
  })

  it('contains invalid samples and keeps reduced motion bounded', () => {
    const motion = computeAvatarMotion({ level: Number.NaN, mouthOpen: Number.NaN }, [Number.NaN], true)
    expect(motion).toEqual({ level: 0, mouthOpen: 0 })
  })

  it('maps Azure visemes to bounded and distinct mouth shapes', () => {
    const silence = visemeMouthShape(0)
    const openVowel = visemeMouthShape(2)
    const roundedVowel = visemeMouthShape(7)

    expect(silence.open).toBe(0)
    expect(openVowel.open).toBeGreaterThan(0.8)
    expect(openVowel.wide).toBeGreaterThan(roundedVowel.wide)
    expect(roundedVowel.round).toBe(1)
    expect(visemeMouthShape(99)).toEqual(silence)
    expect(visemeMouthShape(Number.NaN)).toEqual(silence)
  })
})