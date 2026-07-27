import { describe, it, expect } from 'vitest'
import {
  computeReadinessScore,
  classifyBiometrics,
  computeRMSSD,
  corroborateBiometricTransition,
} from './readiness'
import { combineRisk } from './safety'

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

  it('refuses to infer calm from elapsed time alone', () => {
    // A lone sessionContext term used to renormalize to full weight and report
    // readiness 1.0 on a long-running session with no substantive signal.
    const r = computeReadinessScore({ sessionDurationSeconds: 600 })
    expect(r.readinessScore).toBe(0.5)
    expect(r.stressLevel).toBe('moderate')
    expect(r.signalsUsed).toEqual(['sessionContext'])
  })

  it('uses sessionContext once a substantive signal exists', () => {
    const r = computeReadinessScore({ ventingIntensities: [80, 20], sessionDurationSeconds: 600 })
    expect(r.readinessScore).toBeGreaterThan(0.5)
    expect(r.signalsUsed).toEqual(expect.arrayContaining(['ventingTrend', 'sessionContext']))
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

describe('combineRisk (layered safety)', () => {
  it('escalates to high on a keyword hit regardless of the LLM verdict', () => {
    expect(combineRisk(true, 'NONE')).toBe('high')
    expect(combineRisk(true, null)).toBe('high')
  })

  it('honours an LLM HIGH verdict (case/whitespace-insensitive)', () => {
    expect(combineRisk(false, 'HIGH')).toBe('high')
    expect(combineRisk(false, ' high\n')).toBe('high')
  })

  it('is low only when the LLM says LOW and no keyword fired', () => {
    expect(combineRisk(false, 'LOW')).toBe('low')
  })

  it('is none for ordinary messages', () => {
    expect(combineRisk(false, 'NONE')).toBe('none')
    expect(combineRisk(false, null)).toBe('none')
  })
})

// The false-positive guard [Neupane et al. 2025]: one threshold crossing must
// never drive a transition on its own.
describe('corroborateBiometricTransition', () => {
  const calming = [0.9, 0.7, 0.5]
  const decliningVenting = [80, 40, 10]

  it('rejects when there is not enough biometric history', () => {
    const r = corroborateBiometricTransition({ biometricStressScores: [0.9, 0.5], ventingIntensities: decliningVenting })
    expect(r.corroborated).toBe(false)
    expect(r.reason).toContain('insufficient')
  })

  it('rejects a sustained decline that no other signal agrees with', () => {
    const r = corroborateBiometricTransition({ biometricStressScores: calming })
    expect(r.corroborated).toBe(false)
    expect(r.reason).toContain('no non-biometric signal')
  })

  it('rejects a single dip that is not sustained', () => {
    const r = corroborateBiometricTransition({
      biometricStressScores: [0.3, 0.9, 0.2],
      ventingIntensities: decliningVenting,
    })
    expect(r.corroborated).toBe(false)
    expect(r.reason).toContain('not sustained')
  })

  it('corroborates a sustained decline that venting trend agrees with', () => {
    const r = corroborateBiometricTransition({
      biometricStressScores: calming,
      ventingIntensities: decliningVenting,
    })
    expect(r.corroborated).toBe(true)
    expect(r.reason).toContain('ventingTrend')
  })

  it('corroborates via sentiment when venting data is absent', () => {
    const r = corroborateBiometricTransition({ biometricStressScores: calming, sentimentScores: [0.4] })
    expect(r.corroborated).toBe(true)
    expect(r.reason).toContain('sentiment')
  })

  it('tolerates a small blip without breaking the run', () => {
    const r = corroborateBiometricTransition({
      biometricStressScores: [0.9, 0.92, 0.6],
      ventingIntensities: decliningVenting,
    })
    expect(r.corroborated).toBe(true)
  })
})
