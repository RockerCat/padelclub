-- Fix: "Solicitar ingreso" on a private club fails with a generic "Error al
-- enviar la solicitud" for every real authenticated player.
--
-- Root cause: migration 20260620000002_club_join_requests.sql created the
-- table and its RLS policies but never granted the base table-level
-- privileges to the `authenticated` role. In Postgres, GRANT privilege
-- checks happen before RLS policies are evaluated — so even a correct
-- "insert your own profile_id" policy is rejected upstream (42501
-- permission denied for table club_join_requests) without this grant.
-- Same class of bug as 20260619000001_grant_operating_hours_authenticated.sql.
--
-- Confirmed via direct testing: the same insert succeeds with service_role
-- (bypasses RLS/grants) — proving the schema and constraints are fine — but
-- is rejected for a real authenticated session with exactly this error.
--
-- No UPDATE grant: the table has no update path (rows are only inserted by
-- the requester and deleted on approve/reject).

GRANT SELECT, INSERT, DELETE ON public.club_join_requests TO authenticated;
