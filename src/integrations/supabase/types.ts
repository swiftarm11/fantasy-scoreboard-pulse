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
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      player_mappings: {
        Row: {
          alternate_names: Json | null
          created_at: string
          espn_id: string | null
          id: string
          is_active: boolean | null
          last_game_played: string | null
          last_updated: string
          name: string
          position: string
          sleeper_id: string | null
          tank01_id: string
          tank01_primary_id: string | null
          team: string
          yahoo_id: string | null
        }
        Insert: {
          alternate_names?: Json | null
          created_at?: string
          espn_id?: string | null
          id?: string
          is_active?: boolean | null
          last_game_played?: string | null
          last_updated?: string
          name: string
          position: string
          sleeper_id?: string | null
          tank01_id: string
          tank01_primary_id?: string | null
          team: string
          yahoo_id?: string | null
        }
        Update: {
          alternate_names?: Json | null
          created_at?: string
          espn_id?: string | null
          id?: string
          is_active?: boolean | null
          last_game_played?: string | null
          last_updated?: string
          name?: string
          position?: string
          sleeper_id?: string | null
          tank01_id?: string
          tank01_primary_id?: string | null
          team?: string
          yahoo_id?: string | null
        }
        Relationships: []
      }
      scoring_events: {
        Row: {
          created_at: string
          description: string
          event_type: string
          fantasy_points: number
          id: string
          league_id: string
          nfl_game_id: string | null
          nfl_week: number
          player_id: string
          player_name: string
          quarter: number | null
          season: number
          team_abbr: string
          team_id: string | null
          time_remaining: string | null
          timestamp: string
        }
        Insert: {
          created_at?: string
          description: string
          event_type: string
          fantasy_points: number
          id?: string
          league_id: string
          nfl_game_id?: string | null
          nfl_week: number
          player_id: string
          player_name: string
          quarter?: number | null
          season?: number
          team_abbr: string
          team_id?: string | null
          time_remaining?: string | null
          timestamp: string
        }
        Update: {
          created_at?: string
          description?: string
          event_type?: string
          fantasy_points?: number
          id?: string
          league_id?: string
          nfl_game_id?: string | null
          nfl_week?: number
          player_id?: string
          player_name?: string
          quarter?: number | null
          season?: number
          team_abbr?: string
          team_id?: string | null
          time_remaining?: string | null
          timestamp?: string
        }
        Relationships: []
      }
      sync_metadata: {
        Row: {
          active_players: number | null
          api_requests_used: number | null
          completed_at: string | null
          error_message: string | null
          id: string
          metadata: Json | null
          started_at: string
          status: string
          sync_type: string
          total_players: number | null
        }
        Insert: {
          active_players?: number | null
          api_requests_used?: number | null
          completed_at?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          started_at?: string
          status?: string
          sync_type: string
          total_players?: number | null
        }
        Update: {
          active_players?: number | null
          api_requests_used?: number | null
          completed_at?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          started_at?: string
          status?: string
          sync_type?: string
          total_players?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_player_by_platform: {
        Args: { platform_column: string; player_id: string }
        Returns: {
          alternate_names: Json
          created_at: string
          espn_id: string
          id: string
          is_active: boolean
          last_game_played: string
          last_updated: string
          name: string
          pos: string
          sleeper_id: string
          tank01_id: string
          tank01_primary_id: string
          team: string
          yahoo_id: string
        }[]
      }
      handle_tank01_player_list: { Args: never; Returns: undefined }
      secure_player_sync: {
        Args: { players_data: Json }
        Returns: {
          players_synced: number
          success: boolean
          sync_id: string
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
