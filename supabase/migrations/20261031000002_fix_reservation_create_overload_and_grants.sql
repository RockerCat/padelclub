-- ============================================================
-- Fix: create_reservation_admin/create_reservation_player overload
-- duplication + missing PUBLIC revoke
-- Mi Pádel Club
-- ============================================================
-- 20261031000001 added two trailing DEFAULT-valued parameters
-- (p_is_open[, p_player_count]) to these two RPCs via CREATE OR REPLACE
-- FUNCTION, expecting Postgres to treat it as replacing the function in
-- place (the documented behavior for "append a new parameter with a
-- default"). Verified against the live database right after applying: this
-- assumption was wrong for THIS case — a function's identity in Postgres is
-- the full ordered list of parameter TYPES, and appending new ones (even
-- defaulted) changes that identity, so CREATE OR REPLACE created a second,
-- separate overload instead of replacing the original 8-arg/5-arg one.
-- Confirmed via pg_proc: both the old and new signatures existed side by
-- side. Left as-is, this risks PostgREST resolving an ambiguous overload
-- (PGRST203) for any caller that only supplies the original parameter set,
-- and — worse — the newly-created overload was missing the
-- REVOKE ALL ... FROM PUBLIC every other RPC in this codebase has, so it
-- was callable by `anon` (unauthenticated still fails on the function's own
-- auth.uid() IS NULL check, but the grant itself should never have existed).
--
-- Fix: drop the two now-superseded original-signature overloads outright
-- (their replacement, same name, extra trailing DEFAULT params, already
-- exists and is what every current call site will use), then apply the
-- REVOKE ALL / GRANT authenticated convention explicitly to the surviving
-- signatures. No function body changes here — 20261031000001's bodies are
-- otherwise correct and untouched.
-- ============================================================

DROP FUNCTION IF EXISTS public.create_reservation_admin(uuid, uuid, date, time, integer, text, text, text);
DROP FUNCTION IF EXISTS public.create_reservation_player(uuid, uuid, date, time, integer);

REVOKE ALL ON FUNCTION public.create_reservation_admin(uuid, uuid, date, time, integer, text, text, text, boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_reservation_admin(uuid, uuid, date, time, integer, text, text, text, boolean, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.create_reservation_player(uuid, uuid, date, time, integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_reservation_player(uuid, uuid, date, time, integer, boolean) TO authenticated;
