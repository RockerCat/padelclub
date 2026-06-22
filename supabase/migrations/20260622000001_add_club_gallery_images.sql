-- ============================================================
-- Add a public photo gallery to clubs
--
-- Stores public URLs (same convention as logo_url/cover_image_url)
-- in upload order. The 10-image cap is enforced in the server
-- action (addGalleryImage), mirroring how allowed_reservation_durations
-- is validated in code rather than via a CHECK constraint.
-- ============================================================

ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS gallery_image_urls text[] NOT NULL DEFAULT '{}';
