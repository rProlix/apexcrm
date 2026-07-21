// Supabase Database types
// Replace with output of `npx supabase gen types typescript --project-id <ref>` to get live types.
// The Insert/Update types are kept explicit (not Omit<Row, ...>) to avoid
// circular-reference issues with @supabase/ssr's type resolution.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string
          name: string
          slug: string
          subdomain: string | null
          custom_domain: string | null
          branding: Json
          plan_id: string | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          name: string
          slug: string
          subdomain?: string | null
          custom_domain?: string | null
          branding?: Json
          plan_id?: string | null
          status?: string
        }
        Update: {
          name?: string
          slug?: string
          subdomain?: string | null
          custom_domain?: string | null
          branding?: Json
          plan_id?: string | null
          status?: string
        }
        Relationships: []
      }
      tenant_domains: {
        Row: {
          id: string
          tenant_id: string
          hostname: string
          verified: boolean
          created_at: string
          domain_type: string
          is_primary: boolean
          is_verified: boolean
          verification_token: string | null
          verification_method: string | null
          ssl_status: string
          last_verified_at: string | null
          metadata: Json | null
          updated_at: string
        }
        Insert: {
          tenant_id: string
          hostname: string
          verified?: boolean
          domain_type?: string
          is_primary?: boolean
          is_verified?: boolean
          verification_token?: string | null
          verification_method?: string | null
          ssl_status?: string
          metadata?: Json | null
        }
        Update: {
          tenant_id?: string
          hostname?: string
          verified?: boolean
          domain_type?: string
          is_primary?: boolean
          is_verified?: boolean
          verification_token?: string | null
          verification_method?: string | null
          ssl_status?: string
          last_verified_at?: string | null
          metadata?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      tenant_modules: {
        Row: {
          id: string
          tenant_id: string
          module_key: string
          enabled: boolean
          config: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id: string
          module_key: string
          enabled?: boolean
          config?: Json
        }
        Update: {
          tenant_id?: string
          module_key?: string
          enabled?: boolean
          config?: Json
        }
        Relationships: []
      }
      plans: {
        Row: {
          id: string
          name: string
          slug: string
          price_cents: number
          currency: string
          limits: Json
          modules: Json
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          name: string
          slug: string
          price_cents: number
          currency?: string
          limits?: Json
          modules?: Json
          status?: string
        }
        Update: {
          name?: string
          slug?: string
          price_cents?: number
          currency?: string
          limits?: Json
          modules?: Json
          status?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          id: string
          tenant_id: string
          plan_id: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          status: string
          current_period_end: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id: string
          plan_id: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          status?: string
          current_period_end?: string | null
        }
        Update: {
          tenant_id?: string
          plan_id?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          status?: string
          current_period_end?: string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          id: string
          tenant_id: string | null // null for platform owner
          auth_user_id: string | null
          email: string
          role: 'owner' | 'admin' | 'staff'
          status: string
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id?: string | null
          auth_user_id?: string | null
          email: string
          role?: 'owner' | 'admin' | 'staff'
          status?: string
          metadata?: Json
        }
        Update: {
          tenant_id?: string | null
          auth_user_id?: string | null
          email?: string
          role?: 'owner' | 'admin' | 'staff'
          status?: string
          metadata?: Json
        }
        Relationships: []
      }
      customers: {
        Row: {
          id: string
          tenant_id: string
          name: string
          email: string | null
          phone: string | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id: string
          name: string
          email?: string | null
          phone?: string | null
          metadata?: Json
        }
        Update: {
          tenant_id?: string
          name?: string
          email?: string | null
          phone?: string | null
          metadata?: Json
        }
        Relationships: []
      }
      customer_accounts: {
        Row: {
          id: string
          tenant_id: string
          customer_id: string
          auth_user_id: string | null
          email: string
          role: 'customer'
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id: string
          customer_id: string
          auth_user_id?: string | null
          email: string
          role?: 'customer'
          status?: string
        }
        Update: {
          tenant_id?: string
          customer_id?: string
          auth_user_id?: string | null
          email?: string
          role?: 'customer'
          status?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          id: string
          tenant_id: string
          name: string
          email: string | null
          phone: string | null
          source: string | null
          status: string
          payload: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id: string
          name: string
          email?: string | null
          phone?: string | null
          source?: string | null
          status?: string
          payload?: Json
        }
        Update: {
          tenant_id?: string
          name?: string
          email?: string | null
          phone?: string | null
          source?: string | null
          status?: string
          payload?: Json
        }
        Relationships: []
      }
      contacts: {
        Row: {
          id: string
          tenant_id: string
          name: string
          email: string | null
          phone: string | null
          type: string
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id: string
          name: string
          email?: string | null
          phone?: string | null
          type?: string
          metadata?: Json
        }
        Update: {
          tenant_id?: string
          name?: string
          email?: string | null
          phone?: string | null
          type?: string
          metadata?: Json
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          id: string
          tenant_id: string
          name: string
          plate_number: string | null
          vin: string | null
          status: string
          van_number: string | null
          make: string | null
          model: string | null
          year: number | null
          color: string | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id: string
          name: string
          plate_number?: string | null
          vin?: string | null
          status?: string
          van_number?: string | null
          make?: string | null
          model?: string | null
          year?: number | null
          color?: string | null
          metadata?: Json
        }
        Update: {
          tenant_id?: string
          name?: string
          plate_number?: string | null
          vin?: string | null
          status?: string
          van_number?: string | null
          make?: string | null
          model?: string | null
          year?: number | null
          color?: string | null
          metadata?: Json
        }
        Relationships: []
      }
      appointments: {
        Row: {
          id: string
          tenant_id: string
          customer_id: string | null
          contact_id: string | null
          service_name: string
          starts_at: string
          ends_at: string
          status: string
          notes: string | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id: string
          customer_id?: string | null
          contact_id?: string | null
          service_name: string
          starts_at: string
          ends_at: string
          status?: string
          notes?: string | null
          metadata?: Json
        }
        Update: {
          tenant_id?: string
          customer_id?: string | null
          contact_id?: string | null
          service_name?: string
          starts_at?: string
          ends_at?: string
          status?: string
          notes?: string | null
          metadata?: Json
        }
        Relationships: []
      }
      payments: {
        Row: {
          id: string
          tenant_id: string
          customer_id: string | null
          contact_id: string | null
          amount_cents: number
          currency: string
          provider: string
          provider_reference: string | null
          status: string
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id: string
          customer_id?: string | null
          contact_id?: string | null
          amount_cents: number
          currency?: string
          provider: string
          provider_reference?: string | null
          status?: string
          metadata?: Json
        }
        Update: {
          tenant_id?: string
          customer_id?: string | null
          contact_id?: string | null
          amount_cents?: number
          currency?: string
          provider?: string
          provider_reference?: string | null
          status?: string
          metadata?: Json
        }
        Relationships: []
      }
      reward_points: {
        Row: {
          id: string
          tenant_id: string
          customer_id: string
          balance: number
          updated_at: string
        }
        Insert: {
          tenant_id: string
          customer_id: string
          balance?: number
        }
        Update: {
          tenant_id?: string
          customer_id?: string
          balance?: number
        }
        Relationships: []
      }
      reward_history: {
        Row: {
          id: string
          tenant_id: string
          customer_id: string
          delta: number
          reason: string
          metadata: Json
          created_at: string
        }
        Insert: {
          tenant_id: string
          customer_id: string
          delta: number
          reason: string
          metadata?: Json
        }
        Update: {
          tenant_id?: string
          customer_id?: string
          delta?: number
          reason?: string
          metadata?: Json
        }
        Relationships: []
      }
      damage_assessments: {
        Row: {
          id: string
          tenant_id: string
          vehicle_id: string
          customer_id: string | null
          score: number | null
          ai_confidence: number | null
          result: Json
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id: string
          vehicle_id: string
          customer_id?: string | null
          score?: number | null
          ai_confidence?: number | null
          result?: Json
          status?: string
        }
        Update: {
          tenant_id?: string
          vehicle_id?: string
          customer_id?: string | null
          score?: number | null
          ai_confidence?: number | null
          result?: Json
          status?: string
        }
        Relationships: []
      }
      activity_logs: {
        Row: {
          id: string
          tenant_id: string
          actor_type: string
          actor_id: string | null
          action: string
          entity_type: string | null
          entity_id: string | null
          metadata: Json
          created_at: string
        }
        Insert: {
          tenant_id: string
          actor_type: string
          actor_id?: string | null
          action: string
          entity_type?: string | null
          entity_id?: string | null
          metadata?: Json
        }
        Update: never
        Relationships: []
      }
      audit_logs: {
        Row: {
          id: string
          tenant_id: string | null
          actor_user_id: string | null
          action: string
          metadata: Json
          created_at: string
        }
        Insert: {
          tenant_id?: string | null
          actor_user_id?: string | null
          action: string
          metadata?: Json
        }
        Update: never
        Relationships: []
      }
      roles: {
        Row: {
          id: string
          name: string
          scope: 'platform' | 'tenant'
          created_at: string
        }
        Insert: {
          name: string
          scope: 'platform' | 'tenant'
        }
        Update: {
          name?: string
          scope?: 'platform' | 'tenant'
        }
        Relationships: []
      }
      permissions: {
        Row: {
          id: string
          key: string
          created_at: string
        }
        Insert: {
          key: string
        }
        Update: {
          key?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          role_id: string
          permission_id: string
        }
        Insert: {
          role_id: string
          permission_id: string
        }
        Update: {
          role_id?: string
          permission_id?: string
        }
        Relationships: []
      }
      dashboard_layouts: {
        Row: {
          id: string
          tenant_id: string
          user_id: string | null
          layout: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id: string
          user_id?: string | null
          layout?: Json
        }
        Update: {
          tenant_id?: string
          user_id?: string | null
          layout?: Json
        }
        Relationships: []
      }
      products: {
        Row: {
          id: string
          tenant_id: string
          name: string
          description: string | null
          price: number
          currency: string
          inventory_count: number
          is_active: boolean
          spin_package_id: string | null
          spin_360_id: string | null
          p360_package_id: string | null
          created_at: string
        }
        Insert: {
          tenant_id: string
          name: string
          description?: string | null
          price: number
          currency?: string
          inventory_count?: number
          is_active?: boolean
          spin_package_id?: string | null
          spin_360_id?: string | null
          p360_package_id?: string | null
        }
        Update: {
          tenant_id?: string
          name?: string
          description?: string | null
          price?: number
          currency?: string
          inventory_count?: number
          is_active?: boolean
          spin_package_id?: string | null
          spin_360_id?: string | null
          p360_package_id?: string | null
        }
        Relationships: []
      }
      product_360_packages: {
        Row: {
          id: string
          tenant_id: string
          product_id: string
          name: string | null
          prompt: string | null
          frame_count: number
          status: 'pending' | 'generating' | 'complete' | 'failed'
          error_message: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id: string
          product_id: string
          name?: string | null
          prompt?: string | null
          frame_count?: number
          status?: 'pending' | 'generating' | 'complete' | 'failed'
          error_message?: string | null
        }
        Update: {
          tenant_id?: string
          product_id?: string
          name?: string | null
          prompt?: string | null
          frame_count?: number
          status?: 'pending' | 'generating' | 'complete' | 'failed'
          error_message?: string | null
        }
        Relationships: []
      }
      product_360_frames: {
        Row: {
          id: string
          package_id: string
          frame_index: number
          image_url: string
          storage_path: string | null
          created_at: string
        }
        Insert: {
          package_id: string
          frame_index: number
          image_url: string
          storage_path?: string | null
        }
        Update: {
          package_id?: string
          frame_index?: number
          image_url?: string
          storage_path?: string | null
        }
        Relationships: []
      }
      product_360_spins: {
        Row: {
          id: string
          tenant_id: string
          product_id: string
          name: string
          prompt: string
          image_urls: string[]
          total_frames: number
          status: 'generating' | 'ready' | 'failed'
          error_message: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id: string
          product_id: string
          name: string
          prompt: string
          image_urls?: string[]
          total_frames?: number
          status?: 'generating' | 'ready' | 'failed'
          error_message?: string | null
        }
        Update: {
          tenant_id?: string
          product_id?: string
          name?: string
          prompt?: string
          image_urls?: string[]
          total_frames?: number
          status?: 'generating' | 'ready' | 'failed'
          error_message?: string | null
        }
        Relationships: []
      }
      spin_packages: {
        Row: {
          id: string
          tenant_id: string
          product_id: string
          status: 'draft' | 'generating' | 'ready' | 'failed'
          prompt_text: string
          image_count: number
          midjourney_job_id: string | null
          error_message: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id: string
          product_id: string
          status?: 'draft' | 'generating' | 'ready' | 'failed'
          prompt_text: string
          image_count?: number
          midjourney_job_id?: string | null
          error_message?: string | null
        }
        Update: {
          tenant_id?: string
          product_id?: string
          status?: 'draft' | 'generating' | 'ready' | 'failed'
          prompt_text?: string
          image_count?: number
          midjourney_job_id?: string | null
          error_message?: string | null
        }
        Relationships: []
      }
      spin_images: {
        Row: {
          id: string
          spin_package_id: string
          tenant_id: string
          image_url: string
          storage_path: string | null
          frame_index: number
          created_at: string
        }
        Insert: {
          spin_package_id: string
          tenant_id: string
          image_url: string
          storage_path?: string | null
          frame_index: number
        }
        Update: {
          spin_package_id?: string
          tenant_id?: string
          image_url?: string
          storage_path?: string | null
          frame_index?: number
        }
        Relationships: []
      }
      product_images: {
        Row: {
          id: string
          tenant_id: string
          product_id: string
          image_url: string | null
          created_at: string
        }
        Insert: {
          tenant_id: string
          product_id: string
          image_url?: string | null
        }
        Update: {
          tenant_id?: string
          product_id?: string
          image_url?: string | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          id: string
          tenant_id: string
          customer_id: string
          status: string
          total_amount: number | null
          created_at: string
        }
        Insert: {
          tenant_id: string
          customer_id: string
          status?: string
          total_amount?: number | null
        }
        Update: {
          tenant_id?: string
          customer_id?: string
          status?: string
          total_amount?: number | null
        }
        Relationships: []
      }
      order_items: {
        Row: {
          id: string
          tenant_id: string
          order_id: string
          product_id: string | null
          quantity: number
          price: number
        }
        Insert: {
          tenant_id: string
          order_id: string
          product_id?: string | null
          quantity?: number
          price: number
        }
        Update: {
          tenant_id?: string
          order_id?: string
          product_id?: string | null
          quantity?: number
          price?: number
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          id: string
          tenant_id: string
          site_name: string | null
          logo_url: string | null
          favicon_url: string | null
          brand_colors: Json
          fonts: Json
          theme: Json
          seo_defaults: Json
          header_config: Json
          footer_config: Json
          custom_domain: string | null
          subdomain: string | null
          domain_type: string
          domain_mode: string
          is_published: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id: string
          site_name?: string | null
          logo_url?: string | null
          favicon_url?: string | null
          brand_colors?: Json
          fonts?: Json
          theme?: Json
          seo_defaults?: Json
          header_config?: Json
          footer_config?: Json
          custom_domain?: string | null
          subdomain?: string | null
          domain_type?: string
          domain_mode?: string
          is_published?: boolean
        }
        Update: {
          tenant_id?: string
          site_name?: string | null
          logo_url?: string | null
          favicon_url?: string | null
          brand_colors?: Json
          fonts?: Json
          theme?: Json
          seo_defaults?: Json
          header_config?: Json
          footer_config?: Json
          custom_domain?: string | null
          subdomain?: string | null
          domain_type?: string
          domain_mode?: string
          is_published?: boolean
        }
        Relationships: []
      }
      site_pages: {
        Row: {
          id: string
          tenant_id: string
          slug: string
          title: string | null
          meta_description: string | null
          page_type: string
          status: string
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id: string
          slug: string
          title?: string | null
          meta_description?: string | null
          page_type?: string
          status?: string
          sort_order?: number
        }
        Update: {
          tenant_id?: string
          slug?: string
          title?: string | null
          meta_description?: string | null
          page_type?: string
          status?: string
          sort_order?: number
        }
        Relationships: []
      }
      site_sections: {
        Row: {
          id: string
          tenant_id: string
          page_id: string
          section_type: string
          section_key: string | null
          content: Json
          sort_order: number
          is_visible: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id: string
          page_id: string
          section_type: string
          section_key?: string | null
          content?: Json
          sort_order?: number
          is_visible?: boolean
        }
        Update: {
          tenant_id?: string
          page_id?: string
          section_type?: string
          section_key?: string | null
          content?: Json
          sort_order?: number
          is_visible?: boolean
        }
        Relationships: []
      }
      site_navigation_items: {
        Row: {
          id: string
          tenant_id: string
          label: string
          href: string
          sort_order: number
          is_visible: boolean
          location: string
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id: string
          label: string
          href: string
          sort_order?: number
          is_visible?: boolean
          location?: string
        }
        Update: {
          tenant_id?: string
          label?: string
          href?: string
          sort_order?: number
          is_visible?: boolean
          location?: string
        }
        Relationships: []
      }
      site_assets: {
        Row: {
          id: string
          tenant_id: string
          asset_type: string
          url: string
          metadata: Json
          created_at: string
        }
        Insert: {
          tenant_id: string
          asset_type: string
          url: string
          metadata?: Json
        }
        Update: {
          tenant_id?: string
          asset_type?: string
          url?: string
          metadata?: Json
        }
        Relationships: []
      }
      availability_rules: {
        Row: {
          id: string
          tenant_id: string
          day_of_week: number | null
          start_time: string
          end_time: string
          slot_duration_minutes: number
          slot_interval_minutes: number
          is_available: boolean
          is_active: boolean
          repeat_type: string
          repeat_days: number[] | null
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id: string
          day_of_week?: number | null
          start_time?: string
          end_time?: string
          slot_duration_minutes?: number
          slot_interval_minutes?: number
          is_available?: boolean
          is_active?: boolean
          repeat_type?: string
          repeat_days?: number[] | null
        }
        Update: {
          tenant_id?: string
          day_of_week?: number | null
          start_time?: string
          end_time?: string
          slot_duration_minutes?: number
          slot_interval_minutes?: number
          is_available?: boolean
          is_active?: boolean
          repeat_type?: string
          repeat_days?: number[] | null
          updated_at?: string
        }
        Relationships: []
      }
      blocked_times: {
        Row: {
          id: string
          tenant_id: string
          start_time: string
          end_time: string
          reason: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          tenant_id: string
          start_time: string
          end_time: string
          reason?: string | null
          created_by?: string | null
        }
        Update: {
          tenant_id?: string
          start_time?: string
          end_time?: string
          reason?: string | null
        }
        Relationships: []
      }
      rewards_programs: {
        Row: {
          id: string
          tenant_id: string
          name: string
          description: string | null
          status: string
          earning_rules: Json
          punch_card_rules: Json
          settings: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id: string
          name: string
          description?: string | null
          status?: string
          earning_rules?: Json
          punch_card_rules?: Json
          settings?: Json
        }
        Update: {
          tenant_id?: string
          name?: string
          description?: string | null
          status?: string
          earning_rules?: Json
          punch_card_rules?: Json
          settings?: Json
          updated_at?: string
        }
        Relationships: []
      }
      rewards_balances: {
        Row: {
          id: string
          tenant_id: string
          customer_id: string
          points_balance: number
          lifetime_points_earned: number
          lifetime_points_redeemed: number
          updated_at: string
          created_at: string
        }
        Insert: {
          tenant_id: string
          customer_id: string
          points_balance?: number
          lifetime_points_earned?: number
          lifetime_points_redeemed?: number
        }
        Update: {
          points_balance?: number
          lifetime_points_earned?: number
          lifetime_points_redeemed?: number
          updated_at?: string
        }
        Relationships: []
      }
      rewards_transactions: {
        Row: {
          id: string
          tenant_id: string
          customer_id: string
          program_id: string | null
          transaction_type: string
          points_delta: number
          source_type: string | null
          source_id: string | null
          metadata: Json
          created_at: string
        }
        Insert: {
          tenant_id: string
          customer_id: string
          program_id?: string | null
          transaction_type: string
          points_delta: number
          source_type?: string | null
          source_id?: string | null
          metadata?: Json
        }
        Update: {
          transaction_type?: string
          points_delta?: number
          source_type?: string | null
          metadata?: Json
        }
        Relationships: []
      }
      reward_shop_items: {
        Row: {
          id: string
          tenant_id: string
          name: string
          description: string | null
          points_cost: number
          is_active: boolean
          image_url: string | null
          product_id: string | null
          redemption_type: string
          discount_type: string | null
          discount_value: number | null
          inventory_count: number
          max_redemptions_per_customer: number | null
          settings: Json
          created_at: string
        }
        Insert: {
          tenant_id: string
          name: string
          points_cost: number
          description?: string | null
          is_active?: boolean
          image_url?: string | null
          product_id?: string | null
          redemption_type?: string
          discount_type?: string | null
          discount_value?: number | null
          inventory_count?: number
          max_redemptions_per_customer?: number | null
          settings?: Json
        }
        Update: {
          name?: string
          points_cost?: number
          description?: string | null
          is_active?: boolean
          image_url?: string | null
          inventory_count?: number
          settings?: Json
        }
        Relationships: []
      }
      reward_redemptions: {
        Row: {
          id: string
          tenant_id: string
          customer_id: string
          reward_item_id: string | null
          points_used: number
          status: string
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id: string
          customer_id: string
          reward_item_id?: string | null
          points_used: number
          status?: string
          metadata?: Json
        }
        Update: {
          status?: string
          metadata?: Json
          updated_at?: string
        }
        Relationships: []
      }
      reward_punch_cards: {
        Row: {
          id: string
          tenant_id: string
          customer_id: string
          product_id: string | null
          title: string
          punch_goal: number
          current_punches: number
          reward_type: string
          reward_value: number | null
          status: string
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id: string
          customer_id: string
          product_id?: string | null
          title: string
          punch_goal: number
          current_punches?: number
          reward_type: string
          reward_value?: number | null
          status?: string
          metadata?: Json
        }
        Update: {
          current_punches?: number
          reward_type?: string
          reward_value?: number | null
          status?: string
          metadata?: Json
          updated_at?: string
        }
        Relationships: []
      }
      website_import_jobs: {
        Row: {
          id: string
          tenant_id: string
          created_by: string
          status: string
          source_urls: Json
          notes: string | null
          target_site_id: string | null
          target_page_id: string | null
          error_message: string | null
          progress: number
          started_at: string | null
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id: string
          created_by: string
          status?: string
          source_urls?: Json
          notes?: string | null
          target_site_id?: string | null
          target_page_id?: string | null
          progress?: number
        }
        Update: {
          status?: string
          source_urls?: Json
          notes?: string | null
          error_message?: string | null
          progress?: number
          started_at?: string | null
          completed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      website_import_results: {
        Row: {
          id: string
          tenant_id: string
          job_id: string
          result_key: string
          source_key: string | null
          mapped_section: string | null
          result_value: Json
          confidence_score: number
          approved: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id: string
          job_id: string
          result_key: string
          source_key?: string | null
          mapped_section?: string | null
          result_value?: Json
          confidence_score?: number
          approved?: boolean
        }
        Update: {
          result_key?: string
          result_value?: Json
          confidence_score?: number
          approved?: boolean
          mapped_section?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      website_import_sources: {
        Row: {
          id: string
          tenant_id: string
          job_id: string
          source_url: string
          source_type: string | null
          page_title: string | null
          fetched_status: string
          confidence_score: number
          raw_metadata: Json | null
          raw_text: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id: string
          job_id: string
          source_url: string
          source_type?: string | null
          page_title?: string | null
          fetched_status?: string
          confidence_score?: number
          raw_metadata?: Json | null
          raw_text?: string | null
        }
        Update: {
          fetched_status?: string
          confidence_score?: number
          raw_metadata?: Json | null
          raw_text?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      website_ai_import_jobs: {
        Row: {
          id: string
          tenant_id: string
          created_by: string | null
          source_type: string
          raw_input: string
          status: string
          model: string
          summary: string | null
          detected_business_type: string | null
          detected_content_types: string[]
          confidence: number | null
          error_message: string | null
          token_usage: Json
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id: string
          created_by?: string | null
          source_type?: string
          raw_input: string
          status?: string
          model?: string
          summary?: string | null
          detected_business_type?: string | null
          detected_content_types?: string[]
          confidence?: number | null
          error_message?: string | null
          token_usage?: Json
          metadata?: Json
        }
        Update: {
          status?: string
          summary?: string | null
          detected_business_type?: string | null
          detected_content_types?: string[]
          confidence?: number | null
          error_message?: string | null
          token_usage?: Json
          metadata?: Json
          updated_at?: string
        }
        Relationships: []
      }
      website_ai_suggestions: {
        Row: {
          id: string
          tenant_id: string
          job_id: string
          suggestion_type: string
          action: string
          target_page_id: string | null
          target_section_id: string | null
          title: string | null
          description: string | null
          reason: string | null
          extracted_data: Json
          proposed_section: Json
          confidence: number
          status: string
          admin_notes: string | null
          applied_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id: string
          job_id: string
          suggestion_type: string
          action?: string
          target_page_id?: string | null
          target_section_id?: string | null
          title?: string | null
          description?: string | null
          reason?: string | null
          extracted_data?: Json
          proposed_section?: Json
          confidence?: number
          status?: string
          admin_notes?: string | null
          applied_at?: string | null
        }
        Update: {
          action?: string
          title?: string | null
          description?: string | null
          reason?: string | null
          extracted_data?: Json
          proposed_section?: Json
          confidence?: number
          status?: string
          admin_notes?: string | null
          applied_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      website_ai_applied_changes: {
        Row: {
          id: string
          tenant_id: string
          job_id: string
          suggestion_id: string | null
          applied_by: string | null
          target_type: string
          target_id: string | null
          before_snapshot: Json | null
          after_snapshot: Json | null
          created_at: string
        }
        Insert: {
          tenant_id: string
          job_id: string
          suggestion_id?: string | null
          applied_by?: string | null
          target_type: string
          target_id?: string | null
          before_snapshot?: Json | null
          after_snapshot?: Json | null
        }
        Update: Record<string, never>
        Relationships: []
      }
      van_slack_integrations: {
        Row: {
          id: string
          tenant_id: string
          business_id: string
          slack_team_id: string
          slack_team_name: string | null
          slack_bot_user_id: string | null
          slack_app_id: string | null
          encrypted_bot_token: Json
          token_last4: string | null
          scopes: string[]
          status: string
          connected_by: string | null
          connected_at: string
          last_tested_at: string | null
          last_event_at: string | null
          last_error: string | null
          deleted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          business_id: string
          slack_team_id: string
          slack_team_name?: string | null
          slack_bot_user_id?: string | null
          slack_app_id?: string | null
          encrypted_bot_token: Json
          token_last4?: string | null
          scopes?: string[]
          status?: string
          connected_by?: string | null
          connected_at?: string
          last_tested_at?: string | null
          last_event_at?: string | null
          last_error?: string | null
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Record<string, Json | undefined>
        Relationships: []
      }
      van_slack_channels: {
        Row: {
          id: string
          tenant_id: string
          business_id: string
          integration_id: string
          slack_channel_id: string
          slack_channel_name: string | null
          channel_type: string | null
          is_enabled: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          business_id: string
          integration_id: string
          slack_channel_id: string
          slack_channel_name?: string | null
          channel_type?: string | null
          is_enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Record<string, Json | undefined>
        Relationships: []
      }
      van_damage_slack_events: {
        Row: {
          id: string
          integration_id: string | null
          tenant_id: string | null
          business_id: string | null
          slack_team_id: string
          slack_event_id: string
          slack_event_type: string | null
          slack_channel_id: string | null
          slack_user_id: string | null
          raw_event: Json
          status: string
          error_message: string | null
          created_at: string
        }
        Insert: {
          id?: string
          integration_id?: string | null
          tenant_id?: string | null
          business_id?: string | null
          slack_team_id: string
          slack_event_id: string
          slack_event_type?: string | null
          slack_channel_id?: string | null
          slack_user_id?: string | null
          raw_event?: Json
          status?: string
          error_message?: string | null
          created_at?: string
        }
        Update: Record<string, Json | undefined>
        Relationships: []
      }
      van_damage_inspections: {
        Row: {
          id: string
          tenant_id: string
          business_id: string
          van_id: string | null
          source: string
          slack_team_id: string | null
          slack_channel_id: string | null
          slack_message_ts: string | null
          slack_thread_ts: string | null
          slack_user_id: string | null
          title: string | null
          status: string
          image_count: number
          damage_count: number
          ai_summary: string | null
          ai_confidence: number | null
          ai_model: string | null
          review_status: string
          reviewed_by: string | null
          reviewed_at: string | null
          error_message: string | null
          metadata: Json
          created_at: string
          updated_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          business_id: string
          van_id?: string | null
          source?: string
          slack_team_id?: string | null
          slack_channel_id?: string | null
          slack_message_ts?: string | null
          slack_thread_ts?: string | null
          slack_user_id?: string | null
          title?: string | null
          status?: string
          image_count?: number
          damage_count?: number
          ai_summary?: string | null
          ai_confidence?: number | null
          ai_model?: string | null
          review_status?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
          error_message?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
          completed_at?: string | null
        }
        Update: Record<string, Json | undefined>
        Relationships: []
      }
      van_damage_images: {
        Row: {
          id: string
          tenant_id: string
          business_id: string
          inspection_id: string
          slack_file_id: string | null
          slack_file_url: string | null
          s3_bucket: string | null
          s3_key: string | null
          s3_etag: string | null
          content_type: string | null
          file_size_bytes: number | null
          width: number | null
          height: number | null
          image_role: string | null
          status: string
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          business_id: string
          inspection_id: string
          slack_file_id?: string | null
          slack_file_url?: string | null
          s3_bucket?: string | null
          s3_key?: string | null
          s3_etag?: string | null
          content_type?: string | null
          file_size_bytes?: number | null
          width?: number | null
          height?: number | null
          image_role?: string | null
          status?: string
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: Record<string, Json | undefined>
        Relationships: []
      }
      van_damage_items: {
        Row: {
          id: string
          tenant_id: string
          business_id: string
          inspection_id: string
          image_id: string | null
          damage_type: string | null
          vehicle_area: string | null
          severity: string | null
          confidence: number | null
          description: string | null
          repair_recommendation: string | null
          estimated_cost_min: number | null
          estimated_cost_max: number | null
          bounding_box: Json | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          business_id: string
          inspection_id: string
          image_id?: string | null
          damage_type?: string | null
          vehicle_area?: string | null
          severity?: string | null
          confidence?: number | null
          description?: string | null
          repair_recommendation?: string | null
          estimated_cost_min?: number | null
          estimated_cost_max?: number | null
          bounding_box?: Json | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: Record<string, Json | undefined>
        Relationships: []
      }
      van_damage_jobs: {
        Row: {
          id: string
          tenant_id: string
          business_id: string
          inspection_id: string | null
          slack_event_id: string | null
          sqs_message_id: string | null
          job_type: string
          status: string
          attempt_count: number
          last_error: string | null
          payload: Json
          created_at: string
          updated_at: string
          started_at: string | null
          completed_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          business_id: string
          inspection_id?: string | null
          slack_event_id?: string | null
          sqs_message_id?: string | null
          job_type?: string
          status?: string
          attempt_count?: number
          last_error?: string | null
          payload?: Json
          created_at?: string
          updated_at?: string
          started_at?: string | null
          completed_at?: string | null
        }
        Update: Record<string, Json | undefined>
        Relationships: []
      }
      van_damage_ai_runs: {
        Row: {
          id: string
          tenant_id: string
          business_id: string
          inspection_id: string
          provider: string
          model: string | null
          status: string
          prompt_version: string | null
          input_summary: Json
          raw_response: Json
          parsed_response: Json
          error_message: string | null
          created_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          business_id: string
          inspection_id: string
          provider?: string
          model?: string | null
          status?: string
          prompt_version?: string | null
          input_summary?: Json
          raw_response?: Json
          parsed_response?: Json
          error_message?: string | null
          created_at?: string
          completed_at?: string | null
        }
        Update: Record<string, Json | undefined>
        Relationships: []
      }
      website_image_plans: {
        Row: {
          id: string
          tenant_id: string
          page_id: string | null
          section_id: string | null
          plan_group_id: string | null
          placement_key: string
          section_type: string | null
          image_role: string
          title: string | null
          reason: string | null
          business_goal: string | null
          image_description: string | null
          visual_style: string | null
          prompt: string
          negative_prompt: string | null
          aspect_ratio: string | null
          width: number | null
          height: number | null
          priority: number
          use_existing_if_avail: boolean
          selected_source: string
          existing_asset_url: string | null
          generated_asset_url: string | null
          generated_storage_path: string | null
          generated_alt_text: string | null
          status: string
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id: string
          placement_key: string
          image_role: string
          prompt: string
          page_id?: string | null
          section_id?: string | null
          plan_group_id?: string | null
          section_type?: string | null
          title?: string | null
          reason?: string | null
          business_goal?: string | null
          image_description?: string | null
          visual_style?: string | null
          negative_prompt?: string | null
          aspect_ratio?: string | null
          width?: number | null
          height?: number | null
          priority?: number
          use_existing_if_avail?: boolean
          selected_source?: string
          existing_asset_url?: string | null
          status?: string
          created_by?: string | null
        }
        Update: {
          title?: string | null
          reason?: string | null
          prompt?: string
          negative_prompt?: string | null
          aspect_ratio?: string | null
          status?: string
          selected_source?: string
          generated_asset_url?: string | null
          generated_storage_path?: string | null
          generated_alt_text?: string | null
          existing_asset_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      website_image_jobs: {
        Row: {
          id: string
          tenant_id: string
          plan_id: string | null
          status: string
          model: string
          prompt: string | null
          negative_prompt: string | null
          aspect_ratio: string | null
          image_role: string | null
          placement_key: string | null
          storage_path: string | null
          public_url: string | null
          alt_text: string | null
          generation_metadata: Json
          error_message: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id: string
          plan_id?: string | null
          status?: string
          model?: string
          prompt?: string | null
          negative_prompt?: string | null
          aspect_ratio?: string | null
          image_role?: string | null
          placement_key?: string | null
          storage_path?: string | null
          public_url?: string | null
          alt_text?: string | null
          generation_metadata?: Json
          error_message?: string | null
          created_by?: string | null
        }
        Update: {
          status?: string
          storage_path?: string | null
          public_url?: string | null
          alt_text?: string | null
          generation_metadata?: Json
          error_message?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      van_damage_attention_alerts: {
        Row: {
          id: string
          tenant_id: string
          business_id: string
          van_id: string
          attention_type: string
          source_damage_case_id: string | null
          first_triggered_at: string
          last_observed_at: string
          latest_inspection_id: string | null
          latest_evidence_image_id: string | null
          highest_severity: string
          status: 'active' | 'resolved' | 'dismissed'
          acknowledged_by: string | null
          acknowledged_at: string | null
          observation_count: number
          alert_count: number
          suppressed_duplicate_count: number
          resolved_at: string | null
          resolution_reason: string | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id: string
          business_id: string
          van_id: string
          attention_type?: string
          source_damage_case_id?: string | null
          first_triggered_at: string
          last_observed_at: string
          latest_inspection_id?: string | null
          latest_evidence_image_id?: string | null
          highest_severity: string
          status?: 'active' | 'resolved' | 'dismissed'
          acknowledged_by?: string | null
          acknowledged_at?: string | null
          observation_count?: number
          alert_count?: number
          suppressed_duplicate_count?: number
          resolved_at?: string | null
          resolution_reason?: string | null
          metadata?: Json
        }
        Update: {
          source_damage_case_id?: string | null
          last_observed_at?: string
          latest_inspection_id?: string | null
          latest_evidence_image_id?: string | null
          highest_severity?: string
          status?: 'active' | 'resolved' | 'dismissed'
          acknowledged_by?: string | null
          acknowledged_at?: string | null
          observation_count?: number
          suppressed_duplicate_count?: number
          resolved_at?: string | null
          resolution_reason?: string | null
          metadata?: Json
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      set_tenant_context: {
        Args: { p_tenant_id: string }
        Returns: void
      }
      is_platform_owner: {
        Args: Record<string, never>
        Returns: boolean
      }
      decrement_product_inventory: {
        Args: { p_product_id: string; p_quantity: number }
        Returns: void
      }
      set_platform_admin_context: {
        Args: Record<string, never>
        Returns: void
      }
      upsert_rewards_balance: {
        Args: { p_tenant_id: string; p_customer_id: string; p_points_delta: number }
        Returns: { new_balance: number; lifetime_earned: number; lifetime_redeemed: number } | null
      }
      ingest_van_damage_slack_event: {
        Args: {
          p_integration_id: string
          p_slack_event_id: string
          p_slack_event_type: string
          p_slack_channel_id: string
          p_slack_user_id: string | null
          p_raw_event: Json
          p_slack_message_ts: string
          p_slack_thread_ts: string | null
          p_title: string
          p_files: Json
        }
        Returns: Array<{
          event_row_id: string
          inspection_row_id: string
          job_row_id: string
          was_created: boolean
          existing_sqs_message_id: string | null
        }>
      }
      claim_van_damage_job: {
        Args: {
          p_job_id: string
          p_tenant_id: string
          p_business_id: string
          p_inspection_id: string
          p_stale_before: string
        }
        Returns: string
      }
      complete_van_damage_job: {
        Args: {
          p_job_id: string
          p_inspection_id: string
          p_ai_run_id: string
          p_analysis: Json
          p_items: Json
          p_needs_review: boolean
        }
        Returns: void
      }
      save_van_slack_integration: {
        Args: {
          p_tenant_id: string
          p_business_id: string
          p_slack_team_id: string
          p_slack_team_name: string | null
          p_slack_bot_user_id: string | null
          p_slack_app_id: string | null
          p_encrypted_bot_token: Json
          p_token_last4: string
          p_scopes: string[]
          p_connected_by: string
        }
        Returns: string
      }
      van_damage_worker_schema_contract: {
        Args: Record<string, never>
        Returns: Json
      }
      get_fleet_needs_attention: {
        Args: { p_tenant_id: string; p_business_id: string }
        Returns: Array<{
          tenant_id: string
          business_id: string
          van_id: string
          van_number: string | null
          vehicle_name: string
          make: string | null
          model: string | null
          vehicle_year: number | null
          plate_number: string | null
          operational_status: string
          vehicle_metadata: Json
          profile_image_id: string | null
          attention_alert_id: string
          acknowledged_by: string | null
          acknowledged_by_name: string | null
          acknowledged_at: string | null
          first_triggered_at: string
          last_observed_at: string
          highest_severity: string
          severe_source_count: number
          active_severe_case_count: number
          total_active_damage_case_count: number
          needs_review_count: number
          observation_count: number
          suppressed_duplicate_count: number
          latest_damage_case_id: string | null
          latest_inspection_id: string
          latest_evidence_image_id: string | null
          latest_damage_area: string | null
          latest_damage_type: string | null
          latest_driver: Json
          latest_upload_at: string | null
          latest_image_count: number
          repair_status: string
          recurrent: boolean
        }>
      }
      update_van_severe_attention: {
        Args: {
          p_alert_id: string
          p_tenant_id: string
          p_business_id: string
          p_action: string
          p_actor_id: string
          p_reason?: string | null
        }
        Returns: void
      }
      review_van_damage_case_severity: {
        Args: {
          p_case_id: string
          p_tenant_id: string
          p_business_id: string
          p_effective_severity: string
          p_actor_id: string
          p_reason: string
        }
        Returns: void
      }
      apply_van_damage_inspection_action: {
        Args: {
          p_inspection_id: string
          p_tenant_id: string
          p_business_id: string
          p_action: string
          p_actor_id: string
        }
        Returns: void
      }
    }
    Enums: Record<string, never>
  }
}
