-- ============================================================
-- Realtime — club_join_requests + notifications
-- Mi Pádel Club
-- ============================================================
-- Neither table was ever added to the supabase_realtime publication, so
-- no postgres_changes event reached connected clients regardless of what
-- the frontend subscribed to — this is the missing piece behind "the
-- admin only sees a new request after a manual refresh."
--
-- RLS remains the actual security boundary: Supabase Realtime enforces
-- the subscriber's existing RLS policies for postgres_changes, so this
-- migration does not open up anything that wasn't already readable via
-- club_join_requests_select / notifications_select_own — it only lets
-- already-authorized reads reach the client live instead of on next
-- fetch. No policy is added, changed or removed here.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'club_join_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.club_join_requests;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;
