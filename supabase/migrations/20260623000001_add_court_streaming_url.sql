-- ============================================================
-- Add an optional live-streaming link per court
--
-- Shown on the public club page (Instalaciones) as an external
-- "Ver transmisión" action — never embedded as video, just a link.
-- Nullable, no format CHECK — validated at the server action level
-- (must be a well-formed http(s) URL), same as other optional text
-- fields in this schema.
-- ============================================================

ALTER TABLE public.courts
  ADD COLUMN IF NOT EXISTS streaming_url text;
