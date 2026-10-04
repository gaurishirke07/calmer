import { describe, it, expect } from 'vitest'
import { capMemoriesForPrompt, extractMemory, isDuplicateMemory } from './memory-extract'

describe('extractMemory', () => {
  it('no longer saves a message just because it mentions a common word', () => {
    // each of these was saved verbatim by the old keyword rules
    expect(extractMemory("I'm still furious about the exam tomorrow")).toBeNull()
    expect(extractMemory('my boss emailed me')).toBeNull()
    expect(extractMemory('we talked about college today')).toBeNull()
    expect(extractMemory('my family is visiting')).toBeNull()
  })

  it('keeps explicit first-person disclosures, in the right category', () => {
    expect(extractMemory('I get so angry when my brother takes my stuff')?.category).toBe('trigger')
    expect(extractMemory('Going for a walk really calms me down')?.category).toBe('relaxation')
    expect(extractMemory('My goal is to stop snapping at people')?.category).toBe('goal')
    expect(extractMemory('Exams stress me out every single time')?.category).toBe('stress_exam')
    expect(extractMemory('My manager puts so much pressure on me')?.category).toBe('stress_work')
    expect(extractMemory('I keep arguing with my parents')?.category).toBe('stress_family')
    expect(extractMemory('I love painting in my free time')?.category).toBe('hobby')
  })

  it('never remembers crisis language, even if a pattern matches', () => {
    expect(extractMemory('my family would be better off if I wanted to die, the pressure is too much')).toBeNull()
    expect(extractMemory('I get so angry I want to hurt myself')).toBeNull()
  })

  it('caps the stored text', () => {
    expect(extractMemory('I get angry when ' + 'x'.repeat(400))!.text.length).toBe(150)
  })
})

describe('isDuplicateMemory', () => {
  it('ignores case and whitespace, but not category', () => {
    const existing = [{ category: 'trigger', memory_text: 'I get angry when people interrupt me' }]
    expect(isDuplicateMemory(existing, 'trigger', '  i get ANGRY when people   interrupt me ')).toBe(true)
    expect(isDuplicateMemory(existing, 'goal', 'I get angry when people interrupt me')).toBe(false)
  })
})

describe('capMemoriesForPrompt', () => {
  it('keeps the most recent few per category and a total ceiling', () => {
    const mems = [
      ...Array.from({ length: 5 }, (_, i) => ({ category: 'trigger', i })),
      ...Array.from({ length: 5 }, (_, i) => ({ category: 'goal', i })),
    ]
    const kept = capMemoriesForPrompt(mems, 3, 5)
    expect(kept.filter((m) => m.category === 'trigger')).toHaveLength(3)
    expect(kept).toHaveLength(5)
  })
})
