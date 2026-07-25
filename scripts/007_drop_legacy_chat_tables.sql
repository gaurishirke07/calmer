-- CALMER migration 007 — drop the legacy chat/mood tables (Option 1, Phase F).
--
-- Chat history now lives in the unified schema: `session` (title/summary/mood)
-- + `therapist_convo` (messages), and mood snapshots live in `emotional_state`.
-- All reads/writes have been repointed off these tables, so they're dead.
--
-- RUN THIS LAST — only after confirming the reconciled app works (chat history,
-- summaries, dashboard, analytics) with these tables still present. This is
-- destructive: it removes the old chat/mood data (test data, pre-launch).
--
-- KEPT: profiles (auth), user_memories (the companion-memory feature — not
-- duplicated by the unified schema).

drop table if exists public.chat_messages cascade;
drop table if exists public.chat_sessions cascade;
drop table if exists public.mood_logs cascade;
