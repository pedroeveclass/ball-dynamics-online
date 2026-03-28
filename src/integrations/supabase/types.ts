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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
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
          shirt_color: string
          uniform_number: number
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          id?: string
          number_color: string
          shirt_color: string
          uniform_number: number
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          id?: string
          number_color?: string
          shirt_color?: string
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
          city: string | null
          created_at: string
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
          city?: string | null
          created_at?: string
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
          city?: string | null
          created_at?: string
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
          club_id: string
          created_at: string
          formation: string
          id: string
          is_active: boolean
          name: string | null
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          formation?: string
          id?: string
          is_active?: boolean
          name?: string | null
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          formation?: string
          id?: string
          is_active?: boolean
          name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lineups_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      manager_profiles: {
        Row: {
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
          match_id: string
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
          match_id: string
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
          match_id?: string
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
      match_turns: {
        Row: {
          ball_holder_participant_id: string | null
          created_at: string
          ends_at: string
          id: string
          match_id: string
          phase: string
          possession_club_id: string | null
          processing_started_at: string | null
          processing_token: string | null
          resolved_at: string | null
          set_piece_type: string | null
          started_at: string
          status: string
          turn_number: number
        }
        Insert: {
          ball_holder_participant_id?: string | null
          created_at?: string
          ends_at?: string
          id?: string
          match_id: string
          phase?: string
          possession_club_id?: string | null
          processing_started_at?: string | null
          processing_token?: string | null
          resolved_at?: string | null
          set_piece_type?: string | null
          started_at?: string
          status?: string
          turn_number?: number
        }
        Update: {
          ball_holder_participant_id?: string | null
          created_at?: string
          ends_at?: string
          id?: string
          match_id?: string
          phase?: string
          possession_club_id?: string | null
          processing_started_at?: string | null
          processing_token?: string | null
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
          finished_at: string | null
          half_started_at: string | null
          home_club_id: string
          home_lineup_id: string | null
          home_score: number
          home_uniform: number
          id: string
          injury_time_start_turn: number | null
          injury_time_turns: number
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
          finished_at?: string | null
          half_started_at?: string | null
          home_club_id: string
          home_lineup_id?: string | null
          home_score?: number
          home_uniform?: number
          id?: string
          injury_time_start_turn?: number | null
          injury_time_turns?: number
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
          finished_at?: string | null
          half_started_at?: string | null
          home_club_id?: string
          home_lineup_id?: string | null
          home_score?: number
          home_uniform?: number
          id?: string
          injury_time_start_turn?: number | null
          injury_time_turns?: number
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
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
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
      player_profiles: {
        Row: {
          age: number
          archetype: string
          club_id: string | null
          created_at: string
          dominant_foot: string
          energy_current: number
          energy_max: number
          full_name: string
          height: string
          id: string
          last_trained_at: string | null
          money: number
          overall: number
          primary_position: string
          reputation: number
          secondary_position: string | null
          updated_at: string
          user_id: string | null
          weekly_salary: number
        }
        Insert: {
          age: number
          archetype: string
          club_id?: string | null
          created_at?: string
          dominant_foot: string
          energy_current?: number
          energy_max?: number
          full_name: string
          height?: string
          id?: string
          last_trained_at?: string | null
          money?: number
          overall?: number
          primary_position: string
          reputation?: number
          secondary_position?: string | null
          updated_at?: string
          user_id?: string | null
          weekly_salary?: number
        }
        Update: {
          age?: number
          archetype?: string
          club_id?: string | null
          created_at?: string
          dominant_foot?: string
          energy_current?: number
          energy_max?: number
          full_name?: string
          height?: string
          id?: string
          last_trained_at?: string | null
          money?: number
          overall?: number
          primary_position?: string
          reputation?: number
          secondary_position?: string | null
          updated_at?: string
          user_id?: string | null
          weekly_salary?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          role_selected: string
          updated_at: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id: string
          role_selected?: string
          updated_at?: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          role_selected?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
      claim_match_turn_for_processing: {
        Args: {
          p_match_id: string
          p_now?: string
          p_processing_token: string
          p_stale_after?: string
        }
        Returns: {
          ball_holder_participant_id: string | null
          created_at: string
          ends_at: string
          id: string
          match_id: string
          phase: string
          possession_club_id: string | null
          processing_started_at: string | null
          processing_token: string | null
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
      current_user_active_club_id_uuid: { Args: never; Returns: string }
      current_user_managed_club_id: { Args: never; Returns: string }
      current_user_manager_profile_id: { Args: never; Returns: string }
      current_user_player_profile_id: { Args: never; Returns: string }
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
      is_same_active_club_as_current_user: {
        Args: { _player_profile_id: string }
        Returns: boolean
      }
      release_club_to_bot: { Args: { p_club_id: string }; Returns: undefined }
      release_match_turn_processing: {
        Args: { p_processing_token: string; p_turn_id: string }
        Returns: undefined
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
