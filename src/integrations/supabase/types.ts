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
  public: {
    Tables: {
      app_config: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      club_facilities: {
        Row: {
          club_id: string
          created_at: string
          facility_type: string
          id: string
          level: number
          upgraded_at: string | null
        }
        Insert: {
          club_id: string
          created_at?: string
          facility_type: string
          id?: string
          level?: number
          upgraded_at?: string | null
        }
        Update: {
          club_id?: string
          created_at?: string
          facility_type?: string
          id?: string
          level?: number
          upgraded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_facilities_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_finances: {
        Row: {
          balance: number
          club_id: string
          created_at: string
          debt_warning_since: string | null
          id: string
          projected_expense: number
          projected_income: number
          updated_at: string
          weekly_wage_bill: number
        }
        Insert: {
          balance?: number
          club_id: string
          created_at?: string
          debt_warning_since?: string | null
          id?: string
          projected_expense?: number
          projected_income?: number
          updated_at?: string
          weekly_wage_bill?: number
        }
        Update: {
          balance?: number
          club_id?: string
          created_at?: string
          debt_warning_since?: string | null
          id?: string
          projected_expense?: number
          projected_income?: number
          updated_at?: string
          weekly_wage_bill?: number
        }
        Relationships: [
          {
            foreignKeyName: "club_finances_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_position_demand: {
        Row: {
          club_id: string
          created_at: string
          id: string
          notes: string | null
          position: string
          priority: number
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          id?: string
          notes?: string | null
          position: string
          priority?: number
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          position?: string
          priority?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_position_demand_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_settings: {
        Row: {
          club_id: string
          created_at: string
          default_formation: string | null
          id: string
          play_style: string | null
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          default_formation?: string | null
          id?: string
          play_style?: string | null
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          default_formation?: string | null
          id?: string
          play_style?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_settings_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_uniforms: {
        Row: {
          club_id: string
          created_at: string
          id: string
          number_color: string
          pattern: string
          shirt_color: string
          stripe_color: string
          uniform_number: number
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          id?: string
          number_color: string
          pattern?: string
          shirt_color: string
          stripe_color?: string
          uniform_number: number
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          id?: string
          number_color?: string
          pattern?: string
          shirt_color?: string
          stripe_color?: string
          uniform_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_uniforms_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          assistant_manager_id: string | null
          city: string | null
          created_at: string
          crest_url: string | null
          id: string
          is_bot_managed: boolean
          league_id: string | null
          manager_profile_id: string
          name: string
          primary_color: string
          reputation: number
          secondary_color: string
          short_name: string
          status: string
        }
        Insert: {
          assistant_manager_id?: string | null
          city?: string | null
          created_at?: string
          crest_url?: string | null
          id?: string
          is_bot_managed?: boolean
          league_id?: string | null
          manager_profile_id: string
          name: string
          primary_color?: string
          reputation?: number
          secondary_color?: string
          short_name: string
          status?: string
        }
        Update: {
          assistant_manager_id?: string | null
          city?: string | null
          created_at?: string
          crest_url?: string | null
          id?: string
          is_bot_managed?: boolean
          league_id?: string | null
          manager_profile_id?: string
          name?: string
          primary_color?: string
          reputation?: number
          secondary_color?: string
          short_name?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "clubs_assistant_manager_id_fkey"
            columns: ["assistant_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clubs_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clubs_manager_profile_id_fkey"
            columns: ["manager_profile_id"]
            isOneToOne: true
            referencedRelation: "manager_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_training: {
        Row: {
          club_id: string
          created_at: string
          id: string
          last_trained_at: string | null
          level: number
          skill_type: string
          trained_formation: string | null
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          id?: string
          last_trained_at?: string | null
          level?: number
          skill_type: string
          trained_formation?: string | null
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          id?: string
          last_trained_at?: string | null
          level?: number
          skill_type?: string
          trained_formation?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_training_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_mutual_agreements: {
        Row: {
          contract_id: string
          created_at: string
          id: string
          requested_by: string
          requested_by_id: string
          resolved_at: string | null
          status: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          id?: string
          requested_by: string
          requested_by_id: string
          resolved_at?: string | null
          status?: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          id?: string
          requested_by?: string
          requested_by_id?: string
          resolved_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_mutual_agreements_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_offers: {
        Row: {
          club_id: string
          contract_length: number
          created_at: string
          id: string
          manager_profile_id: string
          message: string | null
          player_profile_id: string
          release_clause: number
          squad_role: string
          status: string
          updated_at: string
          weekly_salary: number
        }
        Insert: {
          club_id: string
          contract_length?: number
          created_at?: string
          id?: string
          manager_profile_id: string
          message?: string | null
          player_profile_id: string
          release_clause?: number
          squad_role?: string
          status?: string
          updated_at?: string
          weekly_salary?: number
        }
        Update: {
          club_id?: string
          contract_length?: number
          created_at?: string
          id?: string
          manager_profile_id?: string
          message?: string | null
          player_profile_id?: string
          release_clause?: number
          squad_role?: string
          status?: string
          updated_at?: string
          weekly_salary?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_offers_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_offers_manager_profile_id_fkey"
            columns: ["manager_profile_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_offers_player_profile_id_fkey"
            columns: ["player_profile_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          club_id: string | null
          created_at: string
          end_date: string | null
          id: string
          player_profile_id: string
          release_clause: number
          start_date: string
          status: string
          terminated_at: string | null
          termination_type: string | null
          updated_at: string
          weekly_salary: number
        }
        Insert: {
          club_id?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          player_profile_id: string
          release_clause?: number
          start_date?: string
          status?: string
          terminated_at?: string | null
          termination_type?: string | null
          updated_at?: string
          weekly_salary?: number
        }
        Update: {
          club_id?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          player_profile_id?: string
          release_clause?: number
          start_date?: string
          status?: string
          terminated_at?: string | null
          termination_type?: string | null
          updated_at?: string
          weekly_salary?: number
        }
        Relationships: [
          {
            foreignKeyName: "contracts_player_profile_id_fkey"
            columns: ["player_profile_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      forum_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          dislike_count: number
          id: string
          like_count: number
          topic_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          dislike_count?: number
          id?: string
          like_count?: number
          topic_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          dislike_count?: number
          id?: string
          like_count?: number
          topic_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "forum_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forum_comments_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "forum_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_reactions: {
        Row: {
          created_at: string
          id: string
          reaction: string
          target_id: string
          target_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reaction: string
          target_id: string
          target_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reaction?: string
          target_id?: string
          target_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forum_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_topics: {
        Row: {
          author_id: string
          body: string
          category_id: string
          comment_count: number
          created_at: string
          dislike_count: number
          id: string
          is_locked: boolean
          is_pinned: boolean
          last_activity_at: string
          like_count: number
          pin_order: number
          title: string
        }
        Insert: {
          author_id: string
          body: string
          category_id: string
          comment_count?: number
          created_at?: string
          dislike_count?: number
          id?: string
          is_locked?: boolean
          is_pinned?: boolean
          last_activity_at?: string
          like_count?: number
          pin_order?: number
          title: string
        }
        Update: {
          author_id?: string
          body?: string
          category_id?: string
          comment_count?: number
          created_at?: string
          dislike_count?: number
          id?: string
          is_locked?: boolean
          is_pinned?: boolean
          last_activity_at?: string
          like_count?: number
          pin_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "forum_topics_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forum_topics_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "forum_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      league_matches: {
        Row: {
          away_club_id: string
          created_at: string
          home_club_id: string
          id: string
          match_id: string | null
          round_id: string
        }
        Insert: {
          away_club_id: string
          created_at?: string
          home_club_id: string
          id?: string
          match_id?: string | null
          round_id: string
        }
        Update: {
          away_club_id?: string
          created_at?: string
          home_club_id?: string
          id?: string
          match_id?: string | null
          round_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_matches_away_club_id_fkey"
            columns: ["away_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_matches_home_club_id_fkey"
            columns: ["home_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_matches_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_matches_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "league_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      league_rounds: {
        Row: {
          created_at: string
          id: string
          round_number: number
          scheduled_at: string
          season_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          round_number: number
          scheduled_at: string
          season_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          round_number?: number
          scheduled_at?: string
          season_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_rounds_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "league_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      league_schedule_votes: {
        Row: {
          created_at: string
          id: string
          league_id: string
          manager_profile_id: string
          preferred_day_1: string
          preferred_day_2: string
          preferred_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          league_id: string
          manager_profile_id: string
          preferred_day_1?: string
          preferred_day_2?: string
          preferred_time?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          league_id?: string
          manager_profile_id?: string
          preferred_day_1?: string
          preferred_day_2?: string
          preferred_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_schedule_votes_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_schedule_votes_manager_profile_id_fkey"
            columns: ["manager_profile_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      league_seasons: {
        Row: {
          created_at: string
          finished_at: string | null
          id: string
          league_id: string
          next_season_at: string | null
          season_number: number
          started_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          finished_at?: string | null
          id?: string
          league_id: string
          next_season_at?: string | null
          season_number?: number
          started_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          finished_at?: string | null
          id?: string
          league_id?: string
          next_season_at?: string | null
          season_number?: number
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_seasons_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      league_standings: {
        Row: {
          club_id: string
          created_at: string
          drawn: number
          goals_against: number
          goals_for: number
          id: string
          lost: number
          played: number
          points: number
          season_id: string
          updated_at: string
          won: number
        }
        Insert: {
          club_id: string
          created_at?: string
          drawn?: number
          goals_against?: number
          goals_for?: number
          id?: string
          lost?: number
          played?: number
          points?: number
          season_id: string
          updated_at?: string
          won?: number
        }
        Update: {
          club_id?: string
          created_at?: string
          drawn?: number
          goals_against?: number
          goals_for?: number
          id?: string
          lost?: number
          played?: number
          points?: number
          season_id?: string
          updated_at?: string
          won?: number
        }
        Relationships: [
          {
            foreignKeyName: "league_standings_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_standings_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "league_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          country: string
          created_at: string
          division: number
          id: string
          match_day_1: string
          match_day_2: string
          match_time: string
          max_teams: number
          name: string
          status: string
        }
        Insert: {
          country?: string
          created_at?: string
          division?: number
          id?: string
          match_day_1?: string
          match_day_2?: string
          match_time?: string
          max_teams?: number
          name: string
          status?: string
        }
        Update: {
          country?: string
          created_at?: string
          division?: number
          id?: string
          match_day_1?: string
          match_day_2?: string
          match_time?: string
          max_teams?: number
          name?: string
          status?: string
        }
        Relationships: []
      }
      lineup_slots: {
        Row: {
          created_at: string
          id: string
          lineup_id: string
          player_profile_id: string
          role_type: string
          slot_position: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          lineup_id: string
          player_profile_id: string
          role_type?: string
          slot_position: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          lineup_id?: string
          player_profile_id?: string
          role_type?: string
          slot_position?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lineup_slots_lineup_id_fkey"
            columns: ["lineup_id"]
            isOneToOne: false
            referencedRelation: "lineups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineup_slots_player_profile_id_fkey"
            columns: ["player_profile_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lineups: {
        Row: {
          captain_player_id: string | null
          club_id: string
          corner_left_taker_id: string | null
          corner_right_taker_id: string | null
          created_at: string
          formation: string
          free_kick_taker_id: string | null
          id: string
          is_active: boolean
          name: string | null
          throw_in_left_taker_id: string | null
          throw_in_right_taker_id: string | null
          updated_at: string
        }
        Insert: {
          captain_player_id?: string | null
          club_id: string
          corner_left_taker_id?: string | null
          corner_right_taker_id?: string | null
          created_at?: string
          formation?: string
          free_kick_taker_id?: string | null
          id?: string
          is_active?: boolean
          name?: string | null
          throw_in_left_taker_id?: string | null
          throw_in_right_taker_id?: string | null
          updated_at?: string
        }
        Update: {
          captain_player_id?: string | null
          club_id?: string
          corner_left_taker_id?: string | null
          corner_right_taker_id?: string | null
          created_at?: string
          formation?: string
          free_kick_taker_id?: string | null
          id?: string
          is_active?: boolean
          name?: string | null
          throw_in_left_taker_id?: string | null
          throw_in_right_taker_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lineups_captain_player_id_fkey"
            columns: ["captain_player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineups_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineups_corner_left_taker_id_fkey"
            columns: ["corner_left_taker_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineups_corner_right_taker_id_fkey"
            columns: ["corner_right_taker_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineups_free_kick_taker_id_fkey"
            columns: ["free_kick_taker_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineups_throw_in_left_taker_id_fkey"
            columns: ["throw_in_left_taker_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineups_throw_in_right_taker_id_fkey"
            columns: ["throw_in_right_taker_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          club_id: string | null
          created_at: string
          id: string
          paid_at: string | null
          player_profile_id: string | null
          principal: number
          remaining: number
          status: string
          weekly_interest_rate: number
          weekly_payment: number
        }
        Insert: {
          club_id?: string | null
          created_at?: string
          id?: string
          paid_at?: string | null
          player_profile_id?: string | null
          principal: number
          remaining: number
          status?: string
          weekly_interest_rate?: number
          weekly_payment: number
        }
        Update: {
          club_id?: string | null
          created_at?: string
          id?: string
          paid_at?: string | null
          player_profile_id?: string | null
          principal?: number
          remaining?: number
          status?: string
          weekly_interest_rate?: number
          weekly_payment?: number
        }
        Relationships: [
          {
            foreignKeyName: "loans_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_player_profile_id_fkey"
            columns: ["player_profile_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      manager_profiles: {
        Row: {
          appearance: Json | null
          coach_type: string | null
          created_at: string
          full_name: string
          id: string
          money: number
          reputation: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          appearance?: Json | null
          coach_type?: string | null
          created_at?: string
          full_name: string
          id?: string
          money?: number
          reputation?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          appearance?: Json | null
          coach_type?: string | null
          created_at?: string
          full_name?: string
          id?: string
          money?: number
          reputation?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      match_actions: {
        Row: {
          action_type: string
          controlled_by_type: string
          controlled_by_user_id: string | null
          created_at: string
          id: string
          match_id: string
          match_turn_id: string
          participant_id: string
          payload: Json | null
          status: string
          target_participant_id: string | null
          target_x: number | null
          target_y: number | null
        }
        Insert: {
          action_type: string
          controlled_by_type?: string
          controlled_by_user_id?: string | null
          created_at?: string
          id?: string
          match_id: string
          match_turn_id: string
          participant_id: string
          payload?: Json | null
          status?: string
          target_participant_id?: string | null
          target_x?: number | null
          target_y?: number | null
        }
        Update: {
          action_type?: string
          controlled_by_type?: string
          controlled_by_user_id?: string | null
          created_at?: string
          id?: string
          match_id?: string
          match_turn_id?: string
          participant_id?: string
          payload?: Json | null
          status?: string
          target_participant_id?: string | null
          target_x?: number | null
          target_y?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "match_actions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_actions_match_turn_id_fkey"
            columns: ["match_turn_id"]
            isOneToOne: false
            referencedRelation: "match_turns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_actions_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "match_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_actions_target_participant_id_fkey"
            columns: ["target_participant_id"]
            isOneToOne: false
            referencedRelation: "match_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      match_availability: {
        Row: {
          confirmed_at: string
          league_match_id: string
          player_profile_id: string
        }
        Insert: {
          confirmed_at?: string
          league_match_id: string
          player_profile_id: string
        }
        Update: {
          confirmed_at?: string
          league_match_id?: string
          player_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_availability_league_match_id_fkey"
            columns: ["league_match_id"]
            isOneToOne: false
            referencedRelation: "league_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_availability_player_profile_id_fkey"
            columns: ["player_profile_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      match_challenges: {
        Row: {
          challenged_club_id: string
          challenged_manager_profile_id: string | null
          challenger_club_id: string
          challenger_manager_profile_id: string
          created_at: string
          id: string
          match_id: string | null
          message: string | null
          scheduled_at: string
          status: string
          updated_at: string
        }
        Insert: {
          challenged_club_id: string
          challenged_manager_profile_id?: string | null
          challenger_club_id: string
          challenger_manager_profile_id: string
          created_at?: string
          id?: string
          match_id?: string | null
          message?: string | null
          scheduled_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          challenged_club_id?: string
          challenged_manager_profile_id?: string | null
          challenger_club_id?: string
          challenger_manager_profile_id?: string
          created_at?: string
          id?: string
          match_id?: string | null
          message?: string | null
          scheduled_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_challenges_challenged_club_id_fkey"
            columns: ["challenged_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_challenges_challenged_manager_profile_id_fkey"
            columns: ["challenged_manager_profile_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_challenges_challenger_club_id_fkey"
            columns: ["challenger_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_challenges_challenger_manager_profile_id_fkey"
            columns: ["challenger_manager_profile_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_challenges_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_chat_messages: {
        Row: {
          created_at: string
          id: string
          match_id: string
          message: string
          user_id: string
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          message: string
          user_id: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          message?: string
          user_id?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_chat_messages_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_event_logs: {
        Row: {
          body: string
          created_at: string
          event_type: string
          id: string
          match_id: string
          payload: Json | null
          title: string
        }
        Insert: {
          body?: string
          created_at?: string
          event_type?: string
          id?: string
          match_id: string
          payload?: Json | null
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          event_type?: string
          id?: string
          match_id?: string
          payload?: Json | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_event_logs_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_participants: {
        Row: {
          club_id: string
          connected_user_id: string | null
          created_at: string
          id: string
          is_bot: boolean
          is_ready: boolean
          is_sent_off: boolean
          lineup_slot_id: string | null
          match_energy: number
          match_id: string
          pickup_slot_id: string | null
          player_profile_id: string | null
          pos_x: number | null
          pos_y: number | null
          role_type: string
          updated_at: string
          yellow_cards: number
        }
        Insert: {
          club_id: string
          connected_user_id?: string | null
          created_at?: string
          id?: string
          is_bot?: boolean
          is_ready?: boolean
          is_sent_off?: boolean
          lineup_slot_id?: string | null
          match_energy?: number
          match_id: string
          pickup_slot_id?: string | null
          player_profile_id?: string | null
          pos_x?: number | null
          pos_y?: number | null
          role_type?: string
          updated_at?: string
          yellow_cards?: number
        }
        Update: {
          club_id?: string
          connected_user_id?: string | null
          created_at?: string
          id?: string
          is_bot?: boolean
          is_ready?: boolean
          is_sent_off?: boolean
          lineup_slot_id?: string | null
          match_energy?: number
          match_id?: string
          pickup_slot_id?: string | null
          player_profile_id?: string | null
          pos_x?: number | null
          pos_y?: number | null
          role_type?: string
          updated_at?: string
          yellow_cards?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_participants_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_participants_lineup_slot_id_fkey"
            columns: ["lineup_slot_id"]
            isOneToOne: false
            referencedRelation: "lineup_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_participants_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_participants_player_profile_id_fkey"
            columns: ["player_profile_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      match_snapshots: {
        Row: {
          created_at: string
          id: string
          match_id: string
          snapshot: Json
          turn_number: number
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          snapshot: Json
          turn_number: number
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          snapshot?: Json
          turn_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_snapshots_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_turns: {
        Row: {
          ball_holder_participant_id: string | null
          ball_x: number | null
          ball_y: number | null
          created_at: string
          ends_at: string
          id: string
          match_id: string
          phase: string
          possession_club_id: string | null
          processing_started_at: string | null
          processing_token: string | null
          resolution_script: Json | null
          resolved_at: string | null
          set_piece_type: string | null
          started_at: string
          status: string
          turn_number: number
        }
        Insert: {
          ball_holder_participant_id?: string | null
          ball_x?: number | null
          ball_y?: number | null
          created_at?: string
          ends_at?: string
          id?: string
          match_id: string
          phase?: string
          possession_club_id?: string | null
          processing_started_at?: string | null
          processing_token?: string | null
          resolution_script?: Json | null
          resolved_at?: string | null
          set_piece_type?: string | null
          started_at?: string
          status?: string
          turn_number?: number
        }
        Update: {
          ball_holder_participant_id?: string | null
          ball_x?: number | null
          ball_y?: number | null
          created_at?: string
          ends_at?: string
          id?: string
          match_id?: string
          phase?: string
          possession_club_id?: string | null
          processing_started_at?: string | null
          processing_token?: string | null
          resolution_script?: Json | null
          resolved_at?: string | null
          set_piece_type?: string | null
          started_at?: string
          status?: string
          turn_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_turns_ball_holder_participant_id_fkey"
            columns: ["ball_holder_participant_id"]
            isOneToOne: false
            referencedRelation: "match_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_turns_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_turns_possession_club_id_fkey"
            columns: ["possession_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          away_club_id: string
          away_lineup_id: string | null
          away_score: number
          away_uniform: number
          created_at: string
          current_half: number
          current_phase: string | null
          current_turn_number: number
          engine_cache: Json | null
          finished_at: string | null
          half_started_at: string | null
          home_club_id: string
          home_lineup_id: string | null
          home_score: number
          home_uniform: number
          id: string
          injury_time_start_turn: number | null
          injury_time_turns: number
          match_type: string
          possession_club_id: string | null
          scheduled_at: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          away_club_id: string
          away_lineup_id?: string | null
          away_score?: number
          away_uniform?: number
          created_at?: string
          current_half?: number
          current_phase?: string | null
          current_turn_number?: number
          engine_cache?: Json | null
          finished_at?: string | null
          half_started_at?: string | null
          home_club_id: string
          home_lineup_id?: string | null
          home_score?: number
          home_uniform?: number
          id?: string
          injury_time_start_turn?: number | null
          injury_time_turns?: number
          match_type?: string
          possession_club_id?: string | null
          scheduled_at?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          away_club_id?: string
          away_lineup_id?: string | null
          away_score?: number
          away_uniform?: number
          created_at?: string
          current_half?: number
          current_phase?: string | null
          current_turn_number?: number
          engine_cache?: Json | null
          finished_at?: string | null
          half_started_at?: string | null
          home_club_id?: string
          home_lineup_id?: string | null
          home_score?: number
          home_uniform?: number
          id?: string
          injury_time_start_turn?: number | null
          injury_time_turns?: number
          match_type?: string
          possession_club_id?: string | null
          scheduled_at?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_away_club_id_fkey"
            columns: ["away_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_away_lineup_id_fkey"
            columns: ["away_lineup_id"]
            isOneToOne: false
            referencedRelation: "lineups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_home_club_id_fkey"
            columns: ["home_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_home_lineup_id_fkey"
            columns: ["home_lineup_id"]
            isOneToOne: false
            referencedRelation: "lineups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_possession_club_id_fkey"
            columns: ["possession_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          link: string | null
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      pickup_game_participants: {
        Row: {
          id: string
          joined_at: string
          pickup_game_id: string
          player_profile_id: string
          slot_id: string
          team_side: string
        }
        Insert: {
          id?: string
          joined_at?: string
          pickup_game_id: string
          player_profile_id: string
          slot_id: string
          team_side: string
        }
        Update: {
          id?: string
          joined_at?: string
          pickup_game_id?: string
          player_profile_id?: string
          slot_id?: string
          team_side?: string
        }
        Relationships: [
          {
            foreignKeyName: "pickup_game_participants_pickup_game_id_fkey"
            columns: ["pickup_game_id"]
            isOneToOne: false
            referencedRelation: "pickup_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickup_game_participants_player_profile_id_fkey"
            columns: ["player_profile_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pickup_games: {
        Row: {
          created_at: string
          created_by_profile_id: string
          format: string
          formation: string
          id: string
          kickoff_at: string
          match_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_profile_id: string
          format: string
          formation: string
          id?: string
          kickoff_at: string
          match_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_profile_id?: string
          format?: string
          formation?: string
          id?: string
          kickoff_at?: string
          match_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pickup_games_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickup_games_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      player_attributes: {
        Row: {
          aceleracao: number
          acuracia_chute: number
          agilidade: number
          antecipacao: number
          cabeceio: number
          comando_area: number
          controle_bola: number
          coragem: number
          created_at: string
          curva: number
          defesa_aerea: number
          desarme: number
          distribuicao_curta: number
          distribuicao_longa: number
          drible: number
          equilibrio: number
          forca: number
          forca_chute: number
          id: string
          marcacao: number
          passe_alto: number
          passe_baixo: number
          pegada: number
          player_profile_id: string
          posicionamento_defensivo: number
          posicionamento_gol: number
          posicionamento_ofensivo: number
          pulo: number
          reflexo: number
          resistencia: number
          saida_gol: number
          stamina: number
          tempo_reacao: number
          tomada_decisao: number
          trabalho_equipe: number
          um_contra_um: number
          um_toque: number
          updated_at: string
          velocidade: number
          visao_jogo: number
        }
        Insert: {
          aceleracao?: number
          acuracia_chute?: number
          agilidade?: number
          antecipacao?: number
          cabeceio?: number
          comando_area?: number
          controle_bola?: number
          coragem?: number
          created_at?: string
          curva?: number
          defesa_aerea?: number
          desarme?: number
          distribuicao_curta?: number
          distribuicao_longa?: number
          drible?: number
          equilibrio?: number
          forca?: number
          forca_chute?: number
          id?: string
          marcacao?: number
          passe_alto?: number
          passe_baixo?: number
          pegada?: number
          player_profile_id: string
          posicionamento_defensivo?: number
          posicionamento_gol?: number
          posicionamento_ofensivo?: number
          pulo?: number
          reflexo?: number
          resistencia?: number
          saida_gol?: number
          stamina?: number
          tempo_reacao?: number
          tomada_decisao?: number
          trabalho_equipe?: number
          um_contra_um?: number
          um_toque?: number
          updated_at?: string
          velocidade?: number
          visao_jogo?: number
        }
        Update: {
          aceleracao?: number
          acuracia_chute?: number
          agilidade?: number
          antecipacao?: number
          cabeceio?: number
          comando_area?: number
          controle_bola?: number
          coragem?: number
          created_at?: string
          curva?: number
          defesa_aerea?: number
          desarme?: number
          distribuicao_curta?: number
          distribuicao_longa?: number
          drible?: number
          equilibrio?: number
          forca?: number
          forca_chute?: number
          id?: string
          marcacao?: number
          passe_alto?: number
          passe_baixo?: number
          pegada?: number
          player_profile_id?: string
          posicionamento_defensivo?: number
          posicionamento_gol?: number
          posicionamento_ofensivo?: number
          pulo?: number
          reflexo?: number
          resistencia?: number
          saida_gol?: number
          stamina?: number
          tempo_reacao?: number
          tomada_decisao?: number
          trabalho_equipe?: number
          um_contra_um?: number
          um_toque?: number
          updated_at?: string
          velocidade?: number
          visao_jogo?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_attributes_player_profile_id_fkey"
            columns: ["player_profile_id"]
            isOneToOne: true
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_discipline: {
        Row: {
          id: string
          player_profile_id: string
          red_cards_accumulated: number
          season_id: string
          updated_at: string
          yellow_cards_accumulated: number
        }
        Insert: {
          id?: string
          player_profile_id: string
          red_cards_accumulated?: number
          season_id: string
          updated_at?: string
          yellow_cards_accumulated?: number
        }
        Update: {
          id?: string
          player_profile_id?: string
          red_cards_accumulated?: number
          season_id?: string
          updated_at?: string
          yellow_cards_accumulated?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_discipline_player_profile_id_fkey"
            columns: ["player_profile_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_discipline_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "league_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      player_match_stats: {
        Row: {
          assists: number
          clean_sheet: boolean
          club_id: string | null
          created_at: string
          fouls_committed: number
          gk_penalties_saved: number
          gk_saves: number
          goals: number
          goals_conceded: number
          id: string
          interceptions: number
          match_id: string
          minutes_played: number
          offsides: number
          participant_id: string | null
          passes_attempted: number
          passes_completed: number
          player_profile_id: string
          position: string | null
          red_cards: number
          season_id: string | null
          shots: number
          shots_on_target: number
          tackles: number
          yellow_cards: number
        }
        Insert: {
          assists?: number
          clean_sheet?: boolean
          club_id?: string | null
          created_at?: string
          fouls_committed?: number
          gk_penalties_saved?: number
          gk_saves?: number
          goals?: number
          goals_conceded?: number
          id?: string
          interceptions?: number
          match_id: string
          minutes_played?: number
          offsides?: number
          participant_id?: string | null
          passes_attempted?: number
          passes_completed?: number
          player_profile_id: string
          position?: string | null
          red_cards?: number
          season_id?: string | null
          shots?: number
          shots_on_target?: number
          tackles?: number
          yellow_cards?: number
        }
        Update: {
          assists?: number
          clean_sheet?: boolean
          club_id?: string | null
          created_at?: string
          fouls_committed?: number
          gk_penalties_saved?: number
          gk_saves?: number
          goals?: number
          goals_conceded?: number
          id?: string
          interceptions?: number
          match_id?: string
          minutes_played?: number
          offsides?: number
          participant_id?: string | null
          passes_attempted?: number
          passes_completed?: number
          player_profile_id?: string
          position?: string | null
          red_cards?: number
          season_id?: string | null
          shots?: number
          shots_on_target?: number
          tackles?: number
          yellow_cards?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_match_stats_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_match_stats_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "match_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_match_stats_player_profile_id_fkey"
            columns: ["player_profile_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_profiles: {
        Row: {
          age: number
          appearance: Json | null
          archetype: string
          club_id: string | null
          created_at: string
          dominant_foot: string
          energy_current: number
          energy_max: number
          full_name: string
          height: string
          id: string
          jersey_number: number | null
          last_auto_trained_date: string | null
          last_match_at: string | null
          last_trained_at: string | null
          money: number
          overall: number
          primary_position: string
          primary_position_changes: number
          reputation: number
          retirement_status: string
          secondary_position: string | null
          updated_at: string
          user_id: string | null
          weekly_salary: number
        }
        Insert: {
          age: number
          appearance?: Json | null
          archetype: string
          club_id?: string | null
          created_at?: string
          dominant_foot: string
          energy_current?: number
          energy_max?: number
          full_name: string
          height?: string
          id?: string
          jersey_number?: number | null
          last_auto_trained_date?: string | null
          last_match_at?: string | null
          last_trained_at?: string | null
          money?: number
          overall?: number
          primary_position: string
          primary_position_changes?: number
          reputation?: number
          retirement_status?: string
          secondary_position?: string | null
          updated_at?: string
          user_id?: string | null
          weekly_salary?: number
        }
        Update: {
          age?: number
          appearance?: Json | null
          archetype?: string
          club_id?: string | null
          created_at?: string
          dominant_foot?: string
          energy_current?: number
          energy_max?: number
          full_name?: string
          height?: string
          id?: string
          jersey_number?: number | null
          last_auto_trained_date?: string | null
          last_match_at?: string | null
          last_trained_at?: string | null
          money?: number
          overall?: number
          primary_position?: string
          primary_position_changes?: number
          reputation?: number
          retirement_status?: string
          secondary_position?: string | null
          updated_at?: string
          user_id?: string | null
          weekly_salary?: number
        }
        Relationships: []
      }
      player_suspensions: {
        Row: {
          club_id: string
          created_at: string
          id: string
          matches_remaining: number
          player_profile_id: string
          season_id: string | null
          source_match_id: string | null
          source_reason: string
        }
        Insert: {
          club_id: string
          created_at?: string
          id?: string
          matches_remaining?: number
          player_profile_id: string
          season_id?: string | null
          source_match_id?: string | null
          source_reason: string
        }
        Update: {
          club_id?: string
          created_at?: string
          id?: string
          matches_remaining?: number
          player_profile_id?: string
          season_id?: string | null
          source_match_id?: string | null
          source_reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_suspensions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_suspensions_player_profile_id_fkey"
            columns: ["player_profile_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_suspensions_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "league_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_suspensions_source_match_id_fkey"
            columns: ["source_match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      player_transfers: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          contract_months: number
          created_at: string
          from_club_id: string | null
          id: string
          player_profile_id: string
          release_clause: number
          requested_at: string
          status: string
          to_club_id: string
          transfer_fee: number
          weekly_salary: number
          window_month: string | null
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          contract_months?: number
          created_at?: string
          from_club_id?: string | null
          id?: string
          player_profile_id: string
          release_clause?: number
          requested_at?: string
          status?: string
          to_club_id: string
          transfer_fee?: number
          weekly_salary?: number
          window_month?: string | null
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          contract_months?: number
          created_at?: string
          from_club_id?: string | null
          id?: string
          player_profile_id?: string
          release_clause?: number
          requested_at?: string
          status?: string
          to_club_id?: string
          transfer_fee?: number
          weekly_salary?: number
          window_month?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_transfers_from_club_id_fkey"
            columns: ["from_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_transfers_player_profile_id_fkey"
            columns: ["player_profile_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_transfers_to_club_id_fkey"
            columns: ["to_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_player_profile_id: string | null
          avatar_char_ref: string | null
          avatar_url: string | null
          created_at: string
          id: string
          is_admin: boolean
          role_selected: string
          updated_at: string
          username: string
        }
        Insert: {
          active_player_profile_id?: string | null
          avatar_char_ref?: string | null
          avatar_url?: string | null
          created_at?: string
          id: string
          is_admin?: boolean
          role_selected?: string
          updated_at?: string
          username: string
        }
        Update: {
          active_player_profile_id?: string | null
          avatar_char_ref?: string | null
          avatar_url?: string | null
          created_at?: string
          id?: string
          is_admin?: boolean
          role_selected?: string
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_player_profile_id_fkey"
            columns: ["active_player_profile_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      season_aging_log: {
        Row: {
          bots_deleted: number
          humans_retired: number
          id: string
          players_aged: number
          players_decayed: number
          ran_at: string
          season_id: string
        }
        Insert: {
          bots_deleted: number
          humans_retired: number
          id?: string
          players_aged: number
          players_decayed: number
          ran_at?: string
          season_id: string
        }
        Update: {
          bots_deleted?: number
          humans_retired?: number
          id?: string
          players_aged?: number
          players_decayed?: number
          ran_at?: string
          season_id?: string
        }
        Relationships: []
      }
      situational_tactics: {
        Row: {
          attack_type: string
          club_id: string
          created_at: string
          formation: string
          id: string
          inclination: string
          phase: string
          positioning: string
          positions: Json
          updated_at: string
        }
        Insert: {
          attack_type?: string
          club_id: string
          created_at?: string
          formation: string
          id?: string
          inclination?: string
          phase: string
          positioning?: string
          positions?: Json
          updated_at?: string
        }
        Update: {
          attack_type?: string
          club_id?: string
          created_at?: string
          formation?: string
          id?: string
          inclination?: string
          phase?: string
          positioning?: string
          positions?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "situational_tactics_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      stadium_sectors: {
        Row: {
          capacity: number
          created_at: string
          id: string
          max_price: number
          min_price: number
          sector_label: string | null
          sector_type: string
          stadium_id: string
          ticket_price: number
        }
        Insert: {
          capacity?: number
          created_at?: string
          id?: string
          max_price?: number
          min_price?: number
          sector_label?: string | null
          sector_type: string
          stadium_id: string
          ticket_price?: number
        }
        Update: {
          capacity?: number
          created_at?: string
          id?: string
          max_price?: number
          min_price?: number
          sector_label?: string | null
          sector_type?: string
          stadium_id?: string
          ticket_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "stadium_sectors_stadium_id_fkey"
            columns: ["stadium_id"]
            isOneToOne: false
            referencedRelation: "stadiums"
            referencedColumns: ["id"]
          },
        ]
      }
      stadium_styles: {
        Row: {
          ad_board_color: string
          bench_color: string
          border_color: string
          club_id: string
          created_at: string
          id: string
          lighting: string
          net_pattern: string
          net_style: string
          pitch_pattern: string
          updated_at: string
        }
        Insert: {
          ad_board_color?: string
          bench_color?: string
          border_color?: string
          club_id: string
          created_at?: string
          id?: string
          lighting?: string
          net_pattern?: string
          net_style?: string
          pitch_pattern?: string
          updated_at?: string
        }
        Update: {
          ad_board_color?: string
          bench_color?: string
          border_color?: string
          club_id?: string
          created_at?: string
          id?: string
          lighting?: string
          net_pattern?: string
          net_style?: string
          pitch_pattern?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stadium_styles_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      stadiums: {
        Row: {
          capacity: number
          club_id: string
          created_at: string
          id: string
          maintenance_cost: number
          name: string
          prestige: number
          quality: number
        }
        Insert: {
          capacity?: number
          club_id: string
          created_at?: string
          id?: string
          maintenance_cost?: number
          name: string
          prestige?: number
          quality?: number
        }
        Update: {
          capacity?: number
          club_id?: string
          created_at?: string
          id?: string
          maintenance_cost?: number
          name?: string
          prestige?: number
          quality?: number
        }
        Relationships: [
          {
            foreignKeyName: "stadiums_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      store_items: {
        Row: {
          bonus_type: string | null
          bonus_value: number | null
          category: string
          created_at: string
          daily_purchase_limit: number | null
          description: string | null
          duration: string | null
          id: string
          is_available: boolean
          level: number | null
          max_level: number | null
          monthly_cost: number | null
          name: string
          price: number
          price_real: number | null
          sort_order: number
        }
        Insert: {
          bonus_type?: string | null
          bonus_value?: number | null
          category: string
          created_at?: string
          daily_purchase_limit?: number | null
          description?: string | null
          duration?: string | null
          id?: string
          is_available?: boolean
          level?: number | null
          max_level?: number | null
          monthly_cost?: number | null
          name: string
          price?: number
          price_real?: number | null
          sort_order?: number
        }
        Update: {
          bonus_type?: string | null
          bonus_value?: number | null
          category?: string
          created_at?: string
          daily_purchase_limit?: number | null
          description?: string | null
          duration?: string | null
          id?: string
          is_available?: boolean
          level?: number | null
          max_level?: number | null
          monthly_cost?: number | null
          name?: string
          price?: number
          price_real?: number | null
          sort_order?: number
        }
        Relationships: []
      }
      store_purchases: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          last_used_at: string | null
          level: number | null
          player_profile_id: string | null
          status: string
          store_item_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          level?: number | null
          player_profile_id?: string | null
          status?: string
          store_item_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          level?: number | null
          player_profile_id?: string | null
          status?: string
          store_item_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_purchases_player_profile_id_fkey"
            columns: ["player_profile_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_purchases_store_item_id_fkey"
            columns: ["store_item_id"]
            isOneToOne: false
            referencedRelation: "store_items"
            referencedColumns: ["id"]
          },
        ]
      }
      training_history: {
        Row: {
          attribute_key: string
          growth: number
          id: string
          new_value: number
          old_value: number
          player_profile_id: string
          trained_at: string
        }
        Insert: {
          attribute_key: string
          growth: number
          id?: string
          new_value: number
          old_value: number
          player_profile_id: string
          trained_at?: string
        }
        Update: {
          attribute_key?: string
          growth?: number
          id?: string
          new_value?: number
          old_value?: number
          player_profile_id?: string
          trained_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_history_player_profile_id_fkey"
            columns: ["player_profile_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      training_plans: {
        Row: {
          attribute_key: string
          created_at: string
          day_of_week: number
          id: string
          player_profile_id: string
          slot_index: number
          updated_at: string
        }
        Insert: {
          attribute_key: string
          created_at?: string
          day_of_week: number
          id?: string
          player_profile_id: string
          slot_index: number
          updated_at?: string
        }
        Update: {
          attribute_key?: string
          created_at?: string
          day_of_week?: number
          id?: string
          player_profile_id?: string
          slot_index?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_plans_player_profile_id_fkey"
            columns: ["player_profile_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _delete_bot_player: {
        Args: { p_player_profile_id: string }
        Returns: undefined
      }
      accept_mutual_exit: {
        Args: {
          p_agreement_id: string
          p_contract_id: string
          p_player_id: string
        }
        Returns: undefined
      }
      admin_adjust_club_balance: {
        Args: { p_amount: number; p_club_id: string }
        Returns: number
      }
      admin_adjust_player_money: {
        Args: { p_amount: number; p_player_id: string }
        Returns: number
      }
      admin_assign_player_to_club: {
        Args: { p_club_id: string; p_player_id: string }
        Returns: undefined
      }
      admin_fire_manager: { Args: { p_club_id: string }; Returns: undefined }
      admin_remove_player_from_club: {
        Args: { p_player_id: string }
        Returns: undefined
      }
      admin_search_players: {
        Args: { p_query: string }
        Returns: {
          club_id: string
          full_name: string
          id: string
          money: number
          overall: number
          primary_position: string
        }[]
      }
      admin_update_club: {
        Args: {
          p_city: string
          p_club_id: string
          p_formation: string
          p_name: string
          p_primary_color: string
          p_secondary_color: string
          p_short_name: string
        }
        Returns: undefined
      }
      advance_all_player_ages: { Args: { p_season_id: string }; Returns: Json }
      apply_aging_decay: {
        Args: { p_player_profile_id: string }
        Returns: Json
      }
      apply_league_schedule_votes: { Args: never; Returns: undefined }
      auto_train_attribute: {
        Args: { p_attribute_key: string; p_player_profile_id: string }
        Returns: Json
      }
      batch_update_participant_positions: {
        Args: { p_updates: Json }
        Returns: undefined
      }
      calculate_matchday_revenue: {
        Args: { p_club_id: string; p_opponent_reputation?: number }
        Returns: {
          capacity: number
          expected_attendance: number
          occupancy_pct: number
          sector_label: string
          sector_revenue: number
          sector_type: string
          ticket_price: number
        }[]
      }
      can_fire_just_cause: { Args: { p_player_id: string }; Returns: boolean }
      cancel_pickup_game: { Args: { p_pickup_id: string }; Returns: undefined }
      cancel_store_subscription: {
        Args: { p_purchase_id: string }
        Returns: Json
      }
      cancel_transfer: { Args: { p_transfer_id: string }; Returns: boolean }
      check_bankruptcies: { Args: never; Returns: number }
      claim_match_turn_for_processing: {
        Args: {
          p_match_id: string
          p_now?: string
          p_processing_token: string
          p_stale_after?: string
        }
        Returns: {
          ball_holder_participant_id: string | null
          ball_x: number | null
          ball_y: number | null
          created_at: string
          ends_at: string
          id: string
          match_id: string
          phase: string
          possession_club_id: string | null
          processing_started_at: string | null
          processing_token: string | null
          resolution_script: Json | null
          resolved_at: string | null
          set_piece_type: string | null
          started_at: string
          status: string
          turn_number: number
        }[]
        SetofOptions: {
          from: "*"
          to: "match_turns"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cleanup_old_snapshots: { Args: never; Returns: undefined }
      compute_onboarding_base_attrs: {
        Args: {
          p_body_type: string
          p_height: string
          p_primary_position: string
          p_user_id: string
        }
        Returns: Json
      }
      create_pickup_game: {
        Args: {
          p_format: string
          p_kickoff_at: string
          p_slot_id: string
          p_team_side: string
        }
        Returns: string
      }
      create_player_profile: {
        Args: {
          p_body_type: string
          p_dominant_foot: string
          p_extra_points: Json
          p_full_name: string
          p_height: string
          p_primary_position: string
        }
        Returns: string
      }
      current_user_active_club_id_uuid: { Args: never; Returns: string }
      current_user_can_edit_club: {
        Args: { p_club_id: string }
        Returns: boolean
      }
      current_user_is_club_member: {
        Args: { p_club_id: string }
        Returns: boolean
      }
      current_user_managed_club_id: { Args: never; Returns: string }
      current_user_manager_profile_id: { Args: never; Returns: string }
      current_user_player_profile_id: { Args: never; Returns: string }
      current_user_player_profile_ids: { Args: never; Returns: string[] }
      delete_player_profile: {
        Args: { p_player_id: string }
        Returns: undefined
      }
      equip_store_item: { Args: { p_purchase_id: string }; Returns: Json }
      fire_player: {
        Args: { p_club_id: string; p_fine_amount?: number; p_player_id: string }
        Returns: undefined
      }
      fire_player_just_cause: {
        Args: { p_club_id: string; p_player_id: string }
        Returns: boolean
      }
      get_aging_decay: {
        Args: { p_age: number; p_category: string }
        Returns: number
      }
      get_attribute_cap: {
        Args: {
          p_archetype: string
          p_attribute_key: string
          p_height: string
          p_position: string
        }
        Returns: number
      }
      get_attribute_decay_category: {
        Args: { p_attribute_key: string }
        Returns: string
      }
      get_bankruptcy_status: {
        Args: { p_club_id: string }
        Returns: {
          balance: number
          days_remaining: number
          debt_since: string
          is_in_debt: boolean
        }[]
      }
      get_club_starting_overall: {
        Args: { p_club_id: string }
        Returns: number
      }
      get_coach_bonuses: {
        Args: { p_club_id: string }
        Returns: {
          bonus_value: number
          level: number
          skill_type: string
          trained_formation: string
        }[]
      }
      get_facility_stats: {
        Args: { p_facility_type: string; p_level: number }
        Returns: {
          training_boost: number
          weekly_cost: number
          weekly_revenue: number
        }[]
      }
      get_facility_upgrade_cost: {
        Args: { p_current_level: number }
        Returns: number
      }
      get_human_counts_by_position: {
        Args: never
        Returns: {
          human_count: number
          pos: string
        }[]
      }
      get_my_club_demand: {
        Args: never
        Returns: {
          pos: string
          priority: number
        }[]
      }
      get_next_window_month: { Args: never; Returns: string }
      get_onboarding_preview: {
        Args: {
          p_body_type: string
          p_height: string
          p_primary_position: string
        }
        Returns: Json
      }
      get_pickup_lobby: {
        Args: { p_pickup_id: string }
        Returns: {
          full_name: string
          participant_id: string
          player_profile_id: string
          primary_position: string
          slot_id: string
          team_side: string
        }[]
      }
      get_position_demand_counts: {
        Args: never
        Returns: {
          demand_count: number
          pos: string
        }[]
      }
      get_training_multiplier: {
        Args: {
          p_archetype: string
          p_attribute_key: string
          p_height: string
          p_position: string
        }
        Returns: number
      }
      is_admin_caller: { Args: never; Returns: boolean }
      is_same_active_club_as_current_user: {
        Args: { _player_profile_id: string }
        Returns: boolean
      }
      is_transfer_window_open: { Args: never; Returns: boolean }
      join_pickup_game: {
        Args: { p_pickup_id: string; p_slot_id: string; p_team_side: string }
        Returns: undefined
      }
      leave_pickup_game: { Args: { p_pickup_id: string }; Returns: undefined }
      merge_match_action_payload: {
        Args: { p_action_id: string; p_patch: Json }
        Returns: undefined
      }
      payoff_loan: {
        Args: { p_entity_id: string; p_entity_type: string; p_loan_id: string }
        Returns: undefined
      }
      pickup_away_club_id: { Args: never; Returns: string }
      pickup_home_club_id: { Args: never; Returns: string }
      pickup_slot_ids: { Args: { p_format: string }; Returns: string[] }
      process_loan: {
        Args: {
          p_amount: number
          p_club_id: string
          p_duration_weeks: number
          p_entity_type: string
          p_interest_rate: number
          p_player_id: string
        }
        Returns: string
      }
      process_single_transfer: {
        Args: { p_transfer_id: string }
        Returns: boolean
      }
      process_transfer_window: { Args: never; Returns: number }
      purchase_store_item: {
        Args: {
          p_buyer_type?: string
          p_confirm_replace?: boolean
          p_player_profile_id: string
          p_store_item_id: string
        }
        Returns: Json
      }
      reactivate_store_subscription: {
        Args: { p_purchase_id: string }
        Returns: Json
      }
      release_match_turn_processing: {
        Args: { p_processing_token: string; p_turn_id: string }
        Returns: undefined
      }
      request_transfer: {
        Args: {
          p_contract_months?: number
          p_from_club_id: string
          p_player_id: string
          p_release_clause: number
          p_to_club_id: string
          p_transfer_fee: number
          p_weekly_salary: number
        }
        Returns: string
      }
      resolve_stale_active_turns: {
        Args: { p_match_id: string }
        Returns: number
      }
      retire_player: { Args: { p_player_profile_id: string }; Returns: Json }
      set_club_assistant_manager: {
        Args: { p_assistant_user_id: string; p_club_id: string }
        Returns: undefined
      }
      set_player_jersey_number: {
        Args: { p_jersey_number: number; p_player_id: string }
        Returns: undefined
      }
      toggle_club_position_demand: {
        Args: { p_position: string }
        Returns: boolean
      }
      toggle_forum_reaction: {
        Args: { p_reaction: string; p_target_id: string; p_target_type: string }
        Returns: Json
      }
      train_attribute: {
        Args: { p_attribute_key: string; p_player_profile_id: string }
        Returns: Json
      }
      train_coach_skill: {
        Args: { p_club_id: string; p_formation?: string; p_skill_type: string }
        Returns: boolean
      }
      transfer_player: {
        Args: {
          p_contract_months: number
          p_new_club_id: string
          p_new_release_clause: number
          p_new_salary: number
          p_old_contract_id: string
          p_player_id: string
        }
        Returns: undefined
      }
      trigger_match_engine: {
        Args: { delay_seconds?: number }
        Returns: undefined
      }
      unequip_store_item: { Args: { p_purchase_id: string }; Returns: Json }
      update_player_last_match: {
        Args: { p_match_id: string }
        Returns: undefined
      }
      upgrade_facility: {
        Args: { p_club_id: string; p_facility_type: string }
        Returns: Json
      }
      use_energetico: { Args: { p_purchase_id: string }; Returns: Json }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
