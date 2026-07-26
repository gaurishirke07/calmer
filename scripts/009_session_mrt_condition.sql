-- CALMER migration 009 — record the handoff decision rule per session (MRT hook).
--
-- The rage room randomises whether the venting→reflection handoff is offered by
-- the readiness score crossing CALM_THRESHOLD ('readiness') or at a fixed elapsed
-- time ('timer' control arm). Logging the per-session assignment lets the
-- transition rule be evaluated as a micro-randomized trial. [Klasnja et al. 2015]
-- Additive and idempotent.

alter table public.session add column if not exists mrt_condition text;
