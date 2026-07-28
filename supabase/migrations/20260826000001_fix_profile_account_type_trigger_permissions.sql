-- ============================================================
-- Fix: 42501 permission denied for table profiles on reactivation
-- Mi Pádel Club
-- ============================================================
-- public.set_account_type_from_club_members() (20260809000001, trigger
-- club_members_set_account_type, AFTER INSERT OR UPDATE ON club_members)
-- was created without SECURITY DEFINER, i.e. SECURITY INVOKER by default.
-- It runs "UPDATE public.profiles SET account_type = NEW.role WHERE id =
-- NEW.profile_id AND account_type IS NULL" — this requires UPDATE
-- privilege on profiles.account_type for whichever role is the CURRENT
-- ROLE at the moment the triggering statement runs.
--
-- Every INSERT path that fires this trigger goes through a SECURITY
-- DEFINER RPC (create_club_with_owner, join_public_club,
-- approve_join_request, claim_invitation) or, for is_active, the
-- SECURITY DEFINER deactivate_player — in all of these the current role
-- inside the DEFINER function's context is the function owner, which has
-- full privileges, so the trigger has always succeeded there.
--
-- toggleMemberActive's activation branch (admin/players/actions.ts) is
-- the one path that issues a *plain client* UPDATE on club_members
-- (is_active only, under the authenticated column-level GRANT UPDATE
-- (is_active, category) from 20260809000001) with no SECURITY DEFINER
-- wrapper. There, the current role stays `authenticated`, which only
-- has UPDATE on profiles (full_name, avatar_url, phone, last_club_id) —
-- deliberately NOT account_type (profiles_account_type_immutable,
-- 20260809000001, protects exactly this column). The trigger's UPDATE
-- statement requires UPDATE privilege on the account_type column purely
-- to be planned, regardless of whether the WHERE clause's "account_type
-- IS NULL" ends up matching any row — so it fails with 42501 before ever
-- checking that predicate. Reproduced verbatim reactivating club_member
-- aa3b8dc3-44f5-4994-a3ff-951346a4ed7f (club alex-club-padel):
--   code: 42501, message: "permission denied for table profiles".
--
-- Fix: mark the function SECURITY DEFINER, so it always runs with its
-- owner's privileges regardless of which role fired the update on
-- club_members — the same posture every other account_type/sport-state
-- trigger function in this codebase already uses. This does NOT grant
-- `authenticated` any general ability to write profiles.account_type:
-- the function still only ever writes NEW.profile_id (the row already
-- tied to the club_members row the caller was authorized, via RLS, to
-- touch — never a client-supplied profile id), still only ever writes
-- the account_type column, and the existing "account_type IS NULL"
-- predicate already makes the actual write idempotent (a profile's
-- account_type transitions exactly once, from NULL, and is then
-- immutable per profiles_account_type_immutable — so this condition
-- already prevents any redundant write; no further "IS DISTINCT FROM"
-- guard is needed on top of it).
--
-- Function name, arguments, RETURNS trigger, body and the trigger
-- definition itself (club_members_set_account_type, AFTER INSERT OR
-- UPDATE ON club_members) are all unchanged — only SECURITY DEFINER is
-- added. No DROP TRIGGER/FUNCTION needed: CREATE OR REPLACE FUNCTION
-- keeps the existing trigger binding intact.
--
-- Note: enforce_club_members_account_type_consistency (the BEFORE
-- trigger, also SECURITY INVOKER) was audited too — it only ever SELECTs
-- profiles/club_members (unrestricted table-level SELECT for
-- authenticated), never UPDATEs, so it never hit this privilege gap and
-- is intentionally left untouched here.
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_account_type_from_club_members()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  UPDATE public.profiles
  SET account_type = NEW.role
  WHERE id = NEW.profile_id AND account_type IS NULL;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_account_type_from_club_members() FROM PUBLIC;
