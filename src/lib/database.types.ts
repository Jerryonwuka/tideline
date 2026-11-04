export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      ai_jobs: {
        Row: {
          cost_estimate_minor: number | null;
          created_at: string;
          error: string | null;
          id: string;
          input_ref: string;
          kind: Database["public"]["Enums"]["ai_job_kind"];
          latency_ms: number | null;
          model: string | null;
          org_id: string;
          output: Json | null;
          prompt_version: string;
          status: Database["public"]["Enums"]["ai_job_status"];
          tokens_in: number | null;
          tokens_out: number | null;
        };
        ComputedFields: never;
        Insert: {
          cost_estimate_minor?: number | null;
          created_at?: string;
          error?: string | null;
          id?: string;
          input_ref: string;
          kind: Database["public"]["Enums"]["ai_job_kind"];
          latency_ms?: number | null;
          model?: string | null;
          org_id: string;
          output?: Json | null;
          prompt_version: string;
          status?: Database["public"]["Enums"]["ai_job_status"];
          tokens_in?: number | null;
          tokens_out?: number | null;
        };
        Update: {
          cost_estimate_minor?: number | null;
          created_at?: string;
          error?: string | null;
          id?: string;
          input_ref?: string;
          kind?: Database["public"]["Enums"]["ai_job_kind"];
          latency_ms?: number | null;
          model?: string | null;
          org_id?: string;
          output?: Json | null;
          prompt_version?: string;
          status?: Database["public"]["Enums"]["ai_job_status"];
          tokens_in?: number | null;
          tokens_out?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "ai_jobs_org_id_orgs_id_fk";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_user_id: string | null;
          after: Json | null;
          at: string;
          before: Json | null;
          entity: string;
          entity_id: string | null;
          id: string;
          ip: string | null;
          org_id: string | null;
          reason: string | null;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_user_id?: string | null;
          after?: Json | null;
          at?: string;
          before?: Json | null;
          entity: string;
          entity_id?: string | null;
          id?: string;
          ip?: string | null;
          org_id?: string | null;
          reason?: string | null;
        };
        Update: {
          action?: string;
          actor_user_id?: string | null;
          after?: Json | null;
          at?: string;
          before?: Json | null;
          entity?: string;
          entity_id?: string | null;
          id?: string;
          ip?: string | null;
          org_id?: string | null;
          reason?: string | null;
        };
        Relationships: [];
      };
      bot_sessions: {
        Row: {
          asking: string | null;
          channel: Database["public"]["Enums"]["message_channel"];
          draft: NonNullable<Json>;
          message_id: string;
          org_id: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          asking?: string | null;
          channel: Database["public"]["Enums"]["message_channel"];
          draft: NonNullable<Json>;
          message_id: string;
          org_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          asking?: string | null;
          channel?: Database["public"]["Enums"]["message_channel"];
          draft?: NonNullable<Json>;
          message_id?: string;
          org_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bot_sessions_message_id_wa_messages_id_fk";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "wa_messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bot_sessions_org_id_orgs_id_fk";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      charter_eligibility_rules: {
        Row: {
          check: NonNullable<Json>;
          code: string;
          description_key: string;
          id: string;
          rule_set_id: string;
          severity: Database["public"]["Enums"]["rule_severity"];
        };
        ComputedFields: never;
        Insert: {
          check: NonNullable<Json>;
          code: string;
          description_key: string;
          id?: string;
          rule_set_id: string;
          severity: Database["public"]["Enums"]["rule_severity"];
        };
        Update: {
          check?: NonNullable<Json>;
          code?: string;
          description_key?: string;
          id?: string;
          rule_set_id?: string;
          severity?: Database["public"]["Enums"]["rule_severity"];
        };
        Relationships: [
          {
            foreignKeyName: "charter_eligibility_rules_rule_set_id_compliance_rule_sets_id_f";
            columns: ["rule_set_id"];
            isOneToOne: false;
            referencedRelation: "compliance_rule_sets";
            referencedColumns: ["id"];
          },
        ];
      };
      compliance_rule_sets: {
        Row: {
          country_code: string | null;
          created_at: string;
          id: string;
          legal_review_note: string | null;
          name: string;
          published_at: string | null;
          reviewed_by: string | null;
          status: Database["public"]["Enums"]["rule_set_status"];
          version: number;
        };
        ComputedFields: never;
        Insert: {
          country_code?: string | null;
          created_at?: string;
          id?: string;
          legal_review_note?: string | null;
          name: string;
          published_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["rule_set_status"];
          version: number;
        };
        Update: {
          country_code?: string | null;
          created_at?: string;
          id?: string;
          legal_review_note?: string | null;
          name?: string;
          published_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["rule_set_status"];
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "compliance_rule_sets_country_code_countries_code_fk";
            columns: ["country_code"];
            isOneToOne: false;
            referencedRelation: "countries";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "compliance_rule_sets_reviewed_by_profiles_id_fk";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      countries: {
        Row: {
          code: string;
          data_region: Database["public"]["Enums"]["data_region"];
          date_order: string;
          default_currency: string;
          default_locale: string;
          default_time_zone: string;
          enabled: boolean;
          launch_status: Database["public"]["Enums"]["launch_status"];
          name: string;
          phone_prefix: string;
          updated_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          data_region: Database["public"]["Enums"]["data_region"];
          date_order?: string;
          default_currency: string;
          default_locale: string;
          default_time_zone: string;
          enabled?: boolean;
          launch_status?: Database["public"]["Enums"]["launch_status"];
          name: string;
          phone_prefix: string;
          updated_at?: string | null;
        };
        Update: {
          code?: string;
          data_region?: Database["public"]["Enums"]["data_region"];
          date_order?: string;
          default_currency?: string;
          default_locale?: string;
          default_time_zone?: string;
          enabled?: boolean;
          launch_status?: Database["public"]["Enums"]["launch_status"];
          name?: string;
          phone_prefix?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "countries_default_currency_currencies_code_fk";
            columns: ["default_currency"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "countries_default_locale_locales_code_fk";
            columns: ["default_locale"];
            isOneToOne: false;
            referencedRelation: "locales";
            referencedColumns: ["code"];
          },
        ];
      };
      crew_members: {
        Row: {
          created_at: string;
          crew_role: Database["public"]["Enums"]["crew_role"];
          emergency_contact_name: string | null;
          emergency_contact_phone: string | null;
          full_name: string;
          id: string;
          org_id: string;
          phone_e164: string | null;
          status: Database["public"]["Enums"]["crew_status"];
          updated_at: string | null;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          crew_role: Database["public"]["Enums"]["crew_role"];
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          full_name: string;
          id?: string;
          org_id: string;
          phone_e164?: string | null;
          status?: Database["public"]["Enums"]["crew_status"];
          updated_at?: string | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          crew_role?: Database["public"]["Enums"]["crew_role"];
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          full_name?: string;
          id?: string;
          org_id?: string;
          phone_e164?: string | null;
          status?: Database["public"]["Enums"]["crew_status"];
          updated_at?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "crew_members_org_id_orgs_id_fk";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crew_members_user_id_profiles_id_fk";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      currencies: {
        Row: {
          code: string;
          enabled: boolean;
          minor_unit_digits: number;
          symbol: string;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          enabled?: boolean;
          minor_unit_digits: number;
          symbol: string;
        };
        Update: {
          code?: string;
          enabled?: boolean;
          minor_unit_digits?: number;
          symbol?: string;
        };
        Relationships: [];
      };
      document_alerts: {
        Row: {
          channel: Database["public"]["Enums"]["alert_channel"];
          detail: Json | null;
          document_id: string;
          id: string;
          offset_days: number;
          org_id: string;
          sent_at: string | null;
          status: string;
        };
        ComputedFields: never;
        Insert: {
          channel: Database["public"]["Enums"]["alert_channel"];
          detail?: Json | null;
          document_id: string;
          id?: string;
          offset_days: number;
          org_id: string;
          sent_at?: string | null;
          status?: string;
        };
        Update: {
          channel?: Database["public"]["Enums"]["alert_channel"];
          detail?: Json | null;
          document_id?: string;
          id?: string;
          offset_days?: number;
          org_id?: string;
          sent_at?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_alerts_document_id_documents_id_fk";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_alerts_document_id_documents_id_fk";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents_live";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_alerts_org_id_orgs_id_fk";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      document_requirements: {
        Row: {
          alert_offsets: number[] | null;
          applies_to: Database["public"]["Enums"]["applies_to"];
          document_type_code: string;
          id: string;
          mandatory: boolean;
          modes: string[];
          regulator_id: string | null;
          rule_set_id: string;
          vessel_types: string[];
        };
        ComputedFields: never;
        Insert: {
          alert_offsets?: number[] | null;
          applies_to: Database["public"]["Enums"]["applies_to"];
          document_type_code: string;
          id?: string;
          mandatory?: boolean;
          modes?: string[];
          regulator_id?: string | null;
          rule_set_id: string;
          vessel_types?: string[];
        };
        Update: {
          alert_offsets?: number[] | null;
          applies_to?: Database["public"]["Enums"]["applies_to"];
          document_type_code?: string;
          id?: string;
          mandatory?: boolean;
          modes?: string[];
          regulator_id?: string | null;
          rule_set_id?: string;
          vessel_types?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "document_requirements_document_type_code_document_types_code_fk";
            columns: ["document_type_code"];
            isOneToOne: false;
            referencedRelation: "document_types";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "document_requirements_regulator_id_regulators_id_fk";
            columns: ["regulator_id"];
            isOneToOne: false;
            referencedRelation: "regulators";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_requirements_rule_set_id_compliance_rule_sets_id_fk";
            columns: ["rule_set_id"];
            isOneToOne: false;
            referencedRelation: "compliance_rule_sets";
            referencedColumns: ["id"];
          },
        ];
      };
      document_types: {
        Row: {
          applies_to: Database["public"]["Enums"]["applies_to"];
          code: string;
          default_validity_months: number | null;
          issuer_name: string | null;
          name_key: string;
          rule_set_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          applies_to: Database["public"]["Enums"]["applies_to"];
          code: string;
          default_validity_months?: number | null;
          issuer_name?: string | null;
          name_key: string;
          rule_set_id?: string | null;
        };
        Update: {
          applies_to?: Database["public"]["Enums"]["applies_to"];
          code?: string;
          default_validity_months?: number | null;
          issuer_name?: string | null;
          name_key?: string;
          rule_set_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "document_types_rule_set_id_compliance_rule_sets_id_fk";
            columns: ["rule_set_id"];
            isOneToOne: false;
            referencedRelation: "compliance_rule_sets";
            referencedColumns: ["id"];
          },
        ];
      };
      documents: {
        Row: {
          created_at: string;
          document_type_code: string;
          expiry_date: string | null;
          extracted: Json | null;
          extraction_confidence: number | null;
          file_path: string | null;
          id: string;
          is_public: boolean;
          issue_date: string | null;
          issuer: string | null;
          number: string | null;
          org_id: string;
          replaced_by: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: Database["public"]["Enums"]["document_status"];
          subject_id: string;
          subject_type: Database["public"]["Enums"]["applies_to"];
          updated_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          document_type_code: string;
          expiry_date?: string | null;
          extracted?: Json | null;
          extraction_confidence?: number | null;
          file_path?: string | null;
          id?: string;
          is_public?: boolean;
          issue_date?: string | null;
          issuer?: string | null;
          number?: string | null;
          org_id: string;
          replaced_by?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["document_status"];
          subject_id: string;
          subject_type: Database["public"]["Enums"]["applies_to"];
          updated_at?: string | null;
        };
        Update: {
          created_at?: string;
          document_type_code?: string;
          expiry_date?: string | null;
          extracted?: Json | null;
          extraction_confidence?: number | null;
          file_path?: string | null;
          id?: string;
          is_public?: boolean;
          issue_date?: string | null;
          issuer?: string | null;
          number?: string | null;
          org_id?: string;
          replaced_by?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["document_status"];
          subject_id?: string;
          subject_type?: Database["public"]["Enums"]["applies_to"];
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "documents_document_type_code_document_types_code_fk";
            columns: ["document_type_code"];
            isOneToOne: false;
            referencedRelation: "document_types";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "documents_org_id_orgs_id_fk";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_reviewed_by_profiles_id_fk";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      exchange_rates: {
        Row: {
          as_of: string;
          base: string;
          id: string;
          quote: string;
          rate: number;
          source: string;
        };
        ComputedFields: never;
        Insert: {
          as_of: string;
          base: string;
          id?: string;
          quote: string;
          rate: number;
          source: string;
        };
        Update: {
          as_of?: string;
          base?: string;
          id?: string;
          quote?: string;
          rate?: number;
          source?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exchange_rates_base_currencies_code_fk";
            columns: ["base"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "exchange_rates_quote_currencies_code_fk";
            columns: ["quote"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
        ];
      };
      expenses: {
        Row: {
          amount_minor: number;
          category: string;
          created_at: string;
          currency: string;
          id: string;
          note: string | null;
          org_id: string;
          payment_method: string | null;
          recorded_by: string | null;
          source: Database["public"]["Enums"]["record_source"];
          trip_id: string | null;
          vessel_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          amount_minor: number;
          category: string;
          created_at?: string;
          currency: string;
          id?: string;
          note?: string | null;
          org_id: string;
          payment_method?: string | null;
          recorded_by?: string | null;
          source: Database["public"]["Enums"]["record_source"];
          trip_id?: string | null;
          vessel_id?: string | null;
        };
        Update: {
          amount_minor?: number;
          category?: string;
          created_at?: string;
          currency?: string;
          id?: string;
          note?: string | null;
          org_id?: string;
          payment_method?: string | null;
          recorded_by?: string | null;
          source?: Database["public"]["Enums"]["record_source"];
          trip_id?: string | null;
          vessel_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "expenses_currency_currencies_code_fk";
            columns: ["currency"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "expenses_org_id_orgs_id_fk";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_trip_id_trips_id_fk";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_vessel_id_vessels_id_fk";
            columns: ["vessel_id"];
            isOneToOne: false;
            referencedRelation: "vessels";
            referencedColumns: ["id"];
          },
        ];
      };
      fee_config: {
        Row: {
          country_code: string | null;
          effective_from: string;
          id: string;
          key: string;
          value: number;
        };
        ComputedFields: never;
        Insert: {
          country_code?: string | null;
          effective_from?: string;
          id?: string;
          key: string;
          value: number;
        };
        Update: {
          country_code?: string | null;
          effective_from?: string;
          id?: string;
          key?: string;
          value?: number;
        };
        Relationships: [
          {
            foreignKeyName: "fee_config_country_code_countries_code_fk";
            columns: ["country_code"];
            isOneToOne: false;
            referencedRelation: "countries";
            referencedColumns: ["code"];
          },
        ];
      };
      incidents: {
        Row: {
          created_at: string;
          description: string;
          escalated_at: string | null;
          id: string;
          org_id: string;
          reported_by: string | null;
          source: Database["public"]["Enums"]["record_source"];
          status: Database["public"]["Enums"]["incident_status"];
          trip_id: string | null;
          urgent: boolean;
          vessel_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          description: string;
          escalated_at?: string | null;
          id?: string;
          org_id: string;
          reported_by?: string | null;
          source: Database["public"]["Enums"]["record_source"];
          status?: Database["public"]["Enums"]["incident_status"];
          trip_id?: string | null;
          urgent?: boolean;
          vessel_id?: string | null;
        };
        Update: {
          created_at?: string;
          description?: string;
          escalated_at?: string | null;
          id?: string;
          org_id?: string;
          reported_by?: string | null;
          source?: Database["public"]["Enums"]["record_source"];
          status?: Database["public"]["Enums"]["incident_status"];
          trip_id?: string | null;
          urgent?: boolean;
          vessel_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "incidents_org_id_orgs_id_fk";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "incidents_trip_id_trips_id_fk";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "incidents_vessel_id_vessels_id_fk";
            columns: ["vessel_id"];
            isOneToOne: false;
            referencedRelation: "vessels";
            referencedColumns: ["id"];
          },
        ];
      };
      invitations: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          created_at: string;
          expires_at: string;
          id: string;
          invited_by: string | null;
          org_id: string;
          phone_e164: string;
          role: Database["public"]["Enums"]["membership_role"];
          token_hash: string;
          updated_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          expires_at: string;
          id?: string;
          invited_by?: string | null;
          org_id: string;
          phone_e164: string;
          role: Database["public"]["Enums"]["membership_role"];
          token_hash: string;
          updated_at?: string | null;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          org_id?: string;
          phone_e164?: string;
          role?: Database["public"]["Enums"]["membership_role"];
          token_hash?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "invitations_accepted_by_profiles_id_fk";
            columns: ["accepted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitations_invited_by_profiles_id_fk";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitations_org_id_orgs_id_fk";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      jetties: {
        Row: {
          admin_area: string | null;
          aliases: string[];
          country_code: string;
          created_at: string;
          id: string;
          lat: number;
          lng: number;
          name: string;
          proposed_by_org_id: string | null;
          status: Database["public"]["Enums"]["jetty_status"];
          time_zone: string;
        };
        ComputedFields: never;
        Insert: {
          admin_area?: string | null;
          aliases?: string[];
          country_code: string;
          created_at?: string;
          id?: string;
          lat: number;
          lng: number;
          name: string;
          proposed_by_org_id?: string | null;
          status?: Database["public"]["Enums"]["jetty_status"];
          time_zone: string;
        };
        Update: {
          admin_area?: string | null;
          aliases?: string[];
          country_code?: string;
          created_at?: string;
          id?: string;
          lat?: number;
          lng?: number;
          name?: string;
          proposed_by_org_id?: string | null;
          status?: Database["public"]["Enums"]["jetty_status"];
          time_zone?: string;
        };
        Relationships: [
          {
            foreignKeyName: "jetties_country_code_countries_code_fk";
            columns: ["country_code"];
            isOneToOne: false;
            referencedRelation: "countries";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "jetties_proposed_by_org_id_orgs_id_fk";
            columns: ["proposed_by_org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      ledger_entries: {
        Row: {
          account: Database["public"]["Enums"]["ledger_account"];
          created_at: string;
          credit_minor: number;
          currency: string;
          debit_minor: number;
          id: string;
          memo: string;
          org_id: string | null;
          payment_id: string | null;
          payout_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          account: Database["public"]["Enums"]["ledger_account"];
          created_at?: string;
          credit_minor?: number;
          currency: string;
          debit_minor?: number;
          id?: string;
          memo: string;
          org_id?: string | null;
          payment_id?: string | null;
          payout_id?: string | null;
        };
        Update: {
          account?: Database["public"]["Enums"]["ledger_account"];
          created_at?: string;
          credit_minor?: number;
          currency?: string;
          debit_minor?: number;
          id?: string;
          memo?: string;
          org_id?: string | null;
          payment_id?: string | null;
          payout_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ledger_entries_currency_currencies_code_fk";
            columns: ["currency"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "ledger_entries_org_id_orgs_id_fk";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ledger_entries_payment_id_payments_id_fk";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
        ];
      };
      locales: {
        Row: {
          code: string;
          enabled: boolean;
          name: string;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          enabled?: boolean;
          name: string;
        };
        Update: {
          code?: string;
          enabled?: boolean;
          name?: string;
        };
        Relationships: [];
      };
      manifest_entries: {
        Row: {
          age_band: Database["public"]["Enums"]["age_band"] | null;
          boarded_at: string | null;
          client_id: string | null;
          created_at: string;
          full_name: string | null;
          id: string;
          is_amendment: boolean;
          next_of_kin_phone: string | null;
          org_id: string;
          phone_e164: string | null;
          seats: number;
          sex: string | null;
          ticket_id: string | null;
          trip_id: string;
        };
        ComputedFields: never;
        Insert: {
          age_band?: Database["public"]["Enums"]["age_band"] | null;
          boarded_at?: string | null;
          client_id?: string | null;
          created_at?: string;
          full_name?: string | null;
          id?: string;
          is_amendment?: boolean;
          next_of_kin_phone?: string | null;
          org_id: string;
          phone_e164?: string | null;
          seats?: number;
          sex?: string | null;
          ticket_id?: string | null;
          trip_id: string;
        };
        Update: {
          age_band?: Database["public"]["Enums"]["age_band"] | null;
          boarded_at?: string | null;
          client_id?: string | null;
          created_at?: string;
          full_name?: string | null;
          id?: string;
          is_amendment?: boolean;
          next_of_kin_phone?: string | null;
          org_id?: string;
          phone_e164?: string | null;
          seats?: number;
          sex?: string | null;
          ticket_id?: string | null;
          trip_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "manifest_entries_org_id_orgs_id_fk";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "manifest_entries_ticket_id_tickets_id_fk";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "tickets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "manifest_entries_trip_id_trips_id_fk";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      memberships: {
        Row: {
          created_at: string;
          id: string;
          invited_by: string | null;
          org_id: string;
          role: Database["public"]["Enums"]["membership_role"];
          status: Database["public"]["Enums"]["membership_status"];
          updated_at: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          invited_by?: string | null;
          org_id: string;
          role: Database["public"]["Enums"]["membership_role"];
          status?: Database["public"]["Enums"]["membership_status"];
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          invited_by?: string | null;
          org_id?: string;
          role?: Database["public"]["Enums"]["membership_role"];
          status?: Database["public"]["Enums"]["membership_status"];
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "memberships_invited_by_profiles_id_fk";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "memberships_org_id_orgs_id_fk";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "memberships_user_id_profiles_id_fk";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          channel: string;
          id: string;
          org_id: string;
          payload: NonNullable<Json>;
          read_at: string | null;
          sent_at: string;
          status: string;
          template: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          channel?: string;
          id?: string;
          org_id: string;
          payload: NonNullable<Json>;
          read_at?: string | null;
          sent_at?: string;
          status?: string;
          template: string;
          user_id: string;
        };
        Update: {
          channel?: string;
          id?: string;
          org_id?: string;
          payload?: NonNullable<Json>;
          read_at?: string | null;
          sent_at?: string;
          status?: string;
          template?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_org_id_orgs_id_fk";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_user_id_profiles_id_fk";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      org_settlement_accounts: {
        Row: {
          created_at: string;
          org_id: string;
          provider: string;
          subaccount_code: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          org_id: string;
          provider: string;
          subaccount_code: string;
        };
        Update: {
          created_at?: string;
          org_id?: string;
          provider?: string;
          subaccount_code?: string;
        };
        Relationships: [
          {
            foreignKeyName: "org_settlement_accounts_org_id_orgs_id_fk";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      orgs: {
        Row: {
          address: string | null;
          country_code: string;
          created_at: string;
          currency: string;
          data_region: Database["public"]["Enums"]["data_region"];
          default_locale: string;
          id: string;
          modes: string[];
          name: string;
          region: string | null;
          registration_number: string | null;
          settings: NonNullable<Json>;
          subscription_status: string | null;
          time_zone: string;
          type: Database["public"]["Enums"]["org_type"];
          updated_at: string | null;
          verification_status: Database["public"]["Enums"]["verification_status"];
        };
        ComputedFields: never;
        Insert: {
          address?: string | null;
          country_code: string;
          created_at?: string;
          currency: string;
          data_region: Database["public"]["Enums"]["data_region"];
          default_locale: string;
          id?: string;
          modes?: string[];
          name: string;
          region?: string | null;
          registration_number?: string | null;
          settings?: NonNullable<Json>;
          subscription_status?: string | null;
          time_zone: string;
          type: Database["public"]["Enums"]["org_type"];
          updated_at?: string | null;
          verification_status?: Database["public"]["Enums"]["verification_status"];
        };
        Update: {
          address?: string | null;
          country_code?: string;
          created_at?: string;
          currency?: string;
          data_region?: Database["public"]["Enums"]["data_region"];
          default_locale?: string;
          id?: string;
          modes?: string[];
          name?: string;
          region?: string | null;
          registration_number?: string | null;
          settings?: NonNullable<Json>;
          subscription_status?: string | null;
          time_zone?: string;
          type?: Database["public"]["Enums"]["org_type"];
          updated_at?: string | null;
          verification_status?: Database["public"]["Enums"]["verification_status"];
        };
        Relationships: [
          {
            foreignKeyName: "orgs_country_code_countries_code_fk";
            columns: ["country_code"];
            isOneToOne: false;
            referencedRelation: "countries";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "orgs_currency_currencies_code_fk";
            columns: ["currency"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "orgs_default_locale_locales_code_fk";
            columns: ["default_locale"];
            isOneToOne: false;
            referencedRelation: "locales";
            referencedColumns: ["code"];
          },
        ];
      };
      payment_provider_routes: {
        Row: {
          country_code: string;
          currency: string;
          enabled: boolean;
          id: string;
          priority: number;
          provider: Database["public"]["Enums"]["payment_provider"];
          purpose: Database["public"]["Enums"]["payment_purpose"];
        };
        ComputedFields: never;
        Insert: {
          country_code: string;
          currency: string;
          enabled?: boolean;
          id?: string;
          priority?: number;
          provider: Database["public"]["Enums"]["payment_provider"];
          purpose: Database["public"]["Enums"]["payment_purpose"];
        };
        Update: {
          country_code?: string;
          currency?: string;
          enabled?: boolean;
          id?: string;
          priority?: number;
          provider?: Database["public"]["Enums"]["payment_provider"];
          purpose?: Database["public"]["Enums"]["payment_purpose"];
        };
        Relationships: [
          {
            foreignKeyName: "payment_provider_routes_country_code_countries_code_fk";
            columns: ["country_code"];
            isOneToOne: false;
            referencedRelation: "countries";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "payment_provider_routes_currency_currencies_code_fk";
            columns: ["currency"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
        ];
      };
      payments: {
        Row: {
          amount_minor: number;
          created_at: string;
          currency: string;
          id: string;
          org_id: string;
          paid_at: string | null;
          payer_org_id: string | null;
          payer_user_id: string | null;
          platform_fee_minor: number;
          provider: Database["public"]["Enums"]["payment_method"];
          provider_fee_minor: number;
          provider_ref: string;
          purpose: Database["public"]["Enums"]["payment_purpose"];
          raw: Json | null;
          reference_id: string;
          reference_type: string;
          status: Database["public"]["Enums"]["payment_status"];
        };
        ComputedFields: never;
        Insert: {
          amount_minor: number;
          created_at?: string;
          currency: string;
          id?: string;
          org_id: string;
          paid_at?: string | null;
          payer_org_id?: string | null;
          payer_user_id?: string | null;
          platform_fee_minor?: number;
          provider: Database["public"]["Enums"]["payment_method"];
          provider_fee_minor?: number;
          provider_ref: string;
          purpose: Database["public"]["Enums"]["payment_purpose"];
          raw?: Json | null;
          reference_id: string;
          reference_type: string;
          status?: Database["public"]["Enums"]["payment_status"];
        };
        Update: {
          amount_minor?: number;
          created_at?: string;
          currency?: string;
          id?: string;
          org_id?: string;
          paid_at?: string | null;
          payer_org_id?: string | null;
          payer_user_id?: string | null;
          platform_fee_minor?: number;
          provider?: Database["public"]["Enums"]["payment_method"];
          provider_fee_minor?: number;
          provider_ref?: string;
          purpose?: Database["public"]["Enums"]["payment_purpose"];
          raw?: Json | null;
          reference_id?: string;
          reference_type?: string;
          status?: Database["public"]["Enums"]["payment_status"];
        };
        Relationships: [
          {
            foreignKeyName: "payments_currency_currencies_code_fk";
            columns: ["currency"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "payments_org_id_orgs_id_fk";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      plan_prices: {
        Row: {
          active_from: string;
          country_code: string | null;
          currency: string;
          id: string;
          plan_code: string;
          price_minor: number;
        };
        ComputedFields: never;
        Insert: {
          active_from?: string;
          country_code?: string | null;
          currency: string;
          id?: string;
          plan_code: string;
          price_minor: number;
        };
        Update: {
          active_from?: string;
          country_code?: string | null;
          currency?: string;
          id?: string;
          plan_code?: string;
          price_minor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "plan_prices_country_code_countries_code_fk";
            columns: ["country_code"];
            isOneToOne: false;
            referencedRelation: "countries";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "plan_prices_currency_currencies_code_fk";
            columns: ["currency"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "plan_prices_plan_code_plans_code_fk";
            columns: ["plan_code"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["code"];
          },
        ];
      };
      plans: {
        Row: {
          code: string;
          limits: NonNullable<Json>;
          mode: string;
          name_key: string;
          unit: Database["public"]["Enums"]["plan_unit"];
        };
        ComputedFields: never;
        Insert: {
          code: string;
          limits?: NonNullable<Json>;
          mode: string;
          name_key: string;
          unit: Database["public"]["Enums"]["plan_unit"];
        };
        Update: {
          code?: string;
          limits?: NonNullable<Json>;
          mode?: string;
          name_key?: string;
          unit?: Database["public"]["Enums"]["plan_unit"];
        };
        Relationships: [];
      };
      platform_admins: {
        Row: {
          created_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "platform_admins_user_id_profiles_id_fk";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
          locale: string | null;
          phone_e164: string | null;
          time_zone: string | null;
          updated_at: string | null;
          whatsapp_opt_in: boolean;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id: string;
          locale?: string | null;
          phone_e164?: string | null;
          time_zone?: string | null;
          updated_at?: string | null;
          whatsapp_opt_in?: boolean;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          locale?: string | null;
          phone_e164?: string | null;
          time_zone?: string | null;
          updated_at?: string | null;
          whatsapp_opt_in?: boolean;
        };
        Relationships: [];
      };
      reconciliation_issues: {
        Row: {
          created_at: string;
          detail: NonNullable<Json>;
          id: string;
          kind: string;
          payment_id: string | null;
          resolved_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          detail?: NonNullable<Json>;
          id?: string;
          kind: string;
          payment_id?: string | null;
          resolved_at?: string | null;
        };
        Update: {
          created_at?: string;
          detail?: NonNullable<Json>;
          id?: string;
          kind?: string;
          payment_id?: string | null;
          resolved_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "reconciliation_issues_payment_id_payments_id_fk";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
        ];
      };
      regulators: {
        Row: {
          id: string;
          name: string;
          rule_set_id: string;
          scope: Database["public"]["Enums"]["regulator_scope"];
          short_name: string;
          website: string | null;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          name: string;
          rule_set_id: string;
          scope: Database["public"]["Enums"]["regulator_scope"];
          short_name: string;
          website?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          rule_set_id?: string;
          scope?: Database["public"]["Enums"]["regulator_scope"];
          short_name?: string;
          website?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "regulators_rule_set_id_compliance_rule_sets_id_fk";
            columns: ["rule_set_id"];
            isOneToOne: false;
            referencedRelation: "compliance_rule_sets";
            referencedColumns: ["id"];
          },
        ];
      };
      routes: {
        Row: {
          active: boolean;
          base_fare_minor: number;
          created_at: string;
          currency: string;
          destination_jetty_id: string;
          distance_km: number | null;
          duration_min: number;
          id: string;
          org_id: string;
          origin_jetty_id: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          base_fare_minor: number;
          created_at?: string;
          currency: string;
          destination_jetty_id: string;
          distance_km?: number | null;
          duration_min: number;
          id?: string;
          org_id: string;
          origin_jetty_id: string;
        };
        Update: {
          active?: boolean;
          base_fare_minor?: number;
          created_at?: string;
          currency?: string;
          destination_jetty_id?: string;
          distance_km?: number | null;
          duration_min?: number;
          id?: string;
          org_id?: string;
          origin_jetty_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "routes_currency_currencies_code_fk";
            columns: ["currency"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "routes_destination_jetty_id_jetties_id_fk";
            columns: ["destination_jetty_id"];
            isOneToOne: false;
            referencedRelation: "jetties";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "routes_org_id_orgs_id_fk";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "routes_origin_jetty_id_jetties_id_fk";
            columns: ["origin_jetty_id"];
            isOneToOne: false;
            referencedRelation: "jetties";
            referencedColumns: ["id"];
          },
        ];
      };
      safety_acknowledgements: {
        Row: {
          acknowledged_at: string;
          acknowledged_by: string;
          org_id: string;
          safety_check_id: string;
        };
        ComputedFields: never;
        Insert: {
          acknowledged_at?: string;
          acknowledged_by: string;
          org_id: string;
          safety_check_id: string;
        };
        Update: {
          acknowledged_at?: string;
          acknowledged_by?: string;
          org_id?: string;
          safety_check_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "safety_acknowledgements_org_id_orgs_id_fk";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "safety_acknowledgements_safety_check_id_safety_checks_id_fk";
            columns: ["safety_check_id"];
            isOneToOne: true;
            referencedRelation: "safety_checks";
            referencedColumns: ["id"];
          },
        ];
      };
      safety_checks: {
        Row: {
          checked_at: string;
          checked_by: string;
          client_id: string | null;
          created_at: string;
          id: string;
          offline: boolean;
          org_id: string;
          reasons: NonNullable<Json>;
          result: Database["public"]["Enums"]["safety_result"];
          rules_applied: NonNullable<Json>;
          sunrise: string | null;
          sunset: string | null;
          trip_id: string;
          weather_fetched_at: string | null;
          weather_snapshot: Json | null;
        };
        ComputedFields: never;
        Insert: {
          checked_at: string;
          checked_by: string;
          client_id?: string | null;
          created_at?: string;
          id?: string;
          offline?: boolean;
          org_id: string;
          reasons?: NonNullable<Json>;
          result: Database["public"]["Enums"]["safety_result"];
          rules_applied: NonNullable<Json>;
          sunrise?: string | null;
          sunset?: string | null;
          trip_id: string;
          weather_fetched_at?: string | null;
          weather_snapshot?: Json | null;
        };
        Update: {
          checked_at?: string;
          checked_by?: string;
          client_id?: string | null;
          created_at?: string;
          id?: string;
          offline?: boolean;
          org_id?: string;
          reasons?: NonNullable<Json>;
          result?: Database["public"]["Enums"]["safety_result"];
          rules_applied?: NonNullable<Json>;
          sunrise?: string | null;
          sunset?: string | null;
          trip_id?: string;
          weather_fetched_at?: string | null;
          weather_snapshot?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "safety_checks_org_id_orgs_id_fk";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "safety_checks_trip_id_trips_id_fk";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      safety_override_requests: {
        Row: {
          id: string;
          note: string | null;
          org_id: string;
          requested_at: string;
          requested_by: string;
          safety_check_id: string;
          trip_id: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          note?: string | null;
          org_id: string;
          requested_at?: string;
          requested_by: string;
          safety_check_id: string;
          trip_id: string;
        };
        Update: {
          id?: string;
          note?: string | null;
          org_id?: string;
          requested_at?: string;
          requested_by?: string;
          safety_check_id?: string;
          trip_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "safety_override_requests_org_id_orgs_id_fk";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "safety_override_requests_safety_check_id_safety_checks_id_fk";
            columns: ["safety_check_id"];
            isOneToOne: false;
            referencedRelation: "safety_checks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "safety_override_requests_trip_id_trips_id_fk";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      safety_overrides: {
        Row: {
          decided_at: string;
          decided_by: string;
          decision: Database["public"]["Enums"]["override_decision"];
          id: string;
          org_id: string;
          reason: string;
          request_id: string;
          requested_at: string;
          requested_by: string;
          safety_check_id: string;
          trip_id: string;
        };
        ComputedFields: never;
        Insert: {
          decided_at?: string;
          decided_by: string;
          decision: Database["public"]["Enums"]["override_decision"];
          id?: string;
          org_id: string;
          reason: string;
          request_id: string;
          requested_at: string;
          requested_by: string;
          safety_check_id: string;
          trip_id: string;
        };
        Update: {
          decided_at?: string;
          decided_by?: string;
          decision?: Database["public"]["Enums"]["override_decision"];
          id?: string;
          org_id?: string;
          reason?: string;
          request_id?: string;
          requested_at?: string;
          requested_by?: string;
          safety_check_id?: string;
          trip_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "safety_overrides_org_id_orgs_id_fk";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "safety_overrides_request_id_safety_override_requests_id_fk";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "safety_override_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "safety_overrides_safety_check_id_safety_checks_id_fk";
            columns: ["safety_check_id"];
            isOneToOne: false;
            referencedRelation: "safety_checks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "safety_overrides_trip_id_trips_id_fk";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      safety_rule_defaults: {
        Row: {
          max_gust_kmh: number;
          max_precip_mm_h: number;
          max_wave_m: number;
          max_wind_kmh: number;
          night_block: boolean;
          permitted_end: string | null;
          permitted_start: string | null;
          rule_set_id: string;
        };
        ComputedFields: never;
        Insert: {
          max_gust_kmh: number;
          max_precip_mm_h?: number;
          max_wave_m: number;
          max_wind_kmh: number;
          night_block?: boolean;
          permitted_end?: string | null;
          permitted_start?: string | null;
          rule_set_id: string;
        };
        Update: {
          max_gust_kmh?: number;
          max_precip_mm_h?: number;
          max_wave_m?: number;
          max_wind_kmh?: number;
          night_block?: boolean;
          permitted_end?: string | null;
          permitted_start?: string | null;
          rule_set_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "safety_rule_defaults_rule_set_id_compliance_rule_sets_id_fk";
            columns: ["rule_set_id"];
            isOneToOne: true;
            referencedRelation: "compliance_rule_sets";
            referencedColumns: ["id"];
          },
        ];
      };
      safety_thresholds: {
        Row: {
          max_gust_kmh: number;
          max_precip_mm_h: number;
          max_wave_m: number;
          max_wind_kmh: number;
          night_block: boolean;
          org_id: string;
          permitted_end: string | null;
          permitted_start: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          max_gust_kmh: number;
          max_precip_mm_h: number;
          max_wave_m: number;
          max_wind_kmh: number;
          night_block?: boolean;
          org_id: string;
          permitted_end?: string | null;
          permitted_start?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          max_gust_kmh?: number;
          max_precip_mm_h?: number;
          max_wave_m?: number;
          max_wind_kmh?: number;
          night_block?: boolean;
          org_id?: string;
          permitted_end?: string | null;
          permitted_start?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "safety_thresholds_org_id_orgs_id_fk";
            columns: ["org_id"];
            isOneToOne: true;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      schedules: {
        Row: {
          active: boolean;
          created_at: string;
          days_of_week: number[];
          departure_time: string;
          id: string;
          org_id: string;
          route_id: string;
          vessel_id: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          created_at?: string;
          days_of_week: number[];
          departure_time: string;
          id?: string;
          org_id: string;
          route_id: string;
          vessel_id: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          days_of_week?: number[];
          departure_time?: string;
          id?: string;
          org_id?: string;
          route_id?: string;
          vessel_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "schedules_org_id_orgs_id_fk";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "schedules_route_id_routes_id_fk";
            columns: ["route_id"];
            isOneToOne: false;
            referencedRelation: "routes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "schedules_vessel_id_vessels_id_fk";
            columns: ["vessel_id"];
            isOneToOne: false;
            referencedRelation: "vessels";
            referencedColumns: ["id"];
          },
        ];
      };
      subscriptions: {
        Row: {
          amount_minor: number;
          created_at: string;
          currency: string;
          id: string;
          org_id: string;
          period_end: string | null;
          period_start: string | null;
          plan_code: string;
          provider_subscription_ref: string | null;
          quantity: number;
          status: Database["public"]["Enums"]["subscription_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          amount_minor: number;
          created_at?: string;
          currency: string;
          id?: string;
          org_id: string;
          period_end?: string | null;
          period_start?: string | null;
          plan_code: string;
          provider_subscription_ref?: string | null;
          quantity?: number;
          status?: Database["public"]["Enums"]["subscription_status"];
          updated_at?: string;
        };
        Update: {
          amount_minor?: number;
          created_at?: string;
          currency?: string;
          id?: string;
          org_id?: string;
          period_end?: string | null;
          period_start?: string | null;
          plan_code?: string;
          provider_subscription_ref?: string | null;
          quantity?: number;
          status?: Database["public"]["Enums"]["subscription_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_currency_currencies_code_fk";
            columns: ["currency"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "subscriptions_org_id_orgs_id_fk";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscriptions_plan_code_plans_code_fk";
            columns: ["plan_code"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["code"];
          },
        ];
      };
      sync_ops: {
        Row: {
          client_id: string;
          op: string;
          org_id: string;
          processed_at: string;
          recorded_at: string | null;
          result: NonNullable<Json>;
          status: Database["public"]["Enums"]["sync_op_status"];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          client_id: string;
          op: string;
          org_id: string;
          processed_at?: string;
          recorded_at?: string | null;
          result?: NonNullable<Json>;
          status: Database["public"]["Enums"]["sync_op_status"];
          user_id: string;
        };
        Update: {
          client_id?: string;
          op?: string;
          org_id?: string;
          processed_at?: string;
          recorded_at?: string | null;
          result?: NonNullable<Json>;
          status?: Database["public"]["Enums"]["sync_op_status"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sync_ops_org_id_orgs_id_fk";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      tax_rules: {
        Row: {
          applies_to: string;
          code: string;
          id: string;
          label_key: string;
          rate_bps: number;
          rule_set_id: string;
        };
        ComputedFields: never;
        Insert: {
          applies_to: string;
          code: string;
          id?: string;
          label_key: string;
          rate_bps: number;
          rule_set_id: string;
        };
        Update: {
          applies_to?: string;
          code?: string;
          id?: string;
          label_key?: string;
          rate_bps?: number;
          rule_set_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tax_rules_rule_set_id_compliance_rule_sets_id_fk";
            columns: ["rule_set_id"];
            isOneToOne: false;
            referencedRelation: "compliance_rule_sets";
            referencedColumns: ["id"];
          },
        ];
      };
      tickets: {
        Row: {
          buyer_name: string;
          buyer_phone: string | null;
          channel: Database["public"]["Enums"]["ticket_channel"];
          code: string;
          created_at: string;
          currency: string;
          fee_bearer: Database["public"]["Enums"]["fee_bearer"];
          id: string;
          org_id: string;
          passenger_user_id: string | null;
          payment_id: string | null;
          platform_fee_minor: number;
          qty: number;
          reserved_until: string | null;
          route_id: string | null;
          status: Database["public"]["Enums"]["ticket_status"];
          total_minor: number;
          trip_id: string;
          unit_price_minor: number;
        };
        ComputedFields: never;
        Insert: {
          buyer_name: string;
          buyer_phone?: string | null;
          channel: Database["public"]["Enums"]["ticket_channel"];
          code: string;
          created_at?: string;
          currency: string;
          fee_bearer: Database["public"]["Enums"]["fee_bearer"];
          id?: string;
          org_id: string;
          passenger_user_id?: string | null;
          payment_id?: string | null;
          platform_fee_minor: number;
          qty: number;
          reserved_until?: string | null;
          route_id?: string | null;
          status?: Database["public"]["Enums"]["ticket_status"];
          total_minor: number;
          trip_id: string;
          unit_price_minor: number;
        };
        Update: {
          buyer_name?: string;
          buyer_phone?: string | null;
          channel?: Database["public"]["Enums"]["ticket_channel"];
          code?: string;
          created_at?: string;
          currency?: string;
          fee_bearer?: Database["public"]["Enums"]["fee_bearer"];
          id?: string;
          org_id?: string;
          passenger_user_id?: string | null;
          payment_id?: string | null;
          platform_fee_minor?: number;
          qty?: number;
          reserved_until?: string | null;
          route_id?: string | null;
          status?: Database["public"]["Enums"]["ticket_status"];
          total_minor?: number;
          trip_id?: string;
          unit_price_minor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "tickets_currency_currencies_code_fk";
            columns: ["currency"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "tickets_org_id_orgs_id_fk";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tickets_payment_id_payments_id_fk";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tickets_route_id_routes_id_fk";
            columns: ["route_id"];
            isOneToOne: false;
            referencedRelation: "routes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tickets_trip_id_trips_id_fk";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trip_positions: {
        Row: {
          accuracy_m: number | null;
          client_id: string;
          id: string;
          lat: number;
          lng: number;
          org_id: string;
          received_at: string;
          recorded_at: string;
          speed_kn: number | null;
          trip_id: string;
        };
        ComputedFields: never;
        Insert: {
          accuracy_m?: number | null;
          client_id: string;
          id?: string;
          lat: number;
          lng: number;
          org_id: string;
          received_at?: string;
          recorded_at: string;
          speed_kn?: number | null;
          trip_id: string;
        };
        Update: {
          accuracy_m?: number | null;
          client_id?: string;
          id?: string;
          lat?: number;
          lng?: number;
          org_id?: string;
          received_at?: string;
          recorded_at?: string;
          speed_kn?: number | null;
          trip_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trip_positions_org_id_orgs_id_fk";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trip_positions_trip_id_trips_id_fk";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trips: {
        Row: {
          actual_arrival: string | null;
          actual_departure: string | null;
          captain_crew_id: string | null;
          cargo_note: string | null;
          client_id: string | null;
          created_at: string;
          currency: string;
          destination_text: string | null;
          id: string;
          lifejackets_confirmed: boolean;
          notes: string | null;
          org_id: string;
          origin_text: string | null;
          passenger_count: number;
          route_id: string | null;
          schedule_id: string | null;
          scheduled_departure: string | null;
          source: Database["public"]["Enums"]["trip_source"];
          status: Database["public"]["Enums"]["trip_status"];
          takings_cash_minor: number;
          takings_digital_minor: number;
          updated_at: string | null;
          vessel_id: string;
        };
        ComputedFields: never;
        Insert: {
          actual_arrival?: string | null;
          actual_departure?: string | null;
          captain_crew_id?: string | null;
          cargo_note?: string | null;
          client_id?: string | null;
          created_at?: string;
          currency: string;
          destination_text?: string | null;
          id?: string;
          lifejackets_confirmed?: boolean;
          notes?: string | null;
          org_id: string;
          origin_text?: string | null;
          passenger_count?: number;
          route_id?: string | null;
          schedule_id?: string | null;
          scheduled_departure?: string | null;
          source?: Database["public"]["Enums"]["trip_source"];
          status?: Database["public"]["Enums"]["trip_status"];
          takings_cash_minor?: number;
          takings_digital_minor?: number;
          updated_at?: string | null;
          vessel_id: string;
        };
        Update: {
          actual_arrival?: string | null;
          actual_departure?: string | null;
          captain_crew_id?: string | null;
          cargo_note?: string | null;
          client_id?: string | null;
          created_at?: string;
          currency?: string;
          destination_text?: string | null;
          id?: string;
          lifejackets_confirmed?: boolean;
          notes?: string | null;
          org_id?: string;
          origin_text?: string | null;
          passenger_count?: number;
          route_id?: string | null;
          schedule_id?: string | null;
          scheduled_departure?: string | null;
          source?: Database["public"]["Enums"]["trip_source"];
          status?: Database["public"]["Enums"]["trip_status"];
          takings_cash_minor?: number;
          takings_digital_minor?: number;
          updated_at?: string | null;
          vessel_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trips_captain_crew_id_crew_members_id_fk";
            columns: ["captain_crew_id"];
            isOneToOne: false;
            referencedRelation: "crew_members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trips_currency_currencies_code_fk";
            columns: ["currency"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "trips_org_id_orgs_id_fk";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trips_route_id_routes_id_fk";
            columns: ["route_id"];
            isOneToOne: false;
            referencedRelation: "routes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trips_schedule_id_schedules_id_fk";
            columns: ["schedule_id"];
            isOneToOne: false;
            referencedRelation: "schedules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trips_vessel_id_vessels_id_fk";
            columns: ["vessel_id"];
            isOneToOne: false;
            referencedRelation: "vessels";
            referencedColumns: ["id"];
          },
        ];
      };
      vessel_crew: {
        Row: {
          created_at: string;
          crew_member_id: string;
          from_date: string;
          id: string;
          org_id: string;
          to_date: string | null;
          vessel_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          crew_member_id: string;
          from_date?: string;
          id?: string;
          org_id: string;
          to_date?: string | null;
          vessel_id: string;
        };
        Update: {
          created_at?: string;
          crew_member_id?: string;
          from_date?: string;
          id?: string;
          org_id?: string;
          to_date?: string | null;
          vessel_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vessel_crew_crew_member_id_crew_members_id_fk";
            columns: ["crew_member_id"];
            isOneToOne: false;
            referencedRelation: "crew_members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vessel_crew_org_id_orgs_id_fk";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vessel_crew_vessel_id_vessels_id_fk";
            columns: ["vessel_id"];
            isOneToOne: false;
            referencedRelation: "vessels";
            referencedColumns: ["id"];
          },
        ];
      };
      vessels: {
        Row: {
          cargo_capacity_t: number | null;
          charter_enabled: boolean;
          created_at: string;
          engine: string | null;
          ferry_enabled: boolean;
          flag_country_code: string | null;
          home_jetty_id: string | null;
          id: string;
          idle_since: string | null;
          imo: string | null;
          length_m: number | null;
          mmsi: string | null;
          name: string;
          operating_country_code: string;
          org_id: string;
          passenger_capacity: number | null;
          photos: string[];
          registration_no: string | null;
          status: Database["public"]["Enums"]["vessel_status"];
          type: Database["public"]["Enums"]["vessel_type"];
          updated_at: string | null;
          year_built: number | null;
        };
        ComputedFields: never;
        Insert: {
          cargo_capacity_t?: number | null;
          charter_enabled?: boolean;
          created_at?: string;
          engine?: string | null;
          ferry_enabled?: boolean;
          flag_country_code?: string | null;
          home_jetty_id?: string | null;
          id?: string;
          idle_since?: string | null;
          imo?: string | null;
          length_m?: number | null;
          mmsi?: string | null;
          name: string;
          operating_country_code: string;
          org_id: string;
          passenger_capacity?: number | null;
          photos?: string[];
          registration_no?: string | null;
          status?: Database["public"]["Enums"]["vessel_status"];
          type: Database["public"]["Enums"]["vessel_type"];
          updated_at?: string | null;
          year_built?: number | null;
        };
        Update: {
          cargo_capacity_t?: number | null;
          charter_enabled?: boolean;
          created_at?: string;
          engine?: string | null;
          ferry_enabled?: boolean;
          flag_country_code?: string | null;
          home_jetty_id?: string | null;
          id?: string;
          idle_since?: string | null;
          imo?: string | null;
          length_m?: number | null;
          mmsi?: string | null;
          name?: string;
          operating_country_code?: string;
          org_id?: string;
          passenger_capacity?: number | null;
          photos?: string[];
          registration_no?: string | null;
          status?: Database["public"]["Enums"]["vessel_status"];
          type?: Database["public"]["Enums"]["vessel_type"];
          updated_at?: string | null;
          year_built?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "vessels_flag_country_code_countries_code_fk";
            columns: ["flag_country_code"];
            isOneToOne: false;
            referencedRelation: "countries";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "vessels_operating_country_code_countries_code_fk";
            columns: ["operating_country_code"];
            isOneToOne: false;
            referencedRelation: "countries";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "vessels_org_id_orgs_id_fk";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      wa_messages: {
        Row: {
          channel: Database["public"]["Enums"]["message_channel"];
          created_at: string;
          direction: Database["public"]["Enums"]["message_direction"];
          id: string;
          linked_entity_id: string | null;
          linked_entity_type: string | null;
          media_path: string | null;
          org_id: string | null;
          parsed: Json | null;
          phone_hash: string;
          state: Database["public"]["Enums"]["message_state"];
          transcript: string | null;
          type: string;
          user_id: string | null;
          wa_message_id: string;
        };
        ComputedFields: never;
        Insert: {
          channel?: Database["public"]["Enums"]["message_channel"];
          created_at?: string;
          direction: Database["public"]["Enums"]["message_direction"];
          id?: string;
          linked_entity_id?: string | null;
          linked_entity_type?: string | null;
          media_path?: string | null;
          org_id?: string | null;
          parsed?: Json | null;
          phone_hash: string;
          state?: Database["public"]["Enums"]["message_state"];
          transcript?: string | null;
          type: string;
          user_id?: string | null;
          wa_message_id: string;
        };
        Update: {
          channel?: Database["public"]["Enums"]["message_channel"];
          created_at?: string;
          direction?: Database["public"]["Enums"]["message_direction"];
          id?: string;
          linked_entity_id?: string | null;
          linked_entity_type?: string | null;
          media_path?: string | null;
          org_id?: string | null;
          parsed?: Json | null;
          phone_hash?: string;
          state?: Database["public"]["Enums"]["message_state"];
          transcript?: string | null;
          type?: string;
          user_id?: string | null;
          wa_message_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "wa_messages_org_id_orgs_id_fk";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
        ];
      };
      weather_cache: {
        Row: {
          data: NonNullable<Json>;
          fetched_at: string;
          key: string;
          lat: number;
          lng: number;
          source: string;
          valid_from: string;
          valid_to: string;
        };
        ComputedFields: never;
        Insert: {
          data: NonNullable<Json>;
          fetched_at: string;
          key: string;
          lat: number;
          lng: number;
          source: string;
          valid_from: string;
          valid_to: string;
        };
        Update: {
          data?: NonNullable<Json>;
          fetched_at?: string;
          key?: string;
          lat?: number;
          lng?: number;
          source?: string;
          valid_from?: string;
          valid_to?: string;
        };
        Relationships: [];
      };
      webhook_events: {
        Row: {
          event_id: string;
          payload: NonNullable<Json>;
          processed_at: string | null;
          provider: string;
          received_at: string;
        };
        ComputedFields: never;
        Insert: {
          event_id: string;
          payload: NonNullable<Json>;
          processed_at?: string | null;
          provider: string;
          received_at?: string;
        };
        Update: {
          event_id?: string;
          payload?: NonNullable<Json>;
          processed_at?: string | null;
          provider?: string;
          received_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      documents_live: {
        Row: {
          created_at: string;
          days_to_expiry: number | null;
          document_type_code: string;
          effective_status: Database["public"]["Enums"]["document_status"] | null;
          expiry_date: string | null;
          extracted: Json | null;
          extraction_confidence: number | null;
          file_path: string | null;
          id: string;
          is_public: boolean;
          issue_date: string | null;
          issuer: string | null;
          number: string | null;
          org_id: string;
          replaced_by: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: Database["public"]["Enums"]["document_status"];
          subject_id: string;
          subject_type: Database["public"]["Enums"]["applies_to"];
          updated_at: string | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "documents_document_type_code_document_types_code_fk";
            columns: ["document_type_code"];
            isOneToOne: false;
            referencedRelation: "document_types";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "documents_org_id_orgs_id_fk";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_reviewed_by_profiles_id_fk";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      accept_invitation: { Args: { p_token: string }; Returns: string };
      compliance_requirements: {
        Args: {
          p_applies_to?: Database["public"]["Enums"]["applies_to"];
          p_country: string;
          p_modes?: string[];
          p_vessel_type?: string;
        };
        Returns: {
          alert_offsets: number[];
          applies_to: Database["public"]["Enums"]["applies_to"];
          document_type_code: string;
          mandatory: boolean;
          name_key: string;
          regulator: string;
          rule_set_country: string;
          rule_set_id: string;
          rule_set_version: number;
        }[];
      };
      create_invitation: {
        Args: {
          p_expires_at: string;
          p_org: string;
          p_phone: string;
          p_role: Database["public"]["Enums"]["membership_role"];
          p_token_hash: string;
        };
        Returns: string;
      };
      create_org: {
        Args: {
          p_address?: string;
          p_country_code: string;
          p_modes: string[];
          p_name: string;
          p_region?: string;
          p_registration_number?: string;
          p_type: Database["public"]["Enums"]["org_type"];
        };
        Returns: string;
      };
      document_types_for: {
        Args: { p_applies_to: Database["public"]["Enums"]["applies_to"]; p_country: string };
        Returns: {
          applies_to: Database["public"]["Enums"]["applies_to"];
          code: string;
          default_validity_months: number;
          issuer_name: string;
          name_key: string;
        }[];
      };
      effective_document_status: {
        Args: {
          p_expiring_days?: number;
          p_expiry: string;
          p_status: Database["public"]["Enums"]["document_status"];
          p_today: string;
        };
        Returns: Database["public"]["Enums"]["document_status"];
      };
      fee_bps: { Args: { p_country: string; p_key: string; p_on?: string }; Returns: number };
      has_role: {
        Args: { p_org: string; p_roles?: Database["public"]["Enums"]["membership_role"][] };
        Returns: boolean;
      };
      invitation_preview: {
        Args: { p_token: string };
        Returns: {
          org_name: string;
          role: Database["public"]["Enums"]["membership_role"];
          status: string;
        }[];
      };
      is_platform_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      materialise_schedule_trips: { Args: { p_date: string; p_org: string }; Returns: number };
      new_rule_set_version: { Args: { p_id: string }; Returns: string };
      publish_rule_set: { Args: { p_id: string; p_note?: string }; Returns: undefined };
      reserve_ticket: {
        Args: {
          p_buyer_name: string;
          p_buyer_phone: string;
          p_channel: Database["public"]["Enums"]["ticket_channel"];
          p_code: string;
          p_currency: string;
          p_fee_bearer: Database["public"]["Enums"]["fee_bearer"];
          p_hold_minutes: number;
          p_passenger_user?: string;
          p_platform_fee_minor: number;
          p_qty: number;
          p_total_minor: number;
          p_trip: string;
          p_unit_price_minor: number;
        };
        Returns: {
          buyer_name: string;
          buyer_phone: string | null;
          channel: Database["public"]["Enums"]["ticket_channel"];
          code: string;
          created_at: string;
          currency: string;
          fee_bearer: Database["public"]["Enums"]["fee_bearer"];
          id: string;
          org_id: string;
          passenger_user_id: string | null;
          payment_id: string | null;
          platform_fee_minor: number;
          qty: number;
          reserved_until: string | null;
          route_id: string | null;
          status: Database["public"]["Enums"]["ticket_status"];
          total_minor: number;
          trip_id: string;
          unit_price_minor: number;
        };
        SetofOptions: {
          from: "*";
          to: "tickets";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      safety_defaults_for: {
        Args: { p_country: string };
        Returns: {
          max_gust_kmh: number;
          max_precip_mm_h: number;
          max_wave_m: number;
          max_wind_kmh: number;
          night_block: boolean;
          permitted_end: string;
          permitted_start: string;
        }[];
      };
    };
    Enums: {
      age_band: "child" | "adult" | "senior";
      ai_job_kind:
        | "ocr_extract"
        | "voice_log"
        | "tender_parse"
        | "tender_draft"
        | "price_rationale"
        | "weather_explain"
        | "assistant";
      ai_job_status: "queued" | "done" | "failed";
      alert_channel: "whatsapp" | "sms" | "email" | "in_app";
      applies_to: "vessel" | "crew" | "org";
      crew_role: "captain" | "engineer" | "deckhand" | "ticket_agent" | "other";
      crew_status: "active" | "inactive";
      data_region: "af" | "eu" | "us";
      document_status: "needs_review" | "valid" | "expiring" | "expired" | "rejected";
      fee_bearer: "passenger" | "operator";
      incident_status: "open" | "acknowledged" | "closed";
      jetty_status: "proposed" | "active";
      launch_status: "planned" | "validating" | "pilot" | "live";
      ledger_account: "escrow" | "platform_revenue" | "payee_payable" | "provider_fees";
      membership_role: "owner" | "manager" | "captain" | "crew" | "charterer";
      membership_status: "active" | "suspended";
      message_channel: "whatsapp" | "sms";
      message_direction: "in" | "out";
      message_state: "received" | "awaiting_confirm" | "confirmed" | "cancelled" | "failed";
      org_type: "ferry_operator" | "vessel_owner" | "charterer" | "barge_operator";
      override_decision: "approved" | "declined";
      payment_method: "paystack" | "flutterwave" | "stripe" | "fake" | "cash" | "transfer_manual";
      payment_provider: "paystack" | "flutterwave" | "stripe";
      payment_purpose: "ticket" | "subscription" | "invoice" | "charter_escrow" | "payout";
      payment_status: "initiated" | "success" | "failed" | "refunded";
      plan_unit: "per_org" | "per_vessel";
      record_source: "app" | "whatsapp_voice" | "whatsapp_text" | "sms";
      regulator_scope: "national" | "state" | "port";
      rule_set_status: "draft" | "published" | "retired";
      rule_severity: "block" | "warn";
      safety_result: "pass" | "warn" | "block";
      subscription_status: "trialing" | "active" | "past_due" | "read_only" | "cancelled";
      sync_op_status: "applied" | "conflict" | "rejected";
      ticket_channel: "online" | "agent_cash" | "agent_transfer";
      ticket_status: "reserved" | "paid" | "used" | "refunded" | "cancelled";
      trip_source: "app" | "whatsapp_voice" | "whatsapp_text" | "sms" | "admin";
      trip_status: "scheduled" | "boarding" | "departed" | "arrived" | "cancelled";
      verification_status: "unverified" | "pending" | "verified";
      vessel_status: "active" | "maintenance" | "idle" | "on_charter" | "laid_up";
      vessel_type: "ferry" | "crew_boat" | "osv" | "tug" | "barge" | "speedboat" | "other";
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
    keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      age_band: ["child", "adult", "senior"],
      ai_job_kind: [
        "ocr_extract",
        "voice_log",
        "tender_parse",
        "tender_draft",
        "price_rationale",
        "weather_explain",
        "assistant",
      ],
      ai_job_status: ["queued", "done", "failed"],
      alert_channel: ["whatsapp", "sms", "email", "in_app"],
      applies_to: ["vessel", "crew", "org"],
      crew_role: ["captain", "engineer", "deckhand", "ticket_agent", "other"],
      crew_status: ["active", "inactive"],
      data_region: ["af", "eu", "us"],
      document_status: ["needs_review", "valid", "expiring", "expired", "rejected"],
      fee_bearer: ["passenger", "operator"],
      incident_status: ["open", "acknowledged", "closed"],
      jetty_status: ["proposed", "active"],
      launch_status: ["planned", "validating", "pilot", "live"],
      ledger_account: ["escrow", "platform_revenue", "payee_payable", "provider_fees"],
      membership_role: ["owner", "manager", "captain", "crew", "charterer"],
      membership_status: ["active", "suspended"],
      message_channel: ["whatsapp", "sms"],
      message_direction: ["in", "out"],
      message_state: ["received", "awaiting_confirm", "confirmed", "cancelled", "failed"],
      org_type: ["ferry_operator", "vessel_owner", "charterer", "barge_operator"],
      override_decision: ["approved", "declined"],
      payment_method: ["paystack", "flutterwave", "stripe", "fake", "cash", "transfer_manual"],
      payment_provider: ["paystack", "flutterwave", "stripe"],
      payment_purpose: ["ticket", "subscription", "invoice", "charter_escrow", "payout"],
      payment_status: ["initiated", "success", "failed", "refunded"],
      plan_unit: ["per_org", "per_vessel"],
      record_source: ["app", "whatsapp_voice", "whatsapp_text", "sms"],
      regulator_scope: ["national", "state", "port"],
      rule_set_status: ["draft", "published", "retired"],
      rule_severity: ["block", "warn"],
      safety_result: ["pass", "warn", "block"],
      subscription_status: ["trialing", "active", "past_due", "read_only", "cancelled"],
      sync_op_status: ["applied", "conflict", "rejected"],
      ticket_channel: ["online", "agent_cash", "agent_transfer"],
      ticket_status: ["reserved", "paid", "used", "refunded", "cancelled"],
      trip_source: ["app", "whatsapp_voice", "whatsapp_text", "sms", "admin"],
      trip_status: ["scheduled", "boarding", "departed", "arrived", "cancelled"],
      verification_status: ["unverified", "pending", "verified"],
      vessel_status: ["active", "maintenance", "idle", "on_charter", "laid_up"],
      vessel_type: ["ferry", "crew_boat", "osv", "tug", "barge", "speedboat", "other"],
    },
  },
} as const;
