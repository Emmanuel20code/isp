export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17";
  };
  public: {
    Tables: {
      app_configurations: {
        Row: {
          category: string;
          created_at: string;
          description: string | null;
          id: string;
          is_public: boolean;
          key: string;
          updated_at: string;
          value: Json;
        };
        Insert: {
          category?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_public?: boolean;
          key: string;
          updated_at?: string;
          value?: Json;
        };
        Update: {
          category?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_public?: boolean;
          key?: string;
          updated_at?: string;
          value?: Json;
        };
        Relationships: [];
      };
      user_settings: {
        Row: {
          created_at: string;
          email_notifications: boolean;
          id: string;
          language: string;
          notifications_enabled: boolean;
          preferences: Json;
          sms_notifications: boolean;
          theme: string;
          timezone: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          email_notifications?: boolean;
          id?: string;
          language?: string;
          notifications_enabled?: boolean;
          preferences?: Json;
          sms_notifications?: boolean;
          theme?: string;
          timezone?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          email_notifications?: boolean;
          id?: string;
          language?: string;
          notifications_enabled?: boolean;
          preferences?: Json;
          sms_notifications?: boolean;
          theme?: string;
          timezone?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string | null;
          id: string;
          metadata: Json;
          tenant_id: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          metadata?: Json;
          tenant_id?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          metadata?: Json;
          tenant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      customers: {
        Row: {
          created_at: string;
          expires_at: string | null;
          full_name: string;
          id: string;
          kind: Database["public"]["Enums"]["package_kind"];
          mac_address: string | null;
          package_id: string | null;
          phone: string;
          router_id: string | null;
          status: Database["public"]["Enums"]["customer_status"];
          tenant_id: string;
          updated_at: string;
          username: string | null;
        };
        Insert: {
          created_at?: string;
          expires_at?: string | null;
          full_name: string;
          id?: string;
          kind?: Database["public"]["Enums"]["package_kind"];
          mac_address?: string | null;
          package_id?: string | null;
          phone: string;
          router_id?: string | null;
          status?: Database["public"]["Enums"]["customer_status"];
          tenant_id: string;
          updated_at?: string;
          username?: string | null;
        };
        Update: {
          created_at?: string;
          expires_at?: string | null;
          full_name?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["package_kind"];
          mac_address?: string | null;
          package_id?: string | null;
          phone?: string;
          router_id?: string | null;
          status?: Database["public"]["Enums"]["customer_status"];
          tenant_id?: string;
          updated_at?: string;
          username?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "customers_package_id_fkey";
            columns: ["package_id"];
            isOneToOne: false;
            referencedRelation: "packages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customers_router_id_fkey";
            columns: ["router_id"];
            isOneToOne: false;
            referencedRelation: "routers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      packages: {
        Row: {
          created_at: string;
          device_limit: number;
          duration_hours: number;
          id: string;
          is_active: boolean;
          kind: Database["public"]["Enums"]["package_kind"];
          name: string;
          price_kes: number;
          speed_down_mbps: number;
          speed_up_mbps: number;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          device_limit?: number;
          duration_hours: number;
          id?: string;
          is_active?: boolean;
          kind?: Database["public"]["Enums"]["package_kind"];
          name: string;
          price_kes: number;
          speed_down_mbps?: number;
          speed_up_mbps?: number;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          device_limit?: number;
          duration_hours?: number;
          id?: string;
          is_active?: boolean;
          kind?: Database["public"]["Enums"]["package_kind"];
          name?: string;
          price_kes?: number;
          speed_down_mbps?: number;
          speed_up_mbps?: number;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "packages_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_mpesa_config: {
        Row: {
          callback_base_url: string | null;
          consumer_key: string | null;
          consumer_secret: string | null;
          created_at: string;
          environment: string;
          id: boolean;
          passkey: string | null;
          shortcode: string | null;
          shortcode_kind: Database["public"]["Enums"]["mpesa_shortcode_type"];
          updated_at: string;
        };
        Insert: {
          callback_base_url?: string | null;
          consumer_key?: string | null;
          consumer_secret?: string | null;
          created_at?: string;
          environment?: string;
          id?: boolean;
          passkey?: string | null;
          shortcode?: string | null;
          shortcode_kind?: Database["public"]["Enums"]["mpesa_shortcode_type"];
          updated_at?: string;
        };
        Update: {
          callback_base_url?: string | null;
          consumer_key?: string | null;
          consumer_secret?: string | null;
          created_at?: string;
          environment?: string;
          id?: boolean;
          passkey?: string | null;
          shortcode?: string | null;
          shortcode_kind?: Database["public"]["Enums"]["mpesa_shortcode_type"];
          updated_at?: string;
        };
        Relationships: [];
      };
      platform_settings: {
        Row: {
          created_at: string;
          id: boolean;
          platform_name: string;
          saas_till_number: string | null;
          subscription_days: number;
          subscription_price_kes: number;
          support_email: string | null;
          support_phone: string | null;
          trial_days: number;
          updated_at: string;
          warning_days: number;
        };
        Insert: {
          created_at?: string;
          id?: boolean;
          platform_name?: string;
          saas_till_number?: string | null;
          subscription_days?: number;
          subscription_price_kes?: number;
          support_email?: string | null;
          support_phone?: string | null;
          trial_days?: number;
          updated_at?: string;
          warning_days?: number;
        };
        Update: {
          created_at?: string;
          id?: boolean;
          platform_name?: string;
          saas_till_number?: string | null;
          subscription_days?: number;
          subscription_price_kes?: number;
          support_email?: string | null;
          support_phone?: string | null;
          trial_days?: number;
          updated_at?: string;
          warning_days?: number;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id: string;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      router_commands: {
        Row: {
          action: string;
          completed_at: string | null;
          created_at: string;
          delivered_at: string | null;
          error: string | null;
          id: string;
          payload: Json;
          result: Json | null;
          router_id: string;
          status: Database["public"]["Enums"]["router_command_status"];
          tenant_id: string;
        };
        Insert: {
          action: string;
          completed_at?: string | null;
          created_at?: string;
          delivered_at?: string | null;
          error?: string | null;
          id?: string;
          payload?: Json;
          result?: Json | null;
          router_id: string;
          status?: Database["public"]["Enums"]["router_command_status"];
          tenant_id: string;
        };
        Update: {
          action?: string;
          completed_at?: string | null;
          created_at?: string;
          delivered_at?: string | null;
          error?: string | null;
          id?: string;
          payload?: Json;
          result?: Json | null;
          router_id?: string;
          status?: Database["public"]["Enums"]["router_command_status"];
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "router_commands_router_id_fkey";
            columns: ["router_id"];
            isOneToOne: false;
            referencedRelation: "routers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "router_commands_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      routers: {
        Row: {
          active_hotspot_users: number;
          active_pppoe_users: number;
          agent_key: string;
          agent_version: string | null;
          board_name: string | null;
          created_at: string;
          id: string;
          identity: string | null;
          last_error: string | null;
          last_seen_at: string | null;
          location: string | null;
          name: string;
          onboard_token: string;
          onboard_token_expires_at: string;
          onboarded_at: string | null;
          public_ip: string | null;
          ros_version: string | null;
          status: Database["public"]["Enums"]["router_status"];
          tenant_id: string;
          updated_at: string;
          uptime: string | null;
        };
        Insert: {
          active_hotspot_users?: number;
          active_pppoe_users?: number;
          agent_key?: string;
          agent_version?: string | null;
          board_name?: string | null;
          created_at?: string;
          id?: string;
          identity?: string | null;
          last_error?: string | null;
          last_seen_at?: string | null;
          location?: string | null;
          name: string;
          onboard_token?: string;
          onboard_token_expires_at?: string;
          onboarded_at?: string | null;
          public_ip?: string | null;
          ros_version?: string | null;
          status?: Database["public"]["Enums"]["router_status"];
          tenant_id: string;
          updated_at?: string;
          uptime?: string | null;
        };
        Update: {
          active_hotspot_users?: number;
          active_pppoe_users?: number;
          agent_key?: string;
          agent_version?: string | null;
          board_name?: string | null;
          created_at?: string;
          id?: string;
          identity?: string | null;
          last_error?: string | null;
          last_seen_at?: string | null;
          location?: string | null;
          name?: string;
          onboard_token?: string;
          onboard_token_expires_at?: string;
          onboarded_at?: string | null;
          public_ip?: string | null;
          ros_version?: string | null;
          status?: Database["public"]["Enums"]["router_status"];
          tenant_id?: string;
          updated_at?: string;
          uptime?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "routers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_members: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          tenant_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          tenant_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          tenant_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_settings: {
        Row: {
          brand_color: string;
          created_at: string;
          logo_url: string | null;
          portal_subtitle: string | null;
          portal_title: string | null;
          support_email: string | null;
          support_phone: string | null;
          tenant_id: string;
          terms_url: string | null;
          updated_at: string;
        };
        Insert: {
          brand_color?: string;
          created_at?: string;
          logo_url?: string | null;
          portal_subtitle?: string | null;
          portal_title?: string | null;
          support_email?: string | null;
          support_phone?: string | null;
          tenant_id: string;
          terms_url?: string | null;
          updated_at?: string;
        };
        Update: {
          brand_color?: string;
          created_at?: string;
          logo_url?: string | null;
          portal_subtitle?: string | null;
          portal_title?: string | null;
          support_email?: string | null;
          support_phone?: string | null;
          tenant_id?: string;
          terms_url?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_settings_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenants: {
        Row: {
          business_email: string | null;
          business_phone: string | null;
          county: string | null;
          created_at: string;
          id: string;
          is_active: boolean;
          mpesa_shortcode: string | null;
          mpesa_shortcode_kind: Database["public"]["Enums"]["mpesa_shortcode_type"] | null;
          mpesa_account_ref: string | null;
          name: string;
          owner_id: string;
          slug: string;
          subscription_end_at: string | null;
          subscription_start_at: string | null;
          subscription_status: Database["public"]["Enums"]["subscription_status"];
          trial_end_at: string;
          trial_start_at: string;
          updated_at: string;
        };
        Insert: {
          business_email?: string | null;
          business_phone?: string | null;
          county?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          mpesa_shortcode?: string | null;
          mpesa_shortcode_kind?: Database["public"]["Enums"]["mpesa_shortcode_type"] | null;
          mpesa_account_ref?: string | null;
          name: string;
          owner_id: string;
          slug: string;
          subscription_end_at?: string | null;
          subscription_start_at?: string | null;
          subscription_status?: Database["public"]["Enums"]["subscription_status"];
          trial_end_at?: string;
          trial_start_at?: string;
          updated_at?: string;
        };
        Update: {
          business_email?: string | null;
          business_phone?: string | null;
          county?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          mpesa_shortcode?: string | null;
          mpesa_shortcode_kind?: Database["public"]["Enums"]["mpesa_shortcode_type"] | null;
          mpesa_account_ref?: string | null;
          name?: string;
          owner_id?: string;
          slug?: string;
          subscription_end_at?: string | null;
          subscription_start_at?: string | null;
          subscription_status?: Database["public"]["Enums"]["subscription_status"];
          trial_end_at?: string;
          trial_start_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id: string;
          tenant_id: string;
          status: string;
          plan_type: string;
          expiry_date: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          status?: string;
          plan_type?: string;
          expiry_date: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          status?: string;
          plan_type?: string;
          expiry_date?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      transactions: {
        Row: {
          amount_kes: number;
          checkout_request_id: string | null;
          created_at: string;
          customer_id: string | null;
          failure_reason: string | null;
          id: string;
          kind: Database["public"]["Enums"]["txn_kind"];
          mpesa_receipt: string | null;
          package_id: string | null;
          phone: string;
          raw: Json;
          status: Database["public"]["Enums"]["txn_status"];
          tenant_id: string;
          voucher_id: string | null;
        };
        Insert: {
          amount_kes: number;
          checkout_request_id?: string | null;
          created_at?: string;
          customer_id?: string | null;
          failure_reason?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["txn_kind"];
          mpesa_receipt?: string | null;
          package_id?: string | null;
          phone: string;
          raw?: Json;
          status?: Database["public"]["Enums"]["txn_status"];
          tenant_id: string;
          voucher_id?: string | null;
        };
        Update: {
          amount_kes?: number;
          checkout_request_id?: string | null;
          created_at?: string;
          customer_id?: string | null;
          failure_reason?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["txn_kind"];
          mpesa_receipt?: string | null;
          package_id?: string | null;
          phone?: string;
          raw?: Json;
          status?: Database["public"]["Enums"]["txn_status"];
          tenant_id?: string;
          voucher_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_package_id_fkey";
            columns: ["package_id"];
            isOneToOne: false;
            referencedRelation: "packages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_voucher_id_fkey";
            columns: ["voucher_id"];
            isOneToOne: false;
            referencedRelation: "vouchers";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          tenant_id: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          tenant_id?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          tenant_id?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      vouchers: {
        Row: {
          activated_at: string | null;
          code: string;
          created_at: string;
          expires_at: string | null;
          id: string;
          package_id: string;
          phone: string | null;
          router_id: string | null;
          status: Database["public"]["Enums"]["voucher_status"];
          tenant_id: string;
        };
        Insert: {
          activated_at?: string | null;
          code: string;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          package_id: string;
          phone?: string | null;
          router_id?: string | null;
          status?: Database["public"]["Enums"]["voucher_status"];
          tenant_id: string;
        };
        Update: {
          activated_at?: string | null;
          code?: string;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          package_id?: string;
          phone?: string | null;
          router_id?: string | null;
          status?: Database["public"]["Enums"]["voucher_status"];
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vouchers_package_id_fkey";
            columns: ["package_id"];
            isOneToOne: false;
            referencedRelation: "packages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vouchers_router_id_fkey";
            columns: ["router_id"];
            isOneToOne: false;
            referencedRelation: "routers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vouchers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_tenant_member: {
        Args: { _tenant_id: string; _user_id: string };
        Returns: boolean;
      };
      is_tenant_owner: {
        Args: { _tenant_id: string; _user_id: string };
        Returns: boolean;
      };
      portal_packages: {
        Args: { _slug: string };
        Returns: {
          device_limit: number;
          duration_hours: number;
          id: string;
          kind: Database["public"]["Enums"]["package_kind"];
          name: string;
          price_kes: number;
          speed_down_mbps: number;
          speed_up_mbps: number;
        }[];
      };
      portal_tenant: {
        Args: { _slug: string };
        Returns: {
          brand_color: string;
          business_name: string;
          logo_url: string;
          portal_subtitle: string;
          portal_title: string;
          support_phone: string;
          tenant_id: string;
        }[];
      };
    };
    Enums: {
      app_role: "super_admin" | "tenant_owner" | "tenant_staff";
      customer_status: "active" | "expired" | "disabled";
      mpesa_shortcode_type: "till" | "paybill";
      package_kind: "hotspot" | "pppoe";
      router_command_status: "queued" | "delivered" | "done" | "failed";
      router_status: "pending" | "online" | "offline";
      subscription_status: "trialing" | "active" | "expired" | "suspended" | "cancelled";
      txn_kind: "customer_payment" | "saas_subscription";
      txn_status: "pending" | "success" | "failed" | "cancelled";
      voucher_status: "unused" | "active" | "used" | "expired";
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
      app_role: ["super_admin", "tenant_owner", "tenant_staff"],
      customer_status: ["active", "expired", "disabled"],
      mpesa_shortcode_type: ["till", "paybill"],
      package_kind: ["hotspot", "pppoe"],
      router_command_status: ["queued", "delivered", "done", "failed"],
      router_status: ["pending", "online", "offline"],
      subscription_status: ["trialing", "active", "expired", "suspended", "cancelled"],
      txn_kind: ["customer_payment", "saas_subscription"],
      txn_status: ["pending", "success", "failed", "cancelled"],
      voucher_status: ["unused", "active", "used", "expired"],
    },
  },
} as const;
