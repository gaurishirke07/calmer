-- 017: keep every signal's value, and ask people how calm they feel.
--
-- 1. emotional_state.signal_values: the 0..1 value of each signal that went
--    into that snapshot's readiness score ({"ventingTrend":0.62,
--    "facialAffect":0.41, ...}), and face_model: which on-device model read the
--    face ('face-api' or 'vit'). Before this only the final score and the LIST
--    of signals were kept, so the face and voice readings were used live and
--    then lost: they could not be analysed or used to learn the weights.
--    Values are derived numbers only; no image or audio is ever stored.
--
-- 2. self_report: a 0..10 "how calm do you feel right now?" rating when the
--    venting phase ends (and optionally after chat). It is the trial's
--    recommended primary outcome (MRT-PROTOCOL §5) and the label for learning
--    the weights (§9).
--
-- Safe in either order with the code: the app retries without the new
-- columns and hides the rating until this exists.

alter table public.emotional_state
  add column if not exists signal_values jsonb,
  add column if not exists face_model text;

alter table public.emotional_state drop constraint if exists emotional_state_face_model_check;
alter table public.emotional_state
  add constraint emotional_state_face_model_check
  check (face_model is null or face_model in ('face-api', 'vit'));

create table if not exists public.self_report (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.session(id) on delete cascade,
  moment text not null check (moment in ('after_venting', 'after_chat')),
  calm smallint not null check (calm between 0 and 10),
  recorded_at timestamptz not null default now()
);

create index if not exists idx_self_report_session on public.self_report(session_id, recorded_at);

alter table public.self_report enable row level security;

drop policy if exists "self_report_select_own" on public.self_report;
create policy "self_report_select_own" on public.self_report for select using (
  exists (select 1 from public.session s where s.id = session_id and s.user_id = auth.uid())
);
drop policy if exists "self_report_insert_own" on public.self_report;
create policy "self_report_insert_own" on public.self_report for insert with check (
  exists (select 1 from public.session s where s.id = session_id and s.user_id = auth.uid())
);
