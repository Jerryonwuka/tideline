export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
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
      safety_rule_defaults: {
        Row: {
          max_gust_kmh: number;
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
          max_wave_m: number;
          max_wind_kmh: number;
          night_block?: boolean;
          permitted_end?: string | null;
          permitted_start?: string | null;
          rule_set_id: string;
        };
        Update: {
          max_gust_kmh?: number;
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
    };
    Views: {
      [_ in never]: never;
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
      new_rule_set_version: { Args: { p_id: string }; Returns: string };
      publish_rule_set: { Args: { p_id: string; p_note?: string }; Returns: undefined };
    };
    Enums: {
      applies_to: "vessel" | "crew" | "org";
      data_region: "af" | "eu" | "us";
      launch_status: "planned" | "validating" | "pilot" | "live";
      membership_role: "owner" | "manager" | "captain" | "crew" | "charterer";
      membership_status: "active" | "suspended";
      org_type: "ferry_operator" | "vessel_owner" | "charterer" | "barge_operator";
      payment_provider: "paystack" | "flutterwave" | "stripe";
      payment_purpose: "ticket" | "subscription" | "invoice" | "charter_escrow" | "payout";
      regulator_scope: "national" | "state" | "port";
      rule_set_status: "draft" | "published" | "retired";
      rule_severity: "block" | "warn";
      verification_status: "unverified" | "pending" | "verified";
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
      applies_to: ["vessel", "crew", "org"],
      data_region: ["af", "eu", "us"],
      launch_status: ["planned", "validating", "pilot", "live"],
      membership_role: ["owner", "manager", "captain", "crew", "charterer"],
      membership_status: ["active", "suspended"],
      org_type: ["ferry_operator", "vessel_owner", "charterer", "barge_operator"],
      payment_provider: ["paystack", "flutterwave", "stripe"],
      payment_purpose: ["ticket", "subscription", "invoice", "charter_escrow", "payout"],
      regulator_scope: ["national", "state", "port"],
      rule_set_status: ["draft", "published", "retired"],
      rule_severity: ["block", "warn"],
      verification_status: ["unverified", "pending", "verified"],
    },
  },
} as const;
