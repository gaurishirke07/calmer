import { NextResponse } from 'next/server'
import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createClient } from '@/lib/supabase/server'
import { getSessionMessages, updateSessionSummary } from '@/lib/services/session'

export const runtime = 'nodejs'

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

    // Honest mood read from the real classifier (latest user message), not a stub.
    const { data: lastUserMsg } = await supabase
      .from('therapist_convo')
      .select('emotion_label')
      .eq('session_id', sessionId)
      .eq('sender', 'user')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const mood = (lastUserMsg?.emotion_label as string) || 'neutral'

    const conversation = messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n')

    // Real, grounded summary via the same model as the chat — no fabricated
    // triggers/techniques. Falls back to a factual one-liner if the model is
    // unavailable.
    let summaryText = `A ${messages.length}-message conversation. Latest emotional read: ${mood}.`
    if (process.env.GROQ_API_KEY) {
      try {
        const groq = createOpenAI({ baseURL: 'https://api.groq.com/openai/v1', apiKey: process.env.GROQ_API_KEY })
        const { text } = await generateText({
          model: groq(process.env.CALMER_CHAT_MODEL || 'llama-3.3-70b-versatile'),
          system:
            'Summarize this supportive conversation in 3-4 short sentences: what the user was feeling, what was discussed, and any coping ideas that came up. Be factual and grounded strictly in the conversation — never invent details.',
          prompt: conversation.slice(0, 6000),
        })
        if (text?.trim()) summaryText = text.trim()
      } catch (e) {
        console.error('[summary] model summary failed, using factual fallback:', (e as Error).message)
      }
    }

    await updateSessionSummary(supabase, user.id, sessionId, summaryText, mood)

    return NextResponse.json({ success: true, summary: summaryText, mood })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
