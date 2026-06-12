-- ─────────────────────────────────────────────────────────────────────────────
-- Grant service_role full access to public schema
--
-- Supabase creates the service_role JWT key automatically, but the underlying
-- PostgreSQL role only gets table-level privileges when tables are created
-- through the Supabase dashboard. Tables created via custom migrations (like
-- all PadelClub migrations) do NOT receive these grants automatically.
--
-- Without these grants, any server-side code that creates a Supabase client
-- with the service_role key will receive:
--   permission denied for table <name>  (PostgreSQL error code 42501)
-- even though RLS is bypassed correctly by the JWT claim.
--
-- This migration was applied manually on 2026-06-12 and is versioned here
-- so the fix is reproducible on any new Supabase project or environment.
-- ─────────────────────────────────────────────────────────────────────────────

-- Schema usage
GRANT USAGE ON SCHEMA public TO service_role;

-- All existing tables, views, sequences, and functions
GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Future objects created in this schema (covers new migrations going forward)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES    TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;
