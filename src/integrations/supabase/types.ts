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
      clubs: {
        Row: {
          city: string | null
          created_at: string
          id: string
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
            foreignKeyName: "clubs_manager_profile_id_fkey"
            columns: ["manager_profile_id"]
            isOneToOne: true
            referencedRelation: "manager_profiles"
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
          created_at: string
          full_name: string
          id: string
          money: number
          reputation: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id?: string
          money?: number
          reputation?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          money?: number
          reputation?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          id: string
          last_trained_at: string | null
          money: number
          overall: number
          primary_position: string
          reputation: number
          secondary_position: string | null
          updated_at: string
          user_id: string
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
          id?: string
          last_trained_at?: string | null
          money?: number
          overall?: number
          primary_position: string
          reputation?: number
          secondary_position?: string | null
          updated_at?: string
          user_id: string
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
          id?: string
          last_trained_at?: string | null
          money?: number
          overall?: number
          primary_position?: string
          reputation?: number
          secondary_position?: string | null
          updated_at?: string
          user_id?: string
          weekly_salary?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          role_selected: string
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          id: string
          role_selected?: string
          updated_at?: string
          username: string
        }
        Update: {
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
          sector_type: string
          stadium_id: string
          ticket_price: number
        }
        Insert: {
          capacity?: number
          created_at?: string
          id?: string
          sector_type: string
          stadium_id: string
          ticket_price?: number
        }
        Update: {
          capacity?: number
          created_at?: string
          id?: string
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
      [_ in never]: never
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
