import { createServiceClient } from '@/lib/supabase/service'
import {
  classifyBiometrics,
  computeReadinessScore,
  computeRMSSD,
  corroborateBiometricTransition,
} from '@/lib/calmer/readiness'

export const runtime = 'nodejs'

// Simple shared-secret gate — the Arduino/bridge has no user login, so this
// is intentionally not a full auth flow. Fine for a dev/demo device; swap
// for per-device signed tokens (see HARDWARE_DEVICE.firmware_version /
// last_calibrated fields) before any real-world deployment.
function isAuthorized(req: Request) {
  const secret = req.headers.get('x-hardware-secret')
  return !!process.env.HARDWARE_INGEST_SECRET && secret === process.env.HARDWARE_INGEST_SECRET
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return new Response('Unauthorized', { status: 401 })
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[biometric] SUPABASE_SERVICE_ROLE_KEY is not set — add it to .env.local and restart the dev server.')
    return new Response('Server misconfigured: SUPABASE_SERVICE_ROLE_KEY is missing from .env.local.', { status: 500 })
  }

  const body = await req.json().catch(() => null)
  if (!body || !body.session_id) {
    return new Response('session_id is required', { status: 400 })
  }

  const heartRate: number | null = body.heart_rate ?? null
  const gripPressure: number | null = body.grip_pressure ?? null
  const ibi: number | null = body.ibi ?? null

  const supabase = createServiceClient()

  // confirm the session exists (no ownership check here — service role — the
  // secret header is what gates this route)
  const { data: session, error: sessionErr } = await supabase
    .from('session')
    .select('id, start_time')
    .eq('id', body.session_id)
    .single()

  if (sessionErr || !session) {
    return new Response('Unknown session_id', { status: 404 })
  }

  // Pull recent readings BEFORE inserting — reused for both the biometric trend
  // and the rolling HRV (RMSSD over the IBI sequence including this beat).
  const { data: prior } = await supabase
    .from('biometric_reading')
    .select('heart_rate, grip_pressure, ibi')
    .eq('session_id', session.id)
    .order('recorded_at', { ascending: true })
    .limit(20)

  const ibiSequence = (prior ?? [])
    .map((r) => r.ibi as number | null)
    .filter((v): v is number => typeof v === 'number')
  if (ibi !== null) ibiSequence.push(ibi)
  const rmssd = computeRMSSD(ibiSequence.slice(-10)) // rolling 10-beat window

  const { stressScore, stressClass } = classifyBiometrics(heartRate, gripPressure)

  const { data: reading, error: readingErr } = await supabase
    .from('biometric_reading')
    .insert({
      session_id: session.id,
      device_id: body.device_id ?? null,
      heart_rate: heartRate,
      grip_pressure: gripPressure,
      ibi,
      rmssd,
      stress_class: stressClass,
    })
    .select()
    .single()

  if (readingErr) {
    console.error('[biometric] insert failed', readingErr)
    return new Response('Failed to store reading', { status: 500 })
  }

  // biometric trend = prior readings + the one we just stored
  const biometricStressScores = [
    ...(prior ?? []).map((r) => classifyBiometrics(r.heart_rate, r.grip_pressure).stressScore),
    stressScore,
  ]

  const sessionDurationSeconds = (Date.now() - new Date(session.start_time).getTime()) / 1000

  // Pull this session's NON-biometric history before scoring. It is needed
  // twice: once so the readiness score genuinely fuses across the whole
  // session rather than seeing biometrics alone, and again for the
  // false-positive guard below [Neupane et al. 2025].
  const [{ data: ventRows }, { data: sentimentRows }] = await Promise.all([
    supabase
      .from('venting_interaction')
      .select('intensity_score')
      .eq('session_id', session.id)
      .order('recorded_at', { ascending: true })
      .limit(20),
    supabase
      .from('emotional_state')
      .select('sentiment_score')
      .eq('session_id', session.id)
      .not('sentiment_score', 'is', null)
      .order('recorded_at', { ascending: true })
      .limit(10),
  ])

  const ventingIntensities = (ventRows ?? []).map(
    (r: { intensity_score: number }) => Number(r.intensity_score),
  )
  const sentimentScores = (sentimentRows ?? []).map(
    (r: { sentiment_score: number }) => Number(r.sentiment_score),
  )

  // Fuse everything this session has, not just the sensor that triggered us.
  const { readinessScore, stressLevel, signalsUsed } = computeReadinessScore({
    biometricStressScores,
    ventingIntensities,
    sentimentScores,
    sessionDurationSeconds,
  })

  const { corroborated, reason } = corroborateBiometricTransition({
    biometricStressScores,
    ventingIntensities,
    sentimentScores,
  })

  if (!corroborated) {
    console.warn(`[biometric] transition NOT corroborated for session ${session.id}: ${reason}`)
  }

  const { error: emotionErr } = await supabase.from('emotional_state').insert({
    session_id: session.id,
    biometric_reading_id: reading.id,
    stress_level: stressLevel,
    readiness_score: readinessScore,
    signals_used: signalsUsed,
    corroborated,
    source: 'biometric',
  })

  if (emotionErr) {
    console.error('[biometric] emotional_state update failed', emotionErr)
  }

  return Response.json({ stressClass, stressScore, readinessScore, stressLevel, rmssd, corroborated })
}
