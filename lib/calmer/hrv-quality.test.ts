import { describe, it, expect } from 'vitest'
import { cleanRmssd, plausibleHeartRate } from './hrv-quality'
import { computeRMSSD } from './readiness'

describe('plausibleHeartRate', () => {
  it('passes rates a seated adult can have', () => {
    expect(plausibleHeartRate(40)).toBe(40)
    expect(plausibleHeartRate(122)).toBe(122)
    expect(plausibleHeartRate(180)).toBe(180)
  })

  it('rejects misreads (the bench data reached 218 bpm)', () => {
    expect(plausibleHeartRate(218)).toBeNull()
    expect(plausibleHeartRate(39)).toBeNull()
    expect(plausibleHeartRate(null)).toBeNull()
    expect(plausibleHeartRate(Number.NaN)).toBeNull()
  })
})

describe('cleanRmssd', () => {
  it('matches plain RMSSD on clean beats', () => {
    const ibis = [800, 820, 790, 810, 805]
    expect(cleanRmssd(ibis).rmssd).toBeCloseTo(computeRMSSD(ibis)!, 10)
    expect(cleanRmssd(ibis).accepted).toBe(5)
  })

  it('drops a missed beat instead of reading it as variability', () => {
    // 1600 = a missed beat (two intervals counted as one). Raw RMSSD explodes.
    const ibis = [800, 810, 1600, 805, 795, 800]
    const raw = computeRMSSD(ibis)!
    const clean = cleanRmssd(ibis)
    expect(raw).toBeGreaterThan(500)
    expect(clean.rmssd).toBeLessThan(15)
    expect(clean.accepted).toBe(5)
  })

  it('never differences across a rejected beat', () => {
    // 800 -> [400 rejected] -> 1200? no: only adjacent ACCEPTED pairs count
    const r = cleanRmssd([800, 400, 820, 810, 790])
    // pairs: (820,810), (810,790) -> diffs -10, -20 -> rmssd sqrt((100+400)/2)
    expect(r.rmssd).toBeCloseTo(Math.sqrt(250), 10)
  })

  it('returns null rather than a number built from too few clean beats', () => {
    expect(cleanRmssd([800, 1700, 300]).rmssd).toBeNull()
    expect(cleanRmssd([]).rmssd).toBeNull()
  })
})
