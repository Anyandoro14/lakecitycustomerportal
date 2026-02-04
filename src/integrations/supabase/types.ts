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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          performed_by: string | null
          performed_by_email: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          performed_by?: string | null
          performed_by_email?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          performed_by?: string | null
          performed_by_email?: string | null
        }
        Relationships: []
      }
      contact_stand_mappings: {
        Row: {
          contact_identifier: string
          contact_type: string
          created_at: string
          created_by: string | null
          created_by_email: string | null
          id: string
          stand_number: string
        }
        Insert: {
          contact_identifier: string
          contact_type: string
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          id?: string
          stand_number: string
        }
        Update: {
          contact_identifier?: string
          contact_type?: string
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          id?: string
          stand_number?: string
        }
        Relationships: []
      }
      conversation_assignments_audit: {
        Row: {
          changed_at: string
          changed_by: string | null
          changed_by_email: string | null
          conversation_id: string
          from_user_email: string | null
          from_user_id: string | null
          id: string
          to_user_email: string | null
          to_user_id: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          changed_by_email?: string | null
          conversation_id: string
          from_user_email?: string | null
          from_user_id?: string | null
          id?: string
          to_user_email?: string | null
          to_user_id?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          changed_by_email?: string | null
          conversation_id?: string
          from_user_email?: string | null
          from_user_id?: string | null
          id?: string
          to_user_email?: string | null
          to_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_assignments_audit_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_ticket_links: {
        Row: {
          conversation_id: string
          id: string
          linked_at: string
          linked_by: string | null
          linked_by_email: string | null
          support_case_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          linked_at?: string
          linked_by?: string | null
          linked_by_email?: string | null
          support_case_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          linked_at?: string
          linked_by?: string | null
          linked_by_email?: string | null
          support_case_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_ticket_links_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_ticket_links_support_case_id_fkey"
            columns: ["support_case_id"]
            isOneToOne: false
            referencedRelation: "support_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_to_user_id: string | null
          created_at: string
          customer_category: string | null
          customer_name: string | null
          id: string
          last_message_at: string | null
          primary_email: string | null
          primary_phone: string | null
          stand_number: string | null
          status: Database["public"]["Enums"]["conversation_status"]
          unread_count: number
          updated_at: string
        }
        Insert: {
          assigned_to_user_id?: string | null
          created_at?: string
          customer_category?: string | null
          customer_name?: string | null
          id?: string
          last_message_at?: string | null
          primary_email?: string | null
          primary_phone?: string | null
          stand_number?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          unread_count?: number
          updated_at?: string
        }
        Update: {
          assigned_to_user_id?: string | null
          created_at?: string
          customer_category?: string | null
          customer_name?: string | null
          id?: string
          last_message_at?: string | null
          primary_email?: string | null
          primary_phone?: string | null
          stand_number?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          unread_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      customer_invitations: {
        Row: {
          accepted_at: string | null
          channel: Database["public"]["Enums"]["invitation_channel"]
          created_at: string
          custom_message: string | null
          customer_email: string
          customer_name: string | null
          customer_phone: string | null
          expires_at: string
          id: string
          invitation_token: string
          message_template: string | null
          sent_at: string
          sent_by: string | null
          sent_by_email: string | null
          stand_number: string
          status: Database["public"]["Enums"]["invitation_status"]
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          channel?: Database["public"]["Enums"]["invitation_channel"]
          created_at?: string
          custom_message?: string | null
          customer_email: string
          customer_name?: string | null
          customer_phone?: string | null
          expires_at?: string
          id?: string
          invitation_token: string
          message_template?: string | null
          sent_at?: string
          sent_by?: string | null
          sent_by_email?: string | null
          stand_number: string
          status?: Database["public"]["Enums"]["invitation_status"]
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          channel?: Database["public"]["Enums"]["invitation_channel"]
          created_at?: string
          custom_message?: string | null
          customer_email?: string
          customer_name?: string | null
          customer_phone?: string | null
          expires_at?: string
          id?: string
          invitation_token?: string
          message_template?: string | null
          sent_at?: string
          sent_by?: string | null
          sent_by_email?: string | null
          stand_number?: string
          status?: Database["public"]["Enums"]["invitation_status"]
          updated_at?: string
        }
        Relationships: []
      }
      customer_onboarding: {
        Row: {
          completed: boolean
          completed_at: string | null
          created_at: string
          current_step: number
          id: string
          skipped: boolean
          steps_completed: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          current_step?: number
          id?: string
          skipped?: boolean
          steps_completed?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          current_step?: number
          id?: string
          skipped?: boolean
          steps_completed?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      internal_notes: {
        Row: {
          conversation_id: string
          created_at: string
          created_by: string | null
          created_by_email: string | null
          id: string
          note: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          id?: string
          note: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          id?: string
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_notes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_users: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          force_password_change: boolean | null
          full_name: string | null
          id: string
          is_override_approver: boolean
          role: Database["public"]["Enums"]["internal_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          force_password_change?: boolean | null
          full_name?: string | null
          id?: string
          is_override_approver?: boolean
          role?: Database["public"]["Enums"]["internal_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          force_password_change?: boolean | null
          full_name?: string | null
          id?: string
          is_override_approver?: boolean
          role?: Database["public"]["Enums"]["internal_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      knowledge_base: {
        Row: {
          category: string
          content: string
          created_at: string
          created_by: string | null
          id: string
          tags: string[] | null
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category: string
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          tags?: string[] | null
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string
          channel: Database["public"]["Enums"]["message_channel"]
          conversation_id: string
          created_at: string
          created_by_user_id: string | null
          delivery_status: Database["public"]["Enums"]["delivery_status"] | null
          direction: Database["public"]["Enums"]["message_direction"]
          id: string
          provider_message_id: string | null
          raw_payload: Json | null
          received_at: string | null
          sent_at: string | null
        }
        Insert: {
          body: string
          channel: Database["public"]["Enums"]["message_channel"]
          conversation_id: string
          created_at?: string
          created_by_user_id?: string | null
          delivery_status?:
            | Database["public"]["Enums"]["delivery_status"]
            | null
          direction: Database["public"]["Enums"]["message_direction"]
          id?: string
          provider_message_id?: string | null
          raw_payload?: Json | null
          received_at?: string | null
          sent_at?: string | null
        }
        Update: {
          body?: string
          channel?: Database["public"]["Enums"]["message_channel"]
          conversation_id?: string
          created_at?: string
          created_by_user_id?: string | null
          delivery_status?:
            | Database["public"]["Enums"]["delivery_status"]
            | null
          direction?: Database["public"]["Enums"]["message_direction"]
          id?: string
          provider_message_id?: string | null
          raw_payload?: Json | null
          received_at?: string | null
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_statements: {
        Row: {
          closing_balance: number
          created_at: string
          customer_email: string
          days_overdue: number | null
          generated_at: string
          id: string
          is_overdue: boolean | null
          opening_balance: number
          payments_received: Json | null
          stand_number: string
          statement_month: string
          total_payments: number
        }
        Insert: {
          closing_balance?: number
          created_at?: string
          customer_email: string
          days_overdue?: number | null
          generated_at?: string
          id?: string
          is_overdue?: boolean | null
          opening_balance?: number
          payments_received?: Json | null
          stand_number: string
          statement_month: string
          total_payments?: number
        }
        Update: {
          closing_balance?: number
          created_at?: string
          customer_email?: string
          days_overdue?: number | null
          generated_at?: string
          id?: string
          is_overdue?: boolean | null
          opening_balance?: number
          payments_received?: Json | null
          stand_number?: string
          statement_month?: string
          total_payments?: number
        }
        Relationships: []
      }
      password_reset_tokens: {
        Row: {
          attempts: number
          created_at: string
          expires_at: string
          id: string
          max_attempts: number
          phone_number: string
          token_hash: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          expires_at?: string
          id?: string
          max_attempts?: number
          phone_number: string
          token_hash: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          expires_at?: string
          id?: string
          max_attempts?: number
          phone_number?: string
          token_hash?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          payment_start_date: string
          phone_number: string | null
          phone_number_2: string | null
          stand_number: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          payment_start_date?: string
          phone_number?: string | null
          phone_number_2?: string | null
          stand_number?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          payment_start_date?: string
          phone_number?: string | null
          phone_number_2?: string | null
          stand_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      support_cases: {
        Row: {
          case_number: string
          created_at: string
          description: string
          email: string
          first_name: string
          id: string
          issue_type: string
          last_name: string
          preferred_contact_method: string
          status: string
          sub_issue: string
          updated_at: string
          user_id: string | null
          whatsapp_number: string | null
        }
        Insert: {
          case_number: string
          created_at?: string
          description: string
          email: string
          first_name: string
          id?: string
          issue_type: string
          last_name: string
          preferred_contact_method?: string
          status?: string
          sub_issue: string
          updated_at?: string
          user_id?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          case_number?: string
          created_at?: string
          description?: string
          email?: string
          first_name?: string
          id?: string
          issue_type?: string
          last_name?: string
          preferred_contact_method?: string
          status?: string
          sub_issue?: string
          updated_at?: string
          user_id?: string | null
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      twofa_bypass_codes: {
        Row: {
          bypass_code: string
          created_at: string
          created_by: string | null
          created_by_email: string | null
          customer_name: string | null
          expires_at: string
          id: string
          is_reusable: boolean
          phone_number: string
          stand_number: string
          used_at: string | null
        }
        Insert: {
          bypass_code: string
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          customer_name?: string | null
          expires_at?: string
          id?: string
          is_reusable?: boolean
          phone_number: string
          stand_number: string
          used_at?: string | null
        }
        Update: {
          bypass_code?: string
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          customer_name?: string | null
          expires_at?: string
          id?: string
          is_reusable?: boolean
          phone_number?: string
          stand_number?: string
          used_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_expired_bypass_codes: { Args: never; Returns: undefined }
      cleanup_expired_password_reset_tokens: { Args: never; Returns: undefined }
      get_internal_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["internal_role"]
      }
      get_user_stand_number: { Args: { user_id: string }; Returns: string }
      is_internal_user: { Args: { _user_id: string }; Returns: boolean }
      is_override_approver: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      conversation_status:
        | "open"
        | "pending_customer"
        | "pending_internal"
        | "closed"
      delivery_status: "queued" | "sent" | "delivered" | "read" | "failed"
      internal_role: "helpdesk" | "admin" | "super_admin" | "director"
      invitation_channel: "email" | "sms" | "whatsapp"
      invitation_status: "pending" | "accepted" | "expired"
      message_channel: "whatsapp" | "sms" | "email"
      message_direction: "inbound" | "outbound"
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
      conversation_status: [
        "open",
        "pending_customer",
        "pending_internal",
        "closed",
      ],
      delivery_status: ["queued", "sent", "delivered", "read", "failed"],
      internal_role: ["helpdesk", "admin", "super_admin", "director"],
      invitation_channel: ["email", "sms", "whatsapp"],
      invitation_status: ["pending", "accepted", "expired"],
      message_channel: ["whatsapp", "sms", "email"],
      message_direction: ["inbound", "outbound"],
    },
  },
} as const
