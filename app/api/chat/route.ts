import { streamText, convertToModelMessages, generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createClient } from '@/lib/supabase/server'
import { getUserMemories, formatMemoriesForPrompt, autoExtractMemoriesFromMessage } from '@/lib/services/memory'
import { classifyEmotion } from '@/lib/calmer/emotion-classifier'
import {
  computeReadinessScore,
  classifyBiometrics,
  detectSafetyTrigger,
  stubTextSentiment,
} from '@/lib/calmer/readiness'
import { SAFETY_CLASSIFIER_SYSTEM, SAFETY_MODE_SYSTEM, combineRisk, type RiskLevel } from '@/lib/calmer/safety'

export const runtime = 'nodejs'

// ── Model choice ─────────────────────────────────────────────────────────
// Llama-3.3-70B via Groq's OpenAI-compatible API (drop-in for the ai-sdk
// OpenAI client). Same open-weight, citable model, served free/fast with no
// Meta-licence gate. Override with CALMER_CHAT_MODEL (must be a Groq model id).
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
    const { messages } = body
    // One unified `session` id drives everything now (history, fusion, summary).
    // `calmerSessionId` is still accepted for backward-compat with the game handoff.
    const sessionId: string | null = body.sessionId ?? body.calmerSessionId ?? null

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

    const groq = createOpenAI({
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey: process.env.GROQ_API_KEY,
    })
    const modelId = process.env.CALMER_CHAT_MODEL || DEFAULT_MODEL

    // ── Safety gate: fast keyword pre-filter + an LLM risk check on every
    // message (layered, conservative — takes the higher signal). HIGH risk
    // switches the reply into safety mode and logs a flag. [Pichowicz 2025]
    let risk: RiskLevel = 'none'
    if (userText) {
      const keywordFlag = detectSafetyTrigger(userText)
      let verdict: string | null = null
      try {
        const { text } = await generateText({
          model: groq(modelId),
          system: SAFETY_CLASSIFIER_SYSTEM,
          prompt: userText,
        })
        verdict = text
      } catch (e) {
        console.warn('[chat] safety LLM check failed, using keyword filter only:', (e as Error).message)
      }
      risk = combineRisk(keywordFlag.triggered, verdict)
    }
    const safetyMode = risk === 'high'

    // Persistent-companion memory extraction (user_memories — kept feature).
    if (userText) {
      await autoExtractMemoriesFromMessage(supabase, user.id, userText)
    }

    // ── Unified layer: persistence + fused readiness (Novelty #1) ──────────
    let previousSummaryText = ''
    if (sessionId && userText) {
      // Pull the session + this session's venting/biometric history in one round.
      const [{ data: sessionRow }, { data: ventRows }, { data: bioRows }] = await Promise.all([
        supabase.from('session').select('start_time, title, summary').eq('id', sessionId).maybeSingle(),
        supabase
          .from('venting_interaction')
          .select('intensity_score, recorded_at')
          .eq('session_id', sessionId)
          .order('recorded_at', { ascending: true })
          .limit(20),
        supabase
          .from('biometric_reading')
          .select('heart_rate, grip_pressure, recorded_at')
          .eq('session_id', sessionId)
          .order('recorded_at', { ascending: true })
          .limit(10),
      ])

      if (sessionRow?.summary) {
        previousSummaryText = `Previous Session Summary:\n${sessionRow.summary}\n`
      }

      // Log the layered-safety result (computed above) against this session.
      if (risk !== 'none') {
        const { error } = await supabase.from('safety_flag').insert({
          session_id: sessionId,
          trigger_type: 'self_harm_risk',
          severity: risk === 'high' ? 'high' : 'low',
          source_text: userText.slice(0, 500),
        })
        if (error) console.error('[chat] failed to log safety_flag:', error.message)
      }

      // Real classifier first, lexicon stub only on failure — record which ran.
      const classification = await classifyEmotion(userText)
      const sentiment = classification?.sentimentScore ?? stubTextSentiment(userText)
      const usingStubSentiment = classification === null
      const emotionLabel = classification?.label ?? 'neutral'

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
      const source = signalsUsed.length > 1 ? 'fused' : 'text'

      const [{ error: convoErr }, { error: stateErr }] = await Promise.all([
        supabase.from('therapist_convo').insert({
          session_id: sessionId,
          sender: 'user',
          msg_text: userText,
          emotion_label: emotionLabel,
        }),
        supabase.from('emotional_state').insert({
          session_id: sessionId,
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

      // Keep the session fresh + titled + mood-tagged for the sidebar/dashboard.
      const sessionUpdate: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        mood: emotionLabel,
      }
      if (!sessionRow?.title) sessionUpdate.title = userText.slice(0, 40)
      const { error: updErr } = await supabase.from('session').update(sessionUpdate).eq('id', sessionId)
      if (updErr) console.error('[chat] failed to update session:', updErr.message)
    }

    // Load memories for the system prompt
    const userMemories = await getUserMemories(supabase, user.id)
    const formattedMemories = formatMemoriesForPrompt(userMemories)

    // Limit to last 10 messages for token economy / relevance
    const recentMessages = messages.slice(-10)

    // On HIGH risk, replace normal therapy with the safety-mode reply.
    const systemPrompt = safetyMode
      ? SAFETY_MODE_SYSTEM
      : `You are CALMER's AI Therapist & Persistent Companion, a compassionate and empathetic mental health guide.

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
        if (!sessionId || !text) return
        const { error } = await supabase.from('therapist_convo').insert({
          session_id: sessionId,
          sender: 'assistant',
          msg_text: text,
        })
        if (error) console.error('[chat] failed to save therapist_convo assistant row:', error.message)
        await supabase.from('session').update({ updated_at: new Date().toISOString() }).eq('id', sessionId)
      },
    })

    return result.toUIMessageStreamResponse()
  } catch (error: any) {
    console.error('Error in chat API route:', error)
    return new Response(error?.message || 'Internal Server Error', { status: 500 })
  }
}
