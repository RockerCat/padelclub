-- Bucket for club cover images and logo uploads from the dashboard hero.
-- Path convention: clubs/{club_id}/{logo|cover}-{timestamp}.{ext}
--
-- storage.foldername('clubs/abc-uuid/cover-123.jpg') → ARRAY['clubs','abc-uuid']
-- [1] = 'clubs'   (literal prefix)
-- [2] = club_id   (UUID we compare against club_members)
--
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'club-assets',
  'club-assets',
  true,
  5242880,  -- 5 MB (covers need more room than logos)
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Public read (assets are shown on public club pages)
CREATE POLICY "club_assets_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'club-assets');

-- Only OWNER can upload
CREATE POLICY "club_assets_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'club-assets'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.club_members cm
      WHERE cm.profile_id = auth.uid()
        AND cm.role      = 'OWNER'
        AND cm.is_active = true
        AND cm.club_id::text = (storage.foldername(name))[2]
    )
  );

-- Only OWNER can replace (update)
CREATE POLICY "club_assets_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'club-assets'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.club_members cm
      WHERE cm.profile_id = auth.uid()
        AND cm.role      = 'OWNER'
        AND cm.is_active = true
        AND cm.club_id::text = (storage.foldername(name))[2]
    )
  );

-- Only OWNER can delete
CREATE POLICY "club_assets_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'club-assets'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.club_members cm
      WHERE cm.profile_id = auth.uid()
        AND cm.role      = 'OWNER'
        AND cm.is_active = true
        AND cm.club_id::text = (storage.foldername(name))[2]
    )
  );
