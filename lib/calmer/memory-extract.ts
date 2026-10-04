// What the companion is allowed to remember automatically, from a chat message.
//
// Before 2026-10-04 any message that merely MENTIONED a common word (exam,
// study, college, school, family, parents, boss, …) was saved verbatim and then
// injected into every future system prompt — for students, nearly every
// message, possibly including crisis disclosures. Now only explicit first-person
// disclosures of a trigger, a coping method, a goal, a hobby, or a stressor
// stated together with its subject ("exams stress me out") qualify, and the
// caller skips extraction entirely when the risk check flagged the message.
import type { MemoryCategory } from '@/lib/types'
import { detectSafetyTrigger } from './readiness'

const STRESS = /\b(stress(ed|ing|ful)?|anxious|anxiety|worried|worry|pressure|scared|panic(king)?|overwhelm(ed|ing)?)\b/
const CONFLICT = /\b(fight(ing)?|argu(e|ing|ment)s?|tension|upset)\b/

const RULES: { category: MemoryCategory; test: (t: string) => boolean }[] = [
  {
    category: 'trigger',
    test: (t) =>
      /\b(i get (so |really )?(angry|mad|furious|annoyed|irritated)|it makes me (so |really )?(angry|mad|furious)|(triggers|sets) me off|i lose my temper)\b/.test(t),
  },
  {
    category: 'relaxation',
    test: (t) => /\b(helps me (calm|relax)|calms me down|relaxes me|i feel better when i|what helps me)\b/.test(t),
  },
  {
    category: 'goal',
    test: (t) => /\b(my goal is|i want to (learn|get better|stop|start|be able)|i'?m trying to|i am trying to)\b/.test(t),
  },
  {
    category: 'stress_exam',
    test: (t) => /\b(exams?|tests?|studying|studies|grades?|marks|assignments?)\b/.test(t) && STRESS.test(t),
  },
  {
    category: 'stress_work',
    test: (t) => /\b(work|job|boss|manager|deadlines?|internship|office)\b/.test(t) && STRESS.test(t),
  },
  {
    category: 'stress_family',
    test: (t) =>
      /\b(family|parents?|mom|mum|dad|mother|father|siblings?|brother|sister|partner|relationship)\b/.test(t) &&
      (STRESS.test(t) || CONFLICT.test(t)),
  },
  {
    category: 'hobby',
    test: (t) => /\b(my hobby|in my free time|i (really )?(love|enjoy) [a-z]+ing)\b/.test(t),
  },
]

// A remembered preference never needs these words, so any message containing
// them is not remembered at all. Broader than the safety keyword list on
// purpose: that list misses e.g. "wanted to die", and this check must hold even
// when the LLM risk check is unavailable. Over-blocking ("dying of laughter")
// only means something harmless isn't remembered.
const NEVER_REMEMBER =
  /\b(die|died|dying|dead|death|kill(ed|ing)?|suicid\w*|self[- ]?harm|harm(ing)? myself|hurt(ing)? myself|cut(ting)? myself|better off without|end (it|it all|my life|things)|not be here|disappear)\b/

/** The memory worth keeping from this message, or null. Never from crisis language. */
export function extractMemory(text: string | undefined): { category: MemoryCategory; text: string } | null {
  if (!text || typeof text !== 'string') return null
  const lower = text.toLowerCase()
  // belt and braces: the caller also skips extraction whenever risk was flagged
  if (detectSafetyTrigger(text).triggered || NEVER_REMEMBER.test(lower)) return null
  const rule = RULES.find((r) => r.test(lower))
  return rule ? { category: rule.category, text: text.trim().slice(0, 150) } : null
}

const normalise = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** True when the same thing is already remembered in that category. */
export function isDuplicateMemory(
  existing: { category: string; memory_text: string }[],
  category: string,
  text: string,
): boolean {
  const n = normalise(text)
  return existing.some((m) => m.category === category && normalise(m.memory_text) === n)
}

/** Most recent first: keep at most `perCategory` per category and `total` overall. */
export function capMemoriesForPrompt<T extends { category: string }>(memories: T[], perCategory = 3, total = 12): T[] {
  const counts: Record<string, number> = {}
  const out: T[] = []
  for (const m of memories) {
    if (out.length >= total) break
    counts[m.category] = (counts[m.category] ?? 0) + 1
    if (counts[m.category] <= perCategory) out.push(m)
  }
  return out
}
