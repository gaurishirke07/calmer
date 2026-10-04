-- 013: study integrity. Run once in the Supabase SQL editor, BEFORE deploying
-- the code that calls start_game_session() (the game falls back to the old
-- insert until this exists, so order matters only for the guarantees below).
--
-- From the 2026-10-04 audit. Each block closes a way a signed-in participant
-- could, from their own browser, change the data the MRT is analysed on:
--   1. the trial arm was drawn by Math.random() in the browser and written by
--      the client, and session_update_own let users rewrite it afterwards;
--   2. whether the handoff offer was shown, withdrawn or taken was never
--      recorded, though the protocol lists offer acceptance as an outcome;
--   3. users could insert biometric rows and devices without the hardware
--      secret, or claim the bridge's default device label;
--   4. users could insert emotional_state rows posing as the biometric route.

-- ── 1. Server-side randomisation ────────────────────────────────────────────
-- The arm is drawn in the database, so neither the client nor a forged request
-- can choose or change it. Constant p = 0.5, as the analysis assumes.
-- randomised_by = 'db' marks these sessions: for them the handoff_event log is
-- authoritative (no offer_shown row = no offer), and only they are eligible
-- trial decision points. Clients cannot write it (column grants below).
alter table public.session add column if not exists randomised_by text;
alter table public.session drop constraint if exists session_randomised_by_check;
alter table public.session
  add constraint session_randomised_by_check check (randomised_by is null or randomised_by = 'db');

create or replace function public.start_game_session()
returns table (session_id uuid, arm text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  return query
    insert into public.session (user_id, status, mrt_condition, randomised_by)
    values (auth.uid(), 'active', case when random() < 0.5 then 'readiness' else 'timer' end, 'db')
    returning id, mrt_condition;
end;
$$;

revoke execute on function public.start_game_session() from public, anon;
grant execute on function public.start_game_session() to authenticated;

-- Signed-in users may still create chat sessions and edit what the UI edits
-- (title, summary, mood), but no longer set or change mrt_condition,
-- randomised_by, start_time, status, end_time or user_id directly.
--
-- What this does NOT stop: a participant with browser dev tools can still
-- insert venting, chat, readiness and handoff rows for their OWN sessions, or
-- delete a session (kept deletable: users can remove their data). Fully
-- tamper-proof outcomes would need every write to go through the server.
revoke insert, update on public.session from anon, authenticated;
grant insert (user_id, status, title) on public.session to authenticated;
grant update (title, summary, mood, updated_at) on public.session to authenticated;

alter table public.session drop constraint if exists session_mrt_condition_check;
alter table public.session
  add constraint session_mrt_condition_check
  check (mrt_condition is null or mrt_condition in ('readiness', 'timer'));

-- ── 2. Handoff offer events ─────────────────────────────────────────────────
create table if not exists public.handoff_event (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.session(id) on delete cascade,
  event text not null check (event in ('offer_shown', 'offer_withdrawn', 'offer_accepted', 'end_screen_chat')),
  readiness_score numeric check (readiness_score is null or (readiness_score >= 0 and readiness_score <= 1)),
  elapsed_seconds numeric,
  recorded_at timestamptz not null default now()
);

alter table public.handoff_event enable row level security;

drop policy if exists "handoff_event_select_own" on public.handoff_event;
create policy "handoff_event_select_own" on public.handoff_event for select using (
  exists (select 1 from public.session s where s.id = session_id and s.user_id = auth.uid())
);
drop policy if exists "handoff_event_insert_own" on public.handoff_event;
create policy "handoff_event_insert_own" on public.handoff_event for insert with check (
  exists (select 1 from public.session s where s.id = session_id and s.user_id = auth.uid())
);

create index if not exists idx_handoff_event_session on public.handoff_event(session_id, recorded_at);

-- ── 3. Sensor data only through /api/biometric (service role) ───────────────
-- No client code inserts these; the bridge posts to the API with the secret.
drop policy if exists "biometric_reading_insert_own" on public.biometric_reading;
drop policy if exists "hardware_device_insert_own" on public.hardware_device;
drop policy if exists "hardware_device_update_own" on public.hardware_device;

-- The API looks devices up by label among service-created rows (user_id null).
create unique index if not exists uq_hardware_device_label_unowned
  on public.hardware_device(device_label) where user_id is null;

-- ── 4. Only the biometric route writes biometric snapshots ──────────────────
drop policy if exists "emotional_state_insert_own" on public.emotional_state;
create policy "emotional_state_insert_own" on public.emotional_state for insert with check (
  exists (select 1 from public.session s where s.id = session_id and s.user_id = auth.uid())
  and source <> 'biometric'
  and corroborated is null
);

-- ── Check (expected results in comments) ────────────────────────────────────
-- select has_column_privilege('authenticated', 'public.session', 'mrt_condition', 'UPDATE');  -- false
-- select has_column_privilege('authenticated', 'public.session', 'title', 'UPDATE');          -- true
-- select count(*) from public.handoff_event;                                                   -- 0
