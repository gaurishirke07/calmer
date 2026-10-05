// CALMER safety layer — crisis / self-harm detection + escalation.
//
// The chat route runs a fast keyword pre-filter (detectSafetyTrigger, in
// readiness.ts) AND a quick LLM risk classification on every user message
// (SAFETY_CLASSIFIER_SYSTEM). On HIGH risk it replies in *safety mode*
// (SAFETY_MODE_SYSTEM) instead of doing normal therapy, and logs a safety_flag.
//
// Grounded in `[Pichowicz et al. 2025, Sci Rep 15:31652]`: a plain keyword list
// is not a defensible crisis pathway. This is a layered, conservative
// improvement — NOT a clinically validated system. Measured on a labelled set
// in scripts/safety-eval.mjs (results in paper/PAPER-STATE.md).

export type RiskLevel = 'none' | 'low' | 'high'

// The one crisis line, used verbatim everywhere a reply must carry it.
export const CRISIS_LINE =
  "In India, call Tele-MANAS at 14416 (free, 24×7). If you're in immediate danger, contact your local emergency services."

// One-shot classifier prompt — must return a single word we can parse.
// The warning-signs sentence was added 2026-10-04 after the safety eval's one
// miss: "I gave away my guitar and my books, I won't be needing them" was rated
// LOW on every run. Deliberately NOT added: any "ignore exaggeration" guidance —
// it would clear "ugh I want to die, I tripped" (a false alarm today) but could
// also clear a real crisis phrased as a joke. For a crisis pathway, wrong trade.
export const SAFETY_CLASSIFIER_SYSTEM = `You are a safety classifier for a mental-health support chat. Read ONLY the user's latest message and rate the risk of imminent self-harm or suicide. Weigh indirect disclosure, hopelessness, and stated plans — not just explicit keywords. Behavioural warning signs count as HIGH even without explicit words: giving possessions away, saying goodbye or writing farewell notes, stockpiling medication or researching methods, or putting their affairs in order.

Reply with EXACTLY one word, nothing else:
- HIGH — any suicidal or self-harm intent, a plan, a warning sign above, or wanting to die / not be here.
- LOW — distress or hopelessness without clear intent.
- NONE — ordinary venting, anger, sadness, or everyday problems.`

// Reply prompt used INSTEAD of normal therapy when risk is HIGH.
export const SAFETY_MODE_SYSTEM = `The user may be in crisis. This is a safety-critical reply — do NOT do therapy, problem-solving, or exploratory questions. Instead:
- Respond with warmth and genuine care; validate their pain and tell them they matter.
- Strongly and clearly urge them to reach out for help RIGHT NOW.
- You MUST include this line verbatim: "${CRISIS_LINE}"
- Keep it short (3–5 sentences), calm, warm, and non-judgmental. Never minimize or dismiss.`

// ── Fail-safes for when the LLM is unavailable ─────────────────────────────
// The keyword list alone catches about a quarter of crisis messages (26.7% in
// scripts/safety-eval.mjs, and none of the indirect or obfuscated ones). When
// the LLM check can't run, the system must not silently trust that degraded
// check: it must surface the crisis line instead.

// Appended to the normal therapy prompt when the risk check could not run for
// this message but the chat model still answers (a transient error, a rate
// limit, or an unparseable verdict).
export const RISK_CHECK_UNAVAILABLE_INSTRUCTION = `IMPORTANT: the automatic safety check could not run for this message, so you cannot rule out risk. Whatever the user said, end your reply with this exact line on its own: "${CRISIS_LINE}"`

// Per-user chat limit (each message costs two Groq calls on a shared free-tier
// key; one account flooding it would push everyone onto the degraded safety
// path). Generous for a person typing; it only stops scripts and loops.
export const CHAT_RATE_LIMIT = { perMinute: 8, perHour: 120 }
export const CHAT_RATE_LIMITED_REPLY = `You're sending messages faster than I can keep up with. Please wait a moment and try again. If you're struggling right now: ${CRISIS_LINE}`

// Shown by the client when a reply fails entirely (provider down, model
// retired, network). Deterministic — no model involved — so it still works in
// exactly the situation where everything else has failed.
export const CHAT_UNAVAILABLE_REPLY = `I couldn't respond just now — something went wrong on my side, not yours. If you're struggling or thinking about harming yourself, please reach out right now. ${CRISIS_LINE}`

/**
 * Combine the keyword pre-filter hit and the LLM verdict into a final risk
 * level. Conservative — takes the higher of the two signals.
 */
export function combineRisk(keywordTriggered: boolean, llmVerdict: string | null): RiskLevel {
  // Whole words, as assessRisk parses them: a substring test read "ALLOWED"
  // (e.g. in a provider error) as LOW. Garbage is handled by assessRisk's
  // unavailable path, which adds the crisis line.
  const v = llmVerdict ?? ''
  if (keywordTriggered || /\bHIGH\b/i.test(v)) return 'high'
  if (/\bLOW\b/i.test(v)) return 'low'
  return 'none'
}

/**
 * The risk level plus whether the LLM check actually ran. A verdict that is
 * missing (the call failed) OR unparseable (no HIGH/LOW/NONE in it) counts as
 * unavailable: combineRisk would read garbage as "none", which must not pass
 * for a clean bill of health.
 */
export function assessRisk(
  keywordTriggered: boolean,
  llmVerdict: string | null,
): { risk: RiskLevel; checkUnavailable: boolean } {
  const parseable = llmVerdict !== null && /\b(HIGH|LOW|NONE)\b/i.test(llmVerdict)
  return { risk: combineRisk(keywordTriggered, llmVerdict), checkUnavailable: !parseable }
}
