-- 012: SECURITY FIX — drop the session_current_state view.
--
-- 003 created this convenience view over emotional_state. A plain Postgres
-- view runs with its creator's privileges, so it bypassed emotional_state's
-- row-level security: found 2026-10-04, the PUBLIC anon key — no login — could
-- read every user's latest readiness score, stress level, sentiment score and
-- timestamps through the REST API (all 33 sessions at the time). Every real
-- table correctly returned zero rows to the same request.
--
-- Nothing in the application uses the view, so it is dropped rather than
-- patched. If a "latest state per session" view is ever needed again, create it
-- WITH (security_invoker = true) so the caller's RLS applies.

drop view if exists public.session_current_state;
