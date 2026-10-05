import { describe, it, expect } from 'vitest'
import { cleanRmssd, contiguousBeats, MAX_BEAT_GAP_MS, plausibleHeartRate } from './hrv-quality'
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

describe('contiguousBeats', () => {
  const now = Date.parse('2026-10-06T10:00:10Z')
  const at = (s: number) => new Date(now - s * 1000).toISOString()

  it('joins every beat from consecutive readings, oldest first', () => {
    const rows = [
      { recorded_at: at(6), ibi: 810, ibis: [800, 810] },
      { recorded_at: at(4), ibi: 830, ibis: [820, 830] },
      { recorded_at: at(2), ibi: 850, ibis: [840, 850] },
    ]
    expect(contiguousBeats(rows, [860, 870], now)).toEqual([800, 810, 820, 830, 840, 850, 860, 870])
  })

  it('stops at a dropout so beats either side are never treated as successive', () => {
    const gapSeconds = MAX_BEAT_GAP_MS / 1000 + 4
    const rows = [
      { recorded_at: at(2 + gapSeconds + 2), ibi: 700, ibis: [700] }, // before the dropout
      { recorded_at: at(2), ibi: 900, ibis: [900] },
    ]
    expect(contiguousBeats(rows, [910], now)).toEqual([900, 910])
  })

  it("never treats the old bridge's one-beat-per-post readings as successive beats", () => {
    const rows = [
      { recorded_at: at(4), ibi: 800, ibis: [800, 805] },
      { recorded_at: at(2), ibi: 820, ibis: null }, // old bridge: breaks the run
    ]
    expect(contiguousBeats(rows, [830], now)).toEqual([830])
    expect(contiguousBeats(rows, [], now)).toEqual([]) // old-bridge request: unknown
  })

  it('is just the current beats when the last reading is stale', () => {
    expect(contiguousBeats([{ recorded_at: at(60), ibi: 800 }], [790], now)).toEqual([790])
  })
})

