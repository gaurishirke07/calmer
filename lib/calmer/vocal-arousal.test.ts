import { describe, it, expect } from 'vitest'
import { rmsToDb, updateNoiseFloor, vocalIntensity, VOICE_MARGIN_DB, VOICE_RANGE_DB } from './vocal-arousal'
import { computeReadinessScore } from './readiness'

describe('vocal-arousal helpers', () => {
  it('converts RMS to dBFS', () => {
    expect(rmsToDb(1)).toBeCloseTo(0, 10)
    expect(rmsToDb(0.1)).toBeCloseTo(-20, 10)
    expect(Number.isFinite(rmsToDb(0))).toBe(true) // silence must not produce -Infinity
  })

  it('tracks the noise floor: falls instantly, rises slowly', () => {
    expect(updateNoiseFloor(null, -60)).toBe(-60)
    expect(updateNoiseFloor(-50, -70)).toBe(-70)
    const after = updateNoiseFloor(-60, -20) // one loud frame barely moves it
    expect(after).toBeGreaterThan(-60)
    expect(after).toBeLessThan(-59.5)
  })

  it('ignores digital-silence frames when tracking the floor', () => {
    // start-up silence must not drag the floor to -160 dB
    expect(updateNoiseFloor(null, rmsToDb(0))).toBeNull()
    expect(updateNoiseFloor(-60, rmsToDb(0))).toBe(-60)
    // ...so a quiet -60 dB room afterwards reads as no speech, not as shouting
    let floor = updateNoiseFloor(null, rmsToDb(0))
    floor = updateNoiseFloor(floor, -60)
    expect(floor).toBe(-60)
    expect(vocalIntensity(-60, floor!)).toBe(0)
  })

  it('reads 0 for anything below the speech threshold', () => {
    expect(vocalIntensity(-55, -60)).toBe(0) // only 5 dB above the floor
    expect(vocalIntensity(-60 + VOICE_MARGIN_DB, -60)).toBe(0)
  })

  it('rises linearly above the threshold and caps at 100', () => {
    expect(vocalIntensity(-60 + VOICE_MARGIN_DB + VOICE_RANGE_DB / 2, -60)).toBeCloseTo(50, 10)
    expect(vocalIntensity(0, -60)).toBe(100)
  })
})

// The opt-in signal reuses the venting rule: decline from the session's own peak.
describe('voiceTrend in the readiness fusion', () => {
  const base = { ventingIntensities: [80, 20], sessionDurationSeconds: 60 }

  it('is absent (score untouched) when the mic is off', () => {
    const r = computeReadinessScore(base)
    expect(r.signalsUsed).not.toContain('voiceTrend')
  })

  it('reads settled after quieting down from a shout, activated while still shouting', () => {
    const quieted = computeReadinessScore({ vocalIntensities: [90, 80, 0, 0, 0, 0, 0, 0], vocalSessionPeak: 90 })
    const shouting = computeReadinessScore({ vocalIntensities: [40, 70, 90, 90], vocalSessionPeak: 90 })
    const value = (r: ReturnType<typeof computeReadinessScore>) => r.contributions.find((c) => c.key === 'voiceTrend')!.value
    expect(value(quieted)).toBe(1)
    expect(value(shouting)).toBe(0)
  })

  it('treats a user who never spoke as no signal, not as activated', () => {
    const r = computeReadinessScore({ ...base, vocalIntensities: [0, 0, 0, 0] })
    expect(r.signalsUsed).not.toContain('voiceTrend')
  })
})
