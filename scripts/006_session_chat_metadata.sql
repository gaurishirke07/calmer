-- CALMER migration 006 — give `session` the chat metadata it needs so it can
-- fully replace the legacy chat_sessions table (Option 1, Phase A).
--
-- The chat sidebar/history/summary features stored title/summary/mood on
-- chat_sessions. Moving them onto `session` lets one unified session carry a
-- venting phase AND a chat phase (title + AI summary + latest mood). Additive
-- and idempotent — safe to run before any code changes.

alter table public.session
  add column if not exists title text,
  add column if not exists summary text,
  add column if not exists mood text,
  add column if not exists updated_at timestamptz not null default now();
