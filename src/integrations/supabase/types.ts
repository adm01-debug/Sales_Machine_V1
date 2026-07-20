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
      cadence_rules: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          owner_id: string | null
          steps: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          owner_id?: string | null
          steps?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          owner_id?: string | null
          steps?: Json
          updated_at?: string
        }
        Relationships: []
      }
      campaigns_orchestration: {
        Row: {
          cadence_rule_id: string | null
          channels: Database["public"]["Enums"]["sm_channel"][]
          created_at: string
          description: string | null
          fatorx_agent_id: string | null
          icp_filter: Json
          id: string
          name: string
          owner_id: string | null
          requires_human_approval: boolean
          status: Database["public"]["Enums"]["sm_campaign_status"]
          updated_at: string
        }
        Insert: {
          cadence_rule_id?: string | null
          channels?: Database["public"]["Enums"]["sm_channel"][]
          created_at?: string
          description?: string | null
          fatorx_agent_id?: string | null
          icp_filter?: Json
          id?: string
          name: string
          owner_id?: string | null
          requires_human_approval?: boolean
          status?: Database["public"]["Enums"]["sm_campaign_status"]
          updated_at?: string
        }
        Update: {
          cadence_rule_id?: string | null
          channels?: Database["public"]["Enums"]["sm_channel"][]
          created_at?: string
          description?: string | null
          fatorx_agent_id?: string | null
          icp_filter?: Json
          id?: string
          name?: string
          owner_id?: string | null
          requires_human_approval?: boolean
          status?: Database["public"]["Enums"]["sm_campaign_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_orchestration_cadence_rule_id_fkey"
            columns: ["cadence_rule_id"]
            isOneToOne: false
            referencedRelation: "cadence_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_quotas: {
        Row: {
          channel: Database["public"]["Enums"]["sm_channel"]
          current_count: number
          daily_cap: number
          id: string
          reset_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["sm_channel"]
          current_count?: number
          daily_cap?: number
          id?: string
          reset_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["sm_channel"]
          current_count?: number
          daily_cap?: number
          id?: string
          reset_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      contact_touchpoints: {
        Row: {
          campaign_id: string | null
          channel: Database["public"]["Enums"]["sm_channel"]
          created_at: string
          direction: Database["public"]["Enums"]["sm_direction"]
          entity_id: string
          error: string | null
          fatorx_thread_id: string | null
          id: string
          payload: Json
          singu_interaction_id: string | null
          status: Database["public"]["Enums"]["sm_touchpoint_status"]
          updated_at: string
        }
        Insert: {
          campaign_id?: string | null
          channel: Database["public"]["Enums"]["sm_channel"]
          created_at?: string
          direction: Database["public"]["Enums"]["sm_direction"]
          entity_id: string
          error?: string | null
          fatorx_thread_id?: string | null
          id?: string
          payload?: Json
          singu_interaction_id?: string | null
          status?: Database["public"]["Enums"]["sm_touchpoint_status"]
          updated_at?: string
        }
        Update: {
          campaign_id?: string | null
          channel?: Database["public"]["Enums"]["sm_channel"]
          created_at?: string
          direction?: Database["public"]["Enums"]["sm_direction"]
          entity_id?: string
          error?: string | null
          fatorx_thread_id?: string | null
          id?: string
          payload?: Json
          singu_interaction_id?: string | null
          status?: Database["public"]["Enums"]["sm_touchpoint_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_touchpoints_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_orchestration"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_touchpoints_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entity_map"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_map: {
        Row: {
          created_at: string
          display_name: string | null
          fatorx_thread_id: string | null
          id: string
          kind: string
          lux_id: string | null
          metadata: Json
          singu_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          fatorx_thread_id?: string | null
          id?: string
          kind: string
          lux_id?: string | null
          metadata?: Json
          singu_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          fatorx_thread_id?: string | null
          id?: string
          kind?: string
          lux_id?: string | null
          metadata?: Json
          singu_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sales_machine_events: {
        Row: {
          error: string | null
          event_type: string
          external_id: string | null
          id: string
          payload: Json
          processed_at: string | null
          received_at: string
          source: Database["public"]["Enums"]["sm_source"]
          status: Database["public"]["Enums"]["sm_event_status"]
        }
        Insert: {
          error?: string | null
          event_type: string
          external_id?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          received_at?: string
          source: Database["public"]["Enums"]["sm_source"]
          status?: Database["public"]["Enums"]["sm_event_status"]
        }
        Update: {
          error?: string | null
          event_type?: string
          external_id?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          received_at?: string
          source?: Database["public"]["Enums"]["sm_source"]
          status?: Database["public"]["Enums"]["sm_event_status"]
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "operator" | "viewer"
      sm_campaign_status: "draft" | "active" | "paused" | "archived"
      sm_channel: "linkedin" | "whatsapp" | "email" | "sms" | "instagram"
      sm_direction: "outbound" | "inbound"
      sm_event_status:
        | "received"
        | "processing"
        | "processed"
        | "error"
        | "ignored"
      sm_source: "lux" | "singu" | "fatorx" | "manual"
      sm_touchpoint_status:
        | "queued"
        | "sent"
        | "delivered"
        | "read"
        | "replied"
        | "failed"
        | "opted_out"
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
    Enums: {
      app_role: ["admin", "operator", "viewer"],
      sm_campaign_status: ["draft", "active", "paused", "archived"],
      sm_channel: ["linkedin", "whatsapp", "email", "sms", "instagram"],
      sm_direction: ["outbound", "inbound"],
      sm_event_status: [
        "received",
        "processing",
        "processed",
        "error",
        "ignored",
      ],
      sm_source: ["lux", "singu", "fatorx", "manual"],
      sm_touchpoint_status: [
        "queued",
        "sent",
        "delivered",
        "read",
        "replied",
        "failed",
        "opted_out",
      ],
    },
  },
} as const
