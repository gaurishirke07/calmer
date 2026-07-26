// CALMER safety layer — crisis / self-harm detection + escalation.
//
// The chat route runs a fast keyword pre-filter (detectSafetyTrigger, in
// readiness.ts) AND a quick LLM risk classification on every user message
// (SAFETY_CLASSIFIER_SYSTEM). On HIGH risk it replies in *safety mode*
// (SAFETY_MODE_SYSTEM) instead of doing normal therapy, and logs a safety_flag.
//
// Grounded in `[Pichowicz et al. 2025, Sci Rep 15:31652]`: a plain keyword list
// is not a defensible crisis pathway. This is a layered, conservative
// improvement — NOT a clinically validated system.

export type RiskLevel = 'none' | 'low' | 'high'

// One-shot classifier prompt — must return a single word we can parse.
export const SAFETY_CLASSIFIER_SYSTEM = `You are a safety classifier for a mental-health support chat. Read ONLY the user's latest message and rate the risk of imminent self-harm or suicide. Weigh indirect disclosure, hopelessness, and stated plans — not just explicit keywords.

Reply with EXACTLY one word, nothing else:
- HIGH — any suicidal or self-harm intent, a plan, or wanting to die / not be here.
- LOW — distress or hopelessness without clear intent.
- NONE — ordinary venting, anger, sadness, or everyday problems.`

// Reply prompt used INSTEAD of normal therapy when risk is HIGH.
export const SAFETY_MODE_SYSTEM = `The user may be in crisis. This is a safety-critical reply — do NOT do therapy, problem-solving, or exploratory questions. Instead:
- Respond with warmth and genuine care; validate their pain and tell them they matter.
- Strongly and clearly urge them to reach out for help RIGHT NOW.
- You MUST include this line verbatim: "In India, call Tele-MANAS at 14416 (free, 24×7). If you're in immediate danger, contact your local emergency services."
- Keep it short (3–5 sentences), calm, warm, and non-judgmental. Never minimize or dismiss.`

/**
 * Combine the keyword pre-filter hit and the LLM verdict into a final risk
 * level. Conservative — takes the higher of the two signals.
 */
export function combineRisk(keywordTriggered: boolean, llmVerdict: string | null): RiskLevel {
  const v = (llmVerdict ?? '').trim().toUpperCase()
  if (keywordTriggered || v.includes('HIGH')) return 'high'
  if (v.includes('LOW')) return 'low'
  return 'none'
}
