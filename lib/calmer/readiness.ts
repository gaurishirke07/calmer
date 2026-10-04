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

import { plausibleHeartRate } from './hrv-quality'

export type StressLevel = 'low' | 'moderate' | 'high'

// The fusion signals, in canonical order (most to least direct evidence). The
// paper's rule is the four published signals; `facialAffect` is an OPT-IN demo
// signal (webcam, off by default). A new modality gets its own key rather than
// being folded into an existing one, so that (a) `signals_used` records
// honestly whether it contributed, and (b) "sentiment" stays text-only, as the
// paper describes it. Because the score renormalises over whatever is present,
// an absent opt-in signal leaves every score exactly as the four-signal rule
// computes it. Keep this in sync with WEIGHTS below.
export type SignalKey =
  | 'ventingTrend'
  | 'biometricTrend'
  | 'sentiment'
  | 'facialAffect'
  | 'voiceTrend'
  | 'sessionContext'

export interface ReadinessInputs {
  ventingIntensities?: number[]   // chronological order, most recent last
  // Highest venting intensity in the WHOLE session. The venting trend is the
  // distance below the SESSION peak (paper §III), but ventingIntensities is a
  // recent window (the game keeps 40 samples; the routes read 40 rows), so
  // without this an early heavy burst — a grenade at 60 — leaves the window and
  // the trend gets measured against whatever the window still holds (a bat at
  // 10). Optional: when omitted, the window's own maximum is used.
  ventingSessionPeak?: number
  biometricStressScores?: number[] // 0..1 per reading, chronological
  sentimentScores?: number[]      // -1..1, chronological (1 = positive/calm)
  // OPT-IN: facial-expression valence from the webcam, -1..1, a recent window
  // (see lib/calmer/facial-affect.ts). Omitted unless the user turned it on.
  facialAffectScores?: number[]
  // OPT-IN: vocal effort from the microphone, 0..100 per sample, chronological
  // recent window, plus the session's peak — the same decline-from-peak rule as
  // venting (see lib/calmer/vocal-arousal.ts). Omitted unless turned on.
  vocalIntensities?: number[]
  vocalSessionPeak?: number
  sessionDurationSeconds?: number
  interactionCount?: number
  // true when any sentiment value fed in came from the lexicon stub rather
  // than the real classifier (see lib/calmer/emotion-classifier.ts). Surfaced
  // on the result so no screenshot / results row can imply the real NLP
  // pipeline ran when it did not.
  usingStubSentiment?: boolean
}

// Per-signal breakdown of how the score was formed. Used to SHOW why the score
// is what it is (the explainable-readiness dashboard) and to let an offline
// study perturb weights. See ReadinessResult.contributions.
export interface SignalContribution {
  key: SignalKey
  active: boolean          // did this signal contribute to the score?
  value: number | null     // the raw 0..1 signal (null when the signal is absent)
  nominalWeight: number    // the fixed prior weight for this signal
  effectiveWeight: number  // weight after renormalising over present signals (0 if absent)
  contribution: number     // effectiveWeight * value (0 if absent)
}

export interface ReadinessResult {
  readinessScore: number
  stressLevel: StressLevel
  signalsUsed: string[]
  usingStubSignals: boolean
  // Always all four signals in canonical order, inactive ones zeroed. In the
  // normal path the active contributions sum to readinessScore; in the two
  // neutral-override guards the score is policy-clamped to 0.5 while the
  // contributions still describe the raw renormalisation of what was present.
  contributions: SignalContribution[]
}

const WEIGHTS: Record<SignalKey, number> = {
  ventingTrend: 0.35,
  biometricTrend: 0.3,
  sentiment: 0.2,
  // Opt-in demo signal, outside the published four (which still sum to 1).
  // Same directness-of-evidence logic: a facial configuration is weaker
  // evidence than the user's own words (sentiment, 0.20) [Barrett et al.
  // 2019] but stronger than the clock, which is no evidence at all (0.15).
  facialAffect: 0.175,
  // Opt-in too, same prior as the face: vocal effort is an uncalibrated proxy
  // for arousal (mic distance and gain move it), so neither opt-in signal is
  // argued above the other.
  voiceTrend: 0.175,
  sessionContext: 0.15,
}

// The prior weights, exported read-only for the offline weight-sensitivity
// study (scripts/weight-sensitivity.mjs). Production code never passes other
// weights to computeReadinessScore.
export const NOMINAL_WEIGHTS: Readonly<Record<SignalKey, number>> = Object.freeze({ ...WEIGHTS })

/**
 * Decline signal: how far has intensity fallen from this session's peak?
 * 0 = sitting at (or climbing to) the peak, 1 = fully settled, null = no
 * peak yet to decline from.
 *
 * This compares a RECENT WINDOW against the SESSION PEAK, deliberately not
 * first-vs-last of a sliding window. The sliding-window version had two fatal
 * behaviours: once the user stopped, the window filled with zeros and read
 * `0 -> 0` as "flat", so the score climbed for about thirty seconds and then
 * collapsed back exactly when the user was calmest; and a steadily venting user
 * sat permanently at "flat", which capped readiness below the handoff
 * threshold and made the decision point unreachable. Measuring against the peak
 * keeps a settled user settled.
 *
 * `knownPeak` is the peak over the whole session when the caller has it (the
 * values passed in are only a recent window). The peak used is the larger of
 * the two, so a long calm after an early burst keeps reading as settled instead
 * of losing its reference point once the burst scrolls out of the window.
 */
function trendSignal(values: number[], knownPeak?: number): number | null {
  if (!values || values.length < 2) return null
  const peak = Math.max(knownPeak ?? 0, ...values)
  // A history with no peak at all (every value 0 — the user has opened the
  // room but not vented yet) carries NO evidence either way, so report the
  // signal as absent rather than 0. Reading it as 0 ("sitting at the peak")
  // scored a user who had done nothing as maximally activated (~0.05) for as
  // long as they idled.
  if (peak <= 0) return null
  // Smoothing window: wide enough to ride out noise in a long session, but not
  // so wide that it swallows the decline in a short one.
  const w = Math.max(1, Math.min(5, Math.floor(values.length / 4)))
  const recent = values.slice(-w).reduce((a, b) => a + b, 0) / w
  // Distance below the session peak: sitting AT the peak (venting hard, or
  // escalating toward a new peak) reads 0. For signals on a 0..100-ish scale
  // (venting, voice) this is the RELATIVE decline, so settling to nothing reads
  // 1. The denominator floor of 1, though, makes it the ABSOLUTE decline for
  // signals on a 0..1 scale — biometric stress: settling from a moderate peak of
  // 0.6 to 0 reads 0.6, not 1. Existing behaviour behind the paper's figures;
  // documented here, deliberately not changed (see PAPER-STATE.md).
  return clamp01((peak - recent) / Math.max(peak, 1))
}

function averageSignal(values: number[], normalize: (v: number) => number): number | null {
  if (!values || values.length === 0) return null
  const avg = values.reduce((a, b) => a + b, 0) / values.length
  return clamp01(normalize(avg))
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x))
}

type Component = { key: SignalKey; value: number | null }

// Expands the renormalised fusion into a per-signal breakdown (all four signals,
// inactive ones zeroed). In the normal path the active contributions sum to the
// readiness score; the dashboard and the offline weight study both read this.
function buildContributions(
  components: Component[],
  totalWeight: number,
  weights: Record<SignalKey, number>,
): SignalContribution[] {
  return components.map((c) => {
    const active = c.value !== null
    const effectiveWeight = active && totalWeight > 0 ? weights[c.key] / totalWeight : 0
    return {
      key: c.key,
      active,
      value: active ? (c.value as number) : null,
      nominalWeight: weights[c.key],
      effectiveWeight,
      contribution: active ? effectiveWeight * (c.value as number) : 0,
    }
  })
}

// `weights` exists for the offline sensitivity study only; production callers
// omit it and get the prior weights.
export function computeReadinessScore(
  inputs: ReadinessInputs,
  weights: Record<SignalKey, number> = WEIGHTS,
): ReadinessResult {
  const components: Component[] = [
    { key: 'ventingTrend', value: trendSignal(inputs.ventingIntensities ?? [], inputs.ventingSessionPeak) },
    { key: 'biometricTrend', value: trendSignal(inputs.biometricStressScores ?? []) },
    { key: 'sentiment', value: averageSignal(inputs.sentimentScores ?? [], (v) => (v + 1) / 2) },
    { key: 'facialAffect', value: averageSignal(inputs.facialAffectScores ?? [], (v) => (v + 1) / 2) },
    { key: 'voiceTrend', value: trendSignal(inputs.vocalIntensities ?? [], inputs.vocalSessionPeak) },
    {
      key: 'sessionContext',
      value:
        inputs.sessionDurationSeconds !== undefined
          ? clamp01(inputs.sessionDurationSeconds / 120) // ramps up over first 2 min
          : null,
    },
  ]

  const available = components.filter((c) => c.value !== null) as { key: SignalKey; value: number }[]

  const usingStubSignals = !!inputs.usingStubSentiment

  // renormalize weights across only the signals we actually have
  const totalWeight = available.reduce((sum, c) => sum + weights[c.key], 0)
  const contributions = buildContributions(components, totalWeight, weights)

  if (available.length === 0) {
    return { readinessScore: 0.5, stressLevel: 'moderate', signalsUsed: [], usingStubSignals, contributions }
  }

  // sessionContext is a CONTEXTUAL MODIFIER, not evidence of calm. On its own it
  // says only "time has passed", and because renormalisation would hand it the
  // full weight, a lone sessionContext term reported readiness 1.0 — i.e. "fully
  // calm" — on the very first biometric reading of an older session, even while
  // that reading measured high stress. Refuse to infer calm from elapsed time
  // alone; report neutral, but still record honestly which signals were present.
  // Facial affect is (noisy) evidence about state, so it counts; elapsed time does not.
  const SUBSTANTIVE: SignalKey[] = ['ventingTrend', 'biometricTrend', 'sentiment', 'facialAffect', 'voiceTrend']
  if (!available.some((c) => SUBSTANTIVE.includes(c.key))) {
    return {
      readinessScore: 0.5,
      stressLevel: 'moderate',
      signalsUsed: available.map((c) => c.key),
      usingStubSignals,
      contributions,
    }
  }

  const readinessScore = clamp01(
    available.reduce((sum, c) => sum + (weights[c.key] / totalWeight) * c.value, 0),
  )

  const stressLevel: StressLevel = readinessScore >= 0.66 ? 'low' : readinessScore >= 0.33 ? 'moderate' : 'high'

  return { readinessScore, stressLevel, signalsUsed: available.map((c) => c.key), usingStubSignals, contributions }
}

/**
 * HANDOFF DECISION RULE: offer reflection only once readiness has held at or
 * above the threshold for `minConsecutive` consecutive computations.
 *
 * A single crossing is not enough. The venting trend reads a small recent
 * window against the session peak, so ONE quiet three-second flush in the
 * middle of steady venting pushed readiness from ~0.05 to ~0.8 and fired the
 * handoff while the user was still smashing things (observed live, session
 * 0e7e3b83, 2026-10-03). This applies the same principle as the biometric
 * corroboration guard below — no single threshold crossing may drive a
 * transition on its own — and uses the same default run length (3). With the
 * game flushing every 3 s, that is ~9 s of sustained calm.
 *
 * Returns false again as soon as the latest score drops back below the
 * threshold, so a user who resumes venting is not left looking at an offer
 * that says they are calm.
 */
export const HANDOFF_MIN_CONSECUTIVE = 3

export function shouldOfferHandoff(
  recentScores: number[],
  threshold: number,
  minConsecutive = HANDOFF_MIN_CONSECUTIVE,
): boolean {
  if (recentScores.length < minConsecutive) return false
  return recentScores.slice(-minConsecutive).every((s) => s >= threshold)
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
  ventingSessionPeak?: number      // see ReadinessInputs.ventingSessionPeak
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

  const ventingTrend = trendSignal(inputs.ventingIntensities ?? [], inputs.ventingSessionPeak)
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
 *
 * MISSING CHANNELS (2026-10-04). A heart rate outside 40–180 bpm is treated as
 * unavailable, exactly like a sensor dropout (lib/calmer/hrv-quality.ts) —
 * before this, a misread 218 bpm scored as maximal stress. And the two channels
 * now RENORMALISE over whichever is present, as the paper describes ("dropped
 * the biometric term and renormalised over the remainder"): before, a missing
 * heart rate entered as 0 — i.e. read as a perfectly calm heart — so a
 * maximum-force squeeze with no pulse scored only 0.6. Neither channel present
 * returns null: no reading, not "calm".
 */
export function classifyBiometrics(
  heartRate: number | null,
  gripPressure: number | null,
): { stressScore: number | null; stressClass: StressLevel | null } {
  const parts: { weight: number; score: number }[] = []

  if (gripPressure !== null && gripPressure !== undefined) {
    let pressureScore = 0
    if (gripPressure < 100) pressureScore = 0
    else if (gripPressure < 650) pressureScore = 0.25
    else if (gripPressure < 950) pressureScore = 0.6
    else pressureScore = 1
    parts.push({ weight: 0.6, score: pressureScore })
  }

  const hr = plausibleHeartRate(heartRate)
  if (hr !== null) {
    let bpmScore = 0
    if (hr < 60) bpmScore = 0.4 // atypical, not "calm" — see note above
    else if (hr <= 100) bpmScore = 0
    else if (hr <= 125) bpmScore = 0.5
    else bpmScore = clamp01(0.5 + (hr - 125) / 100)
    parts.push({ weight: 0.4, score: bpmScore })
  }

  if (parts.length === 0) return { stressScore: null, stressClass: null }
  const totalWeight = parts.reduce((a, p) => a + p.weight, 0)
  const stressScore = clamp01(parts.reduce((a, p) => a + p.weight * p.score, 0) / totalWeight)
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
 * FALLBACK sentiment — a lexicon scorer used ONLY when the real classifier
 * (lib/calmer/emotion-classifier.ts, j-hartmann) is unavailable. It is never the
 * primary path: the chat route calls the model first and drops to this only on
 * failure, setting usingStubSentiment so the result records that the value is
 * lexicon-derived, not model-derived. Kept deliberately simple — it exists to
 * keep the pipeline alive offline, not to be accurate.
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
 * Fast deterministic PRE-FILTER layer of the safety pathway — not the whole
 * detector. The chat route combines this keyword hit with an LLM risk
 * classification via combineRisk (lib/calmer/safety.ts), taking the HIGHER
 * signal. So the LLM layer adds what this list misses (indirect disclosure with
 * no trigger phrase is rated HIGH), but it cannot overrule a hit here: a
 * negated phrase ("I would never hurt myself") still escalates to safety mode.
 * That false positive is the deliberate, conservative direction for a crisis
 * pathway; measuring its rate is the safety evaluation (roadmap B2).
 * Hardening this list (obfuscation, more phrasings) is a real-deployment task.
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
