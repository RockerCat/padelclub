-- ============================================================
-- Restrict profiles SELECT exposure (pre-launch privacy fix)
-- Mi Pádel Club
-- ============================================================
-- profiles_select_all (20260610000001) is `USING (true)` for
-- `authenticated` — any signed-in user can read every other user's
-- full_name, phone, avatar_url, account_type, and is_platform_admin, with
-- zero club-membership scoping. Found in a pre-launch privacy audit.
-- Contradicts the product's own rule that a player's phone is only ever
-- exposed to OWNER/ADMIN of a club they share (see CLAUDE.md → Player
-- Contact Principles).
--
-- Fix, in two independent layers — neither alone is sufficient:
--
--  1. ROW policy: a profile row is visible only to itself, or to someone
--     who shares an active club membership with it. This alone still
--     covers every legitimate existing read of full_name/avatar_url
--     (rosters, reservation participants, tournament pairs, dashboard
--     activity) — none of that narrows.
--
--  2. COLUMN grants: RLS is row-level only — a single policy cannot make a
--     column visible to one caller and hidden from another caller for the
--     SAME row. phone/account_type/is_platform_admin/last_club_id must
--     never be visible to a clubmate just because they share a club (a
--     regular PLAYER must not be able to read another PLAYER's phone by
--     asking for it in a roster/reservation/tournament query), so those
--     columns are removed from the general `authenticated` grant
--     entirely — even for a user's own row, since column privileges are
--     not row-conditional. Two narrowly-scoped SECURITY DEFINER functions
--     restore the two legitimate paths that actually need them:
--       - get_my_profile(): self-only, derives id from auth.uid()
--         internally — no per-target authorization surface to get wrong.
--       - get_club_member_phone(club_id, club_member_id): the exact same
--         authorization discipline already used by get_club_member_email
--         (20260828000001) — an explicit, direct query for an ACTIVE
--         OWNER/ADMIN membership of the caller in that specific club,
--         never a role helper that can silently return NULL.
--
-- App call sites that read these columns directly are updated in the same
-- change to call these functions instead of a raw table select.
-- ============================================================


-- ─── 1. Row policy ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;

-- STABLE SECURITY DEFINER, same reasoning as club_role()/is_club_member()
-- above (20260610000001): a policy on `profiles` embedding a subquery
-- against `club_members` directly would otherwise be evaluated subject to
-- the CALLER's own visibility of club_members; wrapping it in a
-- SECURITY DEFINER function bypasses that, exactly like those two
-- pre-existing helpers already do for policies on other tables.
CREATE OR REPLACE FUNCTION public.shares_active_club_with(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.club_members cm_self
    JOIN   public.club_members cm_target
           ON cm_target.club_id = cm_self.club_id
    WHERE  cm_self.profile_id   = auth.uid()
      AND  cm_self.is_active    = true
      AND  cm_target.profile_id = p_profile_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.shares_active_club_with(uuid) TO authenticated;

-- Deliberately does NOT require cm_target.is_active — an inactive member
-- (e.g. the "Inactivos" filter on Jugadores) must still resolve a name,
-- and deactivation never erases history. Only the CALLER's own membership
-- must be active, so a deactivated caller can't use a stale membership to
-- read anyone.
CREATE POLICY "profiles_select_self_or_clubmate"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR public.shares_active_club_with(id)
  );


-- ─── 2. Column grants ────────────────────────────────────────────────────
-- Same REVOKE-then-narrow-GRANT technique already used for UPDATE in
-- 20260809000001: a column-specific REVOKE alone would NOT narrow the
-- pre-existing table-level SELECT grant (Supabase's own project-default
-- grant to `authenticated`), since Postgres privilege checks pass if ANY
-- applicable grant allows the operation. The table-level grant must be
-- revoked outright, then re-granted only for the columns any authenticated
-- user may legitimately read on any visible row.

REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, full_name, avatar_url) ON public.profiles TO authenticated;


-- ─── 3. get_my_profile() — self-only full profile read ──────────────────
-- Restores direct self-read of the columns just removed from the general
-- grant (phone, account_type, is_platform_admin, last_club_id) for the
-- existing self-service screens/flows that need them (Mi Perfil, post-
-- login routing, the platform-admin self-check). Self-only by
-- construction — id always comes from auth.uid(), never a parameter.

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS TABLE (
  id                uuid,
  full_name         text,
  avatar_url        text,
  phone             text,
  account_type      text,
  is_platform_admin boolean,
  last_club_id      uuid,
  created_at        timestamptz,
  updated_at        timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT p.id, p.full_name, p.avatar_url, p.phone, p.account_type,
         p.is_platform_admin, p.last_club_id, p.created_at, p.updated_at
  FROM   public.profiles p
  WHERE  p.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;


-- ─── 4. get_club_member_phone() — same pattern as get_club_member_email ─
-- Replaces the raw `profiles(phone)` embed the Jugadores/Equipo
-- OWNER/ADMIN screens used to rely on (now impossible: phone has no
-- general grant at all). Mirrors get_club_member_email exactly.

CREATE OR REPLACE FUNCTION public.get_club_member_phone(
  p_club_id        uuid,
  p_club_member_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_phone text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.profile_id = auth.uid()
      AND cm.club_id = p_club_id
      AND cm.role IN ('OWNER', 'ADMIN')
      AND cm.is_active = true
  ) THEN
    RAISE EXCEPTION 'Not authorized to read this club''s member contact info' USING ERRCODE = '42501';
  END IF;

  SELECT p.phone INTO v_phone
  FROM public.club_members cm
  JOIN public.profiles p ON p.id = cm.profile_id
  WHERE cm.id = p_club_member_id
    AND cm.club_id = p_club_id;

  RETURN v_phone;
END;
$$;

REVOKE ALL ON FUNCTION public.get_club_member_phone(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_club_member_phone(uuid, uuid) TO authenticated;
