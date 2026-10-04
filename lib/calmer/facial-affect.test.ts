import { describe, it, expect } from 'vitest'
import { facialValence, topExpression } from './facial-affect'
import { EMOTION_VALENCE } from './affect-valence'
import { computeReadinessScore } from './readiness'

// face-api's FaceExpressions: seven probabilities summing to ~1
const face = (p: Partial<Record<string, number>>) => ({
  neutral: 0, happy: 0, sad: 0, angry: 0, fearful: 0, disgusted: 0, surprised: 0, ...p,
})

describe('facialValence', () => {
  it('maps each face-api expression onto the shared Ekman valence scale', () => {
    expect(facialValence(face({ angry: 1 }))).toBe(EMOTION_VALENCE.anger)
    expect(facialValence(face({ happy: 1 }))).toBe(EMOTION_VALENCE.joy)
    expect(facialValence(face({ sad: 1 }))).toBe(EMOTION_VALENCE.sadness)
    expect(facialValence(face({ neutral: 1 }))).toBe(0)
  })

  it('takes the expectation over the distribution, not the top label', () => {
    // 55% neutral / 45% angry is mildly negative, not a flip to -0.8
    expect(facialValence(face({ neutral: 0.55, angry: 0.45 }))).toBeCloseTo(0.45 * -0.8, 10)
  })

  it('ignores unknown keys and returns null with no known mass', () => {
    expect(facialValence({ ...face({}), detectionScore: 0.9 })).toBeNull()
    expect(facialValence({})).toBeNull()
  })
})

describe('topExpression', () => {
  it('returns the most probable known expression', () => {
    expect(topExpression(face({ angry: 0.7, neutral: 0.3 }))).toEqual({ label: 'angry', score: 0.7 })
    expect(topExpression(face({}))).toBeNull()
  })
})

// The opt-in signal must be invisible when off and honest when on.
describe('facialAffect in the readiness fusion', () => {
  const base = { ventingIntensities: [80, 20], sentimentScores: [0.2], sessionDurationSeconds: 60 }

  it('leaves the four-signal score untouched when the webcam is off', () => {
    const off = computeReadinessScore(base)
    expect(off.signalsUsed).not.toContain('facialAffect')
    expect(off.contributions.find((c) => c.key === 'facialAffect')!.active).toBe(false)
  })

  it('records the webcam in signalsUsed and pulls the score toward the face when on', () => {
    const off = computeReadinessScore(base)
    const angry = computeReadinessScore({ ...base, facialAffectScores: [-0.8, -0.8] })
    const happy = computeReadinessScore({ ...base, facialAffectScores: [1, 1] })
    expect(angry.signalsUsed).toContain('facialAffect')
    expect(angry.readinessScore).toBeLessThan(off.readinessScore)
    expect(happy.readinessScore).toBeGreaterThan(off.readinessScore)
  })

  it('counts as evidence on its own (unlike elapsed time)', () => {
    const r = computeReadinessScore({ facialAffectScores: [1], sessionDurationSeconds: 600 })
    expect(r.readinessScore).toBeGreaterThan(0.5) // not held at the neutral guard
  })
})
