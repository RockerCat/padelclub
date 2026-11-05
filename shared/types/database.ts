export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      club_claim_events: {
        Row: {
          actor_id: string | null
          claim_link_id: string | null
          club_id: string
          created_at: string
          event_type: string
          id: string
          ip_address: string | null
          previous_owner_id: string | null
        }
        Insert: {
          actor_id?: string | null
          claim_link_id?: string | null
          club_id: string
          created_at?: string
          event_type: string
          id?: string
          ip_address?: string | null
          previous_owner_id?: string | null
        }
        Update: {
          actor_id?: string | null
          claim_link_id?: string | null
          club_id?: string
          created_at?: string
          event_type?: string
          id?: string
          ip_address?: string | null
          previous_owner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_claim_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_claim_events_claim_link_id_fkey"
            columns: ["claim_link_id"]
            isOneToOne: false
            referencedRelation: "club_claim_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_claim_events_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_claim_events_previous_owner_id_fkey"
            columns: ["previous_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      club_claim_links: {
        Row: {
          claimed_at: string | null
          claimed_by: string | null
          club_id: string
          created_at: string
          created_by: string
          id: string
          revoked_at: string | null
          revoked_by: string | null
          status: string
          token_hash: string
        }
        Insert: {
          claimed_at?: string | null
          claimed_by?: string | null
          club_id: string
          created_at?: string
          created_by: string
          id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          token_hash: string
        }
        Update: {
          claimed_at?: string | null
          claimed_by?: string | null
          club_id?: string
          created_at?: string
          created_by?: string
          id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_claim_links_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_claim_links_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_claim_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_claim_links_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      club_join_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          club_id: string
          created_at: string
          id: string
          profile_id: string
          rejected_at: string | null
          rejected_by: string | null
          status: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          club_id: string
          created_at?: string
          id?: string
          profile_id: string
          rejected_at?: string | null
          rejected_by?: string | null
          status?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          club_id?: string
          created_at?: string
          id?: string
          profile_id?: string
          rejected_at?: string | null
          rejected_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_join_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_join_requests_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_join_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_join_requests_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      club_member_sport_state: {
        Row: {
          club_id: string
          club_member_id: string
          created_at: string
          current_points: number
          cycle_id: string
          points_reached_at: string
        }
        Insert: {
          club_id: string
          club_member_id: string
          created_at?: string
          current_points?: number
          cycle_id: string
          points_reached_at?: string
        }
        Update: {
          club_id?: string
          club_member_id?: string
          created_at?: string
          current_points?: number
          cycle_id?: string
          points_reached_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_member_sport_state_cycle_club_fk"
            columns: ["cycle_id", "club_id"]
            isOneToOne: false
            referencedRelation: "club_ranking_cycles"
            referencedColumns: ["id", "club_id"]
          },
          {
            foreignKeyName: "club_member_sport_state_member_club_fk"
            columns: ["club_member_id", "club_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id", "club_id"]
          },
        ]
      }
      club_members: {
        Row: {
          category: string
          club_id: string
          id: string
          is_active: boolean
          joined_at: string
          profile_id: string
          role: string
        }
        Insert: {
          category?: string
          club_id: string
          id?: string
          is_active?: boolean
          joined_at?: string
          profile_id: string
          role: string
        }
        Update: {
          category?: string
          club_id?: string
          id?: string
          is_active?: boolean
          joined_at?: string
          profile_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_members_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      club_news: {
        Row: {
          club_id: string
          content: string
          created_at: string
          created_by: string
          id: string
          image_url: string
          published_at: string
          slug: string
          title: string
          tournament_id: string | null
          updated_at: string
        }
        Insert: {
          club_id: string
          content: string
          created_at?: string
          created_by: string
          id?: string
          image_url: string
          published_at?: string
          slug: string
          title: string
          tournament_id?: string | null
          updated_at?: string
        }
        Update: {
          club_id?: string
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          image_url?: string
          published_at?: string
          slug?: string
          title?: string
          tournament_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_news_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_news_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_news_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      club_operating_hours: {
        Row: {
          closes_at: string | null
          club_id: string
          created_at: string
          day_of_week: number
          id: string
          is_open: boolean
          opens_at: string | null
          updated_at: string
        }
        Insert: {
          closes_at?: string | null
          club_id: string
          created_at?: string
          day_of_week: number
          id?: string
          is_open?: boolean
          opens_at?: string | null
          updated_at?: string
        }
        Update: {
          closes_at?: string | null
          club_id?: string
          created_at?: string
          day_of_week?: number
          id?: string
          is_open?: boolean
          opens_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_operating_hours_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_player_category_changes: {
        Row: {
          change_type: string
          club_id: string
          club_member_id: string
          comment: string
          created_at: string
          created_by: string
          id: string
          new_category: string
          new_cycle_id: string
          previous_category: string
          previous_cycle_id: string
          previous_points: number
          previous_position: number | null
        }
        Insert: {
          change_type: string
          club_id: string
          club_member_id: string
          comment: string
          created_at?: string
          created_by: string
          id?: string
          new_category: string
          new_cycle_id: string
          previous_category: string
          previous_cycle_id: string
          previous_points: number
          previous_position?: number | null
        }
        Update: {
          change_type?: string
          club_id?: string
          club_member_id?: string
          comment?: string
          created_at?: string
          created_by?: string
          id?: string
          new_category?: string
          new_cycle_id?: string
          previous_category?: string
          previous_cycle_id?: string
          previous_points?: number
          previous_position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "club_player_category_changes_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_player_category_changes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_player_category_changes_member_club_fk"
            columns: ["club_member_id", "club_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id", "club_id"]
          },
          {
            foreignKeyName: "club_player_category_changes_new_category_fkey"
            columns: ["new_category"]
            isOneToOne: false
            referencedRelation: "sport_categories"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "club_player_category_changes_new_cycle_club_fk"
            columns: ["new_cycle_id", "club_id"]
            isOneToOne: false
            referencedRelation: "club_ranking_cycles"
            referencedColumns: ["id", "club_id"]
          },
          {
            foreignKeyName: "club_player_category_changes_prev_cycle_club_fk"
            columns: ["previous_cycle_id", "club_id"]
            isOneToOne: false
            referencedRelation: "club_ranking_cycles"
            referencedColumns: ["id", "club_id"]
          },
          {
            foreignKeyName: "club_player_category_changes_previous_category_fkey"
            columns: ["previous_category"]
            isOneToOne: false
            referencedRelation: "sport_categories"
            referencedColumns: ["code"]
          },
        ]
      }
      club_player_point_movements: {
        Row: {
          adjustment_mode: string
          category: string
          category_change_id: string | null
          club_id: string
          club_member_id: string
          comment: string
          created_at: string
          created_by: string
          cycle_id: string
          delta: number
          id: string
          new_total: number
          origin: string
          previous_total: number
          reason_code: string | null
          system_event_code: string | null
          tournament_id: string | null
        }
        Insert: {
          adjustment_mode: string
          category: string
          category_change_id?: string | null
          club_id: string
          club_member_id: string
          comment: string
          created_at?: string
          created_by: string
          cycle_id: string
          delta: number
          id?: string
          new_total: number
          origin: string
          previous_total: number
          reason_code?: string | null
          system_event_code?: string | null
          tournament_id?: string | null
        }
        Update: {
          adjustment_mode?: string
          category?: string
          category_change_id?: string | null
          club_id?: string
          club_member_id?: string
          comment?: string
          created_at?: string
          created_by?: string
          cycle_id?: string
          delta?: number
          id?: string
          new_total?: number
          origin?: string
          previous_total?: number
          reason_code?: string | null
          system_event_code?: string | null
          tournament_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_player_point_movements_category_change_id_fkey"
            columns: ["category_change_id"]
            isOneToOne: false
            referencedRelation: "club_player_category_changes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_player_point_movements_category_fkey"
            columns: ["category"]
            isOneToOne: false
            referencedRelation: "sport_categories"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "club_player_point_movements_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_player_point_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_player_point_movements_cycle_club_fk"
            columns: ["cycle_id", "club_id"]
            isOneToOne: false
            referencedRelation: "club_ranking_cycles"
            referencedColumns: ["id", "club_id"]
          },
          {
            foreignKeyName: "club_player_point_movements_member_club_fk"
            columns: ["club_member_id", "club_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id", "club_id"]
          },
          {
            foreignKeyName: "club_player_point_movements_tournament_club_fk"
            columns: ["tournament_id", "club_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id", "club_id"]
          },
        ]
      }
      club_pricing_rule_prices: {
        Row: {
          created_at: string
          currency: string
          duration_minutes: number
          id: string
          price_amount: number
          pricing_rule_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          duration_minutes: number
          id?: string
          price_amount: number
          pricing_rule_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          duration_minutes?: number
          id?: string
          price_amount?: number
          pricing_rule_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_pricing_rule_prices_pricing_rule_id_fkey"
            columns: ["pricing_rule_id"]
            isOneToOne: false
            referencedRelation: "club_pricing_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      club_pricing_rules: {
        Row: {
          club_id: string
          court_id: string | null
          created_at: string
          currency: string
          days_of_week: number[]
          display_order: number
          end_time: string
          id: string
          is_active: boolean
          name: string
          price_per_hour: number | null
          start_time: string
          updated_at: string
        }
        Insert: {
          club_id: string
          court_id?: string | null
          created_at?: string
          currency?: string
          days_of_week: number[]
          display_order?: number
          end_time: string
          id?: string
          is_active?: boolean
          name: string
          price_per_hour?: number | null
          start_time: string
          updated_at?: string
        }
        Update: {
          club_id?: string
          court_id?: string | null
          created_at?: string
          currency?: string
          days_of_week?: number[]
          display_order?: number
          end_time?: string
          id?: string
          is_active?: boolean
          name?: string
          price_per_hour?: number | null
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_pricing_rules_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_pricing_rules_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
        ]
      }
      club_ranking_cycles: {
        Row: {
          category: string
          club_id: string
          created_at: string
          ended_at: string | null
          id: string
          started_at: string
        }
        Insert: {
          category: string
          club_id: string
          created_at?: string
          ended_at?: string | null
          id?: string
          started_at?: string
        }
        Update: {
          category?: string
          club_id?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_ranking_cycles_category_fkey"
            columns: ["category"]
            isOneToOne: false
            referencedRelation: "sport_categories"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "club_ranking_cycles_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_subscriptions: {
        Row: {
          auto_renew: boolean
          cancelled_at: string | null
          club_id: string
          created_at: string
          current_period_end: string
          current_period_start: string
          id: string
          last_payment_at: string | null
          last_payment_status: string | null
          next_billing_at: string | null
          payer_profile_id: string
          status: string
          suspended_at: string | null
          trial_ends_at: string | null
          trial_started_at: string | null
          updated_at: string
        }
        Insert: {
          auto_renew?: boolean
          cancelled_at?: string | null
          club_id: string
          created_at?: string
          current_period_end: string
          current_period_start: string
          id?: string
          last_payment_at?: string | null
          last_payment_status?: string | null
          next_billing_at?: string | null
          payer_profile_id: string
          status?: string
          suspended_at?: string | null
          trial_ends_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
        }
        Update: {
          auto_renew?: boolean
          cancelled_at?: string | null
          club_id?: string
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          last_payment_at?: string | null
          last_payment_status?: string | null
          next_billing_at?: string | null
          payer_profile_id?: string
          status?: string
          suspended_at?: string | null
          trial_ends_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_subscriptions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_subscriptions_payer_profile_id_fkey"
            columns: ["payer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          address: string | null
          allowed_reservation_durations: number[]
          archived_at: string | null
          bg_color: string
          city: string | null
          country: string | null
          cover_image_url: string | null
          created_at: string
          deactivated_at: string | null
          deactivated_by: string | null
          default_player_category: string | null
          description: string | null
          facebook: string | null
          gallery_image_urls: string[]
          id: string
          instagram: string | null
          is_active: boolean
          latitude: number | null
          logo_url: string | null
          longitude: number | null
          name: string
          pending_claim: boolean
          primary_color: string
          reactivated_at: string | null
          reactivated_by: string | null
          secondary_color: string
          slug: string
          state: string | null
          updated_at: string
          visibility: string
          whatsapp: string | null
          youtube: string | null
        }
        Insert: {
          address?: string | null
          allowed_reservation_durations?: number[]
          archived_at?: string | null
          bg_color?: string
          city?: string | null
          country?: string | null
          cover_image_url?: string | null
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          default_player_category?: string | null
          description?: string | null
          facebook?: string | null
          gallery_image_urls?: string[]
          id?: string
          instagram?: string | null
          is_active?: boolean
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          name: string
          pending_claim?: boolean
          primary_color?: string
          reactivated_at?: string | null
          reactivated_by?: string | null
          secondary_color?: string
          slug: string
          state?: string | null
          updated_at?: string
          visibility?: string
          whatsapp?: string | null
          youtube?: string | null
        }
        Update: {
          address?: string | null
          allowed_reservation_durations?: number[]
          archived_at?: string | null
          bg_color?: string
          city?: string | null
          country?: string | null
          cover_image_url?: string | null
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          default_player_category?: string | null
          description?: string | null
          facebook?: string | null
          gallery_image_urls?: string[]
          id?: string
          instagram?: string | null
          is_active?: boolean
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          name?: string
          pending_claim?: boolean
          primary_color?: string
          reactivated_at?: string | null
          reactivated_by?: string | null
          secondary_color?: string
          slug?: string
          state?: string | null
          updated_at?: string
          visibility?: string
          whatsapp?: string | null
          youtube?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clubs_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clubs_default_player_category_fkey"
            columns: ["default_player_category"]
            isOneToOne: false
            referencedRelation: "sport_categories"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "clubs_reactivated_by_fkey"
            columns: ["reactivated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      commercial_leads: {
        Row: {
          city: string
          club_name: string
          contact_name: string
          converted_at: string | null
          converted_club_id: string | null
          created_at: string
          demo_at: string | null
          id: string
          lost_reason: string | null
          notes: string | null
          number_of_courts: number | null
          privacy_consent_at: string
          source: string
          status: string
          updated_at: string
          whatsapp: string
        }
        Insert: {
          city: string
          club_name: string
          contact_name: string
          converted_at?: string | null
          converted_club_id?: string | null
          created_at?: string
          demo_at?: string | null
          id?: string
          lost_reason?: string | null
          notes?: string | null
          number_of_courts?: number | null
          privacy_consent_at: string
          source?: string
          status?: string
          updated_at?: string
          whatsapp: string
        }
        Update: {
          city?: string
          club_name?: string
          contact_name?: string
          converted_at?: string | null
          converted_club_id?: string | null
          created_at?: string
          demo_at?: string | null
          id?: string
          lost_reason?: string | null
          notes?: string | null
          number_of_courts?: number | null
          privacy_consent_at?: string
          source?: string
          status?: string
          updated_at?: string
          whatsapp?: string
        }
        Relationships: [
          {
            foreignKeyName: "commercial_leads_converted_club_id_fkey"
            columns: ["converted_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      commercial_settings: {
        Row: {
          base_monthly_price: number
          created_at: string
          currency: string
          id: string
          promo_enabled: boolean
          promo_monthly_price: number | null
          trial_days: number
          trial_months: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          base_monthly_price: number
          created_at?: string
          currency: string
          id?: string
          promo_enabled?: boolean
          promo_monthly_price?: number | null
          trial_days: number
          trial_months?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          base_monthly_price?: number
          created_at?: string
          currency?: string
          id?: string
          promo_enabled?: boolean
          promo_monthly_price?: number | null
          trial_days?: number
          trial_months?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commercial_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      courts: {
        Row: {
          club_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_indoor: boolean | null
          name: string
          sort_order: number
          streaming_url: string | null
          surface: string | null
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_indoor?: boolean | null
          name: string
          sort_order?: number
          streaming_url?: string | null
          surface?: string | null
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_indoor?: boolean | null
          name?: string
          sort_order?: number
          streaming_url?: string | null
          surface?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courts_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      invitation_links: {
        Row: {
          club_id: string
          created_at: string
          created_by: string
          expires_at: string
          id: string
          is_active: boolean
          max_uses: number | null
          role: string
          token: string
          uses: number
        }
        Insert: {
          club_id: string
          created_at?: string
          created_by: string
          expires_at?: string
          id?: string
          is_active?: boolean
          max_uses?: number | null
          role?: string
          token?: string
          uses?: number
        }
        Update: {
          club_id?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          is_active?: boolean
          max_uses?: number | null
          role?: string
          token?: string
          uses?: number
        }
        Relationships: [
          {
            foreignKeyName: "invitation_links_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitation_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          club_id: string | null
          created_at: string
          id: string
          message: string
          metadata: Json
          profile_id: string
          read_at: string | null
          resolved_at: string | null
          resolved_status: string | null
          title: string
          type: string
        }
        Insert: {
          club_id?: string | null
          created_at?: string
          id?: string
          message: string
          metadata?: Json
          profile_id: string
          read_at?: string | null
          resolved_at?: string | null
          resolved_status?: string | null
          title: string
          type: string
        }
        Update: {
          club_id?: string | null
          created_at?: string
          id?: string
          message?: string
          metadata?: Json
          profile_id?: string
          read_at?: string | null
          resolved_at?: string | null
          resolved_status?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      open_match_participants: {
        Row: {
          confirmed_schedule_version: number
          id: string
          is_active: boolean
          joined_at: string
          left_at: string | null
          match_id: string
          profile_id: string
        }
        Insert: {
          confirmed_schedule_version: number
          id?: string
          is_active?: boolean
          joined_at?: string
          left_at?: string | null
          match_id: string
          profile_id: string
        }
        Update: {
          confirmed_schedule_version?: number
          id?: string
          is_active?: boolean
          joined_at?: string
          left_at?: string | null
          match_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "open_match_participants_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "open_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "open_match_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      open_matches: {
        Row: {
          cancelled_at: string | null
          city: string
          city_key: string
          comment: string | null
          court_booked_at: string | null
          court_status: string
          created_at: string
          guest_count: number
          id: string
          level: string
          match_date: string
          max_players: number
          organizer_id: string
          schedule_changed_at: string | null
          schedule_version: number
          start_time: string
          status: string
          updated_at: string
          venue_id: string | null
          venue_name: string | null
        }
        Insert: {
          cancelled_at?: string | null
          city: string
          city_key: string
          comment?: string | null
          court_booked_at?: string | null
          court_status?: string
          created_at?: string
          guest_count?: number
          id?: string
          level: string
          match_date: string
          max_players?: number
          organizer_id: string
          schedule_changed_at?: string | null
          schedule_version?: number
          start_time: string
          status?: string
          updated_at?: string
          venue_id?: string | null
          venue_name?: string | null
        }
        Update: {
          cancelled_at?: string | null
          city?: string
          city_key?: string
          comment?: string | null
          court_booked_at?: string | null
          court_status?: string
          created_at?: string
          guest_count?: number
          id?: string
          level?: string
          match_date?: string
          max_players?: number
          organizer_id?: string
          schedule_changed_at?: string | null
          schedule_version?: number
          start_time?: string
          status?: string
          updated_at?: string
          venue_id?: string | null
          venue_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "open_matches_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "open_matches_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "padel_venues"
            referencedColumns: ["id"]
          },
        ]
      }
      padel_venues: {
        Row: {
          address: string | null
          club_id: string | null
          created_at: string
          created_by: string | null
          department: string
          department_key: string
          id: string
          internal_notes: string | null
          latitude: number | null
          longitude: number | null
          maps_url: string | null
          municipality: string
          municipality_key: string
          name: string
          name_key: string
          phone: string | null
          published_at: string | null
          source_label: string | null
          source_url: string | null
          status: string
          updated_at: string
          updated_by: string | null
          verified_at: string | null
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          club_id?: string | null
          created_at?: string
          created_by?: string | null
          department: string
          department_key: string
          id?: string
          internal_notes?: string | null
          latitude?: number | null
          longitude?: number | null
          maps_url?: string | null
          municipality: string
          municipality_key: string
          name: string
          name_key: string
          phone?: string | null
          published_at?: string | null
          source_label?: string | null
          source_url?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          verified_at?: string | null
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          club_id?: string | null
          created_at?: string
          created_by?: string | null
          department?: string
          department_key?: string
          id?: string
          internal_notes?: string | null
          latitude?: number | null
          longitude?: number | null
          maps_url?: string | null
          municipality?: string
          municipality_key?: string
          name?: string
          name_key?: string
          phone?: string | null
          published_at?: string | null
          source_label?: string | null
          source_url?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          verified_at?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "padel_venues_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "padel_venues_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "padel_venues_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          checksum: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json
          payment_id: string | null
          processed_at: string | null
          processing_error: string | null
          provider: string
          provider_transaction_id: string | null
          status: string | null
        }
        Insert: {
          checksum?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload: Json
          payment_id?: string | null
          processed_at?: string | null
          processing_error?: string | null
          provider?: string
          provider_transaction_id?: string | null
          status?: string | null
        }
        Update: {
          checksum?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          payment_id?: string | null
          processed_at?: string | null
          processing_error?: string | null
          provider?: string
          provider_transaction_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          base_price: number
          club_id: string
          created_at: string
          currency: string
          discount_amount: number
          failed_at: string | null
          id: string
          initiated_by: string
          paid_at: string | null
          payment_method: string | null
          provider: string
          provider_reference: string
          provider_transaction_id: string | null
          raw_response: Json | null
          status: string
          subscription_id: string
          subscription_period_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          base_price: number
          club_id: string
          created_at?: string
          currency: string
          discount_amount?: number
          failed_at?: string | null
          id?: string
          initiated_by: string
          paid_at?: string | null
          payment_method?: string | null
          provider?: string
          provider_reference: string
          provider_transaction_id?: string | null
          raw_response?: Json | null
          status?: string
          subscription_id: string
          subscription_period_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          base_price?: number
          club_id?: string
          created_at?: string
          currency?: string
          discount_amount?: number
          failed_at?: string | null
          id?: string
          initiated_by?: string
          paid_at?: string | null
          payment_method?: string | null
          provider?: string
          provider_reference?: string
          provider_transaction_id?: string | null
          raw_response?: Json | null
          status?: string
          subscription_id?: string
          subscription_period_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "club_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_subscription_period_id_fkey"
            columns: ["subscription_period_id"]
            isOneToOne: false
            referencedRelation: "subscription_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_type: string | null
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          is_platform_admin: boolean
          last_club_id: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          account_type?: string | null
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          is_platform_admin?: boolean
          last_club_id?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          account_type?: string | null
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_platform_admin?: boolean
          last_club_id?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_last_club_id_fkey"
            columns: ["last_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string
          device_id: string | null
          expo_push_token: string
          id: string
          is_active: boolean
          last_seen_at: string
          platform: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          expo_push_token: string
          id?: string
          is_active?: boolean
          last_seen_at?: string
          platform: string
          profile_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          device_id?: string | null
          expo_push_token?: string
          id?: string
          is_active?: boolean
          last_seen_at?: string
          platform?: string
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_extra_time_entries: {
        Row: {
          added_amount: number
          added_by: string
          added_minutes: number
          club_id: string
          created_at: string
          currency: string
          id: string
          note: string | null
          reservation_id: string
        }
        Insert: {
          added_amount?: number
          added_by: string
          added_minutes: number
          club_id: string
          created_at?: string
          currency: string
          id?: string
          note?: string | null
          reservation_id: string
        }
        Update: {
          added_amount?: number
          added_by?: string
          added_minutes?: number
          club_id?: string
          created_at?: string
          currency?: string
          id?: string
          note?: string | null
          reservation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_extra_time_entries_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_extra_time_entries_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_extra_time_entries_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_join_requests: {
        Row: {
          club_id: string
          created_at: string
          id: string
          profile_id: string
          rejection_reason: string | null
          reservation_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          club_id: string
          created_at?: string
          id?: string
          profile_id: string
          rejection_reason?: string | null
          reservation_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          id?: string
          profile_id?: string
          rejection_reason?: string | null
          reservation_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_join_requests_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_join_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_join_requests_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_join_requests_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_players: {
        Row: {
          created_at: string | null
          id: string
          profile_id: string
          reservation_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          profile_id: string
          reservation_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          profile_id?: string
          reservation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_players_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_players_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          cancelled_at: string | null
          cancelled_by: string | null
          closed_reason: string | null
          club_id: string
          court_id: string
          created_at: string | null
          created_by: string
          date: string
          duration_minutes: number
          extra_amount: number
          extra_currency: string | null
          extra_minutes: number
          id: string
          is_open: boolean
          notes: string | null
          price_amount: number | null
          price_calculated_at: string | null
          price_currency: string | null
          pricing_rule_id: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          rejection_reason_code: string | null
          start_time: string
          status: string
          title: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          closed_reason?: string | null
          club_id: string
          court_id: string
          created_at?: string | null
          created_by: string
          date: string
          duration_minutes?: number
          extra_amount?: number
          extra_currency?: string | null
          extra_minutes?: number
          id?: string
          is_open?: boolean
          notes?: string | null
          price_amount?: number | null
          price_calculated_at?: string | null
          price_currency?: string | null
          pricing_rule_id?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          rejection_reason_code?: string | null
          start_time: string
          status?: string
          title?: string | null
          type?: string
          updated_at?: string | null
        }
        Update: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          closed_reason?: string | null
          club_id?: string
          court_id?: string
          created_at?: string | null
          created_by?: string
          date?: string
          duration_minutes?: number
          extra_amount?: number
          extra_currency?: string | null
          extra_minutes?: number
          id?: string
          is_open?: boolean
          notes?: string | null
          price_amount?: number | null
          price_calculated_at?: string | null
          price_currency?: string | null
          pricing_rule_id?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          rejection_reason_code?: string | null
          start_time?: string
          status?: string
          title?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservations_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_pricing_rule_id_fkey"
            columns: ["pricing_rule_id"]
            isOneToOne: false
            referencedRelation: "club_pricing_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sport_categories: {
        Row: {
          code: string
          created_at: string
          sort_order: number
        }
        Insert: {
          code: string
          created_at?: string
          sort_order: number
        }
        Update: {
          code?: string
          created_at?: string
          sort_order?: number
        }
        Relationships: []
      }
      subscription_periods: {
        Row: {
          base_price: number
          created_at: string
          currency: string
          discount_amount: number
          final_price: number
          id: string
          period_end: string
          period_start: string
          status: string
          subscription_id: string
          updated_at: string
        }
        Insert: {
          base_price: number
          created_at?: string
          currency: string
          discount_amount?: number
          final_price: number
          id?: string
          period_end: string
          period_start: string
          status: string
          subscription_id: string
          updated_at?: string
        }
        Update: {
          base_price?: number
          created_at?: string
          currency?: string
          discount_amount?: number
          final_price?: number
          id?: string
          period_end?: string
          period_start?: string
          status?: string
          subscription_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_periods_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "club_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_entries: {
        Row: {
          category: string
          club_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string
          id: string
          points: number
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          secondary_category: string | null
          status: string
          tournament_id: string
          updated_at: string
          withdrawn_at: string | null
          withdrawn_by: string | null
        }
        Insert: {
          category: string
          club_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by: string
          id?: string
          points?: number
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          secondary_category?: string | null
          status?: string
          tournament_id: string
          updated_at?: string
          withdrawn_at?: string | null
          withdrawn_by?: string | null
        }
        Update: {
          category?: string
          club_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string
          id?: string
          points?: number
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          secondary_category?: string | null
          status?: string
          tournament_id?: string
          updated_at?: string
          withdrawn_at?: string | null
          withdrawn_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_entries_category_fkey"
            columns: ["category"]
            isOneToOne: false
            referencedRelation: "sport_categories"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "tournament_entries_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_entries_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_entries_secondary_category_fkey"
            columns: ["secondary_category"]
            isOneToOne: false
            referencedRelation: "sport_categories"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "tournament_entries_tournament_club_fk"
            columns: ["tournament_id", "club_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id", "club_id"]
          },
          {
            foreignKeyName: "tournament_entries_withdrawn_by_fkey"
            columns: ["withdrawn_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_entry_members: {
        Row: {
          club_id: string
          club_member_id: string
          created_at: string
          id: string
          is_active: boolean
          replaced_at: string | null
          replaced_by: string | null
          tournament_entry_id: string
          tournament_id: string
        }
        Insert: {
          club_id: string
          club_member_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          replaced_at?: string | null
          replaced_by?: string | null
          tournament_entry_id: string
          tournament_id: string
        }
        Update: {
          club_id?: string
          club_member_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          replaced_at?: string | null
          replaced_by?: string | null
          tournament_entry_id?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_entry_members_entry_club_fk"
            columns: ["tournament_entry_id", "club_id"]
            isOneToOne: false
            referencedRelation: "tournament_entries"
            referencedColumns: ["id", "club_id"]
          },
          {
            foreignKeyName: "tournament_entry_members_entry_tournament_fk"
            columns: ["tournament_entry_id", "tournament_id"]
            isOneToOne: false
            referencedRelation: "tournament_entries"
            referencedColumns: ["id", "tournament_id"]
          },
          {
            foreignKeyName: "tournament_entry_members_member_club_fk"
            columns: ["club_member_id", "club_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id", "club_id"]
          },
          {
            foreignKeyName: "tournament_entry_members_replaced_by_fkey"
            columns: ["replaced_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          category: string
          club_id: string
          completed_at: string | null
          completed_by: string | null
          cover_image_url: string | null
          created_at: string
          created_by: string
          description: string | null
          entry_fee_amount: number
          estimated_duration_minutes: number | null
          id: string
          max_pairs: number
          name: string
          prize_description: string | null
          registration_closes_at: string | null
          registration_opens_at: string | null
          secondary_category: string | null
          slug: string
          started_at: string | null
          started_by: string | null
          starts_at: string | null
          status: string
          updated_at: string
          visibility: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          category: string
          club_id: string
          completed_at?: string | null
          completed_by?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          entry_fee_amount?: number
          estimated_duration_minutes?: number | null
          id?: string
          max_pairs: number
          name: string
          prize_description?: string | null
          registration_closes_at?: string | null
          registration_opens_at?: string | null
          secondary_category?: string | null
          slug: string
          started_at?: string | null
          started_by?: string | null
          starts_at?: string | null
          status?: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          category?: string
          club_id?: string
          completed_at?: string | null
          completed_by?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          entry_fee_amount?: number
          estimated_duration_minutes?: number | null
          id?: string
          max_pairs?: number
          name?: string
          prize_description?: string | null
          registration_closes_at?: string | null
          registration_opens_at?: string | null
          secondary_category?: string | null
          slug?: string
          started_at?: string | null
          started_by?: string | null
          starts_at?: string | null
          status?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournaments_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournaments_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournaments_category_fkey"
            columns: ["category"]
            isOneToOne: false
            referencedRelation: "sport_categories"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "tournaments_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournaments_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournaments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournaments_secondary_category_fkey"
            columns: ["secondary_category"]
            isOneToOne: false
            referencedRelation: "sport_categories"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "tournaments_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _check_operating_hours: {
        Args: {
          p_club_id: string
          p_date: string
          p_duration_minutes: number
          p_start_time: string
        }
        Returns: string
      }
      _check_reservation_conflict: {
        Args: {
          p_court_id: string
          p_date: string
          p_duration_minutes: number
          p_exclude_id: string
          p_start_time: string
          p_statuses: string[]
        }
        Returns: boolean
      }
      _close_tournament_registration_for_capacity: {
        Args: { p_actor: string; p_max_pairs: number; p_tournament_id: string }
        Returns: undefined
      }
      _club_stats_summary: {
        Args: { p_club_id: string; p_end: string; p_start: string }
        Returns: Json
      }
      _lock_court_date: {
        Args: { p_court_id: string; p_date: string }
        Returns: undefined
      }
      _maybe_reopen_reservation: {
        Args: { p_reservation_id: string }
        Returns: undefined
      }
      _my_reservations: {
        Args: { p_account_type: string }
        Returns: {
          club_id: string
          court_id: string
          date: string
          duration_minutes: number
          id: string
          start_time: string
          status: string
          type: string
        }[]
      }
      _notify_club_admins: {
        Args: {
          p_club_id: string
          p_message: string
          p_metadata?: Json
          p_title: string
          p_type: string
        }
        Returns: undefined
      }
      _notify_eligible_tournament_players: {
        Args: {
          p_message: string
          p_metadata?: Json
          p_title: string
          p_tournament_id: string
          p_type: string
        }
        Returns: undefined
      }
      _notify_tournament_entry_players: {
        Args: {
          p_exclude_club_member_id?: string
          p_message: string
          p_metadata?: Json
          p_title: string
          p_tournament_entry_id: string
          p_type: string
        }
        Returns: undefined
      }
      _open_match_check_venue: {
        Args: { p_city_key: string; p_current_id: string; p_venue_id: string }
        Returns: string
      }
      _open_match_city_key: { Args: { p_city: string }; Returns: string }
      _open_match_display_name: {
        Args: { p_full_name: string }
        Returns: string
      }
      _open_match_lock: {
        Args: { p_match_id: string }
        Returns: {
          cancelled_at: string | null
          city: string
          city_key: string
          comment: string | null
          court_booked_at: string | null
          court_status: string
          created_at: string
          guest_count: number
          id: string
          level: string
          match_date: string
          max_players: number
          organizer_id: string
          schedule_changed_at: string | null
          schedule_version: number
          start_time: string
          status: string
          updated_at: string
          venue_id: string | null
          venue_name: string | null
        }
        SetofOptions: {
          from: "*"
          to: "open_matches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _open_match_place_changed: {
        Args: {
          p_new_name: string
          p_new_venue_id: string
          p_old_name: string
          p_old_venue_id: string
        }
        Returns: boolean
      }
      _open_match_require_player: { Args: never; Returns: string }
      _open_match_starts_at: {
        Args: { p_date: string; p_time: string }
        Returns: string
      }
      _open_match_taken: {
        Args: { p_guest_count: number; p_match_id: string }
        Returns: number
      }
      _open_match_to_json: {
        Args: {
          p_include_participants: boolean
          p_match: Database["public"]["Tables"]["open_matches"]["Row"]
          p_viewer: string
        }
        Returns: Json
      }
      _open_match_today_bogota: { Args: never; Returns: string }
      _open_match_validate: {
        Args: {
          p_city: string
          p_comment: string
          p_level: string
          p_match_date: string
          p_start_time: string
          p_venue_name: string
        }
        Returns: string
      }
      _padel_venue_admin_json: {
        Args: { p_venue: Database["public"]["Tables"]["padel_venues"]["Row"] }
        Returns: Json
      }
      _padel_venue_clean: { Args: { p_value: string }; Returns: string }
      _padel_venue_maps_url_ok: { Args: { p_url: string }; Returns: boolean }
      _padel_venue_name_key: { Args: { p_value: string }; Returns: string }
      _padel_venue_phone: { Args: { p_value: string }; Returns: string }
      _padel_venue_public_club: { Args: { p_club_id: string }; Returns: Json }
      _padel_venue_public_json: {
        Args: { p_venue: Database["public"]["Tables"]["padel_venues"]["Row"] }
        Returns: Json
      }
      _padel_venue_require_platform_admin: { Args: never; Returns: string }
      _reject_pending_reservation_join_requests: {
        Args: {
          p_actor_id: string
          p_reason_text: string
          p_reservation_id: string
        }
        Returns: undefined
      }
      _require_club_admin: { Args: { p_club_id: string }; Returns: undefined }
      _require_club_not_archived: {
        Args: { p_club_id: string }
        Returns: undefined
      }
      _require_commercial_access: {
        Args: { p_club_id: string }
        Returns: undefined
      }
      _require_player_phone: {
        Args: { p_profile_id: string }
        Returns: undefined
      }
      _reservation_effective_player_count: {
        Args: { p_reservation_id: string }
        Returns: number
      }
      _resolve_reservation_price: {
        Args: {
          p_club_id: string
          p_court_id: string
          p_date: string
          p_duration_minutes: number
          p_start_time: string
        }
        Returns: Record<string, unknown>
      }
      _slugify_tournament_name: { Args: { p_name: string }; Returns: string }
      add_reservation_extra_time: {
        Args: {
          p_extra_amount: number
          p_extra_minutes: number
          p_note: string
          p_reservation_id: string
        }
        Returns: {
          cancelled_at: string | null
          cancelled_by: string | null
          closed_reason: string | null
          club_id: string
          court_id: string
          created_at: string | null
          created_by: string
          date: string
          duration_minutes: number
          extra_amount: number
          extra_currency: string | null
          extra_minutes: number
          id: string
          is_open: boolean
          notes: string | null
          price_amount: number | null
          price_calculated_at: string | null
          price_currency: string | null
          pricing_rule_id: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          rejection_reason_code: string | null
          start_time: string
          status: string
          title: string | null
          type: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "reservations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      adjust_club_player_points: {
        Args: {
          p_club_id: string
          p_club_member_id: string
          p_delta_points: number
          p_note: string
          p_reason_code: string
        }
        Returns: {
          category: string
          club_member_id: string
          delta: number
          movement_id: string
          new_total: number
          previous_total: number
        }[]
      }
      approve_join_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      approve_pending_reservation: {
        Args: { p_reservation_id: string }
        Returns: undefined
      }
      approve_reservation_join_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      archive_club: { Args: { p_club_id: string }; Returns: undefined }
      archive_tournament: {
        Args: { p_tournament_id: string }
        Returns: {
          archived_at: string
          archived_by: string
          cancelled_at: string
          cancelled_by: string
          category: string
          club_id: string
          completed_at: string
          completed_by: string
          cover_image_url: string
          created_at: string
          created_by: string
          description: string
          entry_fee_amount: number
          estimated_duration_minutes: number
          id: string
          max_pairs: number
          name: string
          prize_description: string
          registration_closes_at: string
          registration_opens_at: string
          secondary_category: string
          slug: string
          started_at: string
          started_by: string
          starts_at: string
          status: string
          updated_at: string
          visibility: string
        }[]
      }
      cancel_open_match: { Args: { p_match_id: string }; Returns: Json }
      cancel_reservation: {
        Args: { p_reservation_id: string }
        Returns: undefined
      }
      cancel_tournament: {
        Args: { p_tournament_id: string }
        Returns: {
          archived_at: string
          archived_by: string
          cancelled_at: string
          cancelled_by: string
          category: string
          club_id: string
          completed_at: string
          completed_by: string
          cover_image_url: string
          created_at: string
          created_by: string
          description: string
          entry_fee_amount: number
          estimated_duration_minutes: number
          id: string
          max_pairs: number
          name: string
          prize_description: string
          registration_closes_at: string
          registration_opens_at: string
          secondary_category: string
          slug: string
          started_at: string
          started_by: string
          starts_at: string
          status: string
          updated_at: string
          visibility: string
        }[]
      }
      change_club_player_category: {
        Args: {
          p_change_type: string
          p_club_id: string
          p_club_member_id: string
          p_note: string
          p_target_category: string
        }
        Returns: {
          category_change_id: string
          club_member_id: string
          new_category: string
          new_cycle_id: string
          new_points: number
          previous_category: string
          previous_cycle_id: string
          previous_points: number
        }[]
      }
      claim_club: {
        Args: { p_ip?: string; p_token_hash: string }
        Returns: Json
      }
      claim_invitation: { Args: { p_token: string }; Returns: Json }
      close_tournament_registration: {
        Args: { p_tournament_id: string }
        Returns: {
          archived_at: string
          archived_by: string
          cancelled_at: string
          cancelled_by: string
          category: string
          club_id: string
          completed_at: string
          completed_by: string
          cover_image_url: string
          created_at: string
          created_by: string
          description: string
          entry_fee_amount: number
          estimated_duration_minutes: number
          id: string
          max_pairs: number
          name: string
          prize_description: string
          registration_closes_at: string
          registration_opens_at: string
          secondary_category: string
          slug: string
          started_at: string
          started_by: string
          starts_at: string
          status: string
          updated_at: string
          visibility: string
        }[]
      }
      club_role: { Args: { p_club_id: string }; Returns: string }
      compute_trial_ends_at: {
        Args: {
          p_started_at: string
          p_trial_days: number
          p_trial_months: number
        }
        Returns: string
      }
      configure_club_default_player_category: {
        Args: { p_category: string; p_club_id: string }
        Returns: {
          category: string
          cycle_id: string
          provisioned_count: number
        }[]
      }
      confirm_open_match_attendance: {
        Args: { p_match_id: string }
        Returns: Json
      }
      confirm_tournament_entry: {
        Args: { p_tournament_entry_id: string }
        Returns: {
          category: string
          club_id: string
          confirmed_at: string
          confirmed_by: string
          created_at: string
          created_by: string
          id: string
          points: number
          rejected_at: string
          rejected_by: string
          rejection_reason: string
          secondary_category: string
          status: string
          tournament_id: string
          updated_at: string
          withdrawn_at: string
          withdrawn_by: string
        }[]
      }
      count_active_players: { Args: { p_club_id: string }; Returns: number }
      create_club_news: {
        Args: {
          p_club_id: string
          p_content: string
          p_image_url: string
          p_title: string
          p_tournament_id: string
        }
        Returns: {
          club_id: string
          content: string
          created_at: string
          created_by: string
          id: string
          image_url: string
          published_at: string
          slug: string
          title: string
          tournament_id: string
          updated_at: string
        }[]
      }
      create_club_with_owner: {
        Args: { p_name: string; p_slug: string; p_visibility?: string }
        Returns: {
          id: string
          slug: string
        }[]
      }
      create_commercial_lead: {
        Args: {
          p_city: string
          p_club_name: string
          p_contact_name: string
          p_honeypot?: string
          p_number_of_courts?: number
          p_privacy_consent?: boolean
          p_whatsapp: string
        }
        Returns: boolean
      }
      create_join_request: { Args: { p_club_id: string }; Returns: undefined }
      create_open_match: {
        Args: {
          p_city: string
          p_comment?: string
          p_court_booked?: boolean
          p_level: string
          p_match_date: string
          p_players_already?: number
          p_start_time: string
          p_venue_id?: string
          p_venue_name?: string
        }
        Returns: string
      }
      create_pending_payment: {
        Args: { p_club_id: string }
        Returns: {
          amount: number
          currency: string
          payment_id: string
          provider_reference: string
        }[]
      }
      create_reservation_admin: {
        Args: {
          p_club_id: string
          p_court_id: string
          p_date: string
          p_duration_minutes: number
          p_is_open?: boolean
          p_notes: string
          p_player_count?: number
          p_start_time: string
          p_title: string
          p_type: string
        }
        Returns: string
      }
      create_reservation_player: {
        Args: {
          p_club_id: string
          p_court_id: string
          p_date: string
          p_duration_minutes: number
          p_is_open?: boolean
          p_start_time: string
        }
        Returns: string
      }
      create_tournament:
        | {
            Args: {
              p_category: string
              p_club_id: string
              p_cover_image_url?: string
              p_description?: string
              p_estimated_duration_minutes?: number
              p_max_pairs: number
              p_name: string
              p_prize_description?: string
              p_registration_closes_at?: string
              p_registration_opens_at?: string
              p_secondary_category?: string
              p_starts_at?: string
              p_visibility?: string
            }
            Returns: {
              archived_at: string
              archived_by: string
              cancelled_at: string
              cancelled_by: string
              category: string
              club_id: string
              completed_at: string
              completed_by: string
              cover_image_url: string
              created_at: string
              created_by: string
              description: string
              estimated_duration_minutes: number
              id: string
              max_pairs: number
              name: string
              prize_description: string
              registration_closes_at: string
              registration_opens_at: string
              secondary_category: string
              slug: string
              started_at: string
              started_by: string
              starts_at: string
              status: string
              updated_at: string
              visibility: string
            }[]
          }
        | {
            Args: {
              p_category: string
              p_club_id: string
              p_cover_image_url?: string
              p_description?: string
              p_entry_fee_amount?: number
              p_estimated_duration_minutes?: number
              p_max_pairs: number
              p_name: string
              p_prize_description?: string
              p_registration_closes_at?: string
              p_registration_opens_at?: string
              p_secondary_category?: string
              p_starts_at?: string
              p_visibility?: string
            }
            Returns: {
              archived_at: string
              archived_by: string
              cancelled_at: string
              cancelled_by: string
              category: string
              club_id: string
              completed_at: string
              completed_by: string
              cover_image_url: string
              created_at: string
              created_by: string
              description: string
              entry_fee_amount: number
              estimated_duration_minutes: number
              id: string
              max_pairs: number
              name: string
              prize_description: string
              registration_closes_at: string
              registration_opens_at: string
              secondary_category: string
              slug: string
              started_at: string
              started_by: string
              starts_at: string
              status: string
              updated_at: string
              visibility: string
            }[]
          }
      deactivate_player: {
        Args: { p_club_id: string; p_player_id: string }
        Returns: undefined
      }
      delete_court: { Args: { p_court_id: string }; Returns: undefined }
      delete_own_account: { Args: never; Returns: undefined }
      effective_club_role: { Args: { p_club_id: string }; Returns: string }
      expire_pending_reservations: {
        Args: { p_club_id?: string }
        Returns: undefined
      }
      finalize_tournament: {
        Args: { p_tournament_id: string }
        Returns: {
          already_finalized: boolean
          entries_awarded: number
          movements_created: number
          tournament_id: string
        }[]
      }
      get_club_category_ranking: {
        Args: { p_category: string; p_club_id: string }
        Returns: {
          category: string
          club_member_id: string
          current_points: number
          full_name: string
          points_reached_at: string
          profile_id: string
          ranking_position: number
        }[]
      }
      get_club_category_ranking_view: {
        Args: { p_category: string; p_club_id: string }
        Returns: {
          avatar_url: string
          category: string
          club_member_id: string
          current_points: number
          full_name: string
          points_reached_at: string
          profile_id: string
          ranking_position: number
        }[]
      }
      get_club_claim_preview: { Args: { p_token_hash: string }; Returns: Json }
      get_club_claim_status: {
        Args: { p_club_id: string }
        Returns: {
          claimed_at: string
          claimed_by_email: string
          claimed_by_name: string
          created_at: string
          status: string
        }[]
      }
      get_club_commercial_access: {
        Args: { p_club_id: string }
        Returns: {
          can_create_booking: boolean
          can_create_tournament: boolean
          commercial_status: string
          current_period_end: string
          has_subscription: boolean
          trial_ends_at: string
        }[]
      }
      get_club_join_requests: {
        Args: { p_club_id: string }
        Returns: {
          created_at: string
          email: string
          full_name: string
          id: string
          profile_id: string
          status: string
        }[]
      }
      get_club_member_email: {
        Args: { p_club_id: string; p_club_member_id: string }
        Returns: string
      }
      get_club_member_phone: {
        Args: { p_club_id: string; p_club_member_id: string }
        Returns: string
      }
      get_club_member_sport_state: {
        Args: { p_club_id: string; p_club_member_id: string }
        Returns: {
          category: string
          club_member_id: string
          current_points: number
          points_reached_at: string
        }[]
      }
      get_club_statistics: {
        Args: { p_club_id: string; p_end_date: string; p_start_date: string }
        Returns: Json
      }
      get_invitation_preview: { Args: { p_token: string }; Returns: Json }
      get_my_club_payments: {
        Args: { p_club_id: string; p_limit?: number }
        Returns: {
          amount: number
          created_at: string
          currency: string
          failed_at: string
          id: string
          paid_at: string
          payment_method: string
          status: string
        }[]
      }
      get_my_club_sport_profile: { Args: { p_club_id: string }; Returns: Json }
      get_my_club_subscription: {
        Args: { p_club_id: string }
        Returns: {
          auto_renew: boolean
          base_monthly_price: number
          currency: string
          current_period_end: string
          current_period_start: string
          has_subscription: boolean
          last_payment_at: string
          last_payment_status: string
          next_billing_at: string
          promo_enabled: boolean
          promo_monthly_price: number
          status: string
          suspended_at: string
          trial_ends_at: string
          trial_started_at: string
        }[]
      }
      get_my_profile: {
        Args: never
        Returns: {
          account_type: string
          avatar_url: string
          created_at: string
          full_name: string
          id: string
          is_platform_admin: boolean
          last_club_id: string
          phone: string
          updated_at: string
        }[]
      }
      get_my_profile_activity: { Args: never; Returns: Json }
      get_open_match: { Args: { p_match_id: string }; Returns: Json }
      get_or_create_active_ranking_cycle: {
        Args: { p_category: string; p_club_id: string }
        Returns: string
      }
      get_payment_status: {
        Args: { p_reference: string }
        Returns: {
          amount: number
          club_slug: string
          currency: string
          status: string
        }[]
      }
      get_platform_club_commercial_status: {
        Args: { p_club_id: string }
        Returns: {
          base_monthly_price: number
          currency: string
          current_period_end: string
          current_period_start: string
          has_subscription: boolean
          last_payment_at: string
          last_payment_status: string
          next_billing_at: string
          payer_email: string
          payer_name: string
          payer_profile_id: string
          promo_enabled: boolean
          promo_monthly_price: number
          status: string
          trial_days_remaining: number
          trial_ends_at: string
          trial_started_at: string
        }[]
      }
      get_platform_club_detail: {
        Args: { p_club_id: string }
        Returns: {
          admin_count: number
          court_count: number
          created_at: string
          id: string
          is_active: boolean
          logo_url: string
          name: string
          news_count: number
          owner_email: string
          owner_name: string
          player_count: number
          reservation_count: number
          slug: string
          visibility: string
        }[]
      }
      get_platform_clubs_overview: {
        Args: never
        Returns: {
          commercial_status: string
          court_count: number
          created_at: string
          current_period_end: string
          current_period_start: string
          has_subscription: boolean
          id: string
          is_active: boolean
          last_payment_amount: number
          last_payment_at: string
          last_payment_currency: string
          last_payment_status: string
          name: string
          next_billing_at: string
          owner_email: string
          owner_name: string
          payer_email: string
          payer_name: string
          player_count: number
          slug: string
          trial_ends_at: string
          trial_started_at: string
          visibility: string
        }[]
      }
      get_platform_commercial_settings: {
        Args: never
        Returns: {
          base_monthly_price: number
          currency: string
          promo_enabled: boolean
          promo_monthly_price: number
          trial_days: number
          trial_months: number
          updated_at: string
          updated_by_name: string
        }[]
      }
      get_platform_lead_detail: {
        Args: { p_lead_id: string }
        Returns: {
          city: string
          club_name: string
          contact_name: string
          converted_at: string
          converted_club_id: string
          converted_club_name: string
          converted_club_slug: string
          created_at: string
          demo_at: string
          id: string
          lost_reason: string
          notes: string
          number_of_courts: number
          privacy_consent_at: string
          source: string
          status: string
          updated_at: string
          whatsapp: string
        }[]
      }
      get_platform_leads_overview: {
        Args: never
        Returns: {
          city: string
          club_name: string
          contact_name: string
          converted_club_id: string
          created_at: string
          demo_at: string
          id: string
          number_of_courts: number
          status: string
          whatsapp: string
        }[]
      }
      get_platform_subscription_payments: {
        Args: { p_club_id: string }
        Returns: {
          amount: number
          created_at: string
          currency: string
          failed_at: string
          id: string
          paid_at: string
          payment_method: string
          provider: string
          provider_reference: string
          provider_transaction_id: string
          status: string
        }[]
      }
      get_platform_subscription_periods: {
        Args: { p_club_id: string }
        Returns: {
          base_price: number
          created_at: string
          currency: string
          discount_amount: number
          final_price: number
          id: string
          period_end: string
          period_start: string
          status: string
        }[]
      }
      get_platform_user_detail: {
        Args: { p_user_id: string }
        Returns: {
          created_at: string
          email: string
          full_name: string
          id: string
          is_banned: boolean
          is_platform_admin: boolean
          last_sign_in_at: string
          memberships: Json
        }[]
      }
      get_platform_users_overview: {
        Args: never
        Returns: {
          created_at: string
          email: string
          full_name: string
          id: string
          is_platform_admin: boolean
          memberships: Json
        }[]
      }
      get_public_clubs: {
        Args: never
        Returns: {
          court_count: number
          description: string
          id: string
          logo_url: string
          member_count: number
          name: string
          primary_color: string
          secondary_color: string
          slug: string
        }[]
      }
      get_public_commercial_offer: {
        Args: never
        Returns: {
          currency: string
          monthly_price: number
          trial_days: number
          trial_months: number
        }[]
      }
      get_reservation_share_detail: {
        Args: { p_reservation_id: string }
        Returns: Json
      }
      initialize_club_trial: {
        Args: { p_club_id: string; p_payer_profile_id: string }
        Returns: undefined
      }
      is_club_member: { Args: { p_club_id: string }; Returns: boolean }
      is_current_user_tournament_entry_member: {
        Args: { p_tournament_entry_id: string }
        Returns: boolean
      }
      is_superadmin_club_access: {
        Args: { p_club_id: string }
        Returns: boolean
      }
      join_open_match: { Args: { p_match_id: string }; Returns: Json }
      join_public_club: { Args: { p_club_id: string }; Returns: undefined }
      leave_club: { Args: { p_club_id: string }; Returns: undefined }
      leave_open_match: { Args: { p_match_id: string }; Returns: Json }
      list_my_open_matches: { Args: never; Returns: Json }
      list_open_match_cities: { Args: never; Returns: Json }
      list_open_matches: {
        Args: {
          p_city?: string
          p_date?: string
          p_level?: string
          p_limit?: number
          p_min_spots?: number
        }
        Returns: Json
      }
      list_padel_venues: {
        Args: {
          p_department?: string
          p_limit?: number
          p_municipality?: string
          p_query?: string
        }
        Returns: Json
      }
      notify_reservation_approved: {
        Args: { p_reservation_id: string }
        Returns: undefined
      }
      notify_reservation_cancelled: {
        Args: { p_reservation_id: string }
        Returns: undefined
      }
      notify_reservation_created_for_players: {
        Args: { p_reservation_id: string }
        Returns: undefined
      }
      notify_reservation_extra_time_added: {
        Args: { p_extra_minutes: number; p_reservation_id: string }
        Returns: undefined
      }
      notify_reservation_rejected: {
        Args: { p_reservation_id: string }
        Returns: undefined
      }
      notify_reservation_request_created: {
        Args: { p_reservation_id: string }
        Returns: undefined
      }
      notify_reservation_updated: {
        Args: { p_reservation_id: string }
        Returns: undefined
      }
      open_tournament_registration: {
        Args: { p_tournament_id: string }
        Returns: {
          archived_at: string
          archived_by: string
          cancelled_at: string
          cancelled_by: string
          category: string
          club_id: string
          completed_at: string
          completed_by: string
          cover_image_url: string
          created_at: string
          created_by: string
          description: string
          entry_fee_amount: number
          estimated_duration_minutes: number
          id: string
          max_pairs: number
          name: string
          prize_description: string
          registration_closes_at: string
          registration_opens_at: string
          secondary_category: string
          slug: string
          started_at: string
          started_by: string
          starts_at: string
          status: string
          updated_at: string
          visibility: string
        }[]
      }
      platform_convert_lead_to_pending_club: {
        Args: {
          p_lead_id: string
          p_name: string
          p_slug: string
          p_visibility?: string
        }
        Returns: {
          id: string
          slug: string
        }[]
      }
      platform_convert_padel_venue_to_pending_club: {
        Args: {
          p_name: string
          p_slug: string
          p_venue_id: string
          p_visibility?: string
        }
        Returns: Json
      }
      platform_create_pending_club: {
        Args: { p_name: string; p_slug: string; p_visibility?: string }
        Returns: {
          id: string
          slug: string
        }[]
      }
      platform_deactivate_club: {
        Args: { p_club_id: string }
        Returns: undefined
      }
      platform_delete_padel_venue_draft: {
        Args: { p_venue_id: string }
        Returns: boolean
      }
      platform_find_padel_venue_duplicates: {
        Args: {
          p_address?: string
          p_department: string
          p_exclude_id?: string
          p_municipality: string
          p_name: string
          p_phone?: string
          p_whatsapp?: string
        }
        Returns: Json
      }
      platform_generate_club_claim_link: {
        Args: { p_club_id: string; p_token_hash: string }
        Returns: string
      }
      platform_get_padel_venue: { Args: { p_venue_id: string }; Returns: Json }
      platform_link_padel_venue_club: {
        Args: { p_club_id: string; p_venue_id: string }
        Returns: Json
      }
      platform_list_padel_venues: { Args: never; Returns: Json }
      platform_reactivate_club: {
        Args: { p_club_id: string }
        Returns: undefined
      }
      platform_revoke_club_claim_link: {
        Args: { p_club_id: string }
        Returns: boolean
      }
      platform_save_padel_venue: {
        Args: {
          p_address?: string
          p_department: string
          p_internal_notes?: string
          p_latitude?: number
          p_longitude?: number
          p_maps_url?: string
          p_municipality: string
          p_name: string
          p_phone?: string
          p_source_label?: string
          p_source_url?: string
          p_venue_id: string
          p_verified_at?: string
          p_whatsapp?: string
        }
        Returns: Json
      }
      platform_set_padel_venue_status: {
        Args: { p_status: string; p_venue_id: string }
        Returns: Json
      }
      platform_update_club_slug: {
        Args: { p_club_id: string; p_new_slug: string }
        Returns: {
          id: string
          slug: string
        }[]
      }
      process_wompi_transaction_event: {
        Args: {
          p_amount_in_cents: number
          p_checksum?: string
          p_currency: string
          p_payment_method?: string
          p_provider_transaction_id: string
          p_raw_payload: Json
          p_reference: string
          p_status: string
        }
        Returns: undefined
      }
      provision_club_member_sport_state: {
        Args: { p_club_member_id: string }
        Returns: string
      }
      provision_club_sport_members: {
        Args: { p_club_id: string }
        Returns: {
          cycle_id: string
          provisioned_count: number
          skipped_count: number
        }[]
      }
      register_push_token: {
        Args: {
          p_device_id?: string
          p_expo_push_token: string
          p_platform: string
        }
        Returns: undefined
      }
      register_tournament_entry: {
        Args: {
          p_club_member_one_id: string
          p_club_member_two_id: string
          p_tournament_id: string
        }
        Returns: {
          category: string
          club_id: string
          confirmed_at: string
          confirmed_by: string
          created_at: string
          created_by: string
          id: string
          points: number
          rejected_at: string
          rejected_by: string
          rejection_reason: string
          secondary_category: string
          status: string
          tournament_id: string
          updated_at: string
          withdrawn_at: string
          withdrawn_by: string
        }[]
      }
      reject_join_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      reject_reservation_join_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      reject_tournament_entry: {
        Args: { p_reason: string; p_tournament_entry_id: string }
        Returns: {
          category: string
          club_id: string
          confirmed_at: string
          confirmed_by: string
          created_at: string
          created_by: string
          id: string
          points: number
          rejected_at: string
          rejected_by: string
          rejection_reason: string
          secondary_category: string
          status: string
          tournament_id: string
          updated_at: string
          withdrawn_at: string
          withdrawn_by: string
        }[]
      }
      reopen_tournament_registration: {
        Args: { p_tournament_id: string }
        Returns: {
          archived_at: string
          archived_by: string
          cancelled_at: string
          cancelled_by: string
          category: string
          club_id: string
          completed_at: string
          completed_by: string
          cover_image_url: string
          created_at: string
          created_by: string
          description: string
          entry_fee_amount: number
          estimated_duration_minutes: number
          id: string
          max_pairs: number
          name: string
          prize_description: string
          registration_closes_at: string
          registration_opens_at: string
          secondary_category: string
          slug: string
          started_at: string
          started_by: string
          starts_at: string
          status: string
          updated_at: string
          visibility: string
        }[]
      }
      replace_tournament_entry_member: {
        Args: {
          p_new_club_member_id: string
          p_old_club_member_id: string
          p_tournament_entry_id: string
        }
        Returns: {
          club_id: string
          club_member_id: string
          created_at: string
          id: string
          is_active: boolean
          replaced_at: string
          replaced_by: string
          tournament_entry_id: string
          tournament_id: string
        }[]
      }
      request_to_join_reservation: {
        Args: { p_reservation_id: string }
        Returns: string
      }
      resolve_reservation_request_notifications: {
        Args: { p_reservation_id: string; p_status: string }
        Returns: undefined
      }
      resolve_reservation_slug: {
        Args: {
          p_club_id: string
          p_date: string
          p_name_slug: string
          p_start_time: string
        }
        Returns: string
      }
      restore_tournament: {
        Args: { p_tournament_id: string }
        Returns: {
          archived_at: string
          archived_by: string
          cancelled_at: string
          cancelled_by: string
          category: string
          club_id: string
          completed_at: string
          completed_by: string
          cover_image_url: string
          created_at: string
          created_by: string
          description: string
          entry_fee_amount: number
          estimated_duration_minutes: number
          id: string
          max_pairs: number
          name: string
          prize_description: string
          registration_closes_at: string
          registration_opens_at: string
          secondary_category: string
          slug: string
          started_at: string
          started_by: string
          starts_at: string
          status: string
          updated_at: string
          visibility: string
        }[]
      }
      run_commercial_lifecycle_transitions: {
        Args: never
        Returns: {
          transitioned_active_to_past_due: number
          transitioned_past_due_to_suspended: number
          transitioned_trial_grace_to_suspended: number
        }[]
      }
      set_open_match_guests: {
        Args: { p_guest_count: number; p_match_id: string }
        Returns: Json
      }
      set_reservation_open_status: {
        Args: { p_is_open: boolean; p_reservation_id: string }
        Returns: undefined
      }
      set_tournament_entry_points: {
        Args: {
          p_entry_ids: string[]
          p_points: number[]
          p_tournament_id: string
        }
        Returns: {
          category: string
          club_id: string
          confirmed_at: string
          confirmed_by: string
          created_at: string
          created_by: string
          id: string
          points: number
          rejected_at: string
          rejected_by: string
          rejection_reason: string
          secondary_category: string
          status: string
          tournament_id: string
          updated_at: string
          withdrawn_at: string
          withdrawn_by: string
        }[]
      }
      shares_active_club_with: {
        Args: { p_profile_id: string }
        Returns: boolean
      }
      start_tournament: {
        Args: { p_tournament_id: string }
        Returns: {
          archived_at: string
          archived_by: string
          cancelled_at: string
          cancelled_by: string
          category: string
          club_id: string
          completed_at: string
          completed_by: string
          cover_image_url: string
          created_at: string
          created_by: string
          description: string
          entry_fee_amount: number
          estimated_duration_minutes: number
          id: string
          max_pairs: number
          name: string
          prize_description: string
          registration_closes_at: string
          registration_opens_at: string
          secondary_category: string
          slug: string
          started_at: string
          started_by: string
          starts_at: string
          status: string
          updated_at: string
          visibility: string
        }[]
      }
      unaccent: { Args: { "": string }; Returns: string }
      update_commercial_lead_notes: {
        Args: { p_lead_id: string; p_notes: string }
        Returns: undefined
      }
      update_commercial_lead_status: {
        Args: {
          p_demo_at?: string
          p_lead_id: string
          p_lost_reason?: string
          p_status: string
        }
        Returns: undefined
      }
      update_open_match: {
        Args: {
          p_city: string
          p_clear_venue?: boolean
          p_comment?: string
          p_court_booked?: boolean
          p_level: string
          p_match_date: string
          p_match_id: string
          p_start_time: string
          p_venue_id?: string
          p_venue_name?: string
        }
        Returns: Json
      }
      update_platform_commercial_settings: {
        Args: {
          p_base_monthly_price: number
          p_promo_enabled: boolean
          p_promo_monthly_price: number
          p_trial_days: number
          p_trial_months: number
        }
        Returns: undefined
      }
      update_platform_user_name: {
        Args: { p_full_name: string; p_user_id: string }
        Returns: undefined
      }
      update_reservation: {
        Args: {
          p_court_id: string
          p_date: string
          p_duration_minutes: number
          p_reservation_id: string
          p_start_time: string
        }
        Returns: undefined
      }
      update_reservation_admin: {
        Args: {
          p_court_id: string
          p_date: string
          p_duration_minutes: number
          p_notes: string
          p_reservation_id: string
          p_start_time: string
          p_title: string
          p_type: string
        }
        Returns: undefined
      }
      update_tournament: {
        Args: {
          p_category: string
          p_cover_image_url: string
          p_description: string
          p_entry_fee_amount: number
          p_estimated_duration_minutes: number
          p_max_pairs: number
          p_name: string
          p_prize_description: string
          p_registration_closes_at: string
          p_registration_opens_at: string
          p_secondary_category: string
          p_starts_at: string
          p_tournament_id: string
          p_visibility: string
        }
        Returns: {
          archived_at: string
          archived_by: string
          cancelled_at: string
          cancelled_by: string
          category: string
          club_id: string
          completed_at: string
          completed_by: string
          cover_image_url: string
          created_at: string
          created_by: string
          description: string
          entry_fee_amount: number
          estimated_duration_minutes: number
          id: string
          max_pairs: number
          name: string
          prize_description: string
          registration_closes_at: string
          registration_opens_at: string
          secondary_category: string
          slug: string
          started_at: string
          started_by: string
          starts_at: string
          status: string
          updated_at: string
          visibility: string
        }[]
      }
      update_tournament_cover_image: {
        Args: { p_cover_image_url: string; p_tournament_id: string }
        Returns: {
          archived_at: string
          archived_by: string
          cancelled_at: string
          cancelled_by: string
          category: string
          club_id: string
          completed_at: string
          completed_by: string
          cover_image_url: string
          created_at: string
          created_by: string
          description: string
          entry_fee_amount: number
          estimated_duration_minutes: number
          id: string
          max_pairs: number
          name: string
          prize_description: string
          registration_closes_at: string
          registration_opens_at: string
          secondary_category: string
          slug: string
          started_at: string
          started_by: string
          starts_at: string
          status: string
          updated_at: string
          visibility: string
        }[]
      }
      upsert_pricing_rule_with_prices: {
        Args: {
          p_club_id: string
          p_court_id: string
          p_days_of_week: number[]
          p_display_order: number
          p_end_time: string
          p_name: string
          p_prices: Json
          p_rule_id: string
          p_start_time: string
        }
        Returns: string
      }
      withdraw_tournament_entry: {
        Args: { p_tournament_entry_id: string }
        Returns: {
          category: string
          club_id: string
          confirmed_at: string
          confirmed_by: string
          created_at: string
          created_by: string
          id: string
          points: number
          rejected_at: string
          rejected_by: string
          rejection_reason: string
          secondary_category: string
          status: string
          tournament_id: string
          updated_at: string
          withdrawn_at: string
          withdrawn_by: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

// AUTO-APPENDED — do not edit above this line by hand, and do not add
// anything below it by hand either. Everything above is raw `supabase gen
// types` output; this link is re-added automatically every time by
// scripts/generate-types.sh (npm run types:generate). The actual
// hand-written types (Club, Tournament, ClubRole, PricingRule, etc.) live
// in ./domain.ts, which this file never contains directly — that's what
// lets database.ts be regenerated/overwritten safely at any time.
export * from "./domain";
