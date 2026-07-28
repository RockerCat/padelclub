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
          cover_image_url: string | null;
          primary_color: string;
          secondary_color: string;
          bg_color: string;
          visibility: string;
          city: string | null;
          state: string | null;
          country: string | null;
          address: string | null;
          whatsapp: string | null;
          facebook: string | null;
          instagram: string | null;
          youtube: string | null;
          latitude: number | null;
          longitude: number | null;
          is_active: boolean;
          archived_at: string | null;
          allowed_reservation_durations: number[];
          gallery_image_urls: string[];
          // Fase 1 módulo deportivo (20260819000001) — nullable until the
          // OWNER/ADMIN regularizes the club; never defaulted/assumed.
          default_player_category: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          description?: string | null;
          logo_url?: string | null;
          cover_image_url?: string | null;
          primary_color?: string;
          secondary_color?: string;
          bg_color?: string;
          visibility?: string;
          city?: string | null;
          state?: string | null;
          country?: string | null;
          address?: string | null;
          whatsapp?: string | null;
          facebook?: string | null;
          instagram?: string | null;
          youtube?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          is_active?: boolean;
          archived_at?: string | null;
          allowed_reservation_durations?: number[];
          gallery_image_urls?: string[];
          default_player_category?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          description?: string | null;
          logo_url?: string | null;
          cover_image_url?: string | null;
          primary_color?: string;
          secondary_color?: string;
          bg_color?: string;
          visibility?: string;
          city?: string | null;
          state?: string | null;
          country?: string | null;
          address?: string | null;
          whatsapp?: string | null;
          facebook?: string | null;
          instagram?: string | null;
          youtube?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          is_active?: boolean;
          archived_at?: string | null;
          allowed_reservation_durations?: number[];
          gallery_image_urls?: string[];
          default_player_category?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clubs_default_player_category_fkey";
            columns: ["default_player_category"];
            isOneToOne: false;
            referencedRelation: "sport_categories";
            referencedColumns: ["code"];
          },
        ];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          avatar_url: string | null;
          phone: string | null;
          last_club_id: string | null;
          is_platform_admin: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          avatar_url?: string | null;
          phone?: string | null;
          last_club_id?: string | null;
          is_platform_admin?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          full_name?: string | null;
          avatar_url?: string | null;
          phone?: string | null;
          last_club_id?: string | null;
          is_platform_admin?: boolean;
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
          category: "Principiante" | "5ta" | "4ta" | "3ra" | "2da" | "1ra";
        };
        Insert: {
          id?: string;
          club_id: string;
          profile_id: string;
          role: "OWNER" | "ADMIN" | "PLAYER";
          is_active?: boolean;
          joined_at?: string;
          category?: "Principiante" | "5ta" | "4ta" | "3ra" | "2da" | "1ra";
        };
        Update: {
          role?: "OWNER" | "ADMIN" | "PLAYER";
          is_active?: boolean;
          category?: "Principiante" | "5ta" | "4ta" | "3ra" | "2da" | "1ra";
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
      courts: {
        Row: {
          id: string;
          club_id: string;
          name: string;
          description: string | null;
          surface: string | null;
          is_indoor: boolean | null;
          is_active: boolean;
          sort_order: number;
          streaming_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          club_id: string;
          name: string;
          description?: string | null;
          surface?: string | null;
          is_indoor?: boolean | null;
          is_active?: boolean;
          sort_order?: number;
          streaming_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          description?: string | null;
          surface?: string | null;
          is_indoor?: boolean | null;
          is_active?: boolean;
          sort_order?: number;
          streaming_url?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "courts_club_id_fkey";
            columns: ["club_id"];
            isOneToOne: false;
            referencedRelation: "clubs";
            referencedColumns: ["id"];
          },
        ];
      };
      reservations: {
        Row: {
          id: string;
          club_id: string;
          court_id: string;
          created_by: string;
          date: string;
          start_time: string;
          duration_minutes: number;
          type: "match" | "class" | "block";
          title: string | null;
          notes: string | null;
          status: "confirmed" | "cancelled" | "pending" | "rejected";
          cancelled_at: string | null;
          cancelled_by: string | null;
          // Frozen price fields (20260802000002) — NULL for every
          // reservation until a future phase wires resolveReservationPrice
          // into the creation/edit/approval flows. Never backfilled, never
          // defaulted to 0.
          price_amount: number | null;
          price_currency: string | null;
          pricing_rule_id: string | null;
          price_calculated_at: string | null;
          // Rejection traceability (20260804000001) — only set once
          // status = 'rejected'. Null for every other status, including
          // historical rows rejected before this migration (old reject flow
          // reused status = 'cancelled' with no reason captured).
          rejection_reason_code: string | null;
          rejection_reason: string | null;
          rejected_at: string | null;
          rejected_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          club_id: string;
          court_id: string;
          created_by: string;
          date: string;
          start_time: string;
          duration_minutes?: number;
          type?: "match" | "class" | "block";
          title?: string | null;
          notes?: string | null;
          status?: "confirmed" | "cancelled" | "pending" | "rejected";
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          price_amount?: number | null;
          price_currency?: string | null;
          pricing_rule_id?: string | null;
          price_calculated_at?: string | null;
          rejection_reason_code?: string | null;
          rejection_reason?: string | null;
          rejected_at?: string | null;
          rejected_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          court_id?: string;
          date?: string;
          start_time?: string;
          duration_minutes?: number;
          type?: "match" | "class" | "block";
          title?: string | null;
          notes?: string | null;
          status?: "confirmed" | "cancelled" | "pending" | "rejected";
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          price_amount?: number | null;
          price_currency?: string | null;
          pricing_rule_id?: string | null;
          price_calculated_at?: string | null;
          rejection_reason_code?: string | null;
          rejection_reason?: string | null;
          rejected_at?: string | null;
          rejected_by?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reservations_pricing_rule_id_fkey";
            columns: ["pricing_rule_id"];
            isOneToOne: false;
            referencedRelation: "club_pricing_rules";
            referencedColumns: ["id"];
          },
        ];
      };
      club_pricing_rules: {
        Row: {
          id: string;
          club_id: string;
          court_id: string | null;
          name: string;
          days_of_week: number[];
          start_time: string;
          end_time: string;
          // Legacy as of 20260803000002 — DROP NOT NULL applied; new rules
          // never populate it (see club_pricing_rule_prices, the real
          // source of truth for price now). Historical rows keep their
          // value until a later phase removes the column entirely.
          price_per_hour: number | null;
          currency: string;
          display_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          club_id: string;
          court_id?: string | null;
          name: string;
          days_of_week: number[];
          start_time: string;
          end_time: string;
          price_per_hour?: number | null;
          currency?: string;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          court_id?: string | null;
          name?: string;
          days_of_week?: number[];
          start_time?: string;
          end_time?: string;
          price_per_hour?: number | null;
          currency?: string;
          display_order?: number;
          is_active?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "club_pricing_rules_club_id_fkey";
            columns: ["club_id"];
            isOneToOne: false;
            referencedRelation: "clubs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "club_pricing_rules_court_id_fkey";
            columns: ["court_id"];
            isOneToOne: false;
            referencedRelation: "courts";
            referencedColumns: ["id"];
          },
        ];
      };
      club_pricing_rule_prices: {
        Row: {
          id: string;
          pricing_rule_id: string;
          duration_minutes: number;
          price_amount: number;
          currency: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          pricing_rule_id: string;
          duration_minutes: number;
          price_amount: number;
          currency?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          duration_minutes?: number;
          price_amount?: number;
          currency?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "club_pricing_rule_prices_pricing_rule_id_fkey";
            columns: ["pricing_rule_id"];
            isOneToOne: false;
            referencedRelation: "club_pricing_rules";
            referencedColumns: ["id"];
          },
        ];
      };
      club_operating_hours: {
        Row: {
          id: string;
          club_id: string;
          day_of_week: number;
          is_open: boolean;
          opens_at: string | null;
          closes_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          club_id: string;
          day_of_week: number;
          is_open?: boolean;
          opens_at?: string | null;
          closes_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          is_open?: boolean;
          opens_at?: string | null;
          closes_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "club_operating_hours_club_id_fkey";
            columns: ["club_id"];
            isOneToOne: false;
            referencedRelation: "clubs";
            referencedColumns: ["id"];
          },
        ];
      };
      reservation_players: {
        Row: {
          id: string;
          reservation_id: string;
          profile_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          reservation_id: string;
          profile_id: string;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
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
      club_join_requests: {
        Row: {
          id: string;
          club_id: string;
          profile_id: string;
          status: "pending" | "approved" | "rejected";
          approved_at: string | null;
          approved_by: string | null;
          rejected_at: string | null;
          rejected_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          club_id: string;
          profile_id: string;
          status?: "pending" | "approved" | "rejected";
          approved_at?: string | null;
          approved_by?: string | null;
          rejected_at?: string | null;
          rejected_by?: string | null;
          created_at?: string;
        };
        Update: {
          status?: "pending" | "approved" | "rejected";
          approved_at?: string | null;
          approved_by?: string | null;
          rejected_at?: string | null;
          rejected_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "club_join_requests_club_id_fkey";
            columns: ["club_id"];
            isOneToOne: false;
            referencedRelation: "clubs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "club_join_requests_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      club_news: {
        Row: {
          id: string;
          club_id: string;
          title: string;
          content: string;
          image_url: string;
          created_by: string;
          published_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          club_id: string;
          title: string;
          content: string;
          image_url: string;
          created_by: string;
          published_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          content?: string;
          image_url?: string;
          published_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "club_news_club_id_fkey";
            columns: ["club_id"];
            isOneToOne: false;
            referencedRelation: "clubs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "club_news_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      // ─── Fase 1 módulo deportivo (20260818000001 / 20260820000001) ────────
      // Global, read-only, platform-wide category catalog — no club_id, never
      // club-configurable. Seeded once with exactly 7 rows.
      sport_categories: {
        Row: {
          code: string;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          code: string;
          sort_order: number;
          created_at?: string;
        };
        Update: {
          code?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      // One ranking cycle for a (club, category) combination. ended_at IS
      // NULL means active; at most one active row per club+category
      // (partial unique index, not expressible here).
      club_ranking_cycles: {
        Row: {
          id: string;
          club_id: string;
          category: string;
          started_at: string;
          ended_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          club_id: string;
          category: string;
          started_at?: string;
          ended_at?: string | null;
          created_at?: string;
        };
        Update: {
          ended_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "club_ranking_cycles_club_id_fkey";
            columns: ["club_id"];
            isOneToOne: false;
            referencedRelation: "clubs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "club_ranking_cycles_category_fkey";
            columns: ["category"];
            isOneToOne: false;
            referencedRelation: "sport_categories";
            referencedColumns: ["code"];
          },
        ];
      };
      // Strict 1:1 extension of club_members (club_member_id doubles as PK
      // and FK, same shape as profiles.id extending auth.users). category is
      // deliberately never stored here — always derived via cycle_id. No
      // direct client write path exists (RLS has zero policies for
      // anon/authenticated — see 20260820000001/20260821000001).
      club_member_sport_state: {
        Row: {
          club_member_id: string;
          club_id: string;
          cycle_id: string;
          current_points: number;
          points_reached_at: string;
          created_at: string;
        };
        Insert: {
          club_member_id: string;
          club_id: string;
          cycle_id: string;
          current_points?: number;
          points_reached_at?: string;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: "club_member_sport_state_member_club_fk";
            columns: ["club_member_id", "club_id"];
            isOneToOne: true;
            referencedRelation: "club_members";
            referencedColumns: ["id", "club_id"];
          },
          {
            foreignKeyName: "club_member_sport_state_cycle_club_fk";
            columns: ["cycle_id", "club_id"];
            isOneToOne: false;
            referencedRelation: "club_ranking_cycles";
            referencedColumns: ["id", "club_id"];
          },
        ];
      };
      // Immutable, private history of category changes. No row is ever
      // inserted by this Fase 1 provisioning block — reserved for the
      // future category-change transactional block.
      club_player_category_changes: {
        Row: {
          id: string;
          club_id: string;
          club_member_id: string;
          previous_cycle_id: string;
          new_cycle_id: string;
          previous_category: string;
          new_category: string;
          previous_points: number;
          previous_position: number | null;
          change_type: "promotion" | "demotion" | "correction";
          comment: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          club_id: string;
          club_member_id: string;
          previous_cycle_id: string;
          new_cycle_id: string;
          previous_category: string;
          new_category: string;
          previous_points: number;
          previous_position?: number | null;
          change_type: "promotion" | "demotion" | "correction";
          comment: string;
          created_by: string;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: "club_player_category_changes_member_club_fk";
            columns: ["club_member_id", "club_id"];
            isOneToOne: false;
            referencedRelation: "club_members";
            referencedColumns: ["id", "club_id"];
          },
        ];
      };
      // Immutable, append-only points ledger. No row is ever inserted by
      // this Fase 1 provisioning block — reserved for the future manual
      // point-adjustment / category-change-technical-movement block.
      club_player_point_movements: {
        Row: {
          id: string;
          club_id: string;
          club_member_id: string;
          cycle_id: string;
          category: string;
          previous_total: number;
          new_total: number;
          delta: number;
          adjustment_mode: "delta" | "set";
          origin: "manual" | "system";
          system_event_code: "category_change" | null;
          reason_code:
            | "internal_league"
            | "coach_clinic"
            | "no_show_penalty"
            | "club_representation_bonus"
            | "special_event"
            | "other"
            | null;
          comment: string;
          category_change_id: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          club_id: string;
          club_member_id: string;
          cycle_id: string;
          category: string;
          previous_total: number;
          new_total: number;
          delta: number;
          adjustment_mode: "delta" | "set";
          origin: "manual" | "system";
          system_event_code?: "category_change" | null;
          reason_code?:
            | "internal_league"
            | "coach_clinic"
            | "no_show_penalty"
            | "club_representation_bonus"
            | "special_event"
            | "other"
            | null;
          comment: string;
          category_change_id?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: "club_player_point_movements_member_club_fk";
            columns: ["club_member_id", "club_id"];
            isOneToOne: false;
            referencedRelation: "club_members";
            referencedColumns: ["id", "club_id"];
          },
          {
            foreignKeyName: "club_player_point_movements_category_change_id_fkey";
            columns: ["category_change_id"];
            isOneToOne: false;
            referencedRelation: "club_player_category_changes";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          id: string;
          profile_id: string;
          club_id: string | null;
          type: string;
          title: string;
          message: string;
          metadata: Json;
          read_at: string | null;
          // Shared across every notification pointing at the same
          // join_request_id/reservation_id — never the per-user read
          // state. See 20260803000001_shared_notification_resolution.sql.
          resolved_status: "approved" | "rejected" | null;
          resolved_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          club_id?: string | null;
          type: string;
          title: string;
          message: string;
          metadata?: Json;
          read_at?: string | null;
          resolved_status?: "approved" | "rejected" | null;
          resolved_at?: string | null;
          created_at?: string;
        };
        Update: {
          read_at?: string | null;
          resolved_status?: "approved" | "rejected" | null;
          resolved_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_club_id_fkey";
            columns: ["club_id"];
            isOneToOne: false;
            referencedRelation: "clubs";
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
        Args: { p_name: string; p_slug: string; p_visibility?: string };
        Returns: Array<{ id: string; slug: string }>;
      };
      // public.get_public_clubs — public clubs the caller is not a member of
      get_public_clubs: {
        Args: Record<string, never>;
        Returns: Array<{
          id: string;
          name: string;
          slug: string;
          description: string | null;
          logo_url: string | null;
          primary_color: string;
          secondary_color: string;
          member_count: number;
          court_count: number;
        }>;
      };
      // public.join_public_club — self-join a public club as PLAYER
      join_public_club: {
        Args: { p_club_id: string };
        Returns: void;
      };
      // public.get_invitation_preview — anon-accessible invite info
      get_invitation_preview: {
        Args: { p_token: string };
        Returns: Json;
      };
      // public.claim_invitation — join a club via invite token
      claim_invitation: {
        Args: { p_token: string };
        Returns: Json;
      };
      // public.count_active_players — anon-accessible aggregate player count
      count_active_players: {
        Args: { p_club_id: string };
        Returns: number;
      };
      // public.create_join_request — self-service join request + notifies
      // every OWNER/ADMIN of the club
      create_join_request: {
        Args: { p_club_id: string };
        Returns: void;
      };
      // public.approve_join_request — atomic approve: inserts club_members,
      // marks the request approved, notifies the requester
      approve_join_request: {
        Args: { p_request_id: string };
        Returns: void;
      };
      // public.reject_join_request — atomic reject: marks the request
      // rejected, notifies the requester, no membership created
      reject_join_request: {
        Args: { p_request_id: string };
        Returns: void;
      };
      // public.get_club_join_requests — admin list view (name + email) for
      // one club, gated on the caller's role in that specific club
      get_club_join_requests: {
        Args: { p_club_id: string };
        Returns: Array<{
          id: string;
          profile_id: string;
          full_name: string | null;
          email: string | null;
          status: "pending" | "approved" | "rejected";
          created_at: string;
        }>;
      };
      // public.get_platform_clubs_overview — platform-admin-gated global
      // clubs listing (all clubs, any owner, bypasses RLS internally)
      get_platform_clubs_overview: {
        Args: Record<string, never>;
        Returns: Array<{
          id: string;
          name: string;
          slug: string;
          logo_url: string | null;
          visibility: string;
          is_active: boolean;
          created_at: string;
          owner_name: string | null;
          owner_email: string | null;
          player_count: number;
          court_count: number;
        }>;
      };
      // public.get_platform_club_detail — single-club stats for the
      // platform-admin club detail screen
      get_platform_club_detail: {
        Args: { p_club_id: string };
        Returns: Array<{
          id: string;
          name: string;
          slug: string;
          logo_url: string | null;
          visibility: string;
          is_active: boolean;
          created_at: string;
          owner_name: string | null;
          owner_email: string | null;
          admin_count: number;
          player_count: number;
          reservation_count: number;
          news_count: number;
          court_count: number;
        }>;
      };
      // public.get_platform_users_overview — platform-admin-gated global
      // users listing with their club memberships/roles
      get_platform_users_overview: {
        Args: Record<string, never>;
        Returns: Array<{
          id: string;
          full_name: string | null;
          email: string | null;
          is_platform_admin: boolean;
          created_at: string;
          memberships: Array<{ club_name: string; club_slug: string; role: string }>;
        }>;
      };
      // public.get_platform_user_detail — single-user detail for
      // /platform/users/[userId], including auth-derived read-only fields
      get_platform_user_detail: {
        Args: { p_user_id: string };
        Returns: Array<{
          id: string;
          full_name: string | null;
          email: string | null;
          is_platform_admin: boolean;
          created_at: string;
          last_sign_in_at: string | null;
          is_banned: boolean;
          memberships: Array<{ club_name: string; club_slug: string; role: string }>;
        }>;
      };
      // public.update_platform_user_name — platform-admin-gated rename,
      // touches profiles.full_name only
      update_platform_user_name: {
        Args: { p_user_id: string; p_full_name: string };
        Returns: void;
      };
      // public.notify_reservation_request_created — notifies every
      // OWNER/ADMIN of the club about a new pending reservation request
      notify_reservation_request_created: {
        Args: { p_reservation_id: string };
        Returns: void;
      };
      // public.resolve_reservation_request_notifications — marks every
      // reservation_request_created notification for this reservation as
      // resolved (shared across all OWNER/ADMIN recipients), called right
      // after approvePendingReservation/rejectPendingReservation succeed
      resolve_reservation_request_notifications: {
        Args: { p_reservation_id: string; p_status: string };
        Returns: void;
      };
      // public.notify_reservation_rejected — inserts the player-facing
      // reservation_request_rejected notification and resolves every
      // OWNER/ADMIN's own reservation_request_created notification for
      // this reservation, called right after rejectPendingReservation's
      // conditional UPDATE succeeds
      notify_reservation_rejected: {
        Args: { p_reservation_id: string };
        Returns: void;
      };
      // public.notify_reservation_created_for_players — notifies every
      // player linked via reservation_players about a CONFIRMED reservation
      // OWNER/ADMIN created directly (no prior request from them), called
      // right after createReservation's players insert succeeds
      notify_reservation_created_for_players: {
        Args: { p_reservation_id: string };
        Returns: void;
      };
      // public.cancel_reservation — Phase 4: single centralized RPC for both
      // PLAYER self-cancellation (creator/participant, 2+ hours out) and
      // OWNER/ADMIN operational cancellation (no time restriction); every
      // authorization check is re-derived server-side from auth.uid(), only
      // the reservation id is ever passed in
      cancel_reservation: {
        Args: { p_reservation_id: string };
        Returns: void;
      };
      // public.notify_reservation_cancelled — best-effort, called right
      // after cancel_reservation succeeds; notifies affected players when
      // OWNER/ADMIN cancelled, or every OWNER/ADMIN of the club when a
      // PLAYER cancelled their own reservation
      notify_reservation_cancelled: {
        Args: { p_reservation_id: string };
        Returns: void;
      };
      // public.leave_club — Phase 5: PLAYER-only voluntary leave. Cancels
      // every related pending/confirmed reservation via cancel_reservation,
      // deactivates the membership, and notifies OWNER/ADMIN — all
      // server-derived from auth.uid(), only the club id is ever passed in
      leave_club: {
        Args: { p_club_id: string };
        Returns: void;
      };
      // public.deactivate_player — Phase 6: OWNER/ADMIN-only deactivation
      // of a PLAYER's membership in their own club. Cancels the target's
      // own future reservations, removes their participation in others'
      // future reservations, deactivates the membership, and notifies —
      // all server-derived from auth.uid(); only club_id and the target
      // profile id are ever passed in
      deactivate_player: {
        Args: { p_club_id: string; p_player_id: string };
        Returns: void;
      };
      // public.archive_club — Phase 8: OWNER-only. Sets clubs.archived_at,
      // notifies every active member (any role). No other row is touched —
      // membership, reservations, pricing, branding all stay exactly as
      // they were. Authorization fully server-derived from auth.uid()
      archive_club: {
        Args: { p_club_id: string };
        Returns: void;
      };
      // public.get_club_statistics — Phase 9: OWNER/ADMIN-only, read-only
      // aggregated statistics (period/summary/previousSummary/timeline/
      // statuses/courts/weekdays/hourlySlots as one jsonb object). Excludes
      // type='block' from every metric; no monetary field. Works for an
      // archived club's still-active OWNER/ADMIN (read-only history)
      get_club_statistics: {
        Args: { p_club_id: string; p_start_date: string; p_end_date: string };
        Returns: Json;
      };
      // public.get_my_profile_activity — Phase 10: self-only, no
      // parameters (never a profile/user id). Aggregates the caller's own
      // reservation activity across every club (including left/deactivated/
      // archived ones) as one jsonb object (summary/typeDistribution/
      // monthlyActivity/recentReservations/activeMemberships)
      get_my_profile_activity: {
        Args: Record<string, never>;
        Returns: Json;
      };
      // public.create_reservation_player — Phase 7 concurrency fix:
      // replaces requestReservation's own inline validate-then-insert.
      // Same rules as before (any active club member, conflict-checks
      // pending+confirmed, always type='match'/status='pending', prices
      // the request), now inside the same advisory-lock-protected
      // transaction update_reservation/create_reservation_admin use
      create_reservation_player: {
        Args: {
          p_club_id: string;
          p_court_id: string;
          p_date: string;
          p_start_time: string;
          p_duration_minutes: number;
        };
        Returns: string;
      };
      // public.create_reservation_admin — Phase 7 concurrency fix:
      // replaces createReservation's own inline validate-then-insert.
      // Same rules as before (OWNER/ADMIN only, conflict-checks confirmed
      // only, price never touched), now inside the same
      // advisory-lock-protected transaction
      create_reservation_admin: {
        Args: {
          p_club_id: string;
          p_court_id: string;
          p_date: string;
          p_start_time: string;
          p_duration_minutes: number;
          p_type: string;
          p_title: string | null;
          p_notes: string | null;
        };
        Returns: string;
      };
      // public.update_reservation — Phase 7: single centralized RPC for
      // editing a reservation's court/date/start_time/duration_minutes.
      // PLAYER (creator only, 2+ hours out) and OWNER/ADMIN (any club
      // reservation, no time window) share this one entry point; every
      // authorization/availability/pricing check is re-derived
      // server-side from auth.uid(), only the new field values and the
      // reservation id are ever passed in
      update_reservation: {
        Args: {
          p_reservation_id: string;
          p_court_id: string;
          p_date: string;
          p_start_time: string;
          p_duration_minutes: number;
        };
        Returns: void;
      };
      // public.approve_pending_reservation — Phase 7 concurrency fix:
      // replaces approvePendingReservation's own inline
      // check-then-UPDATE. Same rules as before (OWNER/ADMIN of this
      // reservation's club, pending→confirmed only, court still active,
      // duration/operating hours re-validated, confirmed-only conflict
      // check excluding itself), now inside the same
      // advisory-lock-protected transaction the create/edit paths use
      approve_pending_reservation: {
        Args: { p_reservation_id: string };
        Returns: void;
      };
      // public.notify_reservation_updated — best-effort, called right
      // after update_reservation succeeds; notifies OWNER/ADMIN +
      // participants when a PLAYER edited, or the creator + participants
      // when OWNER/ADMIN edited
      notify_reservation_updated: {
        Args: { p_reservation_id: string };
        Returns: void;
      };
      // public.upsert_pricing_rule_with_prices — atomic create/edit of a
      // pricing rule together with its per-duration prices (child rows).
      // p_rule_id NULL creates; otherwise updates. p_prices is a jsonb
      // array of {duration_minutes, price_amount, currency}.
      upsert_pricing_rule_with_prices: {
        Args: {
          p_rule_id: string | null;
          p_club_id: string;
          p_court_id: string | null;
          p_name: string;
          p_days_of_week: number[];
          p_start_time: string;
          p_end_time: string;
          p_display_order: number;
          p_prices: Json;
        };
        Returns: string;
      };
      // public.get_or_create_active_ranking_cycle — Fase 1 módulo deportivo,
      // internal only (no GRANT to authenticated) — not callable from the
      // client, listed here only for schema completeness
      get_or_create_active_ranking_cycle: {
        Args: { p_club_id: string; p_category: string };
        Returns: string;
      };
      // public.provision_club_member_sport_state — internal only
      provision_club_member_sport_state: {
        Args: { p_club_member_id: string };
        Returns: string | null;
      };
      // public.provision_club_sport_members — internal only; also the
      // explicit backfill entry point, run manually from the SQL Editor
      provision_club_sport_members: {
        Args: { p_club_id: string };
        Returns: Array<{ cycle_id: string; provisioned_count: number; skipped_count: number }>;
      };
      // public.configure_club_default_player_category — the one
      // authenticated-facing RPC of this block; OWNER/ADMIN only,
      // re-derived server-side; updates clubs.default_player_category and
      // provisions every PLAYER still missing a sport state, atomically
      configure_club_default_player_category: {
        Args: { p_club_id: string; p_category: string };
        Returns: Array<{ category: string; cycle_id: string; provisioned_count: number }>;
      };
      // public.adjust_club_player_points — Fase 1 módulo deportivo, bloque 5
      // (20260822000001). OWNER/ADMIN only; manual delta-mode adjustment,
      // floors at zero, always creates exactly one club_player_point_movements
      // row.
      adjust_club_player_points: {
        Args: {
          p_club_id: string;
          p_club_member_id: string;
          p_delta_points: number;
          p_reason_code: string;
          p_note: string;
        };
        Returns: Array<{
          club_member_id: string;
          category: string;
          previous_total: number;
          delta: number;
          new_total: number;
          movement_id: string;
        }>;
      };
      // public.get_club_category_ranking — Fase 1 módulo deportivo, bloque 6
      // (20260824000001). Authenticated + active member of p_club_id only
      // (any role); read-only base ranking query for one club+category.
      // Original RETURNS TABLE shape preserved exactly (no avatar_url) —
      // change_club_player_category (20260822000001/20260823000001) already
      // consumes this exact shape internally; see get_club_category_ranking_view
      // below for the UI-facing variant that adds avatar_url.
      get_club_category_ranking: {
        Args: { p_club_id: string; p_category: string };
        Returns: Array<{
          ranking_position: number;
          club_member_id: string;
          profile_id: string;
          full_name: string | null;
          category: string;
          current_points: number;
          points_reached_at: string;
        }>;
      };
      // public.get_club_category_ranking_view — Fase 1 módulo deportivo,
      // bloque 6 (20260824000001). UI-facing wrapper: composes
      // get_club_category_ranking (inherits its authorization) and adds
      // avatar_url. This is the RPC the ranking page/UI calls — never the
      // one above directly.
      get_club_category_ranking_view: {
        Args: { p_club_id: string; p_category: string };
        Returns: Array<{
          ranking_position: number;
          club_member_id: string;
          profile_id: string;
          full_name: string | null;
          avatar_url: string | null;
          category: string;
          current_points: number;
          points_reached_at: string;
        }>;
      };
      // public.change_club_player_category — OWNER/ADMIN only; validates
      // promotion/demotion direction against sport_categories.sort_order,
      // resets points to 0, inserts exactly one club_player_category_changes
      // row, never a point movement
      change_club_player_category: {
        Args: {
          p_club_id: string;
          p_club_member_id: string;
          p_target_category: string;
          p_change_type: string;
          p_note: string;
        };
        Returns: Array<{
          club_member_id: string;
          previous_category: string;
          new_category: string;
          previous_points: number;
          new_points: number;
          previous_cycle_id: string;
          new_cycle_id: string;
          category_change_id: string;
        }>;
      };
      // public.get_club_member_sport_state — OWNER/ADMIN only; the read
      // companion the admin UI needs since club_member_sport_state/
      // club_ranking_cycles have zero RLS policies and no client GRANT
      get_club_member_sport_state: {
        Args: { p_club_id: string; p_club_member_id: string };
        Returns: Array<{
          club_member_id: string;
          category: string;
          current_points: number;
          points_reached_at: string;
        }>;
      };
      // public.get_club_member_email — OWNER/ADMIN only; profiles has no
      // email column, the real value lives in auth.users only reachable
      // via a SECURITY DEFINER join (20260828000001)
      get_club_member_email: {
        Args: { p_club_id: string; p_club_member_id: string };
        Returns: string | null;
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
export type PricingRule = Tables<"club_pricing_rules">;
export type PricingRulePrice = Tables<"club_pricing_rule_prices">;

export type ClubRole = ClubMember["role"];
export type InvitationRole = InvitationLink["role"];
export type PlayerCategory = ClubMember["category"];

// MVP skill-level categories, weakest to strongest — manually assigned by
// admins for now. Order matters for any future ranking/sort UI.
export const PLAYER_CATEGORIES: PlayerCategory[] = [
  "Principiante",
  "5ta",
  "4ta",
  "3ra",
  "2da",
  "1ra",
];

// ClubMember with profile joined — used in players list and nav
export type ClubMemberWithProfile = ClubMember & {
  profiles: Profile;
};

// ClubMember with club joined — used in [club]/layout.tsx
export type ClubMemberWithClub = ClubMember & {
  clubs: Club;
};

export type Court = Tables<"courts">;

export type Reservation = Tables<"reservations">;
export type ReservationPlayer = Tables<"reservation_players">;
export type ReservationType = Reservation["type"];
export type ReservationStatus = Reservation["status"];

export type ClubOperatingHour = Tables<"club_operating_hours">;

// Fase 1 módulo deportivo — global, ordered category catalog (7 fixed
// rows). Only this table's convenience type is exported here: nothing in
// this provisioning block reads club_ranking_cycles/club_member_sport_state/
// club_player_category_changes/club_player_point_movements directly from
// client code yet.
export type SportCategory = Tables<"sport_categories">;

export type ClubNews = Tables<"club_news">;

// ClubNews with the author's profile joined — used in the admin Noticias list
export type ClubNewsWithAuthor = ClubNews & {
  created_by_profile: Pick<Profile, "full_name"> | null;
};
