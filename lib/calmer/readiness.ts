// CALMER Readiness Score — a JITAI decision rule for the venting→reflection handoff.
//
// In just-in-time adaptive intervention (JITAI) terms [Nahum-Shani et al. 2018,
// Ann Behav Med 52(6):446-462]: the readiness score is a *tailoring variable*,
// the venting→reflection handoff is the *decision point*, this fusion logic is
// the *decision rule*, and "calm-enough" (readiness ≥ threshold) is a *state of
// receptivity*. The delta vs prior work: a continuous, multi-signal score that
// RENORMALISES over whichever signals are present — not a fixed timer, a
// message-count rule / FSM [Elahimanesh 2026], or a single physiological
// threshold [Neupane 2025]. It degrades gracefully: with no hardware it still
// produces a valid score from venting + text alone (signalsUsed records which
// signals actually contributed).
//
// This OPERATIONALISES the arousal-neutral symbolic pathway — it does NOT
// "resolve the catharsis paradox" (settled science: arousal-increasing venting
// fails [Bushman 2002; Kjærvik & Bushman 2024], symbolic disposal works
// [Kanaya & Kawai 2024]). The venting time cap + fast handoff (in the game)
// enforce it.
//
// Weights are a starting point — a tunable decision-rule parameter to validate
// with a micro-randomized trial [Klasnja et al. 2015]:
//   - ventingTrend    (0.35): is venting intensity declining over time?
//   - biometricTrend  (0.30): is heart rate / grip pressure returning to baseline?
//   - sentiment       (0.20): is the *text-sentiment signal* less negative? (a
//                             noisy estimate, not ground-truth emotion [Barrett 2019])
//   - sessionContext  (0.15): has enough time/interaction passed to be meaningful?

export type StressLevel = 'low' | 'moderate' | 'high'

export interface ReadinessInputs {
  ventingIntensities?: number[]   // chronological order, most recent last
  biometricStressScores?: number[] // 0..1 per reading, chronological
  sentimentScores?: number[]      // -1..1, chronological (1 = positive/calm)
  sessionDurationSeconds?: number
  interactionCount?: number
  // true when any sentiment value fed in came from the lexicon stub rather
  // than the real classifier (see lib/calmer/emotion-classifier.ts). Surfaced
  // on the result so no screenshot / results row can imply the real NLP
  // pipeline ran when it did not.
  usingStubSentiment?: boolean
}

export interface ReadinessResult {
  readinessScore: number
  stressLevel: StressLevel
  signalsUsed: string[]
  usingStubSignals: boolean
}

const WEIGHTS = {
  ventingTrend: 0.35,
  biometricTrend: 0.3,
  sentiment: 0.2,
  sessionContext: 0.15,
}

/** Simple linear trend: positive = declining (calming), 0..1 normalized. */
function trendSignal(values: number[]): number | null {
  if (!values || values.length < 2) return null
  const first = values[0]
  const last = values[values.length - 1]
  const maxPossibleDrop = Math.max(first, 1)
  const drop = (first - last) / maxPossibleDrop
  return clamp01(0.5 + drop / 2) // 0.5 = flat, 1 = fully calmed, 0 = escalating
}

function averageSignal(values: number[], normalize: (v: number) => number): number | null {
  if (!values || values.length === 0) return null
  const avg = values.reduce((a, b) => a + b, 0) / values.length
  return clamp01(normalize(avg))
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x))
}

export function computeReadinessScore(inputs: ReadinessInputs): ReadinessResult {
  const components: { key: keyof typeof WEIGHTS; value: number | null }[] = [
    { key: 'ventingTrend', value: trendSignal(inputs.ventingIntensities ?? []) },
    { key: 'biometricTrend', value: trendSignal(inputs.biometricStressScores ?? []) },
    { key: 'sentiment', value: averageSignal(inputs.sentimentScores ?? [], (v) => (v + 1) / 2) },
    {
      key: 'sessionContext',
      value:
        inputs.sessionDurationSeconds !== undefined
          ? clamp01(inputs.sessionDurationSeconds / 120) // ramps up over first 2 min
          : null,
    },
  ]

  const available = components.filter((c) => c.value !== null) as { key: keyof typeof WEIGHTS; value: number }[]

  const usingStubSignals = !!inputs.usingStubSentiment

  if (available.length === 0) {
    return { readinessScore: 0.5, stressLevel: 'moderate', signalsUsed: [], usingStubSignals }
  }

  // renormalize weights across only the signals we actually have
  const totalWeight = available.reduce((sum, c) => sum + WEIGHTS[c.key], 0)
  const readinessScore = clamp01(
    available.reduce((sum, c) => sum + (WEIGHTS[c.key] / totalWeight) * c.value, 0),
  )

  const stressLevel: StressLevel = readinessScore >= 0.66 ? 'low' : readinessScore >= 0.33 ? 'moderate' : 'high'

  return { readinessScore, stressLevel, signalsUsed: available.map((c) => c.key), usingStubSignals }
}

/**
 * FALSE-POSITIVE GUARD for biometric-driven state changes.
 *
 * In the closest wearable+LLM study only about ONE IN FIVE detected
 * physiological events actually warranted an intervention [Neupane et al. 2025,
 * CHI EA], and the nearest agent system likewise flags recognition accuracy as
 * unresolved [Saffaryazdi et al. 2025]. A single threshold crossing must
 * therefore not be allowed to drive a transition on its own.
 *
 * We require BOTH of:
 *   1. a SUSTAINED calming trend across `minConsecutive` biometric readings
 *      (noise-tolerant: a blip up to EPS does not break the run), and
 *   2. at least one NON-BIOMETRIC signal agreeing that the user is calming
 *      (venting intensity declining, or text sentiment non-negative).
 *
 * Rejections are returned with a reason so the caller can log them — the
 * rejection rate is itself a reportable result.
 */
export interface CorroborationInputs {
  biometricStressScores?: number[] // 0..1, chronological, most recent last
  ventingIntensities?: number[]    // chronological
  sentimentScores?: number[]       // -1..1, chronological
  minConsecutive?: number          // default 3
}

export interface CorroborationResult {
  corroborated: boolean
  reason: string
}

/** A blip of this size does not break an otherwise sustained downward run. */
const CORROBORATION_EPS = 0.05

export function corroborateBiometricTransition(inputs: CorroborationInputs): CorroborationResult {
  const minConsecutive = inputs.minConsecutive ?? 3
  const bio = inputs.biometricStressScores ?? []

  if (bio.length < minConsecutive) {
    return { corroborated: false, reason: `insufficient biometric history (${bio.length}/${minConsecutive})` }
  }

  const window = bio.slice(-minConsecutive)
  let sustained = window[window.length - 1] < window[0]
  for (let i = 1; i < window.length && sustained; i++) {
    if (window[i] > window[i - 1] + CORROBORATION_EPS) sustained = false
  }
  if (!sustained) {
    return { corroborated: false, reason: 'biometric trend not sustained across consecutive readings' }
  }

  const ventingTrend = trendSignal(inputs.ventingIntensities ?? [])
  const ventingAgrees = ventingTrend !== null && ventingTrend > 0.5

  const sentiments = inputs.sentimentScores ?? []
  const sentimentAgrees =
    sentiments.length > 0 && sentiments.reduce((a, b) => a + b, 0) / sentiments.length >= 0

  if (!ventingAgrees && !sentimentAgrees) {
    return { corroborated: false, reason: 'no non-biometric signal agrees' }
  }

  return {
    corroborated: true,
    reason: `sustained biometric decline corroborated by ${ventingAgrees ? 'ventingTrend' : 'sentiment'}`,
  }
}

/**
 * Maps a raw FSR pressure reading + BPM into a single 0..1 "biometric stress
 * score" for fusion above.
 *
 * Pressure thresholds mirror hardware/calmer_sensor.ino and report Table 7.2.
 *
 * BPM thresholds are literature-grounded, NOT SWELL-derived — SWELL-KW does
 * not publish absolute bpm cutoffs (it labels task conditions and classifies
 * stress via ML on HRV/RMSSD features, not fixed thresholds). For a single
 * raw-BPM signal, the defensible source is clinical/physiological literature:
 *   - 60-100 bpm = normal resting range (American Heart Association)
 *   - 100-125 bpm = moderate/elevated
 *   - >125 bpm = high stress (matches measured stress-episode elevation of
 *     ~125 bpm from a resting baseline of ~75 bpm in wearable-stress studies)
 *   - <60 bpm = flagged as atypical rather than scored "calm" (fatigue /
 *     sensor placement issues are as likely as genuine calm at this rate)
 * Update report Table 7.3/TC-05 to match — it currently says 120-160 is
 * "safe," which conflicts with both this and the firmware comments.
 */
export function classifyBiometrics(heartRate: number | null, gripPressure: number | null) {
  let pressureScore = 0
  if (gripPressure !== null) {
    if (gripPressure < 100) pressureScore = 0
    else if (gripPressure < 650) pressureScore = 0.25
    else if (gripPressure < 950) pressureScore = 0.6
    else pressureScore = 1
  }

  let bpmScore = 0
  if (heartRate !== null) {
    if (heartRate < 60) bpmScore = 0.4 // atypical, not "calm" — see note above
    else if (heartRate <= 100) bpmScore = 0
    else if (heartRate <= 125) bpmScore = 0.5
    else bpmScore = clamp01(0.5 + (heartRate - 125) / 100)
  }

  const stressScore = clamp01(0.6 * pressureScore + 0.4 * bpmScore)
  const stressClass: StressLevel = stressScore >= 0.66 ? 'high' : stressScore >= 0.33 ? 'moderate' : 'low'

  return { stressScore, stressClass }
}

/**
 * RMSSD (root mean square of successive differences) over a series of inter-beat
 * intervals (IBI, in ms) — the standard short-window HRV metric. Higher RMSSD =
 * more parasympathetic ("calm") variability; lower = more arousal/stress. This
 * is the feature SWELL-KW classifies stress from `[Koldijk et al. 2014]`, so
 * capturing it is what makes the report's HRV grounding legitimate rather than
 * raw-BPM only. Returns null with fewer than 2 intervals.
 */
export function computeRMSSD(ibis: number[]): number | null {
  if (!ibis || ibis.length < 2) return null
  let sumSq = 0
  for (let i = 1; i < ibis.length; i++) {
    const d = ibis[i] - ibis[i - 1]
    sumSq += d * d
  }
  return Math.sqrt(sumSq / (ibis.length - 1))
}

/**
 * STUB — lexicon-based placeholder sentiment, NOT the final NLP layer.
 * Swap for a proper model (e.g. a small transformer or an LLM classification
 * call) before this goes anywhere near the paper's results section.
 */
const NEGATIVE_WORDS = ['angry', 'hate', 'furious', 'stressed', 'anxious', 'worthless', 'awful', 'terrible', 'panic']
const POSITIVE_WORDS = ['calm', 'better', 'okay', 'fine', 'relieved', 'grateful', 'peaceful', 'good', 'relaxed']

export function stubTextSentiment(text: string): number {
  const words = text.toLowerCase().split(/\W+/)
  let score = 0
  for (const w of words) {
    if (NEGATIVE_WORDS.includes(w)) score -= 1
    if (POSITIVE_WORDS.includes(w)) score += 1
  }
  return clamp01((score + 3) / 6) * 2 - 1 // squash into -1..1
}

/**
 * STUB — same caveat as above. Real safety-flag detection should not ship
 * as a plain keyword list; this exists so the SAFETY_FLAG pathway is wired
 * end-to-end for the demo, and to be replaced before any real deployment.
 */
const SAFETY_TRIGGER_PHRASES = [
  'kill myself', 'want to die', 'end my life', 'suicide', 'hurt myself', 'self harm', 'no reason to live',
]

export function detectSafetyTrigger(text: string): { triggered: boolean; triggerType?: string; severity?: 'low' | 'medium' | 'high' } {
  const lower = text.toLowerCase()
  for (const phrase of SAFETY_TRIGGER_PHRASES) {
    if (lower.includes(phrase)) {
      return { triggered: true, triggerType: 'self_harm_language', severity: 'high' }
    }
  }
  return { triggered: false }
}
