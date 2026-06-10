-- ============================================================
-- Sprint 1 — Multi-tenant Core Schema
-- PadelClub
-- ============================================================
-- Execution order:
--   1. Tables (profiles, clubs, club_members, invitation_links)
--   2. Helper functions  — after club_members exists
--   3. Triggers          — after profiles exists
--   4. RLS enable
--   5. RLS policies      — after helper functions exist
--   6. Indexes
-- ============================================================


-- ─── 1. TABLES ───────────────────────────────────────────────────────────────

-- profiles
-- Extends auth.users 1:1. Row created automatically on signup via trigger.
-- "Players" are club_members with role = PLAYER, not a separate table.
CREATE TABLE public.profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text,
  avatar_url  text,
  phone       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- clubs
-- Tenant root. slug is the URL segment: padelclub.co/{slug}/...
CREATE TABLE public.clubs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text UNIQUE NOT NULL
                  CONSTRAINT clubs_slug_format
                    CHECK (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'),
  name            text NOT NULL,
  description     text,
  logo_url        text,
  primary_color   text NOT NULL DEFAULT '#B7E000',
  secondary_color text NOT NULL DEFAULT '#1698BE',
  bg_color        text NOT NULL DEFAULT '#001A24',
  whatsapp        text,
  facebook        text,
  instagram       text,
  youtube         text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- club_members
-- Junction: profile ↔ club with role. UNIQUE prevents duplicate memberships.
CREATE TABLE public.club_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     uuid NOT NULL REFERENCES public.clubs(id)    ON DELETE CASCADE,
  profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'PLAYER')),
  is_active   boolean NOT NULL DEFAULT true,
  joined_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, profile_id)
);

-- invitation_links
-- Token-based invites for onboarding players without manual setup.
CREATE TABLE public.invitation_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     uuid NOT NULL REFERENCES public.clubs(id)    ON DELETE CASCADE,
  token       text UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  role        text NOT NULL DEFAULT 'PLAYER' CHECK (role IN ('ADMIN', 'PLAYER')),
  created_by  uuid NOT NULL REFERENCES public.profiles(id),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  max_uses    integer DEFAULT NULL,  -- NULL = unlimited
  uses        integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);


-- ─── 2. HELPER FUNCTIONS ─────────────────────────────────────────────────────
-- Created AFTER club_members exists so the body compiles without error.
-- STABLE SECURITY DEFINER: Postgres caches result per transaction (no N+1 in RLS).
-- Custom objects must live in public, not in auth. auth.uid() calls are still valid.

CREATE OR REPLACE FUNCTION public.club_role(p_club_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT role
  FROM   public.club_members
  WHERE  club_id    = p_club_id
    AND  profile_id = auth.uid()
    AND  is_active  = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_club_member(p_club_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.club_members
    WHERE  club_id    = p_club_id
      AND  profile_id = auth.uid()
      AND  is_active  = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.club_role(uuid)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_club_member(uuid) TO authenticated;


-- ─── 3. TRIGGERS ─────────────────────────────────────────────────────────────

-- Auto-create profile when a new auth.users row is inserted (on signup)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-update updated_at on clubs and profiles
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_clubs_updated_at
  BEFORE UPDATE ON public.clubs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ─── 4. ENABLE RLS ───────────────────────────────────────────────────────────

ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clubs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_members     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitation_links ENABLE ROW LEVEL SECURITY;


-- ─── 5. RLS POLICIES ─────────────────────────────────────────────────────────

-- profiles
CREATE POLICY "profiles_select_all"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid());

-- clubs
CREATE POLICY "clubs_select_active"
  ON public.clubs FOR SELECT
  USING (is_active = true);

CREATE POLICY "clubs_update_owner"
  ON public.clubs FOR UPDATE
  USING (public.club_role(id) = 'OWNER');

-- club_members
CREATE POLICY "club_members_select"
  ON public.club_members FOR SELECT
  USING (public.is_club_member(club_id));

-- Bootstrap INSERT (first OWNER row) is handled by the create_club_with_owner()
-- SECURITY DEFINER function in migration 002, which bypasses this policy.
-- This policy covers subsequent inserts by existing OWNER/ADMIN.
CREATE POLICY "club_members_insert"
  ON public.club_members FOR INSERT
  WITH CHECK (public.club_role(club_id) IN ('OWNER', 'ADMIN'));

CREATE POLICY "club_members_update"
  ON public.club_members FOR UPDATE
  USING (public.club_role(club_id) IN ('OWNER', 'ADMIN'));

-- invitation_links
CREATE POLICY "invitation_links_select_admin"
  ON public.invitation_links FOR SELECT
  USING (public.club_role(club_id) IN ('OWNER', 'ADMIN'));

CREATE POLICY "invitation_links_insert_admin"
  ON public.invitation_links FOR INSERT
  WITH CHECK (public.club_role(club_id) IN ('OWNER', 'ADMIN'));

CREATE POLICY "invitation_links_update_admin"
  ON public.invitation_links FOR UPDATE
  USING (public.club_role(club_id) IN ('OWNER', 'ADMIN'));


-- ─── 6. INDEXES ──────────────────────────────────────────────────────────────

CREATE INDEX idx_clubs_slug             ON public.clubs         (slug);
CREATE INDEX idx_club_members_club      ON public.club_members  (club_id);
CREATE INDEX idx_club_members_profile   ON public.club_members  (profile_id);
CREATE INDEX idx_club_members_role      ON public.club_members  (club_id, role);
CREATE INDEX idx_invitation_links_token ON public.invitation_links (token);
CREATE INDEX idx_invitation_links_club  ON public.invitation_links (club_id);
