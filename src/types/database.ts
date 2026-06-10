// ─────────────────────────────────────────────────────────────────────────────
// Database types for PadelClub
//
// IMPORTANT: After applying the Sprint 1 migration and logging in with the
// correct Supabase account, regenerate this file with:
//
//   npx supabase gen types typescript \
//     --project-id rfzyqmvqmqsjigcvxxnf \
//     > src/types/database.ts
//
// Until then, this file is maintained manually and covers Sprint 1 tables.
// ─────────────────────────────────────────────────────────────────────────────

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      clubs: {
        Row: {
          id: string;
          slug: string;
          name: string;
          description: string | null;
          logo_url: string | null;
          primary_color: string;
          secondary_color: string;
          bg_color: string;
          whatsapp: string | null;
          facebook: string | null;
          instagram: string | null;
          youtube: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          description?: string | null;
          logo_url?: string | null;
          primary_color?: string;
          secondary_color?: string;
          bg_color?: string;
          whatsapp?: string | null;
          facebook?: string | null;
          instagram?: string | null;
          youtube?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          description?: string | null;
          logo_url?: string | null;
          primary_color?: string;
          secondary_color?: string;
          bg_color?: string;
          whatsapp?: string | null;
          facebook?: string | null;
          instagram?: string | null;
          youtube?: string | null;
          is_active?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          avatar_url: string | null;
          phone: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          avatar_url?: string | null;
          phone?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          full_name?: string | null;
          avatar_url?: string | null;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      club_members: {
        Row: {
          id: string;
          club_id: string;
          profile_id: string;
          role: "OWNER" | "ADMIN" | "PLAYER";
          is_active: boolean;
          joined_at: string;
        };
        Insert: {
          id?: string;
          club_id: string;
          profile_id: string;
          role: "OWNER" | "ADMIN" | "PLAYER";
          is_active?: boolean;
          joined_at?: string;
        };
        Update: {
          role?: "OWNER" | "ADMIN" | "PLAYER";
          is_active?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "club_members_club_id_fkey";
            columns: ["club_id"];
            isOneToOne: false;
            referencedRelation: "clubs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "club_members_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      invitation_links: {
        Row: {
          id: string;
          club_id: string;
          token: string;
          role: "ADMIN" | "PLAYER";
          created_by: string;
          expires_at: string;
          max_uses: number | null;
          uses: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          club_id: string;
          token?: string;
          role?: "ADMIN" | "PLAYER";
          created_by: string;
          expires_at?: string;
          max_uses?: number | null;
          uses?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          role?: "ADMIN" | "PLAYER";
          expires_at?: string;
          max_uses?: number | null;
          uses?: number;
          is_active?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "invitation_links_club_id_fkey";
            columns: ["club_id"];
            isOneToOne: false;
            referencedRelation: "clubs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitation_links_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      // public.club_role — returns the caller's role in a given club, or null
      club_role: {
        Args: { p_club_id: string };
        Returns: string | null;
      };
      // public.is_club_member — returns true if the caller is an active member
      is_club_member: {
        Args: { p_club_id: string };
        Returns: boolean;
      };
      // public.create_club_with_owner — atomic club creation + owner bootstrap
      create_club_with_owner: {
        Args: { p_name: string; p_slug: string };
        Returns: Array<{ id: string; slug: string }>;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

// ─── Convenience type helpers ──────────────────────────────────────────────

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T];

// ─── Domain types (derived from database rows) ─────────────────────────────

export type Club = Tables<"clubs">;
export type Profile = Tables<"profiles">;
export type ClubMember = Tables<"club_members">;
export type InvitationLink = Tables<"invitation_links">;

export type ClubRole = ClubMember["role"];
export type InvitationRole = InvitationLink["role"];

// ClubMember with profile joined — used in players list and nav
export type ClubMemberWithProfile = ClubMember & {
  profiles: Profile;
};

// ClubMember with club joined — used in [club]/layout.tsx
export type ClubMemberWithClub = ClubMember & {
  clubs: Club;
};
