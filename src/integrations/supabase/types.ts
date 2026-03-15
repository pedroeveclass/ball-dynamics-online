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
