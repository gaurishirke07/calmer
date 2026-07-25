-- CALMER migration 004 — record which signals fed each readiness computation.
--
-- signals_used is the concrete evidence for the graceful-degradation claim
-- (Novelty #1): it lets us show the SAME fusion mechanism ran software-only
-- (e.g. ['ventingTrend','sessionContext']) and again with hardware attached
-- (adds 'biometricTrend'), renormalizing over whatever was present. Without
-- persisting it, that comparison is unrecoverable after the fact.
--
-- Run AFTER 003_calmer_unified_schema.sql. Additive and idempotent.

alter table public.emotional_state
  add column if not exists signals_used text[];

-- true when the sentiment input for this snapshot came from the lexicon stub
-- rather than the real classifier — keeps stub-derived rows honestly labelled.
alter table public.emotional_state
  add column if not exists using_stub_signals boolean not null default false;
