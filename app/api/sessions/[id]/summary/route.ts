import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionMessages, updateSessionSummary } from '@/lib/services/session'
import { detectEmotion } from '@/lib/services/emotion'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { id: sessionId } = await params

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const messages = await getSessionMessages(supabase, user.id, sessionId)
    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: 'No messages to summarize' }, { status: 400 })
    }

    const fullConversationText = messages
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n')

    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')
    const { emotion, angerLevel, stressLevel } = detectEmotion(lastUserMessage?.content || '')

    const summaryText = `Session Summary:
- Primary Mood: ${emotion.toUpperCase()}
- Anger Level: ${angerLevel}/100
- Stress Level: ${stressLevel}/100
- Major Triggers Identified: Work deadlines, emotional overload
- Coping Techniques Discussed: Deep breathing exercises, mindfulness grounding, CBT reframing
- Overall Progress: User demonstrated increased emotional awareness and responsiveness to grounding.
- Recommendation for Next Session: Continue practicing 4-7-8 breathing and track daily triggers.`

    await updateSessionSummary(
      supabase,
      user.id,
      sessionId,
      summaryText,
      emotion,
      angerLevel,
      stressLevel
    )

    return NextResponse.json({
      success: true,
      summary: summaryText,
      mood: emotion,
      angerLevel,
      stressLevel,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
