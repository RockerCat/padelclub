-- ============================================================
-- Sprint 1 — Multi-tenant Core Schema
-- PadelClub
-- Created: 2026-06-10
-- ============================================================
-- Tables: profiles, clubs, club_members, invitation_links
-- Functions: auth.club_role, auth.is_club_member, handle_new_user
-- Trigger: on_auth_user_created
-- ============================================================


-- ─── RLS Helper Functions ───────────────────────────────────────────────────
-- Must be created before tables so RLS policies can reference them.
-- STABLE = Postgres caches the result per transaction → avoids N+1 in RLS.

CREATE OR REPLACE FUNCTION auth.club_role(p_club_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM public.club_members
  WHERE club_id = p_club_id
    AND profile_id = auth.uid()
    AND is_active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION auth.is_club_member(p_club_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_members
    WHERE club_id = p_club_id
      AND profile_id = auth.uid()
      AND is_active = true
  );
$$;


-- ─── profiles ───────────────────────────────────────────────────────────────
-- Extends auth.users (1:1). Created automatically via trigger on signup.
-- "Players" are not a separate table — they are club_members with role = PLAYER.

CREATE TABLE public.profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text,
  avatar_url  text,
  phone       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read any profile (needed to display names across the app)
CREATE POLICY "profiles_select_all"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- Users can only update their own profile
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  USING (id = auth.uid());

-- Trigger: auto-create profile row when a new auth.users row is inserted
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ─── clubs ──────────────────────────────────────────────────────────────────
-- The tenant root. One row per club.
-- slug is the URL segment: padelclub.co/{slug}/...

CREATE TABLE public.clubs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text UNIQUE NOT NULL
                  CONSTRAINT clubs_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'),
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

CREATE INDEX idx_clubs_slug ON public.clubs (slug);

ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;

-- Anyone (including anonymous) can read active clubs — needed for slug resolution
CREATE POLICY "clubs_select_active"
  ON public.clubs
  FOR SELECT
  USING (is_active = true);

-- Only OWNER can update their club
CREATE POLICY "clubs_update_owner"
  ON public.clubs
  FOR UPDATE
  USING (auth.club_role(id) = 'OWNER');


-- ─── club_members ────────────────────────────────────────────────────────────
-- Junction table: profile ↔ club with role.
-- A "player" = a profile with role = 'PLAYER' in this table.

CREATE TABLE public.club_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'PLAYER')),
  is_active   boolean NOT NULL DEFAULT true,
  joined_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, profile_id)
);

CREATE INDEX idx_club_members_club    ON public.club_members (club_id);
CREATE INDEX idx_club_members_profile ON public.club_members (profile_id);
CREATE INDEX idx_club_members_role    ON public.club_members (club_id, role);

ALTER TABLE public.club_members ENABLE ROW LEVEL SECURITY;

-- Members can see other members of their own club
CREATE POLICY "club_members_select"
  ON public.club_members
  FOR SELECT
  USING (auth.is_club_member(club_id));

-- OWNER/ADMIN can add new members
CREATE POLICY "club_members_insert"
  ON public.club_members
  FOR INSERT
  WITH CHECK (auth.club_role(club_id) IN ('OWNER', 'ADMIN'));

-- OWNER/ADMIN can update membership (e.g., deactivate, change role)
CREATE POLICY "club_members_update"
  ON public.club_members
  FOR UPDATE
  USING (auth.club_role(club_id) IN ('OWNER', 'ADMIN'));


-- ─── invitation_links ────────────────────────────────────────────────────────
-- Token-based invites so admins can onboard players without manual setup.

CREATE TABLE public.invitation_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  token       text UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  role        text NOT NULL DEFAULT 'PLAYER' CHECK (role IN ('ADMIN', 'PLAYER')),
  created_by  uuid NOT NULL REFERENCES public.profiles(id),
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '7 days',
  max_uses    integer DEFAULT NULL,   -- NULL = unlimited
  uses        integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_invitation_links_token ON public.invitation_links (token);
CREATE INDEX idx_invitation_links_club  ON public.invitation_links (club_id);

ALTER TABLE public.invitation_links ENABLE ROW LEVEL SECURITY;

-- OWNER/ADMIN can see invitation links for their club
CREATE POLICY "invitation_links_select_admin"
  ON public.invitation_links
  FOR SELECT
  USING (auth.club_role(club_id) IN ('OWNER', 'ADMIN'));

-- OWNER/ADMIN can create invitation links
CREATE POLICY "invitation_links_insert_admin"
  ON public.invitation_links
  FOR INSERT
  WITH CHECK (auth.club_role(club_id) IN ('OWNER', 'ADMIN'));

-- OWNER/ADMIN can deactivate links (update is_active, uses)
CREATE POLICY "invitation_links_update_admin"
  ON public.invitation_links
  FOR UPDATE
  USING (auth.club_role(club_id) IN ('OWNER', 'ADMIN'));


-- ─── updated_at trigger ──────────────────────────────────────────────────────
-- Automatically maintain updated_at on clubs and profiles.

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
