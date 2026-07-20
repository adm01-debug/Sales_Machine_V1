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
      agent_eval_cases: {
        Row: {
          agent_id: string | null
          created_at: string
          expected_channel: Database["public"]["Enums"]["sm_channel"] | null
          expected_intent: string
          id: string
          name: string
          notes: string | null
          signal_json: Json
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          expected_channel?: Database["public"]["Enums"]["sm_channel"] | null
          expected_intent: string
          id?: string
          name: string
          notes?: string | null
          signal_json: Json
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          expected_channel?: Database["public"]["Enums"]["sm_channel"] | null
          expected_intent?: string
          id?: string
          name?: string
          notes?: string | null
          signal_json?: Json
          updated_at?: string
        }
        Relationships: []
      }
      agent_eval_runs: {
        Row: {
          actual_output: Json
          case_id: string
          error: string | null
          id: string
          latency_ms: number | null
          passed: boolean
          ran_at: string
          ran_by: string | null
        }
        Insert: {
          actual_output?: Json
          case_id: string
          error?: string | null
          id?: string
          latency_ms?: number | null
          passed: boolean
          ran_at?: string
          ran_by?: string | null
        }
        Update: {
          actual_output?: Json
          case_id?: string
          error?: string | null
          id?: string
          latency_ms?: number | null
          passed?: boolean
          ran_at?: string
          ran_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_eval_runs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "agent_eval_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      cadence_rules: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          owner_id: string | null
          preset: Database["public"]["Enums"]["sm_cadence_preset"]
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
          preset?: Database["public"]["Enums"]["sm_cadence_preset"]
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
          preset?: Database["public"]["Enums"]["sm_cadence_preset"]
          steps?: Json
          updated_at?: string
        }
        Relationships: []
      }
      campaign_target_events: {
        Row: {
          actor: string
          created_at: string
          from_state: Database["public"]["Enums"]["sm_target_state"] | null
          id: string
          payload: Json
          reason: string | null
          target_id: string
          to_state: Database["public"]["Enums"]["sm_target_state"]
        }
        Insert: {
          actor?: string
          created_at?: string
          from_state?: Database["public"]["Enums"]["sm_target_state"] | null
          id?: string
          payload?: Json
          reason?: string | null
          target_id: string
          to_state: Database["public"]["Enums"]["sm_target_state"]
        }
        Update: {
          actor?: string
          created_at?: string
          from_state?: Database["public"]["Enums"]["sm_target_state"] | null
          id?: string
          payload?: Json
          reason?: string | null
          target_id?: string
          to_state?: Database["public"]["Enums"]["sm_target_state"]
        }
        Relationships: [
          {
            foreignKeyName: "campaign_target_events_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "campaign_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_targets: {
        Row: {
          attempts: number
          campaign_id: string
          created_at: string
          current_step: number
          entity_id: string
          id: string
          last_error: string | null
          last_transition_at: string
          locked_until: string | null
          max_attempts: number
          next_run_at: string
          state: Database["public"]["Enums"]["sm_target_state"]
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          campaign_id: string
          created_at?: string
          current_step?: number
          entity_id: string
          id?: string
          last_error?: string | null
          last_transition_at?: string
          locked_until?: string | null
          max_attempts?: number
          next_run_at?: string
          state?: Database["public"]["Enums"]["sm_target_state"]
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          campaign_id?: string
          created_at?: string
          current_step?: number
          entity_id?: string
          id?: string
          last_error?: string | null
          last_transition_at?: string
          locked_until?: string | null
          max_attempts?: number
          next_run_at?: string
          state?: Database["public"]["Enums"]["sm_target_state"]
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_targets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_orchestration"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_targets_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entity_map"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns_orchestration: {
        Row: {
          account_cooldown_hours: number
          cadence_preset: Database["public"]["Enums"]["sm_cadence_preset"]
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
          account_cooldown_hours?: number
          cadence_preset?: Database["public"]["Enums"]["sm_cadence_preset"]
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
          account_cooldown_hours?: number
          cadence_preset?: Database["public"]["Enums"]["sm_cadence_preset"]
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
          attempts: number
          campaign_id: string | null
          channel: Database["public"]["Enums"]["sm_channel"]
          created_at: string
          direction: Database["public"]["Enums"]["sm_direction"]
          email_in_reply_to: string | null
          email_message_id: string | null
          email_references: string[] | null
          entity_id: string
          error: string | null
          fatorx_thread_id: string | null
          id: string
          max_attempts: number
          next_retry_at: string | null
          payload: Json
          singu_interaction_id: string | null
          status: Database["public"]["Enums"]["sm_touchpoint_status"]
          updated_at: string
        }
        Insert: {
          attempts?: number
          campaign_id?: string | null
          channel: Database["public"]["Enums"]["sm_channel"]
          created_at?: string
          direction: Database["public"]["Enums"]["sm_direction"]
          email_in_reply_to?: string | null
          email_message_id?: string | null
          email_references?: string[] | null
          entity_id: string
          error?: string | null
          fatorx_thread_id?: string | null
          id?: string
          max_attempts?: number
          next_retry_at?: string | null
          payload?: Json
          singu_interaction_id?: string | null
          status?: Database["public"]["Enums"]["sm_touchpoint_status"]
          updated_at?: string
        }
        Update: {
          attempts?: number
          campaign_id?: string | null
          channel?: Database["public"]["Enums"]["sm_channel"]
          created_at?: string
          direction?: Database["public"]["Enums"]["sm_direction"]
          email_in_reply_to?: string | null
          email_message_id?: string | null
          email_references?: string[] | null
          entity_id?: string
          error?: string | null
          fatorx_thread_id?: string | null
          id?: string
          max_attempts?: number
          next_retry_at?: string | null
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
      sender_health: {
        Row: {
          bounced: number
          created_at: string
          daily_cap: number
          day: string
          id: string
          replied: number
          sender_id: string
          sent: number
          spam_reports: number
          updated_at: string
        }
        Insert: {
          bounced?: number
          created_at?: string
          daily_cap?: number
          day?: string
          id?: string
          replied?: number
          sender_id: string
          sent?: number
          spam_reports?: number
          updated_at?: string
        }
        Update: {
          bounced?: number
          created_at?: string
          daily_cap?: number
          day?: string
          id?: string
          replied?: number
          sender_id?: string
          sent?: number
          spam_reports?: number
          updated_at?: string
        }
        Relationships: []
      }
      signal_weights: {
        Row: {
          event_type: string
          half_life_hours: number
          updated_at: string
          weight: number
        }
        Insert: {
          event_type: string
          half_life_hours?: number
          updated_at?: string
          weight?: number
        }
        Update: {
          event_type?: string
          half_life_hours?: number
          updated_at?: string
          weight?: number
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
      compute_daily_cap: { Args: { _sender_id: string }; Returns: number }
      has_recent_account_touchpoint: {
        Args: { _entity_id: string; _hours: number }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      signal_score: { Args: { _entity_id: string }; Returns: number }
    }
    Enums: {
      app_role: "admin" | "operator" | "viewer"
      sm_cadence_preset: "aggressive" | "standard" | "enterprise" | "custom"
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
      sm_target_state:
        | "queued"
        | "running"
        | "paused"
        | "replied"
        | "stopped"
        | "lost"
        | "completed"
        | "dead_letter"
      sm_touchpoint_status:
        | "queued"
        | "sent"
        | "delivered"
        | "read"
        | "replied"
        | "failed"
        | "opted_out"
        | "pending_provider"
        | "dead_letter"
        | "pending_approval"
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
      sm_cadence_preset: ["aggressive", "standard", "enterprise", "custom"],
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
      sm_target_state: [
        "queued",
        "running",
        "paused",
        "replied",
        "stopped",
        "lost",
        "completed",
        "dead_letter",
      ],
      sm_touchpoint_status: [
        "queued",
        "sent",
        "delivered",
        "read",
        "replied",
        "failed",
        "opted_out",
        "pending_provider",
        "dead_letter",
        "pending_approval",
      ],
    },
  },
} as const
