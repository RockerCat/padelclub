-- ============================================================
-- Sprint 1.5 — Fix missing profiles for pre-migration users
-- ============================================================
-- Root cause: users who signed up BEFORE migration 001 was applied
-- never triggered on_auth_user_created, so profiles rows were never
-- created. club_members.profile_id FK fails because profiles is empty.
--
-- Fix A: Backfill profiles for all existing auth.users without one.
-- Fix B: Update create_club_with_owner() to upsert the profile first,
--        so future cases (e.g. trigger failure) are handled gracefully.
-- ============================================================


-- ─── A. Backfill missing profiles ────────────────────────────────────────────
-- Runs once at migration time. ON CONFLICT = no-op for users who already
-- have a profile (safe to run on any state of the database).

INSERT INTO public.profiles (id, full_name)
SELECT
  u.id,
  u.raw_user_meta_data->>'full_name'
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = u.id
);


-- ─── B. Initial create_club_with_owner (superseded by migration 004) ─────────
-- NOTE: This version had a 42702 ambiguity bug — ON CONFLICT (id) was ambiguous
-- with the OUT parameter 'id' from RETURNS TABLE (id uuid, slug text).
-- Migration 004 (fix_ambiguous_id.sql) replaces this function with the fix.
-- The backfill in section A above is the permanent contribution of this migration.
