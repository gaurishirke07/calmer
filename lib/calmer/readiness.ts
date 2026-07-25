// CALMER Readiness Score — Novelty Claim #1 implementation
//
// Fuses up to four signals into a single 0..1 "readiness" score that drives
// the Module 1 -> Module 2 handoff (the "Find Peace" prompt). Unlike a fixed
// timer or a message-count rule (e.g. the state-machine approach used by
// comparable therapeutic-chatbot orchestration systems), this score updates
// continuously and degrades gracefully when a signal is unavailable — e.g.
// no hardware connected yet still produces a valid score from venting +
// text alone, per the report's documented alternate flow.
//
// Signals (weights are a starting point — tune once you have pilot data,
// this is exactly the kind of parameter the RCT in Novelty Claim #2 of the
// report should be validating):
//   - ventingTrend    (0.35): is venting intensity declining over time?
//   - biometricTrend  (0.30): is heart rate / grip pressure returning to baseline?
//   - sentiment       (0.20): is recent text less negative?
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
