-- Sprint 3: Reservations module
-- Creates: reservations, reservation_players with full RLS

-- ─── Tables ─────────────────────────────────────────────────────────────────

CREATE TABLE public.reservations (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id          uuid        NOT NULL REFERENCES public.clubs(id),
  court_id         uuid        NOT NULL REFERENCES public.courts(id),
  created_by       uuid        NOT NULL REFERENCES public.profiles(id),
  date             date        NOT NULL,
  start_time       time        NOT NULL,
  duration_minutes integer     NOT NULL DEFAULT 60,
  type             text        NOT NULL DEFAULT 'match',
  title            text,
  notes            text,
  status           text        NOT NULL DEFAULT 'confirmed',
  cancelled_at     timestamptz,
  cancelled_by     uuid        REFERENCES public.profiles(id),
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  CONSTRAINT reservations_valid_duration CHECK (duration_minutes IN (30, 60, 90, 120)),
  CONSTRAINT reservations_valid_type     CHECK (type IN ('match', 'class', 'block')),
  CONSTRAINT reservations_valid_status   CHECK (status IN ('confirmed', 'cancelled'))
);

CREATE TABLE public.reservation_players (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  reservation_id uuid        NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  profile_id     uuid        NOT NULL REFERENCES public.profiles(id),
  created_at     timestamptz DEFAULT now(),
  UNIQUE(reservation_id, profile_id)
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX reservations_club_date_idx     ON public.reservations(club_id, date);
CREATE INDEX reservations_court_date_idx    ON public.reservations(court_id, date);
CREATE INDEX reservations_status_idx        ON public.reservations(status);
CREATE INDEX res_players_reservation_idx    ON public.reservation_players(reservation_id);
CREATE INDEX res_players_profile_idx        ON public.reservation_players(profile_id);

-- ─── Updated-at trigger ───────────────────────────────────────────────────────

CREATE TRIGGER set_reservations_updated_at
  BEFORE UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.reservations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_players ENABLE ROW LEVEL SECURITY;

-- All active club members can read reservations for their club
CREATE POLICY "club members read reservations"
  ON public.reservations FOR SELECT
  USING (public.club_role(club_id) IS NOT NULL);

-- Only OWNER/ADMIN can create reservations
CREATE POLICY "admins insert reservations"
  ON public.reservations FOR INSERT
  WITH CHECK (public.club_role(club_id) IN ('OWNER', 'ADMIN'));

-- Only OWNER/ADMIN can update (includes soft-cancel)
CREATE POLICY "admins update reservations"
  ON public.reservations FOR UPDATE
  USING (public.club_role(club_id) IN ('OWNER', 'ADMIN'));

-- reservation_players: read if member of the parent reservation's club
CREATE POLICY "club members read reservation_players"
  ON public.reservation_players FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = reservation_id
        AND public.club_role(r.club_id) IS NOT NULL
    )
  );

-- reservation_players: insert if OWNER/ADMIN of the parent reservation's club
CREATE POLICY "admins insert reservation_players"
  ON public.reservation_players FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = reservation_id
        AND public.club_role(r.club_id) IN ('OWNER', 'ADMIN')
    )
  );

-- reservation_players: delete if OWNER/ADMIN of the parent reservation's club
CREATE POLICY "admins delete reservation_players"
  ON public.reservation_players FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = reservation_id
        AND public.club_role(r.club_id) IN ('OWNER', 'ADMIN')
    )
  );
