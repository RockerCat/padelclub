-- Migration 008: Club operating hours
-- Allows each club to configure its operating schedule per day of the week.
-- Used for accurate occupancy calculation and reservation validation.
-- day_of_week: 0=domingo, 1=lunes, 2=martes, 3=miércoles, 4=jueves, 5=viernes, 6=sábado

CREATE TABLE public.club_operating_hours (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id       uuid        NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  day_of_week   integer     NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  is_open       boolean     NOT NULL DEFAULT true,
  opens_at      time,       -- null when is_open = false
  closes_at     time,       -- null when is_open = false
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT club_operating_hours_club_day_unique
    UNIQUE (club_id, day_of_week),

  CONSTRAINT club_operating_hours_hours_check
    CHECK (
      (is_open = false)
      OR (opens_at IS NOT NULL AND closes_at IS NOT NULL AND opens_at < closes_at)
    )
);

CREATE TRIGGER set_club_operating_hours_updated_at
  BEFORE UPDATE ON public.club_operating_hours
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.club_operating_hours ENABLE ROW LEVEL SECURITY;

-- All active club members can read operating hours
CREATE POLICY "members_read_operating_hours"
  ON public.club_operating_hours FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.club_members
      WHERE club_members.club_id = club_operating_hours.club_id
        AND club_members.profile_id = auth.uid()
        AND club_members.is_active = true
    )
  );

-- Only OWNER can insert
CREATE POLICY "owner_insert_operating_hours"
  ON public.club_operating_hours FOR INSERT
  WITH CHECK (public.club_role(club_id) = 'OWNER');

-- Only OWNER can update
CREATE POLICY "owner_update_operating_hours"
  ON public.club_operating_hours FOR UPDATE
  USING  (public.club_role(club_id) = 'OWNER')
  WITH CHECK (public.club_role(club_id) = 'OWNER');

-- Only OWNER can delete
CREATE POLICY "owner_delete_operating_hours"
  ON public.club_operating_hours FOR DELETE
  USING (public.club_role(club_id) = 'OWNER');

-- Verification:
-- SELECT * FROM public.club_operating_hours LIMIT 5;
