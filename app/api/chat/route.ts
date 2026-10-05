import { streamText, generateText } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { chatModel } from '@/lib/calmer/chat-model'
import { sanitizeHistory } from '@/lib/calmer/chat-history'
import { createNewSession } from '@/lib/services/session'
import { getUserMemories, formatMemoriesForPrompt, autoExtractMemoriesFromMessage } from '@/lib/services/memory'
import { classifyEmotion } from '@/lib/calmer/emotion-classifier'
import {
  computeReadinessScore,
  classifyBiometrics,
  detectSafetyTrigger,
  stubTextSentiment,
} from '@/lib/calmer/readiness'
import {
  CHAT_RATE_LIMIT,
  CHAT_RATE_LIMITED_REPLY,
  CHAT_UNAVAILABLE_REPLY,
  RISK_CHECK_UNAVAILABLE_INSTRUCTION,
  SAFETY_CLASSIFIER_SYSTEM,
  SAFETY_MODE_SYSTEM,
  assessRisk,
  combineRisk,
  type RiskLevel,
} from '@/lib/calmer/safety'

export const runtime = 'nodejs'

// Model choice lives in lib/calmer/chat-model.ts (shared with the summary route).

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
      console.error('[chat] GROQ_API_KEY is not set')
      return new Response('Chat is not configured.', { status: 500 })
    }

    const body = await req.json().catch(() => null)
    // One unified `session` id drives everything now (history, fusion, summary).
    // `calmerSessionId` is still accepted for backward-compat with the game handoff.
    let sessionId: string | null =
      typeof body?.sessionId === 'string' ? body.sessionId
      : typeof body?.calmerSessionId === 'string' ? body.calmerSessionId
      : null

    // Per-user rate limit, counted from the user's own saved messages (RLS
    // scopes therapist_convo to their sessions). Checked before any model call.
    const countSince = async (ms: number) => {
      const { count } = await supabase
        .from('therapist_convo')
        .select('id', { count: 'exact', head: true })
        .eq('sender', 'user')
        .gte('created_at', new Date(Date.now() - ms).toISOString())
      return count ?? 0
    }
    const [lastMinute, lastHour] = await Promise.all([countSince(60_000), countSince(3_600_000)])
    if (lastMinute >= CHAT_RATE_LIMIT.perMinute || lastHour >= CHAT_RATE_LIMIT.perHour) {
      return new Response(CHAT_RATE_LIMITED_REPLY, { status: 429 })
    }

    // Text-only user/assistant turns rebuilt server-side; the risk check below
    // reads the same text the model does (see lib/calmer/chat-history.ts).
    const history = sanitizeHistory(body?.messages)
    if (!history) {
      return new Response('A user message is required.', { status: 400 })
    }
    const userText = history[history.length - 1].content

    // A stale or foreign ?session= id used to pass straight through: every
    // insert, including the safety flag, then failed RLS while the UI looked fine.
    let sessionRow: { start_time: string | null; title: string | null; summary: string | null } | null = null
    if (sessionId) {
      const { data } = await supabase
        .from('session')
        .select('start_time, title, summary')
        .eq('id', sessionId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!data) return new Response('Session not found.', { status: 404 })
      sessionRow = data
    }

    const model = chatModel()

    // ── Safety gate: fast keyword pre-filter + an LLM risk check on every
    // message (layered, conservative — takes the higher signal). HIGH risk
    // switches the reply into safety mode and logs a flag. [Pichowicz 2025]
    let risk: RiskLevel = 'none'
    let riskCheckUnavailable = false
    // Which layer raised it, stored on the flag so researchers can tell
    // keyword-only flags (incl. LLM outages) from LLM-confirmed ones.
    let riskSource = ''
    if (userText) {
      const keywordFlag = detectSafetyTrigger(userText)
      let verdict: string | null = null
      try {
        const { text } = await generateText({
          model,
          system: SAFETY_CLASSIFIER_SYSTEM,
          prompt: userText,
        })
        verdict = text
      } catch (e) {
        console.error('[chat] SAFETY CHECK FAILED:', (e as Error).message)
      }
      ;({ risk, checkUnavailable: riskCheckUnavailable } = assessRisk(keywordFlag.triggered, verdict))
      const llmRisk = riskCheckUnavailable ? 'none' : combineRisk(false, verdict)
      riskSource =
        [keywordFlag.triggered ? 'keyword' : '', llmRisk !== 'none' ? 'llm' : ''].filter(Boolean).join('+') +
        (riskCheckUnavailable ? ' (llm unavailable)' : '')
      if (riskCheckUnavailable) {
        // Keyword-only catches ~30% of crisis messages (scripts/safety-eval.mjs).
        // Never pass that off as a clean check: this reply carries the crisis line.
        console.error('[chat] risk check unavailable (verdict:', JSON.stringify(verdict), ') — fail-safe: crisis line added')
      }
    }
    const safetyMode = risk === 'high'

    // A flagged message must always leave a safety_flag row, and that needs a
    // session. If the client's session create failed, make one here.
    if (risk !== 'none' && !sessionId) {
      const created = await createNewSession(supabase, user.id, userText.slice(0, 40))
      if (created) sessionId = created.id
      else console.error('[chat] could not create a session to hold a safety flag')
    }

    // Persistent-companion memory: only from messages the risk check actually
    // ran on AND cleared. A flagged message — or one we could not check — is
    // never turned into a memory that would be replayed into every future chat.
    if (userText && risk === 'none' && !riskCheckUnavailable) {
      await autoExtractMemoriesFromMessage(supabase, user.id, userText)
    }

    // ── Unified layer: persistence + fused readiness (Novelty #1) ──────────
    let previousSummaryText = ''
    // Carries the venting stage into Module 2's PROMPT, not just into the
    // readiness score. Without this the agent has no idea the user just spent
    // two minutes in the rage room, so the handoff feels like a cold restart.
    let ventingContext = ''
    if (sessionId && userText) {
      // This session's venting/biometric/sentiment history in one round.
      const [{ data: ventRows }, { data: bioRows }, { data: sentRows }, { data: peakRows }] = await Promise.all([
        // DESCENDING + limit, then reversed below. Ascending + limit returns the
        // OLDEST N, which froze the trend at the start of the session — the
        // moment the user was most activated. Invisible while sessions had
        // fewer rows than the limit; real hardware at 2s intervals produces
        // hundreds, so chat was scoring the user as they were on arrival.
        supabase
          .from('venting_interaction')
          .select('intensity_score, recorded_at')
          .eq('session_id', sessionId)
          .order('recorded_at', { ascending: false })
          // rows of one flush share a timestamp: a fixed tiebreak keeps the 40-row
          // window the same on every read instead of cutting a batch arbitrarily
          .order('id', { ascending: false })
          // 40 = the game's own history length, so chat scores exactly the
          // venting history (hits AND persisted idle ticks) the game ended on.
          .limit(40),
        supabase
          .from('biometric_reading')
          .select('heart_rate, grip_pressure, recorded_at')
          .eq('session_id', sessionId)
          .order('recorded_at', { ascending: false })
          .limit(10),
        // Prior text-sentiment scores for this session, so chat readiness fuses
        // the sentiment TRAJECTORY over the reflection rather than only the latest
        // message. Mirrors how /api/biometric already pulls sentiment history.
        // Newest-first + limit for a recent window; reversed to chronological below.
        supabase
          .from('emotional_state')
          .select('sentiment_score, recorded_at')
          .eq('session_id', sessionId)
          .not('sentiment_score', 'is', null)
          .order('recorded_at', { ascending: false })
          .limit(10),
        // The session's peak intensity — the venting trend's reference point.
        // The 40-row window above can miss an early burst entirely.
        supabase
          .from('venting_interaction')
          .select('intensity_score')
          .eq('session_id', sessionId)
          .order('intensity_score', { ascending: false })
          .limit(1),
      ])

      if (sessionRow?.summary) {
        // A summary of THIS conversation so far (made from the chat's
        // "Summarize Session" button), not of a previous session.
        previousSummaryText = `Summary of this conversation so far:\n${sessionRow.summary}\n`
      }

      // Log the layered-safety result (computed above) against this session.
      if (risk !== 'none') {
        const { error } = await supabase.from('safety_flag').insert({
          session_id: sessionId,
          trigger_type: riskSource || 'self_harm_risk',
          severity: risk === 'high' ? 'high' : 'low',
          source_text: userText.slice(0, 500),
        })
        if (error) console.error('[chat] failed to log safety_flag:', error.message)
      }

      // Real classifier first, lexicon stub only on failure — record which ran.
      const classification = await classifyEmotion(userText)
      const sentiment = classification?.sentimentScore ?? stubTextSentiment(userText)
      const usingStubSentiment = classification === null
      // null when the classifier was unavailable (the stub gives a sentiment
      // number, not an emotion), so dashboards don't count it as 'neutral'.
      const emotionLabel = classification?.label ?? null

      // .reverse() restores chronological order — the queries above fetch
      // newest-first to get a RECENT window, but trendSignal expects oldest-first.
      const ventingIntensities = (ventRows ?? [])
        .slice()
        .reverse()
        .map((r: { intensity_score: number }) => Number(r.intensity_score))
      const biometricStressScores = (bioRows ?? [])
        .slice()
        .reverse()
        .map(
          (r: { heart_rate: number | null; grip_pressure: number | null }) =>
            classifyBiometrics(r.heart_rate, r.grip_pressure).stressScore,
        )
        .filter((s): s is number => s !== null) // no usable channel = no evidence
      // Prior sentiments (chronological) + this message's sentiment last, so the
      // fusion sees the reflection-phase trajectory, not a single point.
      const priorSentiments = (sentRows ?? [])
        .slice()
        .reverse()
        .map((r: { sentiment_score: number }) => Number(r.sentiment_score))
      const sessionDurationSeconds = sessionRow?.start_time
        ? (Date.now() - new Date(sessionRow.start_time).getTime()) / 1000
        : undefined

      const { readinessScore, stressLevel, signalsUsed, usingStubSignals } = computeReadinessScore({
        ventingIntensities,
        ventingSessionPeak: peakRows?.[0] ? Number(peakRows[0].intensity_score) : undefined,
        biometricStressScores,
        sentimentScores: [...priorSentiments, sentiment],
        sessionDurationSeconds,
        usingStubSentiment,
      })
      // 'fused' only when something besides the text joined in: elapsed time is
      // always present, so counting signals made every chat row 'fused'.
      const source = signalsUsed.some((k) => k !== 'sentiment' && k !== 'sessionContext') ? 'fused' : 'text'

      // Only when this session actually has a venting stage behind it.
      if (ventingIntensities.length > 0) {
        ventingContext =
          `Session context: this user has just come from a venting session in the rage room. ` +
          `Their computed readiness is ` +
          `${readinessScore.toFixed(2)} on a 0-1 scale, where 0 means still highly activated and ` +
          `1 means calm. Open by gently acknowledging that they have just been venting and invite ` +
          `them to reflect on what brought it on. Never mention scores, numbers or sensors to the ` +
          `user, and do not sound clinical.\n`
      }

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
      const sessionUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (emotionLabel) sessionUpdate.mood = emotionLabel // keep the last real label
      if (!sessionRow?.title) sessionUpdate.title = userText.slice(0, 40)
      const { error: updErr } = await supabase.from('session').update(sessionUpdate).eq('id', sessionId)
      if (updErr) console.error('[chat] failed to update session:', updErr.message)
    }

    // Load memories for the system prompt
    const userMemories = await getUserMemories(supabase, user.id)
    const formattedMemories = formatMemoriesForPrompt(userMemories)

    // On HIGH risk, replace normal therapy with the safety-mode reply.
    const systemPrompt = safetyMode
      ? SAFETY_MODE_SYSTEM
      : `You are CALMER's AI companion: a compassionate, empathetic guide for reflecting on difficult emotions, with persistent memory of what the user has shared. You are not a therapist and must never claim to be one.

${formattedMemories}

${previousSummaryText}
${ventingContext}

Guidelines:
1. Listen actively, validate emotions without judgment, and naturally reference the user's history and preferred calming strategies when relevant.
2. Avoid repeating advice you already gave in previous sessions.
3. Help users process anger, anxiety, and stress using CBT, mindfulness, and emotional grounding.
4. Ask open-ended, reflective questions; acknowledge feelings before offering suggestions.
5. If the user expresses thoughts of self-harm or crisis, gently encourage contacting local emergency services or a crisis line (in India, Tele-MANAS 14416); never dismiss or minimize.
6. You are first-level, short-term support — not a replacement for professional therapy. Encourage professional help for serious concerns.
7. Keep responses conversational, empathetic, and supportive (2-4 paragraphs).${
          riskCheckUnavailable ? `\n\n${RISK_CHECK_UNAVAILABLE_INSTRUCTION}` : ''
        }`

    const result = streamText({
      model,
      system: systemPrompt,
      messages: history,
      onFinish: async ({ text }) => {
        if (!sessionId || !text) return // sessionId is the validated (or server-created) one
        const { error } = await supabase.from('therapist_convo').insert({
          session_id: sessionId,
          sender: 'assistant',
          msg_text: text,
        })
        if (error) console.error('[chat] failed to save therapist_convo assistant row:', error.message)
        await supabase.from('session').update({ updated_at: new Date().toISOString() }).eq('id', sessionId)
      },
    })

    // A failed reply must never be silent (when the model was retired, users
    // got no reply and no error). The client shows its own deterministic
    // fallback with the crisis line; this is the text it receives.
    return result.toUIMessageStreamResponse({
      // Tag the reply so the client ALWAYS shows the crisis line under it in
      // safety mode (or when the risk check couldn't run), instead of relying
      // on the model to include it.
      messageMetadata: ({ part }) =>
        part.type === 'start' && (safetyMode || riskCheckUnavailable) ? { crisisLine: true } : undefined,
      onError: (err) => {
        console.error('[chat] REPLY FAILED:', (err as Error)?.message ?? err)
        return CHAT_UNAVAILABLE_REPLY
      },
    })
  } catch (error) {
    console.error('Error in chat API route:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}
