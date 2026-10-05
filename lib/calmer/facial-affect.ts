// Opt-in facial-expression signal (roadmap C-2). Pure mapping only — the
// webcam capture and detection live in components/calmer/face-tracker.tsx.
//
// face-api's expression net scores the same seven Ekman categories the text
// classifier does, so the face lands on the SAME valence scale
// (affect-valence.ts) rather than inventing a new one.
//
// Framing matters here more than anywhere in the codebase: facial
// configurations are not reliable read-outs of emotion [Barrett et al. 2019],
// which the paper itself cites. This is one more NOISY signal, fused and
// renormalised like the rest, processed on-device, never stored as images, and
// off unless the user turns it on. It is a demo capability, not part of the
// evaluated four-signal rule.
import { EMOTION_VALENCE } from './affect-valence'

// Expression names from either face model -> the shared Ekman names.
// face-api: angry, disgusted, fearful, sad, neutral, surprised, happy.
// Hugging Face ViT (Xenova/facial_emotions_image_detection): sad, disgust,
// angry, neutral, fear, surprise, happy.
const FACE_TO_EKMAN: Record<string, string> = {
  angry: 'anger',
  disgusted: 'disgust',
  disgust: 'disgust',
  fearful: 'fear',
  fear: 'fear',
  sad: 'sadness',
  neutral: 'neutral',
  surprised: 'surprise',
  surprise: 'surprise',
  happy: 'joy',
}

/** Which model produced the face signal (stored with each snapshot). */
export type FaceModel = 'face-api' | 'vit'

// The research-grade option: Google's ViT-base (patch16, ImageNet-21k)
// fine-tuned for facial expressions, run on-device with transformers.js.
// q4 weights ≈ 57 MB, downloaded once and cached by the browser.
export const VIT_FACE_MODEL = 'Xenova/facial_emotions_image_detection'

/** transformers.js classifier output ([{label, score}]) -> {expression: probability}. */
export function labelScoresToExpressions(out: { label: string; score: number }[]): Record<string, number> {
  const expressions: Record<string, number> = {}
  for (const { label, score } of out) {
    if (typeof label === 'string' && Number.isFinite(score)) expressions[label.toLowerCase()] = score
  }
  return expressions
}

/**
 * Expected valence over the whole expression distribution, -1..1. Using the
 * expectation rather than the top label keeps the signal smooth: a face that is
 * 55% neutral / 45% angry reads mildly negative instead of flipping between 0
 * and -0.8 frame to frame. Returns null when no known expression has mass.
 */
export function facialValence(expressions: Record<string, number>): number | null {
  let sum = 0
  let mass = 0
  for (const [name, p] of Object.entries(expressions)) {
    const ekman = FACE_TO_EKMAN[name]
    if (ekman === undefined || !(p > 0)) continue
    sum += p * EMOTION_VALENCE[ekman]
    mass += p
  }
  return mass > 0 ? sum / mass : null
}

/** The most probable expression, for the on-screen label. */
export function topExpression(expressions: Record<string, number>): { label: string; score: number } | null {
  let best: { label: string; score: number } | null = null
  for (const [name, p] of Object.entries(expressions)) {
    if (FACE_TO_EKMAN[name] === undefined || !(p > 0)) continue
    if (!best || p > best.score) best = { label: name, score: p }
  }
  return best
}
