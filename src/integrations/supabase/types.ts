import type {
  ManagedQuote,
  ManagedOrder,
  PhoneVerification,
  NumberCharge,
  ManagedTable,
} from "@/lib/managed-telephony.types";
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      managed_number_quotes: ManagedTable<
        ManagedQuote,
        | "workspace_id"
        | "e164"
        | "monthly_cents"
        | "setup_cents"
        | "inbound_rate"
        | "carrier_monthly_cents"
        | "carrier_setup_cents"
      >;
      managed_number_orders: ManagedTable<
        ManagedOrder,
        "id" | "workspace_id" | "quote_id" | "number_id"
      >;
      phone_verifications: ManagedTable<
        PhoneVerification,
        "workspace_id" | "number_id" | "agent_id" | "environment_id" | "agent_version"
      >;
      managed_call_charges: ManagedTable<
        Omit<NumberCharge, "period"> & { conversation_id: string },
        "workspace_id" | "order_id" | "conversation_id" | "amount_cents"
      >;
      managed_number_charges: ManagedTable<
        NumberCharge,
        "workspace_id" | "order_id" | "period" | "amount_cents" | "description"
      >;

      runtime_event_batches: {
        Row: { id: string; workspace_id: string; conversation_id: string; created_at: string };
        Insert: { id: string; workspace_id: string; conversation_id: string; created_at?: string };
        Update: {
          id?: string;
          workspace_id?: string;
          conversation_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "runtime_event_batches_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "runtime_event_batches_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_knowledge_bases: {
        Row: {
          agent_id: string;
          knowledge_base_id: string;
          workspace_id: string;
        };
        Insert: {
          agent_id: string;
          knowledge_base_id: string;
          workspace_id: string;
        };
        Update: {
          agent_id?: string;
          knowledge_base_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_knowledge_bases_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_knowledge_bases_knowledge_base_id_fkey";
            columns: ["knowledge_base_id"];
            isOneToOne: false;
            referencedRelation: "knowledge_bases";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_knowledge_bases_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_tool_bindings: {
        Row: {
          agent_id: string;
          confirmation_mode: string;
          created_at: string;
          created_by: string | null;
          enabled: boolean;
          input_mapping: Json;
          output_budget_bytes: number;
          requirement: string;
          timeout_ms: number | null;
          tool_id: string;
          tool_revision_id: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          agent_id: string;
          confirmation_mode?: string;
          created_at?: string;
          created_by?: string | null;
          enabled?: boolean;
          input_mapping?: Json;
          output_budget_bytes?: number;
          requirement?: string;
          timeout_ms?: number | null;
          tool_id: string;
          tool_revision_id: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          agent_id?: string;
          confirmation_mode?: string;
          created_at?: string;
          created_by?: string | null;
          enabled?: boolean;
          input_mapping?: Json;
          output_budget_bytes?: number;
          requirement?: string;
          timeout_ms?: number | null;
          tool_id?: string;
          tool_revision_id?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_tool_bindings_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_tool_bindings_tool_id_fkey";
            columns: ["tool_id"];
            isOneToOne: false;
            referencedRelation: "tool_definitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_tool_bindings_tool_revision_id_fkey";
            columns: ["tool_revision_id"];
            isOneToOne: false;
            referencedRelation: "tool_revisions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_tool_bindings_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_tools: {
        Row: {
          agent_id: string;
          tool_id: string;
          workspace_id: string;
        };
        Insert: {
          agent_id: string;
          tool_id: string;
          workspace_id: string;
        };
        Update: {
          agent_id?: string;
          tool_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_tools_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_tools_tool_id_fkey";
            columns: ["tool_id"];
            isOneToOne: false;
            referencedRelation: "tools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_tools_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_versions: {
        Row: {
          agent_id: string;
          checksum: string;
          config: Json;
          created_at: string;
          id: string;
          published_by: string;
          release_note: string | null;
          version: number;
          workspace_id: string;
        };
        Insert: {
          agent_id: string;
          checksum: string;
          config: Json;
          created_at?: string;
          id?: string;
          published_by?: string;
          release_note?: string | null;
          version: number;
          workspace_id: string;
        };
        Update: {
          agent_id?: string;
          checksum?: string;
          config?: Json;
          created_at?: string;
          id?: string;
          published_by?: string;
          release_note?: string | null;
          version?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_versions_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_versions_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      agents: {
        Row: {
          config: Json;
          created_at: string;
          description: string;
          id: string;
          live_version: number | null;
          name: string;
          status: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          config?: Json;
          created_at?: string;
          description?: string;
          id?: string;
          live_version?: number | null;
          name: string;
          status?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          config?: Json;
          created_at?: string;
          description?: string;
          id?: string;
          live_version?: number | null;
          name?: string;
          status?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agents_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      api_keys: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          key_hash: string;
          last_used_at: string | null;
          name: string;
          prefix: string;
          revoked_at: string | null;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          key_hash: string;
          last_used_at?: string | null;
          name: string;
          prefix: string;
          revoked_at?: string | null;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          key_hash?: string;
          last_used_at?: string | null;
          name?: string;
          prefix?: string;
          revoked_at?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "api_keys_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      api_request_logs: {
        Row: {
          api_key_id: string | null;
          created_at: string;
          duration_ms: number;
          id: string;
          method: string;
          path: string;
          status: number;
          workspace_id: string;
        };
        Insert: {
          api_key_id?: string | null;
          created_at?: string;
          duration_ms?: number;
          id?: string;
          method: string;
          path: string;
          status: number;
          workspace_id: string;
        };
        Update: {
          api_key_id?: string | null;
          created_at?: string;
          duration_ms?: number;
          id?: string;
          method?: string;
          path?: string;
          status?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "api_request_logs_api_key_id_fkey";
            columns: ["api_key_id"];
            isOneToOne: false;
            referencedRelation: "api_keys";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "api_request_logs_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_events: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          id: string;
          metadata: Json;
          org_id: string | null;
          target: string | null;
          workspace_id: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          id?: string;
          metadata?: Json;
          org_id?: string | null;
          target?: string | null;
          workspace_id?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          id?: string;
          metadata?: Json;
          org_id?: string | null;
          target?: string | null;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_events_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_events_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      connector_discovery_runs: {
        Row: {
          actor: string | null;
          catalog_hash: string | null;
          connector_id: string;
          drift: Json;
          error_code: string | null;
          finished_at: string | null;
          id: string;
          protocol_version: string | null;
          started_at: string;
          status: string;
          tool_count: number;
          workspace_id: string;
        };
        Insert: {
          actor?: string | null;
          catalog_hash?: string | null;
          connector_id: string;
          drift?: Json;
          error_code?: string | null;
          finished_at?: string | null;
          id?: string;
          protocol_version?: string | null;
          started_at?: string;
          status: string;
          tool_count?: number;
          workspace_id: string;
        };
        Update: {
          actor?: string | null;
          catalog_hash?: string | null;
          connector_id?: string;
          drift?: Json;
          error_code?: string | null;
          finished_at?: string | null;
          id?: string;
          protocol_version?: string | null;
          started_at?: string;
          status?: string;
          tool_count?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "connector_discovery_runs_connector_id_fkey";
            columns: ["connector_id"];
            isOneToOne: false;
            referencedRelation: "tool_connectors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "connector_discovery_runs_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      conversation_tags: {
        Row: {
          conversation_id: string;
          created_at: string;
          id: string;
          tag: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          conversation_id: string;
          created_at?: string;
          id?: string;
          tag: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          conversation_id?: string;
          created_at?: string;
          id?: string;
          tag?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_tags_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_tags_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      conversation_turns: {
        Row: {
          content: string;
          conversation_id: string;
          created_at: string;
          id: string;
          role: string;
          seq: number;
          workspace_id: string;
        };
        Insert: {
          content: string;
          conversation_id: string;
          created_at?: string;
          id?: string;
          role: string;
          seq: number;
          workspace_id: string;
        };
        Update: {
          content?: string;
          conversation_id?: string;
          created_at?: string;
          id?: string;
          role?: string;
          seq?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_turns_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_turns_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      conversations: {
        Row: {
          phone_number_id: string | null;
          caller_number: string | null;
          runtime_bundle_id: string | null;
          agent_id: string | null;
          agent_version: number | null;
          channel: string;
          deployment_id: string | null;
          duration_seconds: number | null;
          ended_at: string | null;
          environment_id: string | null;
          id: string;
          runtime_mode: string | null;
          session_ref: string | null;
          started_at: string;
          started_by: string | null;
          status: string;
          summary: string | null;
          workspace_id: string;
        };
        Insert: {
          phone_number_id?: string | null;
          caller_number?: string | null;
          runtime_bundle_id?: string | null;
          agent_id?: string | null;
          agent_version?: number | null;
          channel?: string;
          deployment_id?: string | null;
          duration_seconds?: number | null;
          ended_at?: string | null;
          environment_id?: string | null;
          id?: string;
          runtime_mode?: string | null;
          session_ref?: string | null;
          started_at?: string;
          started_by?: string | null;
          status?: string;
          summary?: string | null;
          workspace_id: string;
        };
        Update: {
          phone_number_id?: string | null;
          caller_number?: string | null;
          runtime_bundle_id?: string | null;
          agent_id?: string | null;
          agent_version?: number | null;
          channel?: string;
          deployment_id?: string | null;
          duration_seconds?: number | null;
          ended_at?: string | null;
          environment_id?: string | null;
          id?: string;
          runtime_mode?: string | null;
          session_ref?: string | null;
          started_at?: string;
          started_by?: string | null;
          status?: string;
          summary?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_deployment_fk";
            columns: ["deployment_id"];
            isOneToOne: false;
            referencedRelation: "deployments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_environment_id_fkey";
            columns: ["environment_id"];
            isOneToOne: false;
            referencedRelation: "environments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      demo_requests: {
        Row: {
          company: string | null;
          created_at: string;
          email: string;
          id: string;
          message: string | null;
          name: string;
          team_size: string | null;
        };
        Insert: {
          company?: string | null;
          created_at?: string;
          email: string;
          id?: string;
          message?: string | null;
          name: string;
          team_size?: string | null;
        };
        Update: {
          company?: string | null;
          created_at?: string;
          email?: string;
          id?: string;
          message?: string | null;
          name?: string;
          team_size?: string | null;
        };
        Relationships: [];
      };
      deployments: {
        Row: {
          agent_id: string;
          agent_version: number;
          bundle_id: string;
          canary_percent: number;
          created_at: string;
          created_by: string | null;
          environment_id: string;
          id: string;
          status: string;
          workspace_id: string;
        };
        Insert: {
          agent_id: string;
          agent_version: number;
          bundle_id: string;
          canary_percent?: number;
          created_at?: string;
          created_by?: string | null;
          environment_id: string;
          id?: string;
          status?: string;
          workspace_id: string;
        };
        Update: {
          agent_id?: string;
          agent_version?: number;
          bundle_id?: string;
          canary_percent?: number;
          created_at?: string;
          created_by?: string | null;
          environment_id?: string;
          id?: string;
          status?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deployments_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deployments_bundle_id_fkey";
            columns: ["bundle_id"];
            isOneToOne: false;
            referencedRelation: "runtime_bundles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deployments_environment_id_fkey";
            columns: ["environment_id"];
            isOneToOne: false;
            referencedRelation: "environments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deployments_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      domain_events: {
        Row: {
          created_at: string;
          delivery_lease_at: string | null;
          delivery_token: string | null;
          id: string;
          payload: Json;
          processed_at: string | null;
          schema_version: number;
          type: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          delivery_lease_at?: string | null;
          delivery_token?: string | null;
          id?: string;
          payload?: Json;
          processed_at?: string | null;
          schema_version?: number;
          type: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          delivery_lease_at?: string | null;
          delivery_token?: string | null;
          id?: string;
          payload?: Json;
          processed_at?: string | null;
          schema_version?: number;
          type?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "domain_events_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      environments: {
        Row: {
          created_at: string;
          id: string;
          kind: string;
          name: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          kind?: string;
          name: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: string;
          name?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "environments_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      eval_cases: {
        Row: {
          caller_persona: string;
          created_at: string;
          id: string;
          rubric: string;
          scenario: string;
          suite_id: string;
          title: string;
          workspace_id: string;
        };
        Insert: {
          caller_persona?: string;
          created_at?: string;
          id?: string;
          rubric?: string;
          scenario?: string;
          suite_id: string;
          title: string;
          workspace_id: string;
        };
        Update: {
          caller_persona?: string;
          created_at?: string;
          id?: string;
          rubric?: string;
          scenario?: string;
          suite_id?: string;
          title?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "eval_cases_suite_id_fkey";
            columns: ["suite_id"];
            isOneToOne: false;
            referencedRelation: "eval_suites";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "eval_cases_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      eval_run_items: {
        Row: {
          case_id: string | null;
          case_title: string;
          created_at: string;
          id: string;
          notes: string | null;
          passed: boolean | null;
          run_id: string;
          score: number | null;
          workspace_id: string;
        };
        Insert: {
          case_id?: string | null;
          case_title: string;
          created_at?: string;
          id?: string;
          notes?: string | null;
          passed?: boolean | null;
          run_id: string;
          score?: number | null;
          workspace_id: string;
        };
        Update: {
          case_id?: string | null;
          case_title?: string;
          created_at?: string;
          id?: string;
          notes?: string | null;
          passed?: boolean | null;
          run_id?: string;
          score?: number | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "eval_run_items_case_id_fkey";
            columns: ["case_id"];
            isOneToOne: false;
            referencedRelation: "eval_cases";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "eval_run_items_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "eval_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "eval_run_items_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      eval_runs: {
        Row: {
          agent_version: number | null;
          created_at: string;
          created_by: string | null;
          finished_at: string | null;
          id: string;
          passed: number;
          score: number | null;
          status: string;
          suite_id: string;
          total: number;
          workspace_id: string;
        };
        Insert: {
          agent_version?: number | null;
          created_at?: string;
          created_by?: string | null;
          finished_at?: string | null;
          id?: string;
          passed?: number;
          score?: number | null;
          status?: string;
          suite_id: string;
          total?: number;
          workspace_id: string;
        };
        Update: {
          agent_version?: number | null;
          created_at?: string;
          created_by?: string | null;
          finished_at?: string | null;
          id?: string;
          passed?: number;
          score?: number | null;
          status?: string;
          suite_id?: string;
          total?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "eval_runs_suite_id_fkey";
            columns: ["suite_id"];
            isOneToOne: false;
            referencedRelation: "eval_suites";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "eval_runs_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      eval_suites: {
        Row: {
          agent_id: string | null;
          created_at: string;
          created_by: string | null;
          gates_promotion: boolean;
          id: string;
          name: string;
          pass_threshold: number;
          workspace_id: string;
        };
        Insert: {
          agent_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          gates_promotion?: boolean;
          id?: string;
          name: string;
          pass_threshold?: number;
          workspace_id: string;
        };
        Update: {
          agent_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          gates_promotion?: boolean;
          id?: string;
          name?: string;
          pass_threshold?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "eval_suites_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "eval_suites_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      internal_audit_events: {
        Row: {
          action: string;
          actor_id: string;
          created_at: string;
          id: string;
          metadata: Json;
          target: string | null;
        };
        Insert: {
          action: string;
          actor_id: string;
          created_at?: string;
          id?: string;
          metadata?: Json;
          target?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string;
          created_at?: string;
          id?: string;
          metadata?: Json;
          target?: string | null;
        };
        Relationships: [];
      };
      knowledge_bases: {
        Row: {
          created_at: string;
          description: string;
          embedding_model: string;
          embedding_provider: string;
          id: string;
          name: string;
          rerank: boolean;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          description?: string;
          embedding_model?: string;
          embedding_provider?: string;
          id?: string;
          name: string;
          rerank?: boolean;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          embedding_model?: string;
          embedding_provider?: string;
          id?: string;
          name?: string;
          rerank?: boolean;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "knowledge_bases_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      knowledge_chunks: {
        Row: {
          chunk_index: number;
          content: string;
          created_at: string;
          embedding: string;
          id: string;
          knowledge_base_id: string;
          source_id: string;
          workspace_id: string;
        };
        Insert: {
          chunk_index: number;
          content: string;
          created_at?: string;
          embedding: string;
          id?: string;
          knowledge_base_id: string;
          source_id: string;
          workspace_id: string;
        };
        Update: {
          chunk_index?: number;
          content?: string;
          created_at?: string;
          embedding?: string;
          id?: string;
          knowledge_base_id?: string;
          source_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_knowledge_base_id_fkey";
            columns: ["knowledge_base_id"];
            isOneToOne: false;
            referencedRelation: "knowledge_bases";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "knowledge_chunks_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "knowledge_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "knowledge_chunks_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      knowledge_sources: {
        Row: {
          chunk_count: number;
          created_at: string;
          error: string | null;
          id: string;
          kind: string;
          knowledge_base_id: string;
          name: string;
          source_url: string | null;
          status: string;
          storage_path: string | null;
          url: string | null;
          workspace_id: string;
        };
        Insert: {
          chunk_count?: number;
          created_at?: string;
          error?: string | null;
          id?: string;
          kind: string;
          knowledge_base_id: string;
          name: string;
          source_url?: string | null;
          status?: string;
          storage_path?: string | null;
          url?: string | null;
          workspace_id: string;
        };
        Update: {
          chunk_count?: number;
          created_at?: string;
          error?: string | null;
          id?: string;
          kind?: string;
          knowledge_base_id?: string;
          name?: string;
          source_url?: string | null;
          status?: string;
          storage_path?: string | null;
          url?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "knowledge_sources_knowledge_base_id_fkey";
            columns: ["knowledge_base_id"];
            isOneToOne: false;
            referencedRelation: "knowledge_bases";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "knowledge_sources_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      org_invitations: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          created_at: string;
          email: string;
          id: string;
          invited_by: string;
          org_id: string;
          role: Database["public"]["Enums"]["member_role"];
          status: string;
        };
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          email: string;
          id?: string;
          invited_by: string;
          org_id: string;
          role?: Database["public"]["Enums"]["member_role"];
          status?: string;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          email?: string;
          id?: string;
          invited_by?: string;
          org_id?: string;
          role?: Database["public"]["Enums"]["member_role"];
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "org_invitations_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      org_members: {
        Row: {
          created_at: string;
          org_id: string;
          role: Database["public"]["Enums"]["member_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          org_id: string;
          role?: Database["public"]["Enums"]["member_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          org_id?: string;
          role?: Database["public"]["Enums"]["member_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          id?: string;
          name: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      partner_delegations: {
        Row: {
          allowed_actions: string[];
          client_org_id: string;
          created_at: string;
          expires_at: string | null;
          granted_by: string;
          id: string;
          partner_org_id: string;
          resource_scope: Json;
          revoked_at: string | null;
        };
        Insert: {
          allowed_actions?: string[];
          client_org_id: string;
          created_at?: string;
          expires_at?: string | null;
          granted_by: string;
          id?: string;
          partner_org_id: string;
          resource_scope?: Json;
          revoked_at?: string | null;
        };
        Update: {
          allowed_actions?: string[];
          client_org_id?: string;
          created_at?: string;
          expires_at?: string | null;
          granted_by?: string;
          id?: string;
          partner_org_id?: string;
          resource_scope?: Json;
          revoked_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "partner_delegations_client_org_id_fkey";
            columns: ["client_org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "partner_delegations_partner_org_id_fkey";
            columns: ["partner_org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      permissions: {
        Row: {
          key: string;
        };
        Insert: {
          key: string;
        };
        Update: {
          key?: string;
        };
        Relationships: [];
      };
      phone_numbers: {
        Row: {
          management_mode: string;
          verified_at: string | null;
          provisioning_error: string | null;
          provisioning_token: string | null;
          provisioning_started_at: string | null;
          last_call_at: string | null;
          agent_id: string | null;
          carrier: string;
          created_at: string;
          dispatch_rule_ref: string | null;
          e164: string;
          environment_id: string | null;
          id: string;
          sip_trunk_ref: string | null;
          status: string;
          workspace_id: string;
        };
        Insert: {
          management_mode?: string;
          verified_at?: string | null;
          provisioning_error?: string | null;
          provisioning_token?: string | null;
          provisioning_started_at?: string | null;
          last_call_at?: string | null;
          agent_id?: string | null;
          carrier?: string;
          created_at?: string;
          dispatch_rule_ref?: string | null;
          e164: string;
          environment_id?: string | null;
          id?: string;
          sip_trunk_ref?: string | null;
          status?: string;
          workspace_id: string;
        };
        Update: {
          management_mode?: string;
          verified_at?: string | null;
          provisioning_error?: string | null;
          provisioning_token?: string | null;
          provisioning_started_at?: string | null;
          last_call_at?: string | null;
          agent_id?: string | null;
          carrier?: string;
          created_at?: string;
          dispatch_rule_ref?: string | null;
          e164?: string;
          environment_id?: string | null;
          id?: string;
          sip_trunk_ref?: string | null;
          status?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "phone_numbers_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "phone_numbers_environment_id_fkey";
            columns: ["environment_id"];
            isOneToOne: false;
            referencedRelation: "environments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "phone_numbers_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_incidents: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          notes: string;
          severity: string;
          status: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          notes?: string;
          severity?: string;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          notes?: string;
          severity?: string;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      provider_accounts: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          key_ciphertext: string;
          key_hint: string;
          label: string;
          org_id: string;
          provider: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          key_ciphertext: string;
          key_hint: string;
          label: string;
          org_id: string;
          provider: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          key_ciphertext?: string;
          key_hint?: string;
          label?: string;
          org_id?: string;
          provider?: string;
        };
        Relationships: [
          {
            foreignKeyName: "provider_accounts_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      role_assignments: {
        Row: {
          created_at: string;
          expires_at: string | null;
          granted_by: string | null;
          id: string;
          role_id: string;
          scope_id: string;
          scope_type: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          expires_at?: string | null;
          granted_by?: string | null;
          id?: string;
          role_id: string;
          scope_id: string;
          scope_type: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string | null;
          granted_by?: string | null;
          id?: string;
          role_id?: string;
          scope_id?: string;
          scope_type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "role_assignments_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
        ];
      };
      role_permissions: {
        Row: {
          permission_key: string;
          role_id: string;
        };
        Insert: {
          permission_key: string;
          role_id: string;
        };
        Update: {
          permission_key?: string;
          role_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey";
            columns: ["permission_key"];
            isOneToOne: false;
            referencedRelation: "permissions";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
        ];
      };
      roles: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          org_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          org_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          org_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "roles_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      runtime_bundles: {
        Row: {
          agent_id: string;
          agent_version: number | null;
          bundle: Json;
          checksum: string;
          created_at: string;
          created_by: string | null;
          environment_id: string | null;
          id: string;
          workspace_id: string;
        };
        Insert: {
          agent_id: string;
          agent_version?: number | null;
          bundle: Json;
          checksum: string;
          created_at?: string;
          created_by?: string | null;
          environment_id?: string | null;
          id?: string;
          workspace_id: string;
        };
        Update: {
          agent_id?: string;
          agent_version?: number | null;
          bundle?: Json;
          checksum?: string;
          created_at?: string;
          created_by?: string | null;
          environment_id?: string | null;
          id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "runtime_bundles_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "runtime_bundles_environment_id_fkey";
            columns: ["environment_id"];
            isOneToOne: false;
            referencedRelation: "environments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "runtime_bundles_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      runtime_nonces: {
        Row: {
          expires_at: string;
          nonce: string;
        };
        Insert: {
          expires_at: string;
          nonce: string;
        };
        Update: {
          expires_at?: string;
          nonce?: string;
        };
        Relationships: [];
      };
      security_policies: {
        Row: {
          announce_recording: boolean;
          org_id: string;
          record_calls: boolean;
          redact_pii: boolean;
          retention_days: number;
          transcript_access: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          announce_recording?: boolean;
          org_id: string;
          record_calls?: boolean;
          redact_pii?: boolean;
          retention_days?: number;
          transcript_access?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          announce_recording?: boolean;
          org_id?: string;
          record_calls?: boolean;
          redact_pii?: boolean;
          retention_days?: number;
          transcript_access?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "security_policies_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      support_access_requests: {
        Row: {
          approved_by: string | null;
          created_at: string;
          duration_hours: number;
          expires_at: string | null;
          id: string;
          org_id: string;
          reason: string;
          requested_by: string;
          status: string;
        };
        Insert: {
          approved_by?: string | null;
          created_at?: string;
          duration_hours: number;
          expires_at?: string | null;
          id?: string;
          org_id: string;
          reason: string;
          requested_by: string;
          status?: string;
        };
        Update: {
          approved_by?: string | null;
          created_at?: string;
          duration_hours?: number;
          expires_at?: string | null;
          id?: string;
          org_id?: string;
          reason?: string;
          requested_by?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "support_access_requests_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      tool_approvals: {
        Row: {
          allowed_contexts: string[];
          approval_source: string;
          approved_at: string | null;
          approved_by: string | null;
          confirmation_minimum: string;
          created_at: string;
          drift_read_policy: string;
          id: string;
          idempotency_mode: string;
          policy_revision: number;
          review_required_by: string | null;
          risk_class: string;
          safe_to_retry: boolean;
          status: string;
          tool_revision_id: string;
          workspace_id: string;
        };
        Insert: {
          allowed_contexts?: string[];
          approval_source?: string;
          approved_at?: string | null;
          approved_by?: string | null;
          confirmation_minimum?: string;
          created_at?: string;
          drift_read_policy?: string;
          id?: string;
          idempotency_mode?: string;
          policy_revision?: number;
          review_required_by?: string | null;
          risk_class: string;
          safe_to_retry?: boolean;
          status?: string;
          tool_revision_id: string;
          workspace_id: string;
        };
        Update: {
          allowed_contexts?: string[];
          approval_source?: string;
          approved_at?: string | null;
          approved_by?: string | null;
          confirmation_minimum?: string;
          created_at?: string;
          drift_read_policy?: string;
          id?: string;
          idempotency_mode?: string;
          policy_revision?: number;
          review_required_by?: string | null;
          risk_class?: string;
          safe_to_retry?: boolean;
          status?: string;
          tool_revision_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tool_approvals_tool_revision_id_fkey";
            columns: ["tool_revision_id"];
            isOneToOne: false;
            referencedRelation: "tool_revisions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tool_approvals_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      tool_attempts: {
        Row: {
          attempt_no: number;
          destination_host: string | null;
          ended_at: string | null;
          error_class: string | null;
          id: string;
          invocation_id: string;
          retry_decision: string | null;
          started_at: string;
          status_code: number | null;
          workspace_id: string;
        };
        Insert: {
          attempt_no: number;
          destination_host?: string | null;
          ended_at?: string | null;
          error_class?: string | null;
          id?: string;
          invocation_id: string;
          retry_decision?: string | null;
          started_at?: string;
          status_code?: number | null;
          workspace_id: string;
        };
        Update: {
          attempt_no?: number;
          destination_host?: string | null;
          ended_at?: string | null;
          error_class?: string | null;
          id?: string;
          invocation_id?: string;
          retry_decision?: string | null;
          started_at?: string;
          status_code?: number | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tool_attempts_invocation_id_fkey";
            columns: ["invocation_id"];
            isOneToOne: false;
            referencedRelation: "tool_invocations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tool_attempts_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      tool_connectors: {
        Row: {
          admin_enabled: boolean;
          archived_at: string | null;
          canonical_origin: string;
          configuration: Json;
          consecutive_failures: number;
          created_at: string;
          created_by: string | null;
          discovery_etag: string | null;
          display_name: string;
          endpoint_path: string;
          environment_class: string;
          error_code: string | null;
          health: string;
          id: string;
          last_checked_at: string | null;
          last_success_at: string | null;
          next_check_at: string | null;
          org_id: string;
          protocol_version: string | null;
          provider_label: string | null;
          revision: number;
          sandbox_of: string | null;
          type: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          admin_enabled?: boolean;
          archived_at?: string | null;
          canonical_origin: string;
          configuration?: Json;
          consecutive_failures?: number;
          created_at?: string;
          created_by?: string | null;
          discovery_etag?: string | null;
          display_name: string;
          endpoint_path?: string;
          environment_class?: string;
          error_code?: string | null;
          health?: string;
          id?: string;
          last_checked_at?: string | null;
          last_success_at?: string | null;
          next_check_at?: string | null;
          org_id: string;
          protocol_version?: string | null;
          provider_label?: string | null;
          revision?: number;
          sandbox_of?: string | null;
          type: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          admin_enabled?: boolean;
          archived_at?: string | null;
          canonical_origin?: string;
          configuration?: Json;
          consecutive_failures?: number;
          created_at?: string;
          created_by?: string | null;
          discovery_etag?: string | null;
          display_name?: string;
          endpoint_path?: string;
          environment_class?: string;
          error_code?: string | null;
          health?: string;
          id?: string;
          last_checked_at?: string | null;
          last_success_at?: string | null;
          next_check_at?: string | null;
          org_id?: string;
          protocol_version?: string | null;
          provider_label?: string | null;
          revision?: number;
          sandbox_of?: string | null;
          type?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tool_connectors_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tool_connectors_sandbox_of_fkey";
            columns: ["sandbox_of"];
            isOneToOne: false;
            referencedRelation: "tool_connectors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tool_connectors_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      tool_credential_events: {
        Row: {
          actor: string | null;
          at: string;
          credential_id: string;
          event: string;
          id: string;
          workspace_id: string;
        };
        Insert: {
          actor?: string | null;
          at?: string;
          credential_id: string;
          event: string;
          id?: string;
          workspace_id: string;
        };
        Update: {
          actor?: string | null;
          at?: string;
          credential_id?: string;
          event?: string;
          id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tool_credential_events_credential_id_fkey";
            columns: ["credential_id"];
            isOneToOne: false;
            referencedRelation: "tool_credentials";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tool_credential_events_credential_id_fkey";
            columns: ["credential_id"];
            isOneToOne: false;
            referencedRelation: "tool_credentials_public";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tool_credential_events_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      tool_credentials: {
        Row: {
          auth_kind: string;
          ciphertext: string;
          connector_id: string;
          created_at: string;
          created_by: string | null;
          header_name: string | null;
          hint: string;
          id: string;
          org_id: string;
          origin: string;
          revoked_at: string | null;
          rotated_at: string | null;
          secret_version: number;
          status: string;
          workspace_id: string;
        };
        Insert: {
          auth_kind: string;
          ciphertext: string;
          connector_id: string;
          created_at?: string;
          created_by?: string | null;
          header_name?: string | null;
          hint?: string;
          id?: string;
          org_id: string;
          origin: string;
          revoked_at?: string | null;
          rotated_at?: string | null;
          secret_version?: number;
          status?: string;
          workspace_id: string;
        };
        Update: {
          auth_kind?: string;
          ciphertext?: string;
          connector_id?: string;
          created_at?: string;
          created_by?: string | null;
          header_name?: string | null;
          hint?: string;
          id?: string;
          org_id?: string;
          origin?: string;
          revoked_at?: string | null;
          rotated_at?: string | null;
          secret_version?: number;
          status?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tool_credentials_connector_id_fkey";
            columns: ["connector_id"];
            isOneToOne: false;
            referencedRelation: "tool_connectors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tool_credentials_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tool_credentials_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      tool_definitions: {
        Row: {
          archived_at: string | null;
          connector_id: string;
          created_at: string;
          current_revision_id: string | null;
          id: string;
          source_operation_id: string;
          stable_slug: string;
          state: string;
          unsupported_reason: string | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          archived_at?: string | null;
          connector_id: string;
          created_at?: string;
          current_revision_id?: string | null;
          id?: string;
          source_operation_id: string;
          stable_slug: string;
          state?: string;
          unsupported_reason?: string | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          archived_at?: string | null;
          connector_id?: string;
          created_at?: string;
          current_revision_id?: string | null;
          id?: string;
          source_operation_id?: string;
          stable_slug?: string;
          state?: string;
          unsupported_reason?: string | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tool_definitions_connector_id_fkey";
            columns: ["connector_id"];
            isOneToOne: false;
            referencedRelation: "tool_connectors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tool_definitions_current_rev_fk";
            columns: ["current_revision_id"];
            isOneToOne: false;
            referencedRelation: "tool_revisions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tool_definitions_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      tool_invocations: {
        Row: {
          acting_partner_org_id: string | null;
          actor_user_id: string | null;
          agent_id: string | null;
          agent_version: number | null;
          connector_id: string | null;
          context_key: string;
          context_kind: string;
          conversation_id: string | null;
          deployment_id: string | null;
          ended_at: string | null;
          error_code: string | null;
          id: string;
          idempotency_key: string | null;
          input_hash: string | null;
          input_redacted: Json | null;
          invocation_key: string;
          latency_ms: number | null;
          mode: string;
          org_id: string;
          output_redacted: Json | null;
          session_id: string | null;
          started_at: string;
          status: string;
          tool_id: string | null;
          tool_revision_id: string | null;
          trace_id: string | null;
          turn_id: string | null;
          workflow_id: string | null;
          workflow_run_id: string | null;
          workflow_step_id: string | null;
          workflow_version_id: string | null;
          workspace_id: string;
        };
        Insert: {
          acting_partner_org_id?: string | null;
          actor_user_id?: string | null;
          agent_id?: string | null;
          agent_version?: number | null;
          connector_id?: string | null;
          context_key: string;
          context_kind: string;
          conversation_id?: string | null;
          deployment_id?: string | null;
          ended_at?: string | null;
          error_code?: string | null;
          id?: string;
          idempotency_key?: string | null;
          input_hash?: string | null;
          input_redacted?: Json | null;
          invocation_key: string;
          latency_ms?: number | null;
          mode?: string;
          org_id: string;
          output_redacted?: Json | null;
          session_id?: string | null;
          started_at?: string;
          status: string;
          tool_id?: string | null;
          tool_revision_id?: string | null;
          trace_id?: string | null;
          turn_id?: string | null;
          workflow_id?: string | null;
          workflow_run_id?: string | null;
          workflow_step_id?: string | null;
          workflow_version_id?: string | null;
          workspace_id: string;
        };
        Update: {
          acting_partner_org_id?: string | null;
          actor_user_id?: string | null;
          agent_id?: string | null;
          agent_version?: number | null;
          connector_id?: string | null;
          context_key?: string;
          context_kind?: string;
          conversation_id?: string | null;
          deployment_id?: string | null;
          ended_at?: string | null;
          error_code?: string | null;
          id?: string;
          idempotency_key?: string | null;
          input_hash?: string | null;
          input_redacted?: Json | null;
          invocation_key?: string;
          latency_ms?: number | null;
          mode?: string;
          org_id?: string;
          output_redacted?: Json | null;
          session_id?: string | null;
          started_at?: string;
          status?: string;
          tool_id?: string | null;
          tool_revision_id?: string | null;
          trace_id?: string | null;
          turn_id?: string | null;
          workflow_id?: string | null;
          workflow_run_id?: string | null;
          workflow_step_id?: string | null;
          workflow_version_id?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tool_invocations_connector_id_fkey";
            columns: ["connector_id"];
            isOneToOne: false;
            referencedRelation: "tool_connectors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tool_invocations_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tool_invocations_tool_id_fkey";
            columns: ["tool_id"];
            isOneToOne: false;
            referencedRelation: "tool_definitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tool_invocations_tool_revision_id_fkey";
            columns: ["tool_revision_id"];
            isOneToOne: false;
            referencedRelation: "tool_revisions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tool_invocations_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      tool_mocks: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          reply: Json;
          tool_revision_id: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name?: string;
          reply: Json;
          tool_revision_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          reply?: Json;
          tool_revision_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tool_mocks_tool_revision_id_fkey";
            columns: ["tool_revision_id"];
            isOneToOne: false;
            referencedRelation: "tool_revisions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tool_mocks_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      tool_pending_actions: {
        Row: {
          args_digest: string;
          created_at: string;
          evidence: Json | null;
          executed_at: string | null;
          execution_scope: Json;
          expires_at: string;
          frozen_arguments: string;
          id: string;
          invocation_id: string;
          policy_revision: number;
          session_id: string | null;
          status: string;
          summary: string;
          tool_revision_id: string;
          turn_id: string | null;
          workspace_id: string;
        };
        Insert: {
          args_digest: string;
          created_at?: string;
          evidence?: Json | null;
          executed_at?: string | null;
          execution_scope?: Json;
          expires_at: string;
          frozen_arguments: string;
          id?: string;
          invocation_id: string;
          policy_revision: number;
          session_id?: string | null;
          status?: string;
          summary: string;
          tool_revision_id: string;
          turn_id?: string | null;
          workspace_id: string;
        };
        Update: {
          args_digest?: string;
          created_at?: string;
          evidence?: Json | null;
          executed_at?: string | null;
          execution_scope?: Json;
          expires_at?: string;
          frozen_arguments?: string;
          id?: string;
          invocation_id?: string;
          policy_revision?: number;
          session_id?: string | null;
          status?: string;
          summary?: string;
          tool_revision_id?: string;
          turn_id?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tool_pending_actions_invocation_id_fkey";
            columns: ["invocation_id"];
            isOneToOne: false;
            referencedRelation: "tool_invocations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tool_pending_actions_tool_revision_id_fkey";
            columns: ["tool_revision_id"];
            isOneToOne: false;
            referencedRelation: "tool_revisions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tool_pending_actions_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      tool_policies: {
        Row: {
          max_output_bytes: number;
          rate_limit_per_min: number;
          revision: number;
          sensitive_output: string;
          timeout_ms: number;
          tool_id: string;
          updated_at: string;
          updated_by: string | null;
          workspace_id: string;
        };
        Insert: {
          max_output_bytes?: number;
          rate_limit_per_min?: number;
          revision?: number;
          sensitive_output?: string;
          timeout_ms?: number;
          tool_id: string;
          updated_at?: string;
          updated_by?: string | null;
          workspace_id: string;
        };
        Update: {
          max_output_bytes?: number;
          rate_limit_per_min?: number;
          revision?: number;
          sensitive_output?: string;
          timeout_ms?: number;
          tool_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tool_policies_tool_id_fkey";
            columns: ["tool_id"];
            isOneToOne: true;
            referencedRelation: "tool_definitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tool_policies_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      tool_policy_decisions: {
        Row: {
          decision: string;
          evaluated_at: string;
          id: string;
          invocation_id: string;
          pending_action_id: string | null;
          policy_revision: number;
          reason_codes: string[];
          required_confirmation: string | null;
          risk_class: string | null;
          stage: string;
          workspace_id: string;
        };
        Insert: {
          decision: string;
          evaluated_at?: string;
          id?: string;
          invocation_id: string;
          pending_action_id?: string | null;
          policy_revision: number;
          reason_codes?: string[];
          required_confirmation?: string | null;
          risk_class?: string | null;
          stage: string;
          workspace_id: string;
        };
        Update: {
          decision?: string;
          evaluated_at?: string;
          id?: string;
          invocation_id?: string;
          pending_action_id?: string | null;
          policy_revision?: number;
          reason_codes?: string[];
          required_confirmation?: string | null;
          risk_class?: string | null;
          stage?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tool_policy_decisions_invocation_id_fkey";
            columns: ["invocation_id"];
            isOneToOne: false;
            referencedRelation: "tool_invocations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tool_policy_decisions_pending_action_id_fkey";
            columns: ["pending_action_id"];
            isOneToOne: false;
            referencedRelation: "tool_pending_actions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tool_policy_decisions_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      tool_revisions: {
        Row: {
          adapter_mapping: Json;
          description: string;
          discovered_at: string;
          display_name: string;
          id: string;
          input_schema: Json;
          invocation_hash: string;
          normalizer_version: number;
          output_schema: Json | null;
          remote_annotations: Json;
          review_hash: string;
          revision_no: number;
          tool_id: string;
          workspace_id: string;
        };
        Insert: {
          adapter_mapping?: Json;
          description?: string;
          discovered_at?: string;
          display_name: string;
          id?: string;
          input_schema: Json;
          invocation_hash: string;
          normalizer_version?: number;
          output_schema?: Json | null;
          remote_annotations?: Json;
          review_hash: string;
          revision_no: number;
          tool_id: string;
          workspace_id: string;
        };
        Update: {
          adapter_mapping?: Json;
          description?: string;
          discovered_at?: string;
          display_name?: string;
          id?: string;
          input_schema?: Json;
          invocation_hash?: string;
          normalizer_version?: number;
          output_schema?: Json | null;
          remote_annotations?: Json;
          review_hash?: string;
          revision_no?: number;
          tool_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tool_revisions_tool_id_fkey";
            columns: ["tool_id"];
            isOneToOne: false;
            referencedRelation: "tool_definitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tool_revisions_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      tools: {
        Row: {
          auth_ciphertext: string | null;
          auth_hint: string | null;
          created_at: string;
          description: string;
          endpoint_url: string;
          id: string;
          method: string;
          name: string;
          parameters: Json;
          timeout_ms: number;
          workspace_id: string;
        };
        Insert: {
          auth_ciphertext?: string | null;
          auth_hint?: string | null;
          created_at?: string;
          description?: string;
          endpoint_url: string;
          id?: string;
          method?: string;
          name: string;
          parameters?: Json;
          timeout_ms?: number;
          workspace_id: string;
        };
        Update: {
          auth_ciphertext?: string | null;
          auth_hint?: string | null;
          created_at?: string;
          description?: string;
          endpoint_url?: string;
          id?: string;
          method?: string;
          name?: string;
          parameters?: Json;
          timeout_ms?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tools_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      usage_events: {
        Row: {
          conversation_id: string | null;
          created_at: string;
          id: string;
          kind: string;
          model: string | null;
          provider: string;
          quantity: number;
          unit: string;
          workspace_id: string;
        };
        Insert: {
          conversation_id?: string | null;
          created_at?: string;
          id?: string;
          kind: string;
          model?: string | null;
          provider?: string;
          quantity?: number;
          unit: string;
          workspace_id: string;
        };
        Update: {
          conversation_id?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          model?: string | null;
          provider?: string;
          quantity?: number;
          unit?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "usage_events_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "usage_events_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      webhook_deliveries: {
        Row: {
          created_at: string;
          domain_event_id: string | null;
          duration_ms: number | null;
          endpoint_id: string;
          error: string | null;
          event: string;
          id: string;
          status: number | null;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          domain_event_id?: string | null;
          duration_ms?: number | null;
          endpoint_id: string;
          error?: string | null;
          event: string;
          id?: string;
          status?: number | null;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          domain_event_id?: string | null;
          duration_ms?: number | null;
          endpoint_id?: string;
          error?: string | null;
          event?: string;
          id?: string;
          status?: number | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_domain_event_id_fkey";
            columns: ["domain_event_id"];
            isOneToOne: false;
            referencedRelation: "domain_events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "webhook_deliveries_endpoint_id_fkey";
            columns: ["endpoint_id"];
            isOneToOne: false;
            referencedRelation: "webhook_endpoints";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "webhook_deliveries_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      webhook_endpoints: {
        Row: {
          created_at: string;
          created_by: string | null;
          enabled: boolean;
          events: string[];
          id: string;
          secret_ciphertext: string;
          secret_hint: string;
          url: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          enabled?: boolean;
          events?: string[];
          id?: string;
          secret_ciphertext: string;
          secret_hint: string;
          url: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          enabled?: boolean;
          events?: string[];
          id?: string;
          secret_ciphertext?: string;
          secret_hint?: string;
          url?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "webhook_endpoints_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workflow_runs: {
        Row: {
          workflow_version_id: string | null;
          conversation_id: string | null;
          created_at: string;
          duration_ms: number | null;
          error: string | null;
          finished_at: string | null;
          id: string;
          source: string;
          started_by: string | null;
          status: string;
          steps: Json;
          trigger: string;
          workflow_id: string;
          workspace_id: string;
        };
        Insert: {
          workflow_version_id?: string | null;
          conversation_id?: string | null;
          created_at?: string;
          duration_ms?: number | null;
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          source?: string;
          started_by?: string | null;
          status?: string;
          steps?: Json;
          trigger: string;
          workflow_id: string;
          workspace_id: string;
        };
        Update: {
          workflow_version_id?: string | null;
          conversation_id?: string | null;
          created_at?: string;
          duration_ms?: number | null;
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          source?: string;
          started_by?: string | null;
          status?: string;
          steps?: Json;
          trigger?: string;
          workflow_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workflow_runs_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workflow_runs_workflow_id_fkey";
            columns: ["workflow_id"];
            isOneToOne: false;
            referencedRelation: "workflows";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workflow_runs_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workflow_tool_bindings: {
        Row: {
          execution_policy: Json;
          step_id: string;
          tool_revision_id: string;
          workflow_version_id: string;
          workspace_id: string;
        };
        Insert: {
          execution_policy?: Json;
          step_id: string;
          tool_revision_id: string;
          workflow_version_id: string;
          workspace_id: string;
        };
        Update: {
          execution_policy?: Json;
          step_id?: string;
          tool_revision_id?: string;
          workflow_version_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workflow_tool_bindings_tool_revision_id_fkey";
            columns: ["tool_revision_id"];
            isOneToOne: false;
            referencedRelation: "tool_revisions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workflow_tool_bindings_workflow_version_id_fkey";
            columns: ["workflow_version_id"];
            isOneToOne: false;
            referencedRelation: "workflow_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workflow_tool_bindings_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workflow_versions: {
        Row: {
          created_at: string;
          graph: Json;
          id: string;
          published_by: string | null;
          version: number;
          workflow_id: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          graph: Json;
          id?: string;
          published_by?: string | null;
          version: number;
          workflow_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          graph?: Json;
          id?: string;
          published_by?: string | null;
          version?: number;
          workflow_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workflow_versions_workflow_id_fkey";
            columns: ["workflow_id"];
            isOneToOne: false;
            referencedRelation: "workflows";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workflow_versions_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workflows: {
        Row: {
          published_version_id: string | null;
          agent_id: string | null;
          created_at: string;
          created_by: string | null;
          description: string;
          enabled: boolean;
          id: string;
          name: string;
          steps: Json;
          trigger: string;
          trigger_value: string | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          published_version_id?: string | null;
          agent_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          enabled?: boolean;
          id?: string;
          name: string;
          steps?: Json;
          trigger?: string;
          trigger_value?: string | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          published_version_id?: string | null;
          agent_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          enabled?: boolean;
          id?: string;
          name?: string;
          steps?: Json;
          trigger?: string;
          trigger_value?: string | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workflows_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workflows_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workspaces: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          org_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          org_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          org_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspaces_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      tool_credentials_public: {
        Row: {
          auth_kind: string | null;
          connector_id: string | null;
          created_at: string | null;
          header_name: string | null;
          hint: string | null;
          id: string | null;
          rotated_at: string | null;
          secret_version: number | null;
          status: string | null;
          workspace_id: string | null;
        };
        Insert: {
          auth_kind?: string | null;
          connector_id?: string | null;
          created_at?: string | null;
          header_name?: string | null;
          hint?: string | null;
          id?: string | null;
          rotated_at?: string | null;
          secret_version?: number | null;
          status?: string | null;
          workspace_id?: string | null;
        };
        Update: {
          auth_kind?: string | null;
          connector_id?: string | null;
          created_at?: string | null;
          header_name?: string | null;
          hint?: string | null;
          id?: string | null;
          rotated_at?: string | null;
          secret_version?: number | null;
          status?: string | null;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tool_credentials_connector_id_fkey";
            columns: ["connector_id"];
            isOneToOne: false;
            referencedRelation: "tool_connectors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tool_credentials_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      reserve_managed_number: {
        Args: {
          _workspace: string;
          _quote: string;
          _agent: string;
          _environment: string;
          _request: string;
          _limit: number;
        };
        Returns: string;
      };
      assign_managed_phone_route: {
        Args: { _workspace: string; _number: string; _agent: string; _environment: string };
        Returns: undefined;
      };
      confirm_phone_verification: {
        Args: { _workspace: string; _number: string; _test: string; _conversation: string };
        Returns: undefined;
      };
      accrue_managed_number_charges: { Args: { _order: string }; Returns: undefined };

      ingest_runtime_events: {
        Args: { _session_id: string; _batch_id: string; _events: Json };
        Returns: boolean;
      };
      accept_my_invitations: { Args: never; Returns: number };
      create_organization: {
        Args: { _org_name: string; _workspace_name: string };
        Returns: string;
      };
      has_permission: { Args: { _perm: string; _ws: string }; Returns: boolean };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_org_member: {
        Args: {
          _min?: Database["public"]["Enums"]["member_role"];
          _org: string;
        };
        Returns: boolean;
      };
      is_staff: { Args: { _uid: string }; Returns: boolean };
      is_workspace_member: {
        Args: { _min?: Database["public"]["Enums"]["member_role"]; _ws: string };
        Returns: boolean;
      };
      match_chunks: {
        Args: { _embedding: string; _k?: number; _kb_ids: string[] };
        Returns: {
          content: string;
          id: string;
          similarity: number;
          source_id: string;
          source_name: string;
        }[];
      };
      org_member_emails: {
        Args: { _org: string };
        Returns: {
          email: string;
          user_id: string;
        }[];
      };
    };
    Enums: {
      app_role: "admin" | "operator" | "user";
      member_role: "owner" | "admin" | "member";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "operator", "user"],
      member_role: ["owner", "admin", "member"],
    },
  },
} as const;
