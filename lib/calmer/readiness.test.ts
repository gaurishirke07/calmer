import { describe, it, expect } from 'vitest'
import { computeReadinessScore, classifyBiometrics, computeRMSSD } from './readiness'

describe('computeReadinessScore', () => {
  it('returns a neutral moderate score when no signals are present', () => {
    const r = computeReadinessScore({})
    expect(r.readinessScore).toBe(0.5)
    expect(r.stressLevel).toBe('moderate')
    expect(r.signalsUsed).toEqual([])
    expect(r.usingStubSignals).toBe(false)
  })

  it('reads calmer (high readiness) when venting intensity declines over time', () => {
    const r = computeReadinessScore({ ventingIntensities: [60, 50, 40, 10] })
    expect(r.readinessScore).toBeGreaterThan(0.66)
    expect(r.stressLevel).toBe('low')
    expect(r.signalsUsed).toContain('ventingTrend')
  })

  it('reads high-stress (low readiness) when venting intensity escalates', () => {
    const r = computeReadinessScore({ ventingIntensities: [10, 20, 60] })
    expect(r.readinessScore).toBeLessThan(0.33)
    expect(r.stressLevel).toBe('high')
  })

  it('needs at least two points before a trend signal counts', () => {
    const r = computeReadinessScore({ ventingIntensities: [40] })
    expect(r.signalsUsed).not.toContain('ventingTrend')
  })

  // The graceful-degradation claim: the score fuses ONLY the signals present
  // and renormalizes across them, so it stays valid with any subset.
  it('renormalizes over whichever signals are available', () => {
    const ventingOnly = computeReadinessScore({ ventingIntensities: [50, 20] })
    expect(ventingOnly.signalsUsed).toEqual(['ventingTrend'])

    const fused = computeReadinessScore({
      ventingIntensities: [50, 20],
      sentimentScores: [0.4],
      sessionDurationSeconds: 90,
    })
    expect(fused.signalsUsed).toEqual(
      expect.arrayContaining(['ventingTrend', 'sentiment', 'sessionContext']),
    )
    expect(fused.readinessScore).toBeGreaterThanOrEqual(0)
    expect(fused.readinessScore).toBeLessThanOrEqual(1)
  })

  it('propagates the stub-sentiment flag onto the result', () => {
    const r = computeReadinessScore({ sentimentScores: [-0.5], usingStubSentiment: true })
    expect(r.usingStubSignals).toBe(true)
  })
})

describe('classifyBiometrics', () => {
  it('scores a calm resting reading as low stress', () => {
    const r = classifyBiometrics(75, 50)
    expect(r.stressScore).toBeCloseTo(0, 5)
    expect(r.stressClass).toBe('low')
  })

  it('scores high heart rate + firm grip as high stress', () => {
    const r = classifyBiometrics(130, 1000)
    expect(r.stressScore).toBeCloseTo(0.82, 2)
    expect(r.stressClass).toBe('high')
  })

  it('scores an elevated mid-range reading as moderate', () => {
    const r = classifyBiometrics(110, 700)
    expect(r.stressScore).toBeCloseTo(0.56, 2)
    expect(r.stressClass).toBe('moderate')
  })

  it('treats bradycardia (<60 bpm) as atypical, not calm', () => {
    // 0.4 bpm weight * 0.4 = 0.16 — non-zero even with no grip signal
    const r = classifyBiometrics(50, null)
    expect(r.stressScore).toBeCloseTo(0.16, 5)
  })

  it('handles missing sensors without throwing', () => {
    const r = classifyBiometrics(null, null)
    expect(r.stressScore).toBe(0)
    expect(r.stressClass).toBe('low')
  })
})

describe('computeRMSSD', () => {
  it('returns null with fewer than 2 intervals', () => {
    expect(computeRMSSD([])).toBeNull()
    expect(computeRMSSD([800])).toBeNull()
  })

  it('is 0 when the beat interval is perfectly steady (no variability)', () => {
    expect(computeRMSSD([800, 800, 800, 800])).toBe(0)
  })

  it('computes the root-mean-square of successive differences', () => {
    // diffs: +50, -50 -> squares 2500, 2500 -> mean 2500 -> sqrt = 50
    expect(computeRMSSD([800, 850, 800])).toBeCloseTo(50, 5)
  })
})
