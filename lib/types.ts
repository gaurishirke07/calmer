export type EmotionType = 'anger' | 'stress' | 'sadness' | 'happiness' | 'fear' | 'neutral'

export type MemoryCategory = 
  | 'trigger'
  | 'relaxation'
  | 'goal'
  | 'stress_work'
  | 'stress_family'
  | 'stress_exam'
  | 'hobby'
  | 'other'

export interface UserProfile {
  id: string
  display_name: string | null
  created_at: string
}

export interface ChatMessage {
  id: string
  chat_session_id: string
  user_id: string
  role: 'user' | 'assistant'
  content: string
  emotion?: EmotionType
  created_at: string
}

export interface ChatSession {
  id: string
  user_id: string
  title: string
  summary?: string | null
  mood?: EmotionType
  anger_level?: number
  stress_level?: number
  created_at: string
  updated_at?: string
  chat_messages?: ChatMessage[] | { count: number }[]
}

export interface UserMemory {
  id: string
  user_id: string
  category: MemoryCategory
  memory_text: string
  created_at: string
  updated_at: string
}

export interface MoodLog {
  id: string
  user_id: string
  chat_session_id?: string | null
  dominant_emotion: EmotionType
  anger_level: number
  stress_level: number
  trigger_source?: string | null
  notes?: string | null
  created_at: string
}

export interface SessionSummary {
  mood: EmotionType
  anger_level: number
  stress_level: number
  major_triggers: string[]
  helpful_techniques: string[]
  progress: string
  next_recommendations: string
}

export interface MoodAnalyticsData {
  weeklyMoodTrend: { day: string; anger: number; stress: number; mood: string }[]
  monthlyMoodTrend: { week: string; anger: number; stress: number }[]
  emotionDistribution: { emotion: string; count: number; percentage: number }[]
  commonTriggers: { trigger: string; count: number }[]
  totalSessions: number
  averageAnger: number
  averageStress: number
  emotionalImprovement: number
  currentMood: EmotionType
  mostCommonTrigger: string
}

export interface CategorizedSessions {
  today: ChatSession[]
  yesterday: ChatSession[]
  previous7Days: ChatSession[]
  older: ChatSession[]
}
