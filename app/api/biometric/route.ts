import { createServiceClient } from '@/lib/supabase/service'
import { classifyBiometrics, computeReadinessScore } from '@/lib/calmer/readiness'

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

  const body = await req.json().catch(() => null)
  if (!body || !body.session_id) {
    return new Response('session_id is required', { status: 400 })
  }

  const heartRate: number | null = body.heart_rate ?? null
  const gripPressure: number | null = body.grip_pressure ?? null

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

  const { stressScore, stressClass } = classifyBiometrics(heartRate, gripPressure)

  const { data: reading, error: readingErr } = await supabase
    .from('biometric_reading')
    .insert({
      session_id: session.id,
      device_id: body.device_id ?? null,
      heart_rate: heartRate,
      grip_pressure: gripPressure,
      stress_class: stressClass,
    })
    .select()
    .single()

  if (readingErr) {
    console.error('[biometric] insert failed', readingErr)
    return new Response('Failed to store reading', { status: 500 })
  }

  // pull recent biometric history for the trend signal
  const { data: recentReadings } = await supabase
    .from('biometric_reading')
    .select('heart_rate, grip_pressure, recorded_at')
    .eq('session_id', session.id)
    .order('recorded_at', { ascending: true })
    .limit(10)

  const biometricStressScores = (recentReadings ?? []).map(
    (r) => classifyBiometrics(r.heart_rate, r.grip_pressure).stressScore,
  )

  const sessionDurationSeconds = (Date.now() - new Date(session.start_time).getTime()) / 1000

  const { readinessScore, stressLevel, signalsUsed } = computeReadinessScore({
    biometricStressScores,
    sessionDurationSeconds,
  })

  const { error: emotionErr } = await supabase.from('emotional_state').insert({
    session_id: session.id,
    biometric_reading_id: reading.id,
    stress_level: stressLevel,
    readiness_score: readinessScore,
    signals_used: signalsUsed,
    source: 'biometric',
  })

  if (emotionErr) {
    console.error('[biometric] emotional_state update failed', emotionErr)
  }

  return Response.json({ stressClass, stressScore, readinessScore, stressLevel })
}
