-- Fix: saving operating hours fails with "permission denied for table
-- club_operating_hours" (42501) for authenticated OWNERs.
--
-- Migration 20260611000008_operating_hours.sql created the table and its RLS
-- policies (owner_insert/update/delete_operating_hours), but never granted
-- the base table-level privileges to the `authenticated` role. In Postgres,
-- GRANT privilege checks happen before RLS policies are evaluated — so even
-- a correct "is OWNER" policy is rejected upstream without this grant.
--
-- Confirmed via direct testing: the same upsert succeeds with service_role
-- (bypasses RLS) and the membership/role data is correct, but fails for a
-- real authenticated OWNER session with exactly this Postgres error.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_operating_hours TO authenticated;
