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
      audience_members: {
        Row: {
          audience_id: string
          created_at: string
          entity_id: string
          id: string
          snapshot: Json
        }
        Insert: {
          audience_id: string
          created_at?: string
          entity_id: string
          id?: string
          snapshot?: Json
        }
        Update: {
          audience_id?: string
          created_at?: string
          entity_id?: string
          id?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "audience_members_audience_id_fkey"
            columns: ["audience_id"]
            isOneToOne: false
            referencedRelation: "audiences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audience_members_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entity_map"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audience_members_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "v_contact_profiles"
            referencedColumns: ["entity_id"]
          },
        ]
      }
      audiences: {
        Row: {
          archived: boolean
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          last_refreshed_at: string | null
          member_count: number
          name: string
          rules: Json
          updated_at: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          last_refreshed_at?: string | null
          member_count?: number
          name: string
          rules?: Json
          updated_at?: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          last_refreshed_at?: string | null
          member_count?: number
          name?: string
          rules?: Json
          updated_at?: string
        }
        Relationships: []
      }
      budget_reallocations: {
        Row: {
          actor_user_id: string | null
          applied_at: string
          changes: Json
          channels_changed: number
          id: string
          moved_total_brl: number
          total_after_brl: number
          total_before_brl: number
          transfers: Json
          unmet: Json
        }
        Insert: {
          actor_user_id?: string | null
          applied_at?: string
          changes?: Json
          channels_changed?: number
          id?: string
          moved_total_brl?: number
          total_after_brl?: number
          total_before_brl?: number
          transfers?: Json
          unmet?: Json
        }
        Update: {
          actor_user_id?: string | null
          applied_at?: string
          changes?: Json
          channels_changed?: number
          id?: string
          moved_total_brl?: number
          total_after_brl?: number
          total_before_brl?: number
          transfers?: Json
          unmet?: Json
        }
        Relationships: []
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
      campaign_sends: {
        Row: {
          attempts: number
          campaign_id: string
          created_at: string
          entity_id: string
          id: string
          last_error: string | null
          locked_until: string | null
          max_attempts: number
          next_run_at: string
          sent_at: string | null
          state: string
          touchpoint_id: string | null
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          attempts?: number
          campaign_id: string
          created_at?: string
          entity_id: string
          id?: string
          last_error?: string | null
          locked_until?: string | null
          max_attempts?: number
          next_run_at?: string
          sent_at?: string | null
          state?: string
          touchpoint_id?: string | null
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          attempts?: number
          campaign_id?: string
          created_at?: string
          entity_id?: string
          id?: string
          last_error?: string | null
          locked_until?: string | null
          max_attempts?: number
          next_run_at?: string
          sent_at?: string | null
          state?: string
          touchpoint_id?: string | null
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_sends_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_sends_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entity_map"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_sends_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "v_contact_profiles"
            referencedColumns: ["entity_id"]
          },
          {
            foreignKeyName: "campaign_sends_touchpoint_id_fkey"
            columns: ["touchpoint_id"]
            isOneToOne: false
            referencedRelation: "contact_touchpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_sends_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "campaign_variants"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "campaign_targets_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "v_contact_profiles"
            referencedColumns: ["entity_id"]
          },
        ]
      }
      campaign_variants: {
        Row: {
          body: string
          campaign_id: string
          created_at: string
          id: string
          label: string
          media_url: string | null
          rcs_payload: Json | null
          split_percent: number
          subject: string | null
          updated_at: string
        }
        Insert: {
          body: string
          campaign_id: string
          created_at?: string
          id?: string
          label?: string
          media_url?: string | null
          rcs_payload?: Json | null
          split_percent?: number
          subject?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          campaign_id?: string
          created_at?: string
          id?: string
          label?: string
          media_url?: string | null
          rcs_payload?: Json | null
          split_percent?: number
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_variants_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
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
      channel_budgets: {
        Row: {
          channel: string
          created_at: string
          daily_limit_brl: number
          enabled: boolean
          monthly_limit_brl: number
          note: string | null
          updated_at: string
        }
        Insert: {
          channel: string
          created_at?: string
          daily_limit_brl?: number
          enabled?: boolean
          monthly_limit_brl?: number
          note?: string | null
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          daily_limit_brl?: number
          enabled?: boolean
          monthly_limit_brl?: number
          note?: string | null
          updated_at?: string
        }
        Relationships: []
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
      consent_ledger: {
        Row: {
          channel: Database["public"]["Enums"]["sm_channel"]
          created_at: string
          entity_id: string
          evidence: Json
          id: string
          reason: string | null
          source: string
          status: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["sm_channel"]
          created_at?: string
          entity_id: string
          evidence?: Json
          id?: string
          reason?: string | null
          source: string
          status: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["sm_channel"]
          created_at?: string
          entity_id?: string
          evidence?: Json
          id?: string
          reason?: string | null
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "consent_ledger_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entity_map"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_ledger_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "v_contact_profiles"
            referencedColumns: ["entity_id"]
          },
        ]
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
          fuxico_tracking_id: string | null
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
          fuxico_tracking_id?: string | null
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
          fuxico_tracking_id?: string | null
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
          {
            foreignKeyName: "contact_touchpoints_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "v_contact_profiles"
            referencedColumns: ["entity_id"]
          },
        ]
      }
      email_deliverability_events: {
        Row: {
          created_at: string
          entity_id: string | null
          event_type: string
          external_id: string | null
          id: string
          provider: string
          raw: Json
          touchpoint_id: string | null
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          event_type: string
          external_id?: string | null
          id?: string
          provider: string
          raw?: Json
          touchpoint_id?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          event_type?: string
          external_id?: string | null
          id?: string
          provider?: string
          raw?: Json
          touchpoint_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_deliverability_events_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entity_map"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_deliverability_events_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "v_contact_profiles"
            referencedColumns: ["entity_id"]
          },
          {
            foreignKeyName: "email_deliverability_events_touchpoint_id_fkey"
            columns: ["touchpoint_id"]
            isOneToOne: false
            referencedRelation: "contact_touchpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_map: {
        Row: {
          created_at: string
          display_name: string | null
          fatorx_thread_id: string | null
          fuxico_id: string | null
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
          fuxico_id?: string | null
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
          fuxico_id?: string | null
          id?: string
          kind?: string
          lux_id?: string | null
          metadata?: Json
          singu_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      journey_edges: {
        Row: {
          branch: string
          created_at: string
          from_node_id: string
          id: string
          journey_id: string
          ordinal: number
          to_node_id: string
        }
        Insert: {
          branch?: string
          created_at?: string
          from_node_id: string
          id?: string
          journey_id: string
          ordinal?: number
          to_node_id: string
        }
        Update: {
          branch?: string
          created_at?: string
          from_node_id?: string
          id?: string
          journey_id?: string
          ordinal?: number
          to_node_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journey_edges_from_node_id_fkey"
            columns: ["from_node_id"]
            isOneToOne: false
            referencedRelation: "journey_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_edges_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "journeys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_edges_to_node_id_fkey"
            columns: ["to_node_id"]
            isOneToOne: false
            referencedRelation: "journey_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_enrollment_events: {
        Row: {
          action: string
          created_at: string
          detail: Json
          enrollment_id: string
          id: string
          node_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          detail?: Json
          enrollment_id: string
          id?: string
          node_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          detail?: Json
          enrollment_id?: string
          id?: string
          node_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journey_enrollment_events_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "journey_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_enrollment_events_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "journey_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_enrollments: {
        Row: {
          attempts: number
          context: Json
          created_at: string
          current_node_id: string | null
          entered_at: string
          entity_id: string
          finished_at: string | null
          id: string
          journey_id: string
          last_error: string | null
          locked_until: string | null
          next_run_at: string
          state: Database["public"]["Enums"]["sm_enrollment_state"]
          updated_at: string
        }
        Insert: {
          attempts?: number
          context?: Json
          created_at?: string
          current_node_id?: string | null
          entered_at?: string
          entity_id: string
          finished_at?: string | null
          id?: string
          journey_id: string
          last_error?: string | null
          locked_until?: string | null
          next_run_at?: string
          state?: Database["public"]["Enums"]["sm_enrollment_state"]
          updated_at?: string
        }
        Update: {
          attempts?: number
          context?: Json
          created_at?: string
          current_node_id?: string | null
          entered_at?: string
          entity_id?: string
          finished_at?: string | null
          id?: string
          journey_id?: string
          last_error?: string | null
          locked_until?: string | null
          next_run_at?: string
          state?: Database["public"]["Enums"]["sm_enrollment_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journey_enrollments_current_node_id_fkey"
            columns: ["current_node_id"]
            isOneToOne: false
            referencedRelation: "journey_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_enrollments_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entity_map"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_enrollments_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "v_contact_profiles"
            referencedColumns: ["entity_id"]
          },
          {
            foreignKeyName: "journey_enrollments_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "journeys"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_nodes: {
        Row: {
          config: Json
          created_at: string
          id: string
          journey_id: string
          kind: Database["public"]["Enums"]["sm_journey_node_kind"]
          label: string
          position_x: number
          position_y: number
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          journey_id: string
          kind: Database["public"]["Enums"]["sm_journey_node_kind"]
          label?: string
          position_x?: number
          position_y?: number
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          journey_id?: string
          kind?: Database["public"]["Enums"]["sm_journey_node_kind"]
          label?: string
          position_x?: number
          position_y?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journey_nodes_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "journeys"
            referencedColumns: ["id"]
          },
        ]
      }
      journeys: {
        Row: {
          allow_reentry: boolean
          created_at: string
          created_by: string | null
          description: string | null
          entry_daily_cap: number
          id: string
          metadata: Json
          name: string
          requires_human_approval: boolean
          send_window_end: number
          send_window_start: number
          status: Database["public"]["Enums"]["sm_journey_status"]
          updated_at: string
        }
        Insert: {
          allow_reentry?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_daily_cap?: number
          id?: string
          metadata?: Json
          name: string
          requires_human_approval?: boolean
          send_window_end?: number
          send_window_start?: number
          status?: Database["public"]["Enums"]["sm_journey_status"]
          updated_at?: string
        }
        Update: {
          allow_reentry?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_daily_cap?: number
          id?: string
          metadata?: Json
          name?: string
          requires_human_approval?: boolean
          send_window_end?: number
          send_window_start?: number
          status?: Database["public"]["Enums"]["sm_journey_status"]
          updated_at?: string
        }
        Relationships: []
      }
      lead_form_submissions: {
        Row: {
          company_name: string | null
          confirm_expires_at: string | null
          confirm_token_hash: string | null
          confirmed_at: string | null
          created_at: string
          email: string | null
          entity_id: string | null
          form_id: string
          full_name: string | null
          id: string
          ip_hash: string | null
          payload: Json
          phone: string | null
          status: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          company_name?: string | null
          confirm_expires_at?: string | null
          confirm_token_hash?: string | null
          confirmed_at?: string | null
          created_at?: string
          email?: string | null
          entity_id?: string | null
          form_id: string
          full_name?: string | null
          id?: string
          ip_hash?: string | null
          payload?: Json
          phone?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          company_name?: string | null
          confirm_expires_at?: string | null
          confirm_token_hash?: string | null
          confirmed_at?: string | null
          created_at?: string
          email?: string | null
          entity_id?: string | null
          form_id?: string
          full_name?: string | null
          id?: string
          ip_hash?: string | null
          payload?: Json
          phone?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_form_submissions_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entity_map"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_form_submissions_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "v_contact_profiles"
            referencedColumns: ["entity_id"]
          },
          {
            foreignKeyName: "lead_form_submissions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "lead_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_forms: {
        Row: {
          channel: Database["public"]["Enums"]["sm_channel"]
          confirm_ttl_hours: number
          consent_text: string
          created_at: string
          created_by: string | null
          description: string | null
          double_opt_in: boolean
          fields: Json
          id: string
          journey_id: string | null
          name: string
          slug: string
          status: string
          submission_count: number
          submit_label: string
          success_message: string
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["sm_channel"]
          confirm_ttl_hours?: number
          consent_text?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          double_opt_in?: boolean
          fields?: Json
          id?: string
          journey_id?: string | null
          name: string
          slug: string
          status?: string
          submission_count?: number
          submit_label?: string
          success_message?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["sm_channel"]
          confirm_ttl_hours?: number
          consent_text?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          double_opt_in?: boolean
          fields?: Json
          id?: string
          journey_id?: string | null
          name?: string
          slug?: string
          status?: string
          submission_count?: number
          submit_label?: string
          success_message?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_forms_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "journeys"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_campaigns: {
        Row: {
          audience_id: string | null
          channel: Database["public"]["Enums"]["sm_channel"]
          completed_at: string | null
          created_at: string
          created_by: string | null
          daily_cap: number
          id: string
          metadata: Json
          name: string
          objective: string
          requires_human_approval: boolean
          scheduled_at: string | null
          send_window_end: string | null
          send_window_start: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          audience_id?: string | null
          channel: Database["public"]["Enums"]["sm_channel"]
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          daily_cap?: number
          id?: string
          metadata?: Json
          name: string
          objective?: string
          requires_human_approval?: boolean
          scheduled_at?: string | null
          send_window_end?: string | null
          send_window_start?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          audience_id?: string | null
          channel?: Database["public"]["Enums"]["sm_channel"]
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          daily_cap?: number
          id?: string
          metadata?: Json
          name?: string
          objective?: string
          requires_human_approval?: boolean
          scheduled_at?: string | null
          send_window_end?: string | null
          send_window_start?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaigns_audience_id_fkey"
            columns: ["audience_id"]
            isOneToOne: false
            referencedRelation: "audiences"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          archived: boolean
          body: string
          channel: Database["public"]["Enums"]["sm_channel"]
          created_at: string
          created_by: string | null
          email_blocks: Json | null
          id: string
          media_url: string | null
          name: string
          rcs_payload: Json | null
          subject: string | null
          updated_at: string
          variables: Json
        }
        Insert: {
          archived?: boolean
          body: string
          channel: Database["public"]["Enums"]["sm_channel"]
          created_at?: string
          created_by?: string | null
          email_blocks?: Json | null
          id?: string
          media_url?: string | null
          name: string
          rcs_payload?: Json | null
          subject?: string | null
          updated_at?: string
          variables?: Json
        }
        Update: {
          archived?: boolean
          body?: string
          channel?: Database["public"]["Enums"]["sm_channel"]
          created_at?: string
          created_by?: string | null
          email_blocks?: Json | null
          id?: string
          media_url?: string | null
          name?: string
          rcs_payload?: Json | null
          subject?: string | null
          updated_at?: string
          variables?: Json
        }
        Relationships: []
      }
      ops_alert_notifications: {
        Row: {
          alert_id: string
          created_at: string
          detail: string
          first_notified_at: string
          id: string
          last_notified_at: string
          level: string
          occurrences: number
          resolved_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          alert_id: string
          created_at?: string
          detail: string
          first_notified_at?: string
          id?: string
          last_notified_at?: string
          level: string
          occurrences?: number
          resolved_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          alert_id?: string
          created_at?: string
          detail?: string
          first_notified_at?: string
          id?: string
          last_notified_at?: string
          level?: string
          occurrences?: number
          resolved_at?: string | null
          title?: string
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
      template_preflight_history: {
        Row: {
          created_at: string
          created_by: string | null
          findings: Json
          id: string
          score: number
          template_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          findings?: Json
          id?: string
          score: number
          template_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          findings?: Json
          id?: string
          score?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_preflight_history_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
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
      v_contact_profiles: {
        Row: {
          audience_count: number | null
          consent_by_channel: Json | null
          created_at: string | null
          display_name: string | null
          entity_id: string | null
          fatorx_thread_id: string | null
          inbound_count: number | null
          kind: string | null
          last_touch_at: string | null
          lux_id: string | null
          metadata: Json | null
          signal_score: number | null
          singu_id: string | null
          touchpoint_count: number | null
        }
        Insert: {
          audience_count?: never
          consent_by_channel?: never
          created_at?: string | null
          display_name?: string | null
          entity_id?: string | null
          fatorx_thread_id?: string | null
          inbound_count?: never
          kind?: string | null
          last_touch_at?: never
          lux_id?: string | null
          metadata?: Json | null
          signal_score?: never
          singu_id?: string | null
          touchpoint_count?: never
        }
        Update: {
          audience_count?: never
          consent_by_channel?: never
          created_at?: string | null
          display_name?: string | null
          entity_id?: string | null
          fatorx_thread_id?: string | null
          inbound_count?: never
          kind?: string | null
          last_touch_at?: never
          lux_id?: string | null
          metadata?: Json | null
          signal_score?: never
          singu_id?: string | null
          touchpoint_count?: never
        }
        Relationships: []
      }
      v_pipeline_health: {
        Row: {
          completed: number | null
          dead_letter: number | null
          lost: number | null
          opt_outs_7d: number | null
          paused: number | null
          queued: number | null
          refreshed_at: string | null
          replied: number | null
          replies_24h: number | null
          running: number | null
          sent_24h: number | null
          stopped: number | null
          total: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      check_consent: {
        Args: {
          _channel: Database["public"]["Enums"]["sm_channel"]
          _entity_id: string
        }
        Returns: boolean
      }
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
      refresh_pipeline_health: { Args: never; Returns: undefined }
      signal_score: { Args: { _entity_id: string }; Returns: number }
    }
    Enums: {
      app_role: "admin" | "operator" | "viewer"
      sm_cadence_preset: "aggressive" | "standard" | "enterprise" | "custom"
      sm_campaign_status: "draft" | "active" | "paused" | "archived"
      sm_channel:
        | "linkedin"
        | "whatsapp"
        | "email"
        | "sms"
        | "instagram"
        | "rcs"
        | "mms"
      sm_direction: "outbound" | "inbound"
      sm_enrollment_state:
        | "active"
        | "waiting"
        | "completed"
        | "exited"
        | "goal_reached"
        | "failed"
      sm_event_status:
        | "received"
        | "processing"
        | "processed"
        | "error"
        | "ignored"
      sm_journey_node_kind:
        | "trigger"
        | "send"
        | "wait"
        | "condition"
        | "split"
        | "goal"
        | "exit"
      sm_journey_status: "draft" | "active" | "paused" | "archived"
      sm_source: "lux" | "singu" | "fatorx" | "manual" | "fuxico"
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
      sm_channel: [
        "linkedin",
        "whatsapp",
        "email",
        "sms",
        "instagram",
        "rcs",
        "mms",
      ],
      sm_direction: ["outbound", "inbound"],
      sm_enrollment_state: [
        "active",
        "waiting",
        "completed",
        "exited",
        "goal_reached",
        "failed",
      ],
      sm_event_status: [
        "received",
        "processing",
        "processed",
        "error",
        "ignored",
      ],
      sm_journey_node_kind: [
        "trigger",
        "send",
        "wait",
        "condition",
        "split",
        "goal",
        "exit",
      ],
      sm_journey_status: ["draft", "active", "paused", "archived"],
      sm_source: ["lux", "singu", "fatorx", "manual", "fuxico"],
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
