-- CALMER Unified Schema (v2)
-- Replaces the flat game_sessions/chat_sessions/chat_messages model with the
-- ER-diagram-aligned schema from the IPD report: SESSION as the connective
-- hub, EMOTIONAL_STATE as the pivot entity feeding both modules, and a
-- hardware layer (HARDWARE_DEVICE, BIOMETRIC_READING) for the patent-facing
-- biometric-to-emotional-state relationship.
--
-- Run this AFTER 001 and 002. Idempotent: every table uses `if not exists`
-- and every policy is dropped-then-created, so this script can be re-run
-- safely without the "policy already exists" (42710) error.

-- =========================================================
-- SESSION (hub entity — one row per user visit to the platform)
-- =========================================================
create table if not exists public.session (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  start_time timestamptz not null default now(),
  end_time timestamptz,
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  created_at timestamptz default now()
);

alter table public.session enable row level security;

drop policy if exists "session_select_own" on public.session;
create policy "session_select_own" on public.session for select using (auth.uid() = user_id);
drop policy if exists "session_insert_own" on public.session;
create policy "session_insert_own" on public.session for insert with check (auth.uid() = user_id);
drop policy if exists "session_update_own" on public.session;
create policy "session_update_own" on public.session for update using (auth.uid() = user_id);
drop policy if exists "session_delete_own" on public.session;
create policy "session_delete_own" on public.session for delete using (auth.uid() = user_id);

create index if not exists idx_session_user_id on public.session(user_id);

-- =========================================================
-- HARDWARE_DEVICE (physical sensing equipment used during sessions)
-- =========================================================
create table if not exists public.hardware_device (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  device_label text,
  sensor_type text not null check (sensor_type in ('pulse', 'fsr', 'combined')),
  firmware_version text,
  last_calibrated timestamptz,
  created_at timestamptz default now()
);

alter table public.hardware_device enable row level security;

drop policy if exists "hardware_device_select_own" on public.hardware_device;
create policy "hardware_device_select_own" on public.hardware_device for select using (auth.uid() = user_id);
drop policy if exists "hardware_device_insert_own" on public.hardware_device;
create policy "hardware_device_insert_own" on public.hardware_device for insert with check (auth.uid() = user_id);
drop policy if exists "hardware_device_update_own" on public.hardware_device;
create policy "hardware_device_update_own" on public.hardware_device for update using (auth.uid() = user_id);
drop policy if exists "hardware_device_delete_own" on public.hardware_device;
create policy "hardware_device_delete_own" on public.hardware_device for delete using (auth.uid() = user_id);

-- =========================================================
-- BIOMETRIC_READING (raw sensor stream, N:1 into SESSION)
-- =========================================================
create table if not exists public.biometric_reading (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.session(id) on delete cascade,
  device_id uuid references public.hardware_device(id) on delete set null,
  heart_rate integer,
  grip_pressure numeric,
  stress_class text check (stress_class in ('low', 'moderate', 'high')),
  recorded_at timestamptz not null default now()
);

alter table public.biometric_reading enable row level security;

drop policy if exists "biometric_reading_select_own" on public.biometric_reading;
create policy "biometric_reading_select_own" on public.biometric_reading for select using (
  exists (select 1 from public.session s where s.id = session_id and s.user_id = auth.uid())
);
drop policy if exists "biometric_reading_insert_own" on public.biometric_reading;
create policy "biometric_reading_insert_own" on public.biometric_reading for insert with check (
  exists (select 1 from public.session s where s.id = session_id and s.user_id = auth.uid())
);

create index if not exists idx_biometric_reading_session_id on public.biometric_reading(session_id);

-- =========================================================
-- EMOTIONAL_STATE (the central pivot entity — 1:N per session)
-- Every write here is a snapshot; the most recent row per session is the
-- "current" state. biometric_reading_id is nullable so software-only
-- sessions (no hardware connected) still work, per report's alternate flow.
-- =========================================================
create table if not exists public.emotional_state (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.session(id) on delete cascade,
  biometric_reading_id uuid references public.biometric_reading(id) on delete set null,
  sentiment_score numeric,
  stress_level text check (stress_level in ('low', 'moderate', 'high')),
  readiness_score numeric check (readiness_score >= 0 and readiness_score <= 1),
  source text not null default 'fused' check (source in ('text', 'biometric', 'interaction', 'fused')),
  recorded_at timestamptz not null default now()
);

alter table public.emotional_state enable row level security;

drop policy if exists "emotional_state_select_own" on public.emotional_state;
create policy "emotional_state_select_own" on public.emotional_state for select using (
  exists (select 1 from public.session s where s.id = session_id and s.user_id = auth.uid())
);
drop policy if exists "emotional_state_insert_own" on public.emotional_state;
create policy "emotional_state_insert_own" on public.emotional_state for insert with check (
  exists (select 1 from public.session s where s.id = session_id and s.user_id = auth.uid())
);

create index if not exists idx_emotional_state_session_id on public.emotional_state(session_id, recorded_at desc);

-- =========================================================
-- VENTING_INTERACTION (Module 1 — one row per user action in rage room)
-- =========================================================
create table if not exists public.venting_interaction (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.session(id) on delete cascade,
  input_type text not null check (input_type in ('tap', 'drag', 'text', 'weapon_select')),
  intensity_score numeric not null default 0,
  target_label text,
  recorded_at timestamptz not null default now()
);

alter table public.venting_interaction enable row level security;

drop policy if exists "venting_interaction_select_own" on public.venting_interaction;
create policy "venting_interaction_select_own" on public.venting_interaction for select using (
  exists (select 1 from public.session s where s.id = session_id and s.user_id = auth.uid())
);
drop policy if exists "venting_interaction_insert_own" on public.venting_interaction;
create policy "venting_interaction_insert_own" on public.venting_interaction for insert with check (
  exists (select 1 from public.session s where s.id = session_id and s.user_id = auth.uid())
);

create index if not exists idx_venting_interaction_session_id on public.venting_interaction(session_id);

-- =========================================================
-- THERAPIST_CONVO (Module 2 — one row per message, either side)
-- =========================================================
create table if not exists public.therapist_convo (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.session(id) on delete cascade,
  sender text not null check (sender in ('user', 'assistant')),
  msg_text text not null,
  emotion_label text,
  created_at timestamptz not null default now()
);

alter table public.therapist_convo enable row level security;

drop policy if exists "therapist_convo_select_own" on public.therapist_convo;
create policy "therapist_convo_select_own" on public.therapist_convo for select using (
  exists (select 1 from public.session s where s.id = session_id and s.user_id = auth.uid())
);
drop policy if exists "therapist_convo_insert_own" on public.therapist_convo;
create policy "therapist_convo_insert_own" on public.therapist_convo for insert with check (
  exists (select 1 from public.session s where s.id = session_id and s.user_id = auth.uid())
);

create index if not exists idx_therapist_convo_session_id on public.therapist_convo(session_id, created_at);

-- =========================================================
-- SAFETY_FLAG (conditional, 1:0..N per session)
-- =========================================================
create table if not exists public.safety_flag (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.session(id) on delete cascade,
  trigger_type text not null,
  severity text not null check (severity in ('low', 'medium', 'high')),
  source_text text,
  created_at timestamptz not null default now()
);

alter table public.safety_flag enable row level security;

drop policy if exists "safety_flag_select_own" on public.safety_flag;
create policy "safety_flag_select_own" on public.safety_flag for select using (
  exists (select 1 from public.session s where s.id = session_id and s.user_id = auth.uid())
);
drop policy if exists "safety_flag_insert_own" on public.safety_flag;
create policy "safety_flag_insert_own" on public.safety_flag for insert with check (
  exists (select 1 from public.session s where s.id = session_id and s.user_id = auth.uid())
);

-- =========================================================
-- Convenience view: latest emotional state per session
-- (used by the readiness-score / transition-detection logic)
-- =========================================================
create or replace view public.session_current_state as
select distinct on (session_id)
  session_id, readiness_score, stress_level, sentiment_score, source, recorded_at
from public.emotional_state
order by session_id, recorded_at desc;
