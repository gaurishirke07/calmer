// CALMER Sentiment Analyzer — the dedicated classification component named
// in report Fig 5.1 ("Sentiment Analyzer" / "Emotion Analysis System"),
// kept separate from the AI Therapist chat model on purpose: this is a
// narrow classification task, not a conversational one, and a small
// distilled classifier is faster/cheaper/more consistent for it than
// asking the chat LLM to self-report sentiment.
//
// Model: j-hartmann/emotion-english-distilroberta-base — distilled RoBERTa,
// 7-way Ekman emotion classification (anger, disgust, fear, joy, neutral,
// sadness, surprise). Cite as Hartmann (2022), Hugging Face model card — the
// model itself has NO standalone peer-reviewed paper. Do NOT attribute it to
// "Rozado, Hughes & Halberstadt 2022": that is a different paper that merely
// *uses* this model. Chosen over SamLowe/roberta-base-go_emotions because its
// small label set maps directly onto our 3-tier stress_level without extra
// collapsing logic — see EMOTION_SENTIMENT_MAP below.
//
// NOTE (framing, per Barrett et al. 2019): treat this output as a NOISY
// text-sentiment signal fused with others, never as ground-truth "emotion".

const EMOTION_MODEL = 'j-hartmann/emotion-english-distilroberta-base'

// sentiment score, -1 (distressed) .. +1 (calm/positive) — feeds
// computeReadinessScore's `sentimentScores` input in lib/calmer/readiness.ts
const EMOTION_SENTIMENT_MAP: Record<string, number> = {
  anger: -0.8,
  disgust: -0.6,
  fear: -0.7,
  sadness: -0.6,
  neutral: 0,
  surprise: 0.2,
  joy: 1,
}

export interface EmotionClassification {
  label: string
  score: number
  sentimentScore: number
}

// HF Inference Providers router (hf-inference provider). The legacy host
// `api-inference.huggingface.co` was FULLY DECOMMISSIONED in late 2025 and
// now returns 410/404 — pointing here again is what silently disabled the
// real classifier for the entire project. Small classic classifiers are not
// guaranteed provider coverage, so verify at runtime: if this 404s for
// j-hartmann, self-host (transformers.js in-process or a tiny Python sidecar)
// instead of falling back to the lexicon stub forever.
const EMOTION_ENDPOINT = `https://router.huggingface.co/hf-inference/models/${EMOTION_MODEL}`

/**
 * Calls the HF-hosted classifier. Returns null on any failure (endpoint
 * unavailable, model cold-starting, network issue, missing token) so callers
 * can fall back to the lexicon stub in readiness.ts rather than breaking the
 * chat flow. The fallback is intentionally LOUD (console.warn) — silent
 * degradation is exactly what hid the dead-endpoint bug. Callers should treat
 * a null return as "sentiment is stub-derived" and set usingStubSignals.
 */
export async function classifyEmotion(text: string): Promise<EmotionClassification | null> {
  if (!process.env.HF_TOKEN) {
    console.warn('[emotion-classifier] HF_TOKEN missing — sentiment will be STUB-derived, not model-derived.')
    return null
  }
  if (!text.trim()) return null

  try {
    const res = await fetch(EMOTION_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.HF_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
      // 8s cap — a slow/cold-starting classifier shouldn't stall the chat reply
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      console.warn(
        `[emotion-classifier] HF router returned ${res.status} — FALLING BACK TO LEXICON STUB. ` +
          `Sentiment values are NOT model-derived. If this is a 404, j-hartmann is not served by ` +
          `hf-inference; self-host instead. Body:`,
        await res.text(),
      )
      return null
    }

    const data = await res.json()
    // shape: [[{label, score}, ...]] for a single input string
    const scores: { label: string; score: number }[] = Array.isArray(data[0]) ? data[0] : data
    if (!scores || scores.length === 0) return null

    const top = scores.reduce((best, s) => (s.score > best.score ? s : best))
    const sentimentScore = EMOTION_SENTIMENT_MAP[top.label] ?? 0

    return { label: top.label, score: top.score, sentimentScore }
  } catch (err) {
    console.warn(
      '[emotion-classifier] request error — FALLING BACK TO LEXICON STUB (sentiment not model-derived):',
      (err as Error).message,
    )
    return null
  }
}
