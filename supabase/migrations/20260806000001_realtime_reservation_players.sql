-- ============================================================
-- Realtime — reservation_players
-- Mi Pádel Club
-- ============================================================
-- "Mis reservas" (PlayerAvailabilityCalendar.tsx) now shows every CONFIRMED
-- reservation a player participates in, however it was created — including
-- one an OWNER/ADMIN created directly and added the player to via
-- reservation_players (admin/reservations/actions.ts), with no prior
-- request from the player at all. That row's created_by is the admin, not
-- the player, so the existing reservations INSERT/UPDATE listeners
-- (filtered on created_by=eq.<user.id>, see 20260805000001) never fire for
-- it — the only live signal for "I was just added to a reservation" is an
-- INSERT on reservation_players itself.
--
-- `reservation_players` was never added to the supabase_realtime
-- publication, so no postgres_changes event reached connected clients
-- regardless of what the frontend subscribed to — same root cause already
-- fixed for club_join_requests/notifications (20260728000001) and
-- reservations (20260805000001).
--
-- RLS remains the actual security boundary: Supabase Realtime enforces the
-- subscriber's existing RLS policies for postgres_changes ("club members
-- read reservation_players" — readable by any active member of the
-- reservation's club), and the frontend additionally filters to
-- profile_id=eq.<user.id> so a player only ever reacts to their own rows.
-- No policy is added, changed or removed here.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'reservation_players'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reservation_players;
  END IF;
END $$;
