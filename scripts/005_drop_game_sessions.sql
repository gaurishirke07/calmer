-- CALMER migration 005 — drop the dead legacy game_sessions table.
--
-- The rage room now writes the unified schema (session / venting_interaction /
-- emotional_state); nothing writes game_sessions anymore, and the dashboard's
-- rage-room history reads the unified `session` table instead. This is the
-- "light touch" reconciliation step — the chat-history tables (chat_sessions,
-- chat_messages, mood_logs) are handled in a later, larger migration.
--
-- CASCADE also drops the FK constraint on chat_sessions.game_session_id (that
-- column remains, just without the now-dangling reference).

drop table if exists public.game_sessions cascade;
