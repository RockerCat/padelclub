-- Create public bucket for club logos
-- Path convention: club-logos/{club_id}/logo_{timestamp}.{ext}
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'club-logos',
  'club-logos',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Public read (bucket is public, but RLS still requires an explicit policy)
CREATE POLICY "club_logos_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'club-logos');

-- Club owners can upload their logo
-- The first path segment must be the club_id they own
CREATE POLICY "club_logos_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'club-logos'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.club_members cm
      WHERE cm.profile_id = auth.uid()
        AND cm.role    = 'OWNER'
        AND cm.is_active = true
        AND cm.club_id::text = (storage.foldername(name))[1]
    )
  );

-- Club owners can replace (upsert) their logo
CREATE POLICY "club_logos_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'club-logos'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.club_members cm
      WHERE cm.profile_id = auth.uid()
        AND cm.role    = 'OWNER'
        AND cm.is_active = true
        AND cm.club_id::text = (storage.foldername(name))[1]
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
        AND cm.role    = 'OWNER'
        AND cm.is_active = true
        AND cm.club_id::text = (storage.foldername(name))[1]
    )
  );
