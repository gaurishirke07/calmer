-- CALMER migration 010 — record whether a biometric-driven snapshot was
-- corroborated by a second, non-biometric signal.
--
-- Rationale: in the closest wearable+LLM study only about one in five detected
-- physiological events actually warranted an intervention [Neupane et al. 2025,
-- CHI EA]. A single threshold crossing must therefore not drive a transition on
-- its own. corroborateBiometricTransition() in lib/calmer/readiness.ts requires
-- a sustained trend across consecutive readings PLUS agreement from venting
-- trend or text sentiment, and the outcome is stored here.
--
--   true  = biometric trend sustained AND a non-biometric signal agreed
--   false = rejected (the rejection rate is itself a reportable result)
--   null  = not applicable (this snapshot was not biometric-driven)
--
-- Additive and idempotent. Run AFTER 004_add_signals_used.sql.

alter table public.emotional_state
  add column if not exists corroborated boolean;

comment on column public.emotional_state.corroborated is
  'Biometric-driven snapshots only: did a sustained trend plus a non-biometric signal agree? NULL for text/interaction-sourced snapshots.';
