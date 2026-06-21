-- ============================================================
-- Club Join Requests
-- PadelClub
-- ============================================================
-- Purpose:
--   Second access path for private clubs (the first being
--   invitation_links). A player visiting a private club's public
--   profile can request to join; an OWNER/ADMIN approves or
--   rejects. There is no "rejected" status to keep around —
--   approving inserts the club_members row and deletes the
--   request, rejecting just deletes the request. Every row in
--   this table is implicitly "pending".
--
--   club_members_insert's existing RLS policy already lets an
--   OWNER/ADMIN insert members for their own club, so "approve"
--   needs no SECURITY DEFINER RPC — it's a plain insert + delete
--   from a server action, both covered by RLS below.
-- ============================================================

CREATE TABLE public.club_join_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     uuid NOT NULL REFERENCES public.clubs(id)    ON DELETE CASCADE,
  profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, profile_id)
);

ALTER TABLE public.club_join_requests ENABLE ROW LEVEL SECURITY;

-- A player can see their own request (to know they already applied)
-- and create one for themselves. Admins/owners see every request for
-- their club and resolve it (approve = insert membership then delete
-- the request; reject = delete the request) — both covered by the
-- same DELETE policy.

CREATE POLICY "club_join_requests_select"
  ON public.club_join_requests FOR SELECT
  USING (profile_id = auth.uid() OR public.club_role(club_id) IN ('OWNER', 'ADMIN'));

CREATE POLICY "club_join_requests_insert_own"
  ON public.club_join_requests FOR INSERT
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "club_join_requests_delete_admin"
  ON public.club_join_requests FOR DELETE
  USING (public.club_role(club_id) IN ('OWNER', 'ADMIN'));

CREATE INDEX club_join_requests_club_id_idx ON public.club_join_requests(club_id);
