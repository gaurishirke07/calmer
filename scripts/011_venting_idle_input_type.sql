-- 011: allow the rage room to persist IDLE intervals.
--
-- The game scores readiness from a venting history that includes a zero sample
-- for every 3-second flush with no action — going quiet IS the decline the
-- venting trend measures. Those zeros used to live only in the browser tab, so
-- the chat and biometric routes, which rebuild the history from this table, saw
-- only the hits and read a user who had settled (readiness 1.0 in the game) as
-- still sitting at their peak (0.24 on arrival in chat). Persisting the idle
-- ticks gives every route the same history the game scored.
--
-- Idle rows have intensity_score 0 and input_type 'idle'; the dashboard excludes
-- them from its per-session action count.

alter table public.venting_interaction
  drop constraint if exists venting_interaction_input_type_check;

alter table public.venting_interaction
  add constraint venting_interaction_input_type_check
  check (input_type in ('tap', 'drag', 'text', 'weapon_select', 'idle'));
