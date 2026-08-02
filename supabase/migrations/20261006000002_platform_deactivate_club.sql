-- ============================================================
-- SUPERADMIN "Desactivar club"
-- Mi Pádel Club
-- ============================================================
-- clubs.is_active already exists (boolean, NOT NULL DEFAULT true, since
-- the original schema) and was deliberately left untouched by archive_club
-- (20260815000001) — that migration's own comment reserves it for exactly
-- this: a platform-level (SUPERADMIN) suspend toggle, orthogonal to
-- archived_at (the OWNER-only self-archival flag). This migration is the
-- first to ever write clubs.is_active = false.
--
-- deactivated_at/deactivated_by mirror the existing cancelled_at/
-- cancelled_by pattern already used on tournaments — no new model.

ALTER TABLE public.clubs
  ADD COLUMN deactivated_at timestamptz,
  ADD COLUMN deactivated_by uuid REFERENCES public.profiles(id);

-- ─── platform_deactivate_club ───────────────────────────────────────────────
-- SUPERADMIN-only. Never deletes or touches anything except clubs.is_active/
-- deactivated_at/deactivated_by on the target row. Never touches
-- archived_at — that remains exclusively the OWNER's own archive_club.
-- Same auth pattern as platform_generate_club_claim_link/
-- platform_revoke_club_claim_link (20261003000001): re-derives
-- SUPERADMIN authorization directly from profiles.is_platform_admin,
-- never trusts the caller.
CREATE OR REPLACE FUNCTION public.platform_deactivate_club(p_club_id uuid)
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

  IF v_is_active = false THEN
    RAISE EXCEPTION 'Club already inactive' USING ERRCODE = '22023';
  END IF;

  UPDATE public.clubs
  SET is_active = false, deactivated_at = now(), deactivated_by = auth.uid()
  WHERE id = p_club_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Club already inactive' USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_deactivate_club(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_deactivate_club(uuid) TO authenticated;

-- ─── _require_club_not_archived — widen to also cover is_active = false ────
-- Same function name/signature, kept on purpose: 19 existing RPCs
-- (create_reservation_player/admin, update_reservation,
-- approve_pending_reservation, create_join_request, approve_join_request,
-- and 13 tournament RPCs) already PERFORM this by name — CREATE OR REPLACE
-- preserves the function's OID, so every existing caller picks up the
-- wider check with zero changes to their own migrations. Renaming would
-- touch ~19 call sites for no behavioral benefit.
--
-- Both branches raise ERRCODE P0005 (existing app-level error mapping in
-- 5 TS files already treats P0005 as "club not operational" and shows
-- "Este club se encuentra archivado." — accepted as a minor wording
-- imprecision for the is_active branch, since this guard is a rare-path
-- safety net: the real UX control point is the [club]/layout.tsx access
-- gate, which shows the accurate "desactivado por la plataforma" copy
-- before any operational RPC is ever reachable).
CREATE OR REPLACE FUNCTION public._require_club_not_archived(p_club_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_is_active   boolean;
  v_archived_at timestamptz;
BEGIN
  SELECT is_active, archived_at INTO v_is_active, v_archived_at
  FROM public.clubs
  WHERE id = p_club_id;

  IF v_archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Este club se encuentra archivado.' USING ERRCODE = 'P0005';
  END IF;

  IF v_is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Este club se encuentra desactivado.' USING ERRCODE = 'P0005';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._require_club_not_archived(uuid) FROM PUBLIC;

-- ─── create_club_news — add the guard it was missing ───────────────────────
-- create_club_news never called _require_club_not_archived at all — the
-- only RPC among the "new commitment" set with this gap. Adding it here is
-- required for "no publicar noticias" while deactivated, and incidentally
-- also closes the same pre-existing gap for an archived club (never
-- guarded before either) — accepted as the natural, minimal consequence
-- of the one guard call this task requires, not a separate refactor.
-- Byte-identical to 20261001000002 otherwise.
CREATE OR REPLACE FUNCTION public.create_club_news(
  p_club_id       uuid,
  p_title         text,
  p_content       text,
  p_image_url     text,
  p_tournament_id uuid
)
RETURNS TABLE (
  id            uuid,
  club_id       uuid,
  title         text,
  slug          text,
  content       text,
  image_url     text,
  created_by    uuid,
  tournament_id uuid,
  published_at  timestamptz,
  created_at    timestamptz,
  updated_at    timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_caller_member  public.club_members%ROWTYPE;
  v_title          text;
  v_content        text;
  v_image_url      text;
  v_tournament     public.tournaments%ROWTYPE;
  v_base_slug      text;
  v_candidate_slug text;
  v_date_part      text;
  v_suffix         int := 0;
  v_constraint     text;
  v_news           public.club_news%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_caller_member
  FROM public.club_members AS cm
  WHERE cm.club_id = p_club_id AND cm.profile_id = auth.uid() AND cm.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to publish news for this club' USING ERRCODE = '42501';
  END IF;
  IF v_caller_member.role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Not authorized to publish news for this club' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(p_club_id);

  v_title := btrim(COALESCE(p_title, ''));
  IF length(v_title) < 3 THEN
    RAISE EXCEPTION 'Title must be at least 3 characters' USING ERRCODE = '22023';
  END IF;

  v_content := btrim(COALESCE(p_content, ''));
  IF v_content = '' THEN
    RAISE EXCEPTION 'Content is required' USING ERRCODE = '22023';
  END IF;

  v_image_url := btrim(COALESCE(p_image_url, ''));
  IF v_image_url = '' THEN
    RAISE EXCEPTION 'Image is required' USING ERRCODE = '22023';
  END IF;

  -- tournament_id — nunca se confía en el valor recibido tal cual: debe
  -- existir, pertenecer a este mismo club, estar completed, y no tener
  -- ya una noticia asociada (mismo trío de reglas que la policy RLS de
  -- INSERT, ahora también explícito aquí con mensajes propios).
  IF p_tournament_id IS NOT NULL THEN
    SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = p_tournament_id AND t.club_id = p_club_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Tournament not found for this club' USING ERRCODE = 'P0002';
    END IF;
    IF v_tournament.status <> 'completed' THEN
      RAISE EXCEPTION 'Tournament must be completed to generate its news' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.club_news WHERE tournament_id = p_tournament_id) THEN
      RAISE EXCEPTION 'This tournament already has a published news item' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Slug: intento real de INSERT por iteración (mismo patrón que
  -- create_tournament) — el índice único (club_id, slug) es la única
  -- fuente de verdad, incluso bajo carrera.
  v_base_slug := COALESCE(public._slugify_tournament_name(v_title), 'noticia');
  v_candidate_slug := v_base_slug;

  LOOP
    BEGIN
      INSERT INTO public.club_news AS cn (club_id, title, slug, content, image_url, created_by, tournament_id)
      VALUES (p_club_id, v_title, v_candidate_slug, v_content, v_image_url, auth.uid(), p_tournament_id)
      RETURNING * INTO v_news;

      EXIT;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;

      IF v_constraint = 'club_news_one_per_tournament' THEN
        RAISE EXCEPTION 'This tournament already has a published news item' USING ERRCODE = '22023';
      END IF;
      IF v_constraint <> 'club_news_club_id_slug_key' THEN
        RAISE;
      END IF;

      IF v_suffix = 0 THEN
        v_date_part := to_char(now(), 'YYYYMMDD');
        v_candidate_slug := v_base_slug || '-' || v_date_part;
        v_suffix := 2;
      ELSE
        v_candidate_slug := v_base_slug || '-' || v_date_part || '-' || v_suffix;
        v_suffix := v_suffix + 1;
      END IF;

      IF v_suffix > 50 THEN
        RAISE EXCEPTION 'Could not generate a unique news slug after multiple attempts' USING ERRCODE = '23505';
      END IF;
    END;
  END LOOP;

  RETURN QUERY SELECT
    v_news.id, v_news.club_id, v_news.title, v_news.slug, v_news.content, v_news.image_url,
    v_news.created_by, v_news.tournament_id, v_news.published_at, v_news.created_at, v_news.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.create_club_news(uuid, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_club_news(uuid, text, text, text, uuid) TO authenticated;
