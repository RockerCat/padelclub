-- Add cover_image_url column to clubs for public page hero image
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS cover_image_url text;
