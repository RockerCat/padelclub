-- ============================================================
-- Sprint 2A — Courts
-- PadelClub
-- ============================================================

-- ─── 1. TABLE ────────────────────────────────────────────────────────────────

CREATE TABLE public.courts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     uuid        NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  description text,
  surface     text,
  is_indoor   boolean,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);


-- ─── 2. TRIGGER updated_at ───────────────────────────────────────────────────

CREATE TRIGGER set_courts_updated_at
  BEFORE UPDATE ON public.courts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ─── 3. ENABLE RLS ───────────────────────────────────────────────────────────

ALTER TABLE public.courts ENABLE ROW LEVEL SECURITY;


-- ─── 4. RLS POLICIES ─────────────────────────────────────────────────────────

-- Club members (any role) can read courts
CREATE POLICY "courts_select_member"
  ON public.courts FOR SELECT
  USING (public.is_club_member(club_id));

-- OWNER and ADMIN can create courts
CREATE POLICY "courts_insert_admin"
  ON public.courts FOR INSERT
  WITH CHECK (public.club_role(club_id) IN ('OWNER', 'ADMIN'));

-- OWNER and ADMIN can update courts (incl. deactivate via is_active = false)
CREATE POLICY "courts_update_admin"
  ON public.courts FOR UPDATE
  USING (public.club_role(club_id) IN ('OWNER', 'ADMIN'));

-- No DELETE policy — courts are deactivated, never hard-deleted


-- ─── 5. GRANTS ───────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE ON public.courts TO authenticated;


-- ─── 6. INDEXES ──────────────────────────────────────────────────────────────

CREATE INDEX idx_courts_club        ON public.courts (club_id);
CREATE INDEX idx_courts_club_active ON public.courts (club_id, is_active);
CREATE INDEX idx_courts_sort        ON public.courts (club_id, sort_order);
