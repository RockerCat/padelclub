-- Create public bucket for club logos
-- Path convention: clubs/{club_id}/logo-{timestamp}.{ext}
--
-- storage.foldername('clubs/abc/logo-123.png') → ARRAY['clubs','abc']
-- [1] = 'clubs'  (literal folder prefix)
-- [2] = club_id  (the UUID we compare against club_members)
--
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'club-logos',
  'club-logos',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Public read (bucket is public, but objects still need an explicit policy)
CREATE POLICY "club_logos_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'club-logos');

-- Club owners can upload (INSERT)
-- Path segment [2] contains the club_id they must own
CREATE POLICY "club_logos_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'club-logos'
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

-- Club owners can replace their logo (UPDATE)
CREATE POLICY "club_logos_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'club-logos'
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

-- Club owners can delete their logo
CREATE POLICY "club_logos_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'club-logos'
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
