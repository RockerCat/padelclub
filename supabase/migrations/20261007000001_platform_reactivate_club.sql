-- ============================================================
-- SUPERADMIN "Reactivar club"
-- Mi Pádel Club
-- ============================================================
-- Counterpart to platform_deactivate_club (20261006000002): flips
-- clubs.is_active back to true. Every existing is_active-based check
-- across the app (public discovery, RLS, [club]/layout.tsx's access gate,
-- _require_club_not_archived) is dynamic — nothing to touch there, this
-- migration only adds the write path and its own audit pair.
--
-- reactivated_at/reactivated_by mirror deactivated_at/deactivated_by
-- (never cleared by this migration — they remain the historical record of
-- the last deactivation, exactly as archived_at-style fields already do
-- elsewhere in this schema).

ALTER TABLE public.clubs
  ADD COLUMN reactivated_at timestamptz,
  ADD COLUMN reactivated_by uuid REFERENCES public.profiles(id);

-- ─── platform_reactivate_club ───────────────────────────────────────────────
-- SUPERADMIN-only. Never touches club_members, reservations, tournaments,
-- club_news, courts, pricing rules, or claim links — only clubs.is_active/
-- reactivated_at/reactivated_by on the target row. Never touches
-- archived_at (still exclusively the OWNER's own archive_club) or
-- deactivated_at/deactivated_by (kept as history, not cleared). Same auth
-- pattern as platform_deactivate_club.
CREATE OR REPLACE FUNCTION public.platform_reactivate_club(p_club_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_is_active boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles me
    WHERE me.id = auth.uid() AND me.is_platform_admin = true
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT is_active INTO v_is_active
  FROM public.clubs
  WHERE id = p_club_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Club not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_is_active = true THEN
    RAISE EXCEPTION 'Club already active' USING ERRCODE = '22023';
  END IF;

  UPDATE public.clubs
  SET is_active = true, reactivated_at = now(), reactivated_by = auth.uid()
  WHERE id = p_club_id AND is_active = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Club already active' USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_reactivate_club(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_reactivate_club(uuid) TO authenticated;
