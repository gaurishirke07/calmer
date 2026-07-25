import { EmotionType } from '@/lib/types'

const ANGER_KEYWORDS = [
  'angry', 'furious', 'mad', 'rage', 'pissed', 'annoyed', 'irrigated', 'hate', 
  'frustrated', 'outraged', 'livid', 'resensetful', 'hostile', 'screaming', 'yelling'
]

const STRESS_KEYWORDS = [
  'stress', 'stressed', 'overwhelmed', 'pressure', 'anxious', 'anxiety', 'panic',
  'exhausted', 'burnout', 'deadlines', 'workload', 'tense', 'nervous', 'worry'
]

const SADNESS_KEYWORDS = [
  'sad', 'depressed', 'lonely', 'hopeless', 'crying', 'heartbroken', 'unhappy',
  'grief', 'miserable', 'gloomy', 'despair', 'hurt', 'down'
]

const FEAR_KEYWORDS = [
  'scared', 'afraid', 'fear', 'terrified', 'frightened', 'fearful', 'dread'
]

const HAPPINESS_KEYWORDS = [
  'happy', 'calm', 'peaceful', 'relaxed', 'grateful', 'good', 'better', 'joy',
  'hopeful', 'relieved', 'content', 'optimistic'
]

export function detectEmotion(text?: string): { emotion: EmotionType; angerLevel: number; stressLevel: number } {
  const safeText = typeof text === 'string' ? text : ''
  const lower = safeText.toLowerCase()

  let angerScore = 0
  let stressScore = 0
  let sadnessScore = 0
  let fearScore = 0
  let happyScore = 0

  ANGER_KEYWORDS.forEach((word) => {
    if (lower.includes(word)) angerScore += 2
  })

  STRESS_KEYWORDS.forEach((word) => {
    if (lower.includes(word)) stressScore += 2
  })

  SADNESS_KEYWORDS.forEach((word) => {
    if (lower.includes(word)) sadnessScore += 2
  })

  FEAR_KEYWORDS.forEach((word) => {
    if (lower.includes(word)) fearScore += 2
  })

  HAPPINESS_KEYWORDS.forEach((word) => {
    if (lower.includes(word)) happyScore += 2
  })

  // Exclamation marks or ALL CAPS add intensity to anger/stress
  if (safeText.includes('!')) {
    angerScore += 1
    stressScore += 1
  }
  if (safeText && safeText === safeText.toUpperCase() && safeText.length > 5) {
    angerScore += 3
  }

  let dominant: EmotionType = 'neutral'
  let maxScore = 0

  const scores: { emotion: EmotionType; score: number }[] = [
    { emotion: 'anger', score: angerScore },
    { emotion: 'stress', score: stressScore },
    { emotion: 'sadness', score: sadnessScore },
    { emotion: 'fear', score: fearScore },
    { emotion: 'happiness', score: happyScore },
  ]

  scores.forEach((item) => {
    if (item.score > maxScore) {
      maxScore = item.score
      dominant = item.emotion
    }
  })

  // Calculate normalized anger & stress levels (0-100)
  const angerLevel = Math.min(100, Math.max(10, angerScore * 25 + 30))
  const stressLevel = Math.min(100, Math.max(10, stressScore * 25 + 30))

  return {
    emotion: dominant,
    angerLevel,
    stressLevel,
  }
}
