-- ============================================================
-- Realtime — reservations
-- Mi Pádel Club
-- ============================================================
-- The PLAYER's own Disponibilidad/Reservas page already subscribes to the
-- notifications Realtime channel (notify_reservation_rejected fires there
-- on rejection), but OWNER/ADMIN approving a pending request
-- (approvePendingReservation, admin/reservations/actions.ts) never inserts
-- any player-facing notification — so there was no event left for that
-- page to react to, and the player's activity panel/calendar context stayed
-- on "Pendiente" until a manual refresh.
--
-- `reservations` was never added to the supabase_realtime publication, so
-- no postgres_changes event reached connected clients regardless of what
-- the frontend subscribed to — this is the missing piece, same root cause
-- already fixed for club_join_requests/notifications in migration
-- 20260728000001.
--
-- RLS remains the actual security boundary: Supabase Realtime enforces the
-- subscriber's existing RLS policies for postgres_changes ("club members
-- read reservations" — public.club_role(club_id) IS NOT NULL), so this
-- migration does not open up anything that wasn't already readable via a
-- normal SELECT — it only lets an already-authorized read reach the client
-- live instead of on next fetch. No policy is added, changed or removed
-- here.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'reservations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reservations;
  END IF;
END $$;
