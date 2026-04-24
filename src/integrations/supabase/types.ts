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
      automation_queue: {
        Row: {
          campaign_id: string | null
          created_at: string
          current_node_id: string | null
          customer_id: string | null
          id: string
          processed_at: string | null
          scheduled_for: string | null
          status: string
          tenant_id: string
          trigger_data: Json | null
          trigger_type: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          current_node_id?: string | null
          customer_id?: string | null
          id?: string
          processed_at?: string | null
          scheduled_for?: string | null
          status?: string
          tenant_id: string
          trigger_data?: Json | null
          trigger_type: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          current_node_id?: string | null
          customer_id?: string | null
          id?: string
          processed_at?: string | null
          scheduled_for?: string | null
          status?: string
          tenant_id?: string
          trigger_data?: Json | null
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_queue_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_queue_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_activities: {
        Row: {
          attribution_order_id: string | null
          campaign_id: string
          channel: string | null
          clicked_at: string | null
          conversion_value: number | null
          converted_at: string | null
          created_at: string
          customer_id: string
          delivered_at: string | null
          id: string
          read_at: string | null
          replied_at: string | null
          sent_at: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          attribution_order_id?: string | null
          campaign_id: string
          channel?: string | null
          clicked_at?: string | null
          conversion_value?: number | null
          converted_at?: string | null
          created_at?: string
          customer_id: string
          delivered_at?: string | null
          id?: string
          read_at?: string | null
          replied_at?: string | null
          sent_at?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          attribution_order_id?: string | null
          campaign_id?: string
          channel?: string | null
          clicked_at?: string | null
          conversion_value?: number | null
          converted_at?: string | null
          created_at?: string
          customer_id?: string
          delivered_at?: string | null
          id?: string
          read_at?: string | null
          replied_at?: string | null
          sent_at?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_activities_attribution_order_id_fkey"
            columns: ["attribution_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_activities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_activities_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_activities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          actions: Json | null
          audience_rules: Json | null
          created_at: string
          end_date: string | null
          flow_data: Json | null
          has_bonus: boolean | null
          has_survey: boolean | null
          id: string
          kind: string
          last_error: string | null
          list_id: string | null
          name: string
          scheduled_at: string | null
          start_date: string | null
          status: string
          tenant_id: string
          trigger_type: string | null
          type: string
          updated_at: string
        }
        Insert: {
          actions?: Json | null
          audience_rules?: Json | null
          created_at?: string
          end_date?: string | null
          flow_data?: Json | null
          has_bonus?: boolean | null
          has_survey?: boolean | null
          id?: string
          kind?: string
          last_error?: string | null
          list_id?: string | null
          name: string
          scheduled_at?: string | null
          start_date?: string | null
          status?: string
          tenant_id: string
          trigger_type?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          actions?: Json | null
          audience_rules?: Json | null
          created_at?: string
          end_date?: string | null
          flow_data?: Json | null
          has_bonus?: boolean | null
          has_survey?: boolean | null
          id?: string
          kind?: string
          last_error?: string | null
          list_id?: string | null
          name?: string
          scheduled_at?: string | null
          start_date?: string | null
          status?: string
          tenant_id?: string
          trigger_type?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "contact_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_list_members: {
        Row: {
          added_at: string
          customer_id: string
          id: string
          list_id: string
        }
        Insert: {
          added_at?: string
          customer_id: string
          id?: string
          list_id: string
        }
        Update: {
          added_at?: string
          customer_id?: string
          id?: string
          list_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_list_members_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_list_members_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "contact_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_lists: {
        Row: {
          created_at: string
          customer_count: number | null
          description: string | null
          filter_rules: Json | null
          id: string
          name: string
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_count?: number | null
          description?: string | null
          filter_rules?: Json | null
          id?: string
          name: string
          tenant_id: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_count?: number | null
          description?: string | null
          filter_rules?: Json | null
          id?: string
          name?: string
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      customer_groups: {
        Row: {
          created_at: string
          customer_count: number | null
          description: string | null
          id: string
          name: string
          rules: Json | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_count?: number | null
          description?: string | null
          id?: string
          name: string
          rules?: Json | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_count?: number | null
          description?: string | null
          id?: string
          name?: string
          rules?: Json | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          avg_ticket: number | null
          created_at: string
          custom_attributes: Json | null
          document: string | null
          email: string | null
          id: string
          is_lead: boolean | null
          last_order_at: string | null
          name: string
          phone: string | null
          rfm_frequency: number | null
          rfm_monetary: number | null
          rfm_recency: number | null
          rfm_segment: string | null
          tags: string[] | null
          tenant_id: string
          total_orders: number | null
          total_spent: number | null
          updated_at: string
        }
        Insert: {
          avg_ticket?: number | null
          created_at?: string
          custom_attributes?: Json | null
          document?: string | null
          email?: string | null
          id?: string
          is_lead?: boolean | null
          last_order_at?: string | null
          name: string
          phone?: string | null
          rfm_frequency?: number | null
          rfm_monetary?: number | null
          rfm_recency?: number | null
          rfm_segment?: string | null
          tags?: string[] | null
          tenant_id: string
          total_orders?: number | null
          total_spent?: number | null
          updated_at?: string
        }
        Update: {
          avg_ticket?: number | null
          created_at?: string
          custom_attributes?: Json | null
          document?: string | null
          email?: string | null
          id?: string
          is_lead?: boolean | null
          last_order_at?: string | null
          name?: string
          phone?: string | null
          rfm_frequency?: number | null
          rfm_monetary?: number | null
          rfm_recency?: number | null
          rfm_segment?: string | null
          tags?: string[] | null
          tenant_id?: string
          total_orders?: number | null
          total_spent?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_accounts: {
        Row: {
          access_token: string | null
          auto_reply_comments: boolean
          auto_reply_dms: boolean
          auto_reply_lives: boolean
          created_at: string
          followers_count: number | null
          id: string
          ig_user_id: string
          is_active: boolean
          live_active_id: string | null
          metadata: Json | null
          page_id: string
          page_name: string | null
          profile_picture_url: string | null
          tenant_id: string
          token_expires_at: string | null
          updated_at: string
          username: string
        }
        Insert: {
          access_token?: string | null
          auto_reply_comments?: boolean
          auto_reply_dms?: boolean
          auto_reply_lives?: boolean
          created_at?: string
          followers_count?: number | null
          id?: string
          ig_user_id: string
          is_active?: boolean
          live_active_id?: string | null
          metadata?: Json | null
          page_id: string
          page_name?: string | null
          profile_picture_url?: string | null
          tenant_id: string
          token_expires_at?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          access_token?: string | null
          auto_reply_comments?: boolean
          auto_reply_dms?: boolean
          auto_reply_lives?: boolean
          created_at?: string
          followers_count?: number | null
          id?: string
          ig_user_id?: string
          is_active?: boolean
          live_active_id?: string | null
          metadata?: Json | null
          page_id?: string
          page_name?: string | null
          profile_picture_url?: string | null
          tenant_id?: string
          token_expires_at?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      instagram_comment_rules: {
        Row: {
          cooldown_seconds: number
          created_at: string
          daily_limit_per_user: number
          dm_link_url: string | null
          dm_text: string
          id: string
          ig_account_id: string
          is_active: boolean
          keywords: string[]
          match_mode: string
          name: string
          post_ids: string[]
          public_reply_text: string
          scope: string
          stats_clicks: number
          stats_dm_sent: number
          stats_sent: number
          tenant_id: string
          updated_at: string
          use_ai_intent: boolean
        }
        Insert: {
          cooldown_seconds?: number
          created_at?: string
          daily_limit_per_user?: number
          dm_link_url?: string | null
          dm_text: string
          id?: string
          ig_account_id: string
          is_active?: boolean
          keywords?: string[]
          match_mode?: string
          name: string
          post_ids?: string[]
          public_reply_text: string
          scope?: string
          stats_clicks?: number
          stats_dm_sent?: number
          stats_sent?: number
          tenant_id: string
          updated_at?: string
          use_ai_intent?: boolean
        }
        Update: {
          cooldown_seconds?: number
          created_at?: string
          daily_limit_per_user?: number
          dm_link_url?: string | null
          dm_text?: string
          id?: string
          ig_account_id?: string
          is_active?: boolean
          keywords?: string[]
          match_mode?: string
          name?: string
          post_ids?: string[]
          public_reply_text?: string
          scope?: string
          stats_clicks?: number
          stats_dm_sent?: number
          stats_sent?: number
          tenant_id?: string
          updated_at?: string
          use_ai_intent?: boolean
        }
        Relationships: []
      }
      instagram_comments: {
        Row: {
          comment_id: string
          content: string | null
          created_at: string
          from_ig_user_id: string | null
          from_username: string | null
          id: string
          ig_account_id: string
          media_type: string | null
          metadata: Json | null
          parent_comment_id: string | null
          permalink: string | null
          post_id: string
          replied: boolean
          reply_content: string | null
          reply_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          comment_id: string
          content?: string | null
          created_at?: string
          from_ig_user_id?: string | null
          from_username?: string | null
          id?: string
          ig_account_id: string
          media_type?: string | null
          metadata?: Json | null
          parent_comment_id?: string | null
          permalink?: string | null
          post_id: string
          replied?: boolean
          reply_content?: string | null
          reply_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          comment_id?: string
          content?: string | null
          created_at?: string
          from_ig_user_id?: string | null
          from_username?: string | null
          id?: string
          ig_account_id?: string
          media_type?: string | null
          metadata?: Json | null
          parent_comment_id?: string | null
          permalink?: string | null
          post_id?: string
          replied?: boolean
          reply_content?: string | null
          reply_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_comments_ig_account_id_fkey"
            columns: ["ig_account_id"]
            isOneToOne: false
            referencedRelation: "instagram_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_live_comments: {
        Row: {
          auto_replied: boolean
          comment_id: string
          content: string | null
          created_at: string
          from_ig_user_id: string | null
          from_username: string | null
          id: string
          ig_account_id: string
          live_id: string
          metadata: Json | null
          reply_content: string | null
          reply_status: string | null
          tenant_id: string
        }
        Insert: {
          auto_replied?: boolean
          comment_id: string
          content?: string | null
          created_at?: string
          from_ig_user_id?: string | null
          from_username?: string | null
          id?: string
          ig_account_id: string
          live_id: string
          metadata?: Json | null
          reply_content?: string | null
          reply_status?: string | null
          tenant_id: string
        }
        Update: {
          auto_replied?: boolean
          comment_id?: string
          content?: string | null
          created_at?: string
          from_ig_user_id?: string | null
          from_username?: string | null
          id?: string
          ig_account_id?: string
          live_id?: string
          metadata?: Json | null
          reply_content?: string | null
          reply_status?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_live_comments_ig_account_id_fkey"
            columns: ["ig_account_id"]
            isOneToOne: false
            referencedRelation: "instagram_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_messages: {
        Row: {
          content: string | null
          created_at: string
          customer_id: string | null
          direction: string
          id: string
          ig_account_id: string
          ig_conversation_id: string | null
          ig_user_id: string
          media_url: string | null
          message_id: string | null
          message_type: string
          metadata: Json | null
          status: string
          tenant_id: string
          updated_at: string
          username: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          customer_id?: string | null
          direction?: string
          id?: string
          ig_account_id: string
          ig_conversation_id?: string | null
          ig_user_id: string
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          metadata?: Json | null
          status?: string
          tenant_id: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          customer_id?: string | null
          direction?: string
          id?: string
          ig_account_id?: string
          ig_conversation_id?: string | null
          ig_user_id?: string
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          metadata?: Json | null
          status?: string
          tenant_id?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_messages_ig_account_id_fkey"
            columns: ["ig_account_id"]
            isOneToOne: false
            referencedRelation: "instagram_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_rule_executions: {
        Row: {
          comment_id: string
          created_at: string
          dm_message_id: string | null
          dm_status: string | null
          error: string | null
          from_ig_user_id: string | null
          from_username: string | null
          id: string
          ig_account_id: string
          matched_by: string
          matched_term: string | null
          post_id: string | null
          public_reply_status: string | null
          rule_id: string
          tenant_id: string
          tracked_link_id: string | null
        }
        Insert: {
          comment_id: string
          created_at?: string
          dm_message_id?: string | null
          dm_status?: string | null
          error?: string | null
          from_ig_user_id?: string | null
          from_username?: string | null
          id?: string
          ig_account_id: string
          matched_by: string
          matched_term?: string | null
          post_id?: string | null
          public_reply_status?: string | null
          rule_id: string
          tenant_id: string
          tracked_link_id?: string | null
        }
        Update: {
          comment_id?: string
          created_at?: string
          dm_message_id?: string | null
          dm_status?: string | null
          error?: string | null
          from_ig_user_id?: string | null
          from_username?: string | null
          id?: string
          ig_account_id?: string
          matched_by?: string
          matched_term?: string | null
          post_id?: string | null
          public_reply_status?: string | null
          rule_id?: string
          tenant_id?: string
          tracked_link_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_rule_executions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "instagram_comment_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_active: boolean
          last_synced_at: string | null
          provider: string
          sync_error: string | null
          sync_settings: Json
          sync_status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          provider: string
          sync_error?: string | null
          sync_settings?: Json
          sync_status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          provider?: string
          sync_error?: string | null
          sync_settings?: Json
          sync_status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      link_clicks: {
        Row: {
          clicked_at: string
          id: string
          ip: string | null
          link_id: string
          referer: string | null
          user_agent: string | null
        }
        Insert: {
          clicked_at?: string
          id?: string
          ip?: string | null
          link_id: string
          referer?: string | null
          user_agent?: string | null
        }
        Update: {
          clicked_at?: string
          id?: string
          ip?: string | null
          link_id?: string
          referer?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "link_clicks_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "tracked_links"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          body: string
          buttons: Json | null
          category: string
          created_at: string
          footer: string | null
          header_content: string | null
          header_type: string | null
          id: string
          language: string
          meta_template_id: string | null
          name: string
          sample_values: Json | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          body: string
          buttons?: Json | null
          category?: string
          created_at?: string
          footer?: string | null
          header_content?: string | null
          header_type?: string | null
          id?: string
          language?: string
          meta_template_id?: string | null
          name: string
          sample_values?: Json | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          buttons?: Json | null
          category?: string
          created_at?: string
          footer?: string | null
          header_content?: string | null
          header_type?: string | null
          id?: string
          language?: string
          meta_template_id?: string | null
          name?: string
          sample_values?: Json | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          carrier: string | null
          created_at: string
          customer_id: string
          delivery_estimate: string | null
          external_id: string | null
          id: string
          items_summary: Json | null
          mapped_status: string | null
          order_number: string | null
          payment_summary: Json | null
          status: string
          status_alias: string | null
          tenant_id: string
          total: number
          tracking_code: string | null
          tracking_url: string | null
          updated_at: string
        }
        Insert: {
          carrier?: string | null
          created_at?: string
          customer_id: string
          delivery_estimate?: string | null
          external_id?: string | null
          id?: string
          items_summary?: Json | null
          mapped_status?: string | null
          order_number?: string | null
          payment_summary?: Json | null
          status?: string
          status_alias?: string | null
          tenant_id: string
          total?: number
          tracking_code?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Update: {
          carrier?: string | null
          created_at?: string
          customer_id?: string
          delivery_estimate?: string | null
          external_id?: string | null
          id?: string
          items_summary?: Json | null
          mapped_status?: string | null
          order_number?: string | null
          payment_summary?: Json | null
          status?: string
          status_alias?: string | null
          tenant_id?: string
          total?: number
          tracking_code?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tenant_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          name: string
          plan_name: string | null
          plan_price: number | null
          revenue_range: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          plan_name?: string | null
          plan_price?: number | null
          revenue_range?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          plan_name?: string | null
          plan_price?: number | null
          revenue_range?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      tracked_links: {
        Row: {
          campaign_id: string | null
          code: string
          created_at: string
          customer_id: string | null
          id: string
          original_url: string
          tenant_id: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          campaign_id?: string | null
          code: string
          created_at?: string
          customer_id?: string | null
          id?: string
          original_url: string
          tenant_id: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          campaign_id?: string | null
          code?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          original_url?: string
          tenant_id?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tracked_links_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracked_links_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_accounts: {
        Row: {
          access_token: string | null
          created_at: string
          display_phone: string | null
          id: string
          is_active: boolean | null
          phone_number_id: string
          quality_rating: string | null
          tenant_id: string
          updated_at: string
          verified_name: string | null
        }
        Insert: {
          access_token?: string | null
          created_at?: string
          display_phone?: string | null
          id?: string
          is_active?: boolean | null
          phone_number_id: string
          quality_rating?: string | null
          tenant_id: string
          updated_at?: string
          verified_name?: string | null
        }
        Update: {
          access_token?: string | null
          created_at?: string
          display_phone?: string | null
          id?: string
          is_active?: boolean | null
          phone_number_id?: string
          quality_rating?: string | null
          tenant_id?: string
          updated_at?: string
          verified_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_group_members: {
        Row: {
          added_at: string
          customer_id: string
          group_id: string
          id: string
          role: string
        }
        Insert: {
          added_at?: string
          customer_id: string
          group_id: string
          id?: string
          role?: string
        }
        Update: {
          added_at?: string
          customer_id?: string
          group_id?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_group_members_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_groups: {
        Row: {
          avatar_url: string | null
          created_at: string
          description: string | null
          external_group_id: string | null
          id: string
          member_count: number
          name: string
          permission: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          description?: string | null
          external_group_id?: string | null
          id?: string
          member_count?: number
          name: string
          permission?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          description?: string | null
          external_group_id?: string | null
          id?: string
          member_count?: number
          name?: string
          permission?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          content: string | null
          created_at: string
          customer_id: string | null
          direction: string
          id: string
          media_url: string | null
          message_type: string
          metadata: Json | null
          phone: string
          status: string
          template_name: string | null
          tenant_id: string
          updated_at: string
          wamid: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          customer_id?: string | null
          direction?: string
          id?: string
          media_url?: string | null
          message_type?: string
          metadata?: Json | null
          phone: string
          status?: string
          template_name?: string | null
          tenant_id: string
          updated_at?: string
          wamid?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          customer_id?: string | null
          direction?: string
          id?: string
          media_url?: string | null
          message_type?: string
          metadata?: Json | null
          phone?: string
          status?: string
          template_name?: string | null
          tenant_id?: string
          updated_at?: string
          wamid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      whatsapp_accounts_safe: {
        Row: {
          created_at: string | null
          display_phone: string | null
          id: string | null
          is_active: boolean | null
          phone_number_id: string | null
          quality_rating: string | null
          tenant_id: string | null
          updated_at: string | null
          verified_name: string | null
        }
        Insert: {
          created_at?: string | null
          display_phone?: string | null
          id?: string | null
          is_active?: boolean | null
          phone_number_id?: string | null
          quality_rating?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          verified_name?: string | null
        }
        Update: {
          created_at?: string | null
          display_phone?: string | null
          id?: string | null
          is_active?: boolean | null
          phone_number_id?: string | null
          quality_rating?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          verified_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      calculate_rfm_scores: { Args: { _tenant_id: string }; Returns: undefined }
      get_user_tenant_ids: { Args: { _user_id: string }; Returns: string[] }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_tenant_member: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      sync_rfm_lists: { Args: { _tenant_id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "collaborator"
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
      app_role: ["admin", "collaborator"],
    },
  },
} as const
