-- ============================================================
-- Página Pública — extend access from OWNER-only to OWNER + ADMIN
-- Mi Pádel Club
-- ============================================================
-- The app-layer checks that gate this module (page.tsx redirect,
-- settings/actions.ts, onboarding/actions.ts) are being relaxed from
-- role !== 'OWNER' to NOT IN ('OWNER','ADMIN') in the same change.
-- Those app checks alone are not enough: the clubs table and the
-- club-assets storage bucket both have their own RLS restricting
-- writes to OWNER, so without this migration every save would still
-- fail for ADMIN with a permission error. Club isolation is untouched
-- — club_role()/club_members lookups stay scoped to the specific
-- club_id being written, exactly as before, only the allowed ROLE set
-- changes for this one policy family.
-- ============================================================

-- clubs: OWNER + ADMIN can update their own club (branding, logo,
-- cover, name, description, location, social links, gallery).
DROP POLICY IF EXISTS "clubs_update_owner" ON public.clubs;

CREATE POLICY "clubs_update_owner_admin"
  ON public.clubs FOR UPDATE
  USING (public.club_role(id) IN ('OWNER', 'ADMIN'));

-- club-assets storage bucket (logo/cover uploads via ClubHero, gallery
-- images via GalleryModal) — same OWNER-only → OWNER+ADMIN relaxation.
DROP POLICY IF EXISTS "club_assets_insert" ON storage.objects;
CREATE POLICY "club_assets_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'club-assets'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.club_members cm
      WHERE cm.profile_id = auth.uid()
        AND cm.role      IN ('OWNER', 'ADMIN')
        AND cm.is_active = true
        AND cm.club_id::text = (storage.foldername(name))[2]
    )
  );

DROP POLICY IF EXISTS "club_assets_update" ON storage.objects;
CREATE POLICY "club_assets_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'club-assets'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.club_members cm
      WHERE cm.profile_id = auth.uid()
        AND cm.role      IN ('OWNER', 'ADMIN')
        AND cm.is_active = true
        AND cm.club_id::text = (storage.foldername(name))[2]
    )
  );

DROP POLICY IF EXISTS "club_assets_delete" ON storage.objects;
CREATE POLICY "club_assets_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'club-assets'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.club_members cm
      WHERE cm.profile_id = auth.uid()
        AND cm.role      IN ('OWNER', 'ADMIN')
        AND cm.is_active = true
        AND cm.club_id::text = (storage.foldername(name))[2]
    )
  );

-- club-logos bucket intentionally left untouched — LogoUpload.tsx (the
-- only consumer) is not wired into any route today.
