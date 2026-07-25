import { streamText, convertToModelMessages } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createClient } from '@/lib/supabase/server'
import { getUserMemories, formatMemoriesForPrompt, autoExtractMemoriesFromMessage } from '@/lib/services/memory'
import { detectEmotion } from '@/lib/services/emotion'
import { classifyEmotion } from '@/lib/calmer/emotion-classifier'
import {
  computeReadinessScore,
  classifyBiometrics,
  detectSafetyTrigger,
  stubTextSentiment,
} from '@/lib/calmer/readiness'

export const runtime = 'nodejs'

// ── Model choice ─────────────────────────────────────────────────────────
// Llama-3.3-70B via Groq's OpenAI-compatible API (drop-in for the ai-sdk
// OpenAI client). Same open-weight, citable model (Llama 3 technical report),
// but Groq serves it on a free tier with NO Meta-licence gate and NO inference
// credits, at the fastest hosted speed available (LPU, ~700 tok/s) — which
// keeps the demo snappy. Free-tier caps (~1,000 req/day) are ample for dev.
// Override with CALMER_CHAT_MODEL to A/B a different model without code changes.
const DEFAULT_MODEL = 'llama-3.3-70b-versatile'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return new Response('Unauthorized', { status: 401 })
    }

    if (!process.env.GROQ_API_KEY) {
      return new Response('GROQ_API_KEY is missing from environment variables.', { status: 500 })
    }

    const body = await req.json()
    // sessionId       -> legacy chat_sessions row (drives sidebar / history / memory)
    // calmerSessionId -> unified `session` row shared with the rage room, so the
    //                    readiness score can FUSE this message's sentiment with the
    //                    same session's venting + biometric history (Novelty #1).
    const { messages, sessionId } = body
    const calmerSessionId: string | null = body.calmerSessionId ?? body.session_id ?? null

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response('Messages array is required', { status: 400 })
    }

    // Extract last user message text (string or AI-SDK parts shape)
    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === 'user')
    let userText = ''
    if (lastUserMsg) {
      if (typeof lastUserMsg.content === 'string' && lastUserMsg.content.length > 0) {
        userText = lastUserMsg.content
      } else if (Array.isArray(lastUserMsg.parts)) {
        userText = lastUserMsg.parts
          .filter((p: any) => p && p.type === 'text' && typeof p.text === 'string')
          .map((p: any) => p.text)
          .join(' ')
      } else if (lastUserMsg.content) {
        userText = String(lastUserMsg.content)
      }
    }

    // ── Legacy persistence (v1) — keeps sidebar / history / mood analytics working.
    // detectEmotion is the older keyword stub in lib/services/emotion.ts; it feeds
    // only the legacy mood_logs. The unified research layer below uses the real
    // classifier instead. (Reconciling these two paths is Phase 6 hygiene.)
    const { emotion, angerLevel, stressLevel: legacyStress } = detectEmotion(userText)
    if (sessionId && userText) {
      await supabase.from('chat_messages').insert({
        chat_session_id: sessionId,
        user_id: user.id,
        role: 'user',
        content: userText,
        emotion,
      })
      await supabase.from('mood_logs').insert({
        user_id: user.id,
        chat_session_id: sessionId,
        dominant_emotion: emotion,
        anger_level: angerLevel,
        stress_level: legacyStress,
      })
      await autoExtractMemoriesFromMessage(supabase, user.id, userText)
    }

    // ── Unified research layer (Novelty #1) — safety flag + fused readiness.
    if (calmerSessionId && userText) {
      // Safety-flag STUB (keyword list) — wired end-to-end so the SAFETY_FLAG
      // pathway is demonstrable, but NOT a real crisis detector. Replacing it
      // with a layered classifier+LLM check is Phase 3 (T4.1); do not present
      // this keyword match as the safety mechanism.
      const flag = detectSafetyTrigger(userText)
      if (flag.triggered) {
        const { error } = await supabase.from('safety_flag').insert({
          session_id: calmerSessionId,
          trigger_type: flag.triggerType,
          severity: flag.severity,
          source_text: userText.slice(0, 500),
        })
        if (error) console.error('[chat] failed to log safety_flag:', error.message)
      }

      // Real classifier first, lexicon stub only on failure — and record which
      // one actually ran so stub-derived rows stay honestly labelled.
      const classification = await classifyEmotion(userText)
      const sentiment = classification?.sentimentScore ?? stubTextSentiment(userText)
      const usingStubSentiment = classification === null
      const emotionLabel = classification?.label ?? emotion

      // Cross-session fusion: pull THIS session's venting + biometric history so
      // the chat-side readiness score is not sentiment-alone.
      const [{ data: sessionRow }, { data: ventRows }, { data: bioRows }] = await Promise.all([
        supabase.from('session').select('start_time').eq('id', calmerSessionId).maybeSingle(),
        supabase
          .from('venting_interaction')
          .select('intensity_score, recorded_at')
          .eq('session_id', calmerSessionId)
          .order('recorded_at', { ascending: true })
          .limit(20),
        supabase
          .from('biometric_reading')
          .select('heart_rate, grip_pressure, recorded_at')
          .eq('session_id', calmerSessionId)
          .order('recorded_at', { ascending: true })
          .limit(10),
      ])

      const ventingIntensities = (ventRows ?? []).map((r: { intensity_score: number }) => Number(r.intensity_score))
      const biometricStressScores = (bioRows ?? []).map(
        (r: { heart_rate: number | null; grip_pressure: number | null }) =>
          classifyBiometrics(r.heart_rate, r.grip_pressure).stressScore,
      )
      const sessionDurationSeconds = sessionRow?.start_time
        ? (Date.now() - new Date(sessionRow.start_time).getTime()) / 1000
        : undefined

      const { readinessScore, stressLevel, signalsUsed, usingStubSignals } = computeReadinessScore({
        ventingIntensities,
        biometricStressScores,
        sentimentScores: [sentiment],
        sessionDurationSeconds,
        usingStubSentiment,
      })

      // source is 'fused' when more than the text signal contributed, else 'text'
      const source = signalsUsed.length > 1 ? 'fused' : 'text'

      const [{ error: convoErr }, { error: stateErr }] = await Promise.all([
        supabase.from('therapist_convo').insert({
          session_id: calmerSessionId,
          sender: 'user',
          msg_text: userText,
          emotion_label: emotionLabel,
        }),
        supabase.from('emotional_state').insert({
          session_id: calmerSessionId,
          sentiment_score: sentiment,
          readiness_score: readinessScore,
          stress_level: stressLevel,
          signals_used: signalsUsed,
          using_stub_signals: usingStubSignals,
          source,
        }),
      ])
      if (convoErr) console.error('[chat] failed to save therapist_convo user row:', convoErr.message)
      if (stateErr) console.error('[chat] failed to update emotional_state:', stateErr.message)
    }

    // Load memories & previous summary for the system prompt (v1 behavior)
    const userMemories = await getUserMemories(supabase, user.id)
    const formattedMemories = formatMemoriesForPrompt(userMemories)

    let previousSummaryText = ''
    if (sessionId) {
      const { data: currentSession } = await supabase
        .from('chat_sessions')
        .select('summary')
        .eq('id', sessionId)
        .single()
      if (currentSession?.summary) {
        previousSummaryText = `Previous Session Summary:\n${currentSession.summary}\n`
      }
    }

    // Limit to last 10 messages for token economy / relevance
    const recentMessages = messages.slice(-10)

    const groq = createOpenAI({
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey: process.env.GROQ_API_KEY,
    })
    const modelId = process.env.CALMER_CHAT_MODEL || DEFAULT_MODEL

    const systemPrompt = `You are CALMER's AI Therapist & Persistent Companion, a compassionate and empathetic mental health guide.

${formattedMemories}

${previousSummaryText}

Guidelines:
1. Listen actively, validate emotions without judgment, and naturally reference the user's history and preferred calming strategies when relevant.
2. Avoid repeating advice you already gave in previous sessions.
3. Help users process anger, anxiety, and stress using CBT, mindfulness, and emotional grounding.
4. Ask open-ended, reflective questions; acknowledge feelings before offering suggestions.
5. If the user expresses thoughts of self-harm or crisis, gently encourage contacting local emergency services or a crisis line (in India, Tele-MANAS 14416); never dismiss or minimize.
6. You are first-level, short-term support — not a replacement for professional therapy. Encourage professional help for serious concerns.
7. Keep responses conversational, empathetic, and supportive (2-4 paragraphs).`

    const result = streamText({
      model: groq(modelId),
      system: systemPrompt,
      messages: await convertToModelMessages(recentMessages),
      onFinish: async ({ text }) => {
        if (!calmerSessionId || !text) return
        const { error } = await supabase.from('therapist_convo').insert({
          session_id: calmerSessionId,
          sender: 'assistant',
          msg_text: text,
        })
        if (error) console.error('[chat] failed to save therapist_convo assistant row:', error.message)
      },
    })

    return result.toUIMessageStreamResponse()
  } catch (error: any) {
    console.error('Error in chat API route:', error)
    return new Response(error?.message || 'Internal Server Error', { status: 500 })
  }
}
