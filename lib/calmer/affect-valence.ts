// One valence scale for every Ekman-category emotion source: the text
// classifier (j-hartmann, lib/calmer/emotion-classifier.ts) and the opt-in
// facial-expression signal (lib/calmer/facial-affect.ts). Shared so the two
// cannot drift apart. -1 = distressed, +1 = calm/positive.
//
// Framing [Barrett et al. 2019]: these are NOISY estimates from a text or a
// facial configuration, fused with other signals — never ground-truth emotion.
export const EMOTION_VALENCE: Record<string, number> = {
  anger: -0.8,
  disgust: -0.6,
  fear: -0.7,
  sadness: -0.6,
  neutral: 0,
  surprise: 0.2,
  joy: 1,
}
