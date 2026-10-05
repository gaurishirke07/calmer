import { describe, it, expect } from 'vitest'
import {
  computeReadinessScore,
  classifyBiometrics,
  computeRMSSD,
  corroborateBiometricTransition,
  detectSafetyTrigger,
  isMissingSignalColumns,
  signalValuesOf,
  shouldOfferHandoff,
  NOMINAL_WEIGHTS,
} from './readiness'
import {
  CHAT_UNAVAILABLE_REPLY,
  CRISIS_LINE,
  RISK_CHECK_UNAVAILABLE_INSTRUCTION,
  SAFETY_MODE_SYSTEM,
  assessRisk,
  combineRisk,
} from './safety'

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

  // Paper §III: the venting trend is the distance below the SESSION peak. The
  // history passed in is only a recent window, so the caller supplies the peak.
  it('measures decline against the session peak, not just the window', () => {
    // An early grenade (60) has scrolled out; the window holds steady bat hits.
    const windowOnly = computeReadinessScore({ ventingIntensities: [10, 10, 10, 10] })
    const withPeak = computeReadinessScore({ ventingIntensities: [10, 10, 10, 10], ventingSessionPeak: 60 })
    expect(windowOnly.contributions[0].value).toBe(0) // reads "at peak"
    expect(withPeak.contributions[0].value).toBeCloseTo(50 / 60, 10) // well below the real peak
  })

  it('keeps a long calm settled after the burst leaves the window', () => {
    const r = computeReadinessScore({ ventingIntensities: [0, 0, 0, 0], ventingSessionPeak: 10 })
    expect(r.signalsUsed).toContain('ventingTrend')
    expect(r.contributions[0].value).toBe(1)
  })

  it('never uses a session peak below the window maximum', () => {
    const r = computeReadinessScore({ ventingIntensities: [40, 10], ventingSessionPeak: 5 })
    expect(r.contributions[0].value).toBeCloseTo(30 / 40, 10)
  })

  // Observed live: a user idling in the room before venting read ~0.05
  // "activated", because an all-zero history has its "peak" at 0.
  it('treats a history with no venting yet as no signal, not as activated', () => {
    const r = computeReadinessScore({ ventingIntensities: [0, 0, 0, 0], sessionDurationSeconds: 20 })
    expect(r.signalsUsed).not.toContain('ventingTrend')
    expect(r.readinessScore).toBe(0.5) // only sessionContext left -> neutral guard
    expect(r.stressLevel).toBe('moderate')
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

// The explainable-readiness breakdown that the dashboard renders and the offline
// weight study perturbs. The score is a black box without it.
describe('computeReadinessScore — contributions breakdown', () => {
  const CANON = ['ventingTrend', 'biometricTrend', 'sentiment', 'facialAffect', 'voiceTrend', 'sessionContext']

  it('always returns every signal in canonical order', () => {
    const r = computeReadinessScore({ ventingIntensities: [60, 20] })
    expect(r.contributions.map((c) => c.key)).toEqual(CANON)
  })

  it('marks absent signals inactive and zeroed', () => {
    const r = computeReadinessScore({ ventingIntensities: [60, 20] })
    const bio = r.contributions.find((c) => c.key === 'biometricTrend')!
    expect(bio.active).toBe(false)
    expect(bio.value).toBeNull()
    expect(bio.effectiveWeight).toBe(0)
    expect(bio.contribution).toBe(0)
  })

  it('active contributions sum to the readiness score (normal path)', () => {
    const r = computeReadinessScore({
      ventingIntensities: [80, 20],
      sentimentScores: [0.4],
      sessionDurationSeconds: 90,
    })
    const sum = r.contributions.reduce((s, c) => s + c.contribution, 0)
    expect(sum).toBeCloseTo(r.readinessScore, 10)
  })

  it('renormalises effective weights over present signals (they sum to 1)', () => {
    const r = computeReadinessScore({ ventingIntensities: [80, 20], sentimentScores: [0.4] })
    const active = r.contributions.filter((c) => c.active)
    expect(active.map((c) => c.key)).toEqual(['ventingTrend', 'sentiment'])
    expect(active.reduce((s, c) => s + c.effectiveWeight, 0)).toBeCloseTo(1, 10)
    // ventingTrend keeps its 0.35 : 0.20 ratio against sentiment after renormalising
    const venting = active.find((c) => c.key === 'ventingTrend')!
    expect(venting.effectiveWeight).toBeCloseTo(0.35 / 0.55, 10)
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
    // heart rate alone carries the reading (grip absent): its atypical score, 0.4
    const r = classifyBiometrics(50, null)
    expect(r.stressScore).toBeCloseTo(0.4, 5)
    expect(r.stressClass).toBe('moderate')
  })

  // A missing channel used to enter as 0 — a perfectly calm heart — so a
  // maximum squeeze with no pulse scored only 0.6. It now renormalises.
  it('renormalises over the channel that is present', () => {
    expect(classifyBiometrics(null, 1000).stressScore).toBe(1)
    expect(classifyBiometrics(130, null).stressScore).toBeCloseTo(0.55, 10)
  })

  // Bench data: a misread 218 bpm used to score as maximal stress.
  it('treats an implausible heart rate as unavailable, like a dropout', () => {
    expect(classifyBiometrics(218, 50)).toEqual(classifyBiometrics(null, 50))
    expect(classifyBiometrics(30, 50)).toEqual(classifyBiometrics(null, 50))
    expect(classifyBiometrics(180, null).stressScore).toBe(1) // the ceiling itself is plausible
  })

  it('returns no reading — not "calm" — when no channel is usable', () => {
    expect(classifyBiometrics(null, null)).toEqual({ stressScore: null, stressClass: null })
    expect(classifyBiometrics(250, null)).toEqual({ stressScore: null, stressClass: null })
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
    // whole words only: "allowed" in an error string is not a LOW verdict
    expect(combineRisk(false, 'ERROR: request not allowed')).toBe('none')
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

// The handoff decision rule. Observed live: one quiet 3 s flush mid-venting
// pushed readiness from ~0.05 to ~0.8 and fired the handoff while the user was
// still smashing things. A single crossing must not be enough.
describe('shouldOfferHandoff', () => {
  const T = 0.66

  it('does not fire on a single crossing', () => {
    expect(shouldOfferHandoff([0.05, 0.05, 0.79], T)).toBe(false)
  })

  it('does not fire on a spike that falls back (the live failure case)', () => {
    expect(shouldOfferHandoff([0.05, 0.78, 0.79, 0.1], T)).toBe(false)
  })

  it('fires once readiness has held above the threshold for three computations', () => {
    expect(shouldOfferHandoff([0.3, 0.69, 0.83, 0.84], T)).toBe(true)
  })

  it('counts a score exactly at the threshold as calm-enough', () => {
    expect(shouldOfferHandoff([0.66, 0.66, 0.66], T)).toBe(true)
  })

  it('withdraws the offer when the latest score drops back below', () => {
    expect(shouldOfferHandoff([0.8, 0.85, 0.9, 0.2], T)).toBe(false)
  })

  it('needs at least minConsecutive scores', () => {
    expect(shouldOfferHandoff([0.9, 0.9], T)).toBe(false)
    expect(shouldOfferHandoff([0.9, 0.9], T, 2)).toBe(true)
  })
})

// The offline weight-sensitivity study re-fuses with other weights; production
// must keep using the priors.
describe('computeReadinessScore — weight override (analysis only)', () => {
  const inputs = { ventingIntensities: [80, 20], sentimentScores: [-0.6], sessionDurationSeconds: 60 }

  it('defaults to the prior weights', () => {
    expect(computeReadinessScore(inputs).readinessScore).toBe(
      computeReadinessScore(inputs, { ...NOMINAL_WEIGHTS }).readinessScore,
    )
  })

  it('re-fuses the same signals under different weights', () => {
    const ventingHeavy = computeReadinessScore(inputs, { ventingTrend: 0.9, biometricTrend: 0, sentiment: 0.05, facialAffect: 0, voiceTrend: 0, sessionContext: 0.05 })
    const sentimentHeavy = computeReadinessScore(inputs, { ventingTrend: 0.05, biometricTrend: 0, sentiment: 0.9, facialAffect: 0, voiceTrend: 0, sessionContext: 0.05 })
    expect(ventingHeavy.readinessScore).toBeGreaterThan(sentimentHeavy.readinessScore) // venting calm, text angry
    expect(ventingHeavy.contributions.map((c) => c.value)).toEqual(sentimentHeavy.contributions.map((c) => c.value))
  })

  it('exposes the priors read-only', () => {
    expect(Object.isFrozen(NOMINAL_WEIGHTS)).toBe(true)
    // the four PUBLISHED weights sum to 1; facialAffect is an opt-in extra
    const published = ['ventingTrend', 'biometricTrend', 'sentiment', 'sessionContext'] as const
    expect(published.reduce((a, k) => a + NOMINAL_WEIGHTS[k], 0)).toBeCloseTo(1, 10)
  })
})

// Fail-safes: when the LLM risk check can't run, the system must not pass the
// keyword-only result off as a clean check (keyword-only recall was 26.7%).
describe('assessRisk (safety fail-safe)', () => {
  it('flags the check as unavailable when the LLM call failed', () => {
    expect(assessRisk(false, null)).toEqual({ risk: 'none', checkUnavailable: true })
  })

  it('treats an unparseable verdict as unavailable, not as a clean NONE', () => {
    expect(assessRisk(false, 'I cannot help with that.')).toEqual({ risk: 'none', checkUnavailable: true })
  })

  it('accepts a real verdict', () => {
    expect(assessRisk(false, 'NONE')).toEqual({ risk: 'none', checkUnavailable: false })
    expect(assessRisk(false, ' low\n')).toEqual({ risk: 'low', checkUnavailable: false })
  })

  it('still escalates on a keyword hit when the LLM is down', () => {
    expect(assessRisk(true, null)).toEqual({ risk: 'high', checkUnavailable: true })
  })

  it('carries the crisis line in every fail-safe text', () => {
    for (const t of [SAFETY_MODE_SYSTEM, RISK_CHECK_UNAVAILABLE_INSTRUCTION, CHAT_UNAVAILABLE_REPLY]) {
      expect(t).toContain(CRISIS_LINE)
    }
    expect(CRISIS_LINE).toContain('14416')
  })
})

describe('safety keyword pre-filter', () => {
  it('catches the variants the list used to miss', () => {
    for (const t of ['I feel suicidal', 'thinking about self-harm again', 'I keep cutting myself', "everyone's better off dead"]) {
      expect(detectSafetyTrigger(t).triggered).toBe(true)
    }
  })
  it('still ignores ordinary venting', () => {
    expect(detectSafetyTrigger('my boss is killing me with these deadlines').triggered).toBe(false)
  })
})

describe('non-finite inputs (audit 2026-10-05)', () => {
  it('treats NaN and Infinity as missing evidence instead of poisoning the score', () => {
    const clean = computeReadinessScore({ ventingIntensities: [80, 40, 0], sessionDurationSeconds: 60 })
    const dirty = computeReadinessScore({
      ventingIntensities: [80, NaN, 40, Infinity, 0],
      ventingSessionPeak: NaN,
      sentimentScores: [NaN],
      sessionDurationSeconds: 60,
    })
    expect(Number.isFinite(dirty.readinessScore)).toBe(true)
    expect(dirty.readinessScore).toBeCloseTo(clean.readinessScore, 10)
    expect(dirty.signalsUsed).not.toContain('sentiment')
  })

  it('drops a NaN duration rather than returning NaN', () => {
    const r = computeReadinessScore({ ventingIntensities: [50, 0], sessionDurationSeconds: NaN })
    expect(Number.isFinite(r.readinessScore)).toBe(true)
    expect(r.signalsUsed).not.toContain('sessionContext')
  })

  it('does not read a NaN or out-of-range grip as maximum stress', () => {
    expect(classifyBiometrics(75, NaN)).toEqual(classifyBiometrics(75, null))
    expect(classifyBiometrics(75, -5)).toEqual(classifyBiometrics(75, null))
    expect(classifyBiometrics(75, 5000)).toEqual(classifyBiometrics(75, null))
    expect(classifyBiometrics(null, NaN)).toEqual({ stressScore: null, stressClass: null })
  })
})

describe('signalValuesOf (stored with each snapshot)', () => {
  it('keeps the value of every active signal, rounded, and nothing else', () => {
    const r = computeReadinessScore({
      ventingIntensities: [80, 40, 0],
      facialAffectScores: [0.123456],
      sessionDurationSeconds: 60,
    })
    const v = signalValuesOf(r.contributions)
    expect(Object.keys(v).sort()).toEqual(['facialAffect', 'sessionContext', 'ventingTrend'])
    expect(v.sessionContext).toBe(0.5)
    expect(String(v.facialAffect).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(4)
  })

  it('recognises the pre-017 missing-column error only', () => {
    expect(isMissingSignalColumns({ message: "Could not find the 'signal_values' column of 'emotional_state'" })).toBe(true)
    expect(isMissingSignalColumns({ message: 'new row violates row-level security policy' })).toBe(false)
    expect(isMissingSignalColumns(null)).toBe(false)
  })
})

