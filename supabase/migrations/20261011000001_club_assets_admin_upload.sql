-- ============================================================
-- club-assets storage bucket — re-assert OWNER+ADMIN upload access
-- Mi Pádel Club
-- ============================================================
-- Audit finding: TournamentImageUpload.tsx (tournaments/actions.ts's
-- cover image field) uploads straight to the `club-assets` bucket, path
-- `clubs/{club_id}/tournaments/cover-{timestamp}.{ext}` — the exact same
-- bucket and `clubs/{club_id}/...` path convention already used by
-- ClubHero's logo/cover uploads and the public-page gallery. There is no
-- separate tournament bucket and no tournament-specific storage policy —
-- every uploader for this bucket shares the same three RLS policies
-- (club_assets_insert/_update/_delete on storage.objects), so a fix here
-- fixes every one of them at once, tournaments included.
--
-- Those three policies were already widened from OWNER-only to
-- OWNER+ADMIN once, in 20260726000001 ("Página Pública — extend access
-- from OWNER-only to OWNER + ADMIN"), and nothing since has reverted them
-- (verified: 20261004000001/20261005000001 only add/remove an ADDITIVE
-- SUPERADMIN-pending-claim sibling policy, never touching these three;
-- 20261008000001, the general SUPERADMIN "Entrar al club" migration,
-- never references storage at all). That means the exact ADMIN failure
-- described here ("new row violates row-level security policy" on
-- INSERT, before the tournament row is even created) is precisely the
-- symptom of the ORIGINAL 20260615000007 OWNER-only version of these
-- policies still being the one enforced — i.e. 20260726000001's fix
-- never actually reached this database. This migration is the minimal,
-- idempotent fix for that: DROP IF EXISTS + CREATE the exact same
-- OWNER+ADMIN policies again, so the correct state is guaranteed
-- regardless of what's currently live, without depending on a prior
-- migration having been applied.
--
-- Unchanged by design: SELECT stays public (club_assets_select, not
-- touched here — assets are shown on public pages); PLAYER is still
-- rejected (cm.role IN ('OWNER','ADMIN') only); a member of a different
-- club still cannot write into another club's folder (cm.club_id::text =
-- (storage.foldername(name))[2] still scopes every check to the caller's
-- own club_id, read from the path itself — untouched, multi-tenant
-- isolation preserved exactly as before). No other bucket, no app code,
-- no data model change.

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
