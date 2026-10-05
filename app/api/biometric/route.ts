import { createHash, timingSafeEqual } from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/service'
import {
  classifyBiometrics,
  computeReadinessScore,
  corroborateBiometricTransition,
} from '@/lib/calmer/readiness'
import { insertSnapshot } from '@/lib/calmer/snapshot'
import { cleanRmssd, contiguousBeats, RMSSD_WINDOW_BEATS } from '@/lib/calmer/hrv-quality'

export const runtime = 'nodejs'

// Simple shared-secret gate — the Arduino/bridge has no user login, so this
// is intentionally not a full auth flow. Fine for a dev/demo device; swap
// for per-device signed tokens (see HARDWARE_DEVICE.firmware_version /
// last_calibrated fields) before any real-world deployment.
function isAuthorized(req: Request) {
  const expected = process.env.HARDWARE_INGEST_SECRET
  const secret = req.headers.get('x-hardware-secret')
  if (!expected || !secret) return false
  // Constant-time compare of fixed-length digests, so response timing can't
  // leak how much of a guessed secret was right.
  const digest = (v: string) => createHash('sha256').update(v).digest()
  return timingSafeEqual(digest(secret), digest(expected))
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
  if (!body || typeof body.session_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.session_id)) {
    return new Response('session_id (a UUID) is required', { status: 400 })
  }
  // Each reading is a finite number or absent. Anything else used to reach the
  // database and come back as a 500.
  const asReading = (v: unknown): number | null | undefined =>
    v === undefined || v === null ? null : typeof v === 'number' && Number.isFinite(v) ? v : undefined
  const heartRate = asReading(body.heart_rate)
  const gripPressure = asReading(body.grip_pressure)
  const ibi = asReading(body.ibi)
  if (heartRate === undefined || gripPressure === undefined || ibi === undefined) {
    return new Response('heart_rate, grip_pressure and ibi must be numbers or null', { status: 400 })
  }
  // Every beat since the bridge's last post (new firmware/bridge). Older
  // bridges send only `ibi`, the latest beat, which still works.
  let ibis: number[] = []
  if (body.ibis !== undefined && body.ibis !== null) {
    if (!Array.isArray(body.ibis) || body.ibis.length > 30 || !body.ibis.every((v: unknown) => typeof v === 'number' && Number.isFinite(v))) {
      return new Response('ibis must be an array of up to 30 numbers', { status: 400 })
    }
    ibis = (body.ibis as number[]).map(Math.round)
  }


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
    .select('*') // includes `ibis` once migration 016 exists (absent before: no error)
    .eq('session_id', session.id)
    // Newest-first, reversed below. Ascending + limit returned the OLDEST 20,
    // so the "rolling" RMSSD window was really the first ten beats of the
    // session and the biometric trend never moved once 20 rows existed.
    .order('recorded_at', { ascending: false })
    .limit(20)

  const priorChrono = (prior ?? []).slice().reverse()

  // Successive beats only: the latest run of readings with no dropout between
  // them, joined beat by beat (lib/calmer/hrv-quality.ts contiguousBeats), then
  // artifact-rejected. On the bench data most raw beats were missed/doubled,
  // so raw RMSSD (median 341 ms) measured the sensor, not the heart. null when
  // too few clean beats survive.
  const beats = contiguousBeats(priorChrono, ibis, Date.now())
  const rmssd = cleanRmssd(beats.slice(-RMSSD_WINDOW_BEATS)).rmssd

  const { stressScore, stressClass } = classifyBiometrics(heartRate, gripPressure)

  // ── Provenance ────────────────────────────────────────────────────────────
  // Identify the sender so hardware rows are distinguishable from simulated
  // ones. A real board runs serial-bridge.js with --device-label; simulate.js
  // and the Fig. 3 generator send the label 'simulator' (scripts/provenance.mjs).
  // Without this the two are indistinguishable after the fact, and we make a
  // claim in print about which parts of the sensing layer ran on hardware.
  let deviceId: string | null = body.device_id ?? null
  if (!deviceId && body.device_label) {
    const { data: existing } = await supabase
      .from('hardware_device')
      .select('id')
      .eq('device_label', body.device_label)
      .is('user_id', null) // only devices this route registered (migration 013)
      .maybeSingle()
    if (existing) {
      deviceId = existing.id
    } else {
      const { data: created, error: devErr } = await supabase
        .from('hardware_device')
        .insert({
          device_label: body.device_label,
          sensor_type: 'combined',
          firmware_version: body.firmware_version ?? null,
        })
        .select('id')
        .single()
      if (devErr) console.error('[biometric] device registration failed:', devErr.message)
      else deviceId = created.id
    }
  }

  const row = {
    session_id: session.id,
    device_id: deviceId,
    heart_rate: heartRate,
    grip_pressure: gripPressure,
    ibi: ibi ?? (ibis.length ? ibis[ibis.length - 1] : null),
    rmssd,
    stress_class: stressClass,
  }
  let { data: reading, error: readingErr } = await supabase
    .from('biometric_reading')
    .insert(ibis.length ? { ...row, ibis } : row)
    .select()
    .single()
  // Before migration 016 there is no `ibis` column: keep the reading anyway.
  if (readingErr && ibis.length && /ibis/.test(readingErr.message)) {
    console.warn('[biometric] no ibis column yet (run migration 016); saving without the beat list')
    ;({ data: reading, error: readingErr } = await supabase.from('biometric_reading').insert(row).select().single())
  }

  if (readingErr) {
    console.error('[biometric] insert failed', readingErr)
    return new Response('Failed to store reading', { status: 500 })
  }

  // biometric trend = recent prior readings (chronological) + the one just
  // stored. Must use priorChrono, not `prior` — the query returns newest-first
  // and trendSignal reads the tail of the array as "most recent".
  // Readings with no usable channel (null) carry no evidence and are skipped.
  const biometricStressScores = [
    ...priorChrono.map((r) => classifyBiometrics(r.heart_rate, r.grip_pressure).stressScore),
    stressScore,
  ].filter((s): s is number => s !== null)

  const sessionDurationSeconds = (Date.now() - new Date(session.start_time).getTime()) / 1000

  // Pull this session's NON-biometric history before scoring. It is needed
  // twice: once so the readiness score genuinely fuses across the whole
  // session rather than seeing biometrics alone, and again for the
  // false-positive guard below [Neupane et al. 2025].
  const [{ data: ventRows }, { data: sentimentRows }, { data: peakRows }] = await Promise.all([
    supabase
      .from('venting_interaction')
      .select('intensity_score')
      .eq('session_id', session.id)
      .order('recorded_at', { ascending: false })
      // rows of one flush share a timestamp: a fixed tiebreak keeps the 40-row
      // window the same on every read instead of cutting a batch arbitrarily
      .order('id', { ascending: false })
      // Same 40-sample window the game scores (hits + persisted idle ticks).
      .limit(40),
    supabase
      .from('emotional_state')
      .select('sentiment_score')
      .eq('session_id', session.id)
      .not('sentiment_score', 'is', null)
      .order('recorded_at', { ascending: false })
      .limit(10),
    // The session's peak venting intensity (the trend's reference point).
    supabase
      .from('venting_interaction')
      .select('intensity_score')
      .eq('session_id', session.id)
      .order('intensity_score', { ascending: false })
      .limit(1),
  ])
  const ventingSessionPeak = peakRows?.[0] ? Number(peakRows[0].intensity_score) : undefined

  // .reverse() restores chronological order for the trend calculations.
  const ventingIntensities = (ventRows ?? []).slice().reverse().map(
    (r: { intensity_score: number }) => Number(r.intensity_score),
  )
  const sentimentScores = (sentimentRows ?? []).map(
    (r: { sentiment_score: number }) => Number(r.sentiment_score),
  )

  // Fuse everything this session has, not just the sensor that triggered us.
  const { readinessScore, stressLevel, signalsUsed, contributions } = computeReadinessScore({
    biometricStressScores,
    ventingIntensities,
    ventingSessionPeak,
    sentimentScores,
    sessionDurationSeconds,
  })

  const { corroborated, reason } = corroborateBiometricTransition({
    biometricStressScores,
    ventingIntensities,
    ventingSessionPeak,
    sentimentScores,
  })

  if (!corroborated) {
    console.warn(`[biometric] transition NOT corroborated for session ${session.id}: ${reason}`)
  }

  const { error: emotionErr } = await insertSnapshot(
    supabase,
    {
      session_id: session.id,
      biometric_reading_id: reading.id,
      stress_level: stressLevel,
      readiness_score: readinessScore,
      signals_used: signalsUsed,
      corroborated,
      source: 'biometric',
    },
    contributions,
  )

  if (emotionErr) {
    console.error('[biometric] emotional_state update failed', emotionErr)
  }

  return Response.json({ stressClass, stressScore, readinessScore, stressLevel, rmssd, corroborated })
}
