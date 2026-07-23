-- ============================================================
-- Notifications
-- Mi Pádel Club
-- ============================================================
-- Minimal, generic notification inbox — first consumer is the join-request
-- flow (admin gets notified of new requests, player gets notified of the
-- resolution), but the shape is intentionally generic (type/title/message/
-- metadata) so future flows can reuse it without a new table.
--
-- No INSERT policy for authenticated/anon: rows are only ever created by
-- SECURITY DEFINER functions (create_join_request, approve_join_request,
-- reject_join_request — see 20260727000002), which bypass RLS. A regular
-- user can only ever read/update their OWN notifications.
-- ============================================================

CREATE TABLE public.notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  club_id     uuid REFERENCES public.clubs(id) ON DELETE CASCADE,
  type        text NOT NULL,
  title       text NOT NULL,
  message     text NOT NULL,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_own"
  ON public.notifications FOR SELECT
  USING (profile_id = auth.uid());

-- "Mark as read" is the only user-driven write — scoped so a user can only
-- ever flip their own rows, and only their own (WITH CHECK mirrors USING).
CREATE POLICY "notifications_update_own"
  ON public.notifications FOR UPDATE
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

CREATE INDEX notifications_profile_unread_idx
  ON public.notifications (profile_id, read_at, created_at DESC);
