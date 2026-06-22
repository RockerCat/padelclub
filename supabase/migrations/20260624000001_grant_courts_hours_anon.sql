-- Fix: anonymous visitors to /clubs/[slug] see fewer sections than an
-- authenticated OWNER previewing the same club ("Transmisiones en vivo",
-- "Instalaciones" summary and "Horarios" are missing for them).
--
-- Root cause: migration 20260615000005_clubs_all_active_read.sql added RLS
-- policies ("courts_select_active_club", "operating_hours_select_active_club")
-- that allow anon to read courts/hours for any active club, but never granted
-- the base table-level SELECT privilege to the `anon` role. In Postgres, GRANT
-- privilege checks happen before RLS policies are evaluated, so anon requests
-- were rejected upstream with "permission denied for table" — same class of
-- bug as 20260619000001_grant_operating_hours_authenticated.sql, but for the
-- anon role instead of authenticated.
--
-- Confirmed via direct REST calls: anon key got 42501 on both tables before
-- this grant, while the anon-accessible count_active_players() RPC (which is
-- SECURITY DEFINER and doesn't need a table grant) worked fine — explaining
-- why the player count appeared but courts/hours didn't.

GRANT SELECT ON public.courts TO anon;
GRANT SELECT ON public.club_operating_hours TO anon;
