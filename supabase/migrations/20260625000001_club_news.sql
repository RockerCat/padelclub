-- ============================================================
-- Club News — official public communication channel for a club
-- (tournaments, events, announcements, promotions, live streams, etc.)
--
-- MVP fields only: image, title, content, publish date, author.
-- No comments/likes/categories/tags/reactions — intentionally out of scope.
-- ============================================================

CREATE TABLE public.club_news (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id      uuid        NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  title        text        NOT NULL,
  content      text        NOT NULL,
  image_url    text        NOT NULL,
  created_by   uuid        NOT NULL REFERENCES public.profiles(id),
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX club_news_club_id_published_at_idx
  ON public.club_news (club_id, published_at DESC);

CREATE TRIGGER set_club_news_updated_at
  BEFORE UPDATE ON public.club_news
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.club_news ENABLE ROW LEVEL SECURITY;

-- Public read — news is the club's public communication channel, same
-- active-club-only pattern as courts/operating hours.
CREATE POLICY "club_news_select_active_club"
  ON public.club_news
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clubs c
      WHERE c.id = club_news.club_id
        AND c.is_active = true
    )
  );

-- Only OWNER/ADMIN can publish, edit or delete news.
CREATE POLICY "club_news_insert_admin"
  ON public.club_news
  FOR INSERT
  WITH CHECK (public.club_role(club_id) IN ('OWNER', 'ADMIN'));

CREATE POLICY "club_news_update_admin"
  ON public.club_news
  FOR UPDATE
  USING (public.club_role(club_id) IN ('OWNER', 'ADMIN'));

CREATE POLICY "club_news_delete_admin"
  ON public.club_news
  FOR DELETE
  USING (public.club_role(club_id) IN ('OWNER', 'ADMIN'));

-- Table-level GRANTs, explicit for both roles — RLS alone is not enough.
-- (Postgres checks GRANTs before evaluating RLS policies; this exact gap bit
-- us with courts/club_operating_hours in 20260624000001/20260624000002.)
GRANT SELECT ON public.club_news TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.club_news TO authenticated;
