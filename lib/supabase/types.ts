// Supabase Database types
// Replace with output of `npx supabase gen types typescript --project-id <ref>` to get live types.
// The Insert/Update types are kept explicit (not Omit<Row, ...>) to avoid
// circular-reference issues with @supabase/ssr's type resolution.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      tenants: {
        Row: {
          id:            string
          name:          string
          slug:          string
          subdomain:     string | null
          custom_domain: string | null
          branding:      Json
          plan_id:       string | null
          status:        string
          created_at:    string
          updated_at:    string
        }
        Insert: {
          name:          string
          slug:          string
          subdomain?:    string | null
          custom_domain?: string | null
          branding?:     Json
          plan_id?:      string | null
          status?:       string
        }
        Update: {
          name?:         string
          slug?:         string
          subdomain?:    string | null
          custom_domain?: string | null
          branding?:     Json
          plan_id?:      string | null
          status?:       string
        }
        Relationships: []
      }
      tenant_domains: {
        Row: {
          id:                   string
          tenant_id:            string
          hostname:             string
          verified:             boolean
          created_at:           string
          domain_type:          string
          is_primary:           boolean
          is_verified:          boolean
          verification_token:   string | null
          verification_method:  string | null
          ssl_status:           string
          last_verified_at:     string | null
          metadata:             Json | null
          updated_at:           string
        }
        Insert: {
          tenant_id:            string
          hostname:             string
          verified?:            boolean
          domain_type?:         string
          is_primary?:          boolean
          is_verified?:         boolean
          verification_token?:  string | null
          verification_method?: string | null
          ssl_status?:          string
          metadata?:            Json | null
        }
        Update: {
          tenant_id?:           string
          hostname?:            string
          verified?:            boolean
          domain_type?:         string
          is_primary?:          boolean
          is_verified?:         boolean
          verification_token?:  string | null
          verification_method?: string | null
          ssl_status?:          string
          last_verified_at?:    string | null
          metadata?:            Json | null
          updated_at?:          string
        }
        Relationships: []
      }
      tenant_modules: {
        Row: {
          id:         string
          tenant_id:  string
          module_key: string
          enabled:    boolean
          config:     Json
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id:  string
          module_key: string
          enabled?:   boolean
          config?:    Json
        }
        Update: {
          tenant_id?: string
          module_key?: string
          enabled?:   boolean
          config?:    Json
        }
        Relationships: []
      }
      plans: {
        Row: {
          id:          string
          name:        string
          slug:        string
          price_cents: number
          currency:    string
          limits:      Json
          modules:     Json
          status:      string
          created_at:  string
          updated_at:  string
        }
        Insert: {
          name:         string
          slug:         string
          price_cents:  number
          currency?:    string
          limits?:      Json
          modules?:     Json
          status?:      string
        }
        Update: {
          name?:        string
          slug?:        string
          price_cents?: number
          currency?:    string
          limits?:      Json
          modules?:     Json
          status?:      string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          id:                     string
          tenant_id:              string
          plan_id:                string
          stripe_customer_id:     string | null
          stripe_subscription_id: string | null
          status:                 string
          current_period_end:     string | null
          created_at:             string
          updated_at:             string
        }
        Insert: {
          tenant_id:               string
          plan_id:                 string
          stripe_customer_id?:     string | null
          stripe_subscription_id?: string | null
          status?:                 string
          current_period_end?:     string | null
        }
        Update: {
          tenant_id?:              string
          plan_id?:                string
          stripe_customer_id?:     string | null
          stripe_subscription_id?: string | null
          status?:                 string
          current_period_end?:     string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          id:           string
          tenant_id:    string | null   // null for platform owner
          auth_user_id: string | null
          email:        string
          role:         'owner' | 'admin' | 'staff'
          status:       string
          metadata:     Json
          created_at:   string
          updated_at:   string
        }
        Insert: {
          tenant_id?:    string | null
          auth_user_id?: string | null
          email:         string
          role?:         'owner' | 'admin' | 'staff'
          status?:       string
          metadata?:     Json
        }
        Update: {
          tenant_id?:    string | null
          auth_user_id?: string | null
          email?:        string
          role?:         'owner' | 'admin' | 'staff'
          status?:       string
          metadata?:     Json
        }
        Relationships: []
      }
      customers: {
        Row: {
          id:         string
          tenant_id:  string
          name:       string
          email:      string | null
          phone:      string | null
          metadata:   Json
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id:  string
          name:       string
          email?:     string | null
          phone?:     string | null
          metadata?:  Json
        }
        Update: {
          tenant_id?: string
          name?:      string
          email?:     string | null
          phone?:     string | null
          metadata?:  Json
        }
        Relationships: []
      }
      customer_accounts: {
        Row: {
          id:           string
          tenant_id:    string
          customer_id:  string
          auth_user_id: string | null
          email:        string
          role:         'customer'
          status:       string
          created_at:   string
          updated_at:   string
        }
        Insert: {
          tenant_id:     string
          customer_id:   string
          auth_user_id?: string | null
          email:         string
          role?:         'customer'
          status?:       string
        }
        Update: {
          tenant_id?:    string
          customer_id?:  string
          auth_user_id?: string | null
          email?:        string
          role?:         'customer'
          status?:       string
        }
        Relationships: []
      }
      leads: {
        Row: {
          id:         string
          tenant_id:  string
          name:       string
          email:      string | null
          phone:      string | null
          source:     string | null
          status:     string
          payload:    Json
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id:  string
          name:       string
          email?:     string | null
          phone?:     string | null
          source?:    string | null
          status?:    string
          payload?:   Json
        }
        Update: {
          tenant_id?: string
          name?:      string
          email?:     string | null
          phone?:     string | null
          source?:    string | null
          status?:    string
          payload?:   Json
        }
        Relationships: []
      }
      contacts: {
        Row: {
          id:         string
          tenant_id:  string
          name:       string
          email:      string | null
          phone:      string | null
          type:       string
          metadata:   Json
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id:  string
          name:       string
          email?:     string | null
          phone?:     string | null
          type?:      string
          metadata?:  Json
        }
        Update: {
          tenant_id?: string
          name?:      string
          email?:     string | null
          phone?:     string | null
          type?:      string
          metadata?:  Json
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          id:           string
          tenant_id:    string
          name:         string
          plate_number: string | null
          vin:          string | null
          status:       string
          metadata:     Json
          created_at:   string
          updated_at:   string
        }
        Insert: {
          tenant_id:     string
          name:          string
          plate_number?: string | null
          vin?:          string | null
          status?:       string
          metadata?:     Json
        }
        Update: {
          tenant_id?:    string
          name?:         string
          plate_number?: string | null
          vin?:          string | null
          status?:       string
          metadata?:     Json
        }
        Relationships: []
      }
      appointments: {
        Row: {
          id:           string
          tenant_id:    string
          customer_id:  string | null
          contact_id:   string | null
          service_name: string
          starts_at:    string
          ends_at:      string
          status:       string
          notes:        string | null
          metadata:     Json
          created_at:   string
          updated_at:   string
        }
        Insert: {
          tenant_id:     string
          customer_id?:  string | null
          contact_id?:   string | null
          service_name:  string
          starts_at:     string
          ends_at:       string
          status?:       string
          notes?:        string | null
          metadata?:     Json
        }
        Update: {
          tenant_id?:    string
          customer_id?:  string | null
          contact_id?:   string | null
          service_name?: string
          starts_at?:    string
          ends_at?:      string
          status?:       string
          notes?:        string | null
          metadata?:     Json
        }
        Relationships: []
      }
      payments: {
        Row: {
          id:                 string
          tenant_id:          string
          customer_id:        string | null
          contact_id:         string | null
          amount_cents:       number
          currency:           string
          provider:           string
          provider_reference: string | null
          status:             string
          metadata:           Json
          created_at:         string
          updated_at:         string
        }
        Insert: {
          tenant_id:           string
          customer_id?:        string | null
          contact_id?:         string | null
          amount_cents:        number
          currency?:           string
          provider:            string
          provider_reference?: string | null
          status?:             string
          metadata?:           Json
        }
        Update: {
          tenant_id?:          string
          customer_id?:        string | null
          contact_id?:         string | null
          amount_cents?:       number
          currency?:           string
          provider?:           string
          provider_reference?: string | null
          status?:             string
          metadata?:           Json
        }
        Relationships: []
      }
      reward_points: {
        Row: {
          id:          string
          tenant_id:   string
          customer_id: string
          balance:     number
          updated_at:  string
        }
        Insert: {
          tenant_id:   string
          customer_id: string
          balance?:    number
        }
        Update: {
          tenant_id?:   string
          customer_id?: string
          balance?:     number
        }
        Relationships: []
      }
      reward_history: {
        Row: {
          id:          string
          tenant_id:   string
          customer_id: string
          delta:       number
          reason:      string
          metadata:    Json
          created_at:  string
        }
        Insert: {
          tenant_id:   string
          customer_id: string
          delta:       number
          reason:      string
          metadata?:   Json
        }
        Update: {
          tenant_id?:   string
          customer_id?: string
          delta?:       number
          reason?:      string
          metadata?:    Json
        }
        Relationships: []
      }
      damage_assessments: {
        Row: {
          id:            string
          tenant_id:     string
          vehicle_id:    string
          customer_id:   string | null
          score:         number | null
          ai_confidence: number | null
          result:        Json
          status:        string
          created_at:    string
          updated_at:    string
        }
        Insert: {
          tenant_id:      string
          vehicle_id:     string
          customer_id?:   string | null
          score?:         number | null
          ai_confidence?: number | null
          result?:        Json
          status?:        string
        }
        Update: {
          tenant_id?:     string
          vehicle_id?:    string
          customer_id?:   string | null
          score?:         number | null
          ai_confidence?: number | null
          result?:        Json
          status?:        string
        }
        Relationships: []
      }
      activity_logs: {
        Row: {
          id:          string
          tenant_id:   string
          actor_type:  string
          actor_id:    string | null
          action:      string
          entity_type: string | null
          entity_id:   string | null
          metadata:    Json
          created_at:  string
        }
        Insert: {
          tenant_id:    string
          actor_type:   string
          actor_id?:    string | null
          action:       string
          entity_type?: string | null
          entity_id?:   string | null
          metadata?:    Json
        }
        Update: never
        Relationships: []
      }
      audit_logs: {
        Row: {
          id:            string
          tenant_id:     string | null
          actor_user_id: string | null
          action:        string
          metadata:      Json
          created_at:    string
        }
        Insert: {
          tenant_id?:     string | null
          actor_user_id?: string | null
          action:         string
          metadata?:      Json
        }
        Update: never
        Relationships: []
      }
      roles: {
        Row: {
          id:         string
          name:       string
          scope:      'platform' | 'tenant'
          created_at: string
        }
        Insert: {
          name:   string
          scope:  'platform' | 'tenant'
        }
        Update: {
          name?:  string
          scope?: 'platform' | 'tenant'
        }
        Relationships: []
      }
      permissions: {
        Row: {
          id:         string
          key:        string
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
          role_id:       string
          permission_id: string
        }
        Insert: {
          role_id:       string
          permission_id: string
        }
        Update: {
          role_id?:       string
          permission_id?: string
        }
        Relationships: []
      }
      dashboard_layouts: {
        Row: {
          id:         string
          tenant_id:  string
          user_id:    string | null
          layout:     Json
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id:  string
          user_id?:   string | null
          layout?:    Json
        }
        Update: {
          tenant_id?: string
          user_id?:   string | null
          layout?:    Json
        }
        Relationships: []
      }
      products: {
        Row: {
          id:               string
          tenant_id:        string
          name:             string
          description:      string | null
          price:            number
          currency:         string
          inventory_count:  number
          is_active:        boolean
          spin_package_id:  string | null
          spin_360_id:      string | null
          p360_package_id:  string | null
          created_at:       string
        }
        Insert: {
          tenant_id:         string
          name:              string
          description?:      string | null
          price:             number
          currency?:         string
          inventory_count?:  number
          is_active?:        boolean
          spin_package_id?:  string | null
          spin_360_id?:      string | null
          p360_package_id?:  string | null
        }
        Update: {
          tenant_id?:        string
          name?:             string
          description?:      string | null
          price?:            number
          currency?:         string
          inventory_count?:  number
          is_active?:        boolean
          spin_package_id?:  string | null
          spin_360_id?:      string | null
          p360_package_id?:  string | null
        }
        Relationships: []
      }
      product_360_packages: {
        Row: {
          id:            string
          tenant_id:     string
          product_id:    string
          name:          string | null
          prompt:        string | null
          frame_count:   number
          status:        'pending' | 'generating' | 'complete' | 'failed'
          error_message: string | null
          created_at:    string
          updated_at:    string
        }
        Insert: {
          tenant_id:      string
          product_id:     string
          name?:          string | null
          prompt?:        string | null
          frame_count?:   number
          status?:        'pending' | 'generating' | 'complete' | 'failed'
          error_message?: string | null
        }
        Update: {
          tenant_id?:     string
          product_id?:    string
          name?:          string | null
          prompt?:        string | null
          frame_count?:   number
          status?:        'pending' | 'generating' | 'complete' | 'failed'
          error_message?: string | null
        }
        Relationships: []
      }
      product_360_frames: {
        Row: {
          id:           string
          package_id:   string
          frame_index:  number
          image_url:    string
          storage_path: string | null
          created_at:   string
        }
        Insert: {
          package_id:    string
          frame_index:   number
          image_url:     string
          storage_path?: string | null
        }
        Update: {
          package_id?:   string
          frame_index?:  number
          image_url?:    string
          storage_path?: string | null
        }
        Relationships: []
      }
      product_360_spins: {
        Row: {
          id:            string
          tenant_id:     string
          product_id:    string
          name:          string
          prompt:        string
          image_urls:    string[]
          total_frames:  number
          status:        'generating' | 'ready' | 'failed'
          error_message: string | null
          created_at:    string
          updated_at:    string
        }
        Insert: {
          tenant_id:      string
          product_id:     string
          name:           string
          prompt:         string
          image_urls?:    string[]
          total_frames?:  number
          status?:        'generating' | 'ready' | 'failed'
          error_message?: string | null
        }
        Update: {
          tenant_id?:     string
          product_id?:    string
          name?:          string
          prompt?:        string
          image_urls?:    string[]
          total_frames?:  number
          status?:        'generating' | 'ready' | 'failed'
          error_message?: string | null
        }
        Relationships: []
      }
      spin_packages: {
        Row: {
          id:                string
          tenant_id:         string
          product_id:        string
          status:            'draft' | 'generating' | 'ready' | 'failed'
          prompt_text:       string
          image_count:       number
          midjourney_job_id: string | null
          error_message:     string | null
          created_at:        string
          updated_at:        string
        }
        Insert: {
          tenant_id:          string
          product_id:         string
          status?:            'draft' | 'generating' | 'ready' | 'failed'
          prompt_text:        string
          image_count?:       number
          midjourney_job_id?: string | null
          error_message?:     string | null
        }
        Update: {
          tenant_id?:          string
          product_id?:         string
          status?:             'draft' | 'generating' | 'ready' | 'failed'
          prompt_text?:        string
          image_count?:        number
          midjourney_job_id?:  string | null
          error_message?:      string | null
        }
        Relationships: []
      }
      spin_images: {
        Row: {
          id:              string
          spin_package_id: string
          tenant_id:       string
          image_url:       string
          storage_path:    string | null
          frame_index:     number
          created_at:      string
        }
        Insert: {
          spin_package_id: string
          tenant_id:       string
          image_url:       string
          storage_path?:   string | null
          frame_index:     number
        }
        Update: {
          spin_package_id?: string
          tenant_id?:       string
          image_url?:       string
          storage_path?:    string | null
          frame_index?:     number
        }
        Relationships: []
      }
      product_images: {
        Row: {
          id:         string
          tenant_id:  string
          product_id: string
          image_url:  string | null
          created_at: string
        }
        Insert: {
          tenant_id:  string
          product_id: string
          image_url?: string | null
        }
        Update: {
          tenant_id?:  string
          product_id?: string
          image_url?:  string | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          id:           string
          tenant_id:    string
          customer_id:  string
          status:       string
          total_amount: number | null
          created_at:   string
        }
        Insert: {
          tenant_id:     string
          customer_id:   string
          status?:       string
          total_amount?: number | null
        }
        Update: {
          tenant_id?:    string
          customer_id?:  string
          status?:       string
          total_amount?: number | null
        }
        Relationships: []
      }
      order_items: {
        Row: {
          id:         string
          tenant_id:  string
          order_id:   string
          product_id: string | null
          quantity:   number
          price:      number
        }
        Insert: {
          tenant_id:  string
          order_id:   string
          product_id?: string | null
          quantity?:  number
          price:      number
        }
        Update: {
          tenant_id?:  string
          order_id?:   string
          product_id?: string | null
          quantity?:   number
          price?:      number
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          id:            string
          tenant_id:     string
          site_name:     string | null
          logo_url:      string | null
          favicon_url:   string | null
          brand_colors:  Json
          fonts:         Json
          theme:         Json
          seo_defaults:  Json
          header_config: Json
          footer_config: Json
          custom_domain: string | null
          subdomain:     string | null
          domain_type:   string
          domain_mode:   string
          is_published:  boolean
          created_at:    string
          updated_at:    string
        }
        Insert: {
          tenant_id:      string
          site_name?:     string | null
          logo_url?:      string | null
          favicon_url?:   string | null
          brand_colors?:  Json
          fonts?:         Json
          theme?:         Json
          seo_defaults?:  Json
          header_config?: Json
          footer_config?: Json
          custom_domain?: string | null
          subdomain?:     string | null
          domain_type?:   string
          domain_mode?:   string
          is_published?:  boolean
        }
        Update: {
          tenant_id?:     string
          site_name?:     string | null
          logo_url?:      string | null
          favicon_url?:   string | null
          brand_colors?:  Json
          fonts?:         Json
          theme?:         Json
          seo_defaults?:  Json
          header_config?: Json
          footer_config?: Json
          custom_domain?: string | null
          subdomain?:     string | null
          domain_type?:   string
          domain_mode?:   string
          is_published?:  boolean
        }
        Relationships: []
      }
      site_pages: {
        Row: {
          id:               string
          tenant_id:        string
          slug:             string
          title:            string | null
          meta_description: string | null
          page_type:        string
          status:           string
          sort_order:       number
          created_at:       string
          updated_at:       string
        }
        Insert: {
          tenant_id:         string
          slug:              string
          title?:            string | null
          meta_description?: string | null
          page_type?:        string
          status?:           string
          sort_order?:       number
        }
        Update: {
          tenant_id?:        string
          slug?:             string
          title?:            string | null
          meta_description?: string | null
          page_type?:        string
          status?:           string
          sort_order?:       number
        }
        Relationships: []
      }
      site_sections: {
        Row: {
          id:           string
          tenant_id:    string
          page_id:      string
          section_type: string
          section_key:  string | null
          content:      Json
          sort_order:   number
          is_visible:   boolean
          created_at:   string
          updated_at:   string
        }
        Insert: {
          tenant_id:    string
          page_id:      string
          section_type: string
          section_key?: string | null
          content?:     Json
          sort_order?:  number
          is_visible?:  boolean
        }
        Update: {
          tenant_id?:    string
          page_id?:      string
          section_type?: string
          section_key?:  string | null
          content?:      Json
          sort_order?:   number
          is_visible?:   boolean
        }
        Relationships: []
      }
      site_navigation_items: {
        Row: {
          id:         string
          tenant_id:  string
          label:      string
          href:       string
          sort_order: number
          is_visible: boolean
          location:   string
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id:  string
          label:      string
          href:       string
          sort_order?: number
          is_visible?: boolean
          location?:   string
        }
        Update: {
          tenant_id?:  string
          label?:      string
          href?:       string
          sort_order?: number
          is_visible?: boolean
          location?:   string
        }
        Relationships: []
      }
      site_assets: {
        Row: {
          id:         string
          tenant_id:  string
          asset_type: string
          url:        string
          metadata:   Json
          created_at: string
        }
        Insert: {
          tenant_id:   string
          asset_type:  string
          url:         string
          metadata?:   Json
        }
        Update: {
          tenant_id?:  string
          asset_type?: string
          url?:        string
          metadata?:   Json
        }
        Relationships: []
      }
      availability_rules: {
        Row: {
          id:                    string
          tenant_id:             string
          day_of_week:           number | null
          start_time:            string
          end_time:              string
          slot_duration_minutes: number
          slot_interval_minutes: number
          is_available:          boolean
          is_active:             boolean
          repeat_type:           string
          repeat_days:           number[] | null
          created_at:            string
          updated_at:            string
        }
        Insert: {
          tenant_id:              string
          day_of_week?:           number | null
          start_time?:            string
          end_time?:              string
          slot_duration_minutes?: number
          slot_interval_minutes?: number
          is_available?:          boolean
          is_active?:             boolean
          repeat_type?:           string
          repeat_days?:           number[] | null
        }
        Update: {
          tenant_id?:             string
          day_of_week?:           number | null
          start_time?:            string
          end_time?:              string
          slot_duration_minutes?: number
          slot_interval_minutes?: number
          is_available?:          boolean
          is_active?:             boolean
          repeat_type?:           string
          repeat_days?:           number[] | null
          updated_at?:            string
        }
        Relationships: []
      }
      blocked_times: {
        Row: {
          id:         string
          tenant_id:  string
          start_time: string
          end_time:   string
          reason:     string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          tenant_id:   string
          start_time:  string
          end_time:    string
          reason?:     string | null
          created_by?: string | null
        }
        Update: {
          tenant_id?:  string
          start_time?: string
          end_time?:   string
          reason?:     string | null
        }
        Relationships: []
      }
      rewards_programs: {
        Row: {
          id:               string
          tenant_id:        string
          name:             string
          description:      string | null
          status:           string
          earning_rules:    Json
          punch_card_rules: Json
          settings:         Json
          created_at:       string
          updated_at:       string
        }
        Insert: {
          tenant_id:         string
          name:              string
          description?:      string | null
          status?:           string
          earning_rules?:    Json
          punch_card_rules?: Json
          settings?:         Json
        }
        Update: {
          tenant_id?:        string
          name?:             string
          description?:      string | null
          status?:           string
          earning_rules?:    Json
          punch_card_rules?: Json
          settings?:         Json
          updated_at?:       string
        }
        Relationships: []
      }
      rewards_balances: {
        Row: {
          id:                       string
          tenant_id:                string
          customer_id:              string
          points_balance:           number
          lifetime_points_earned:   number
          lifetime_points_redeemed: number
          updated_at:               string
          created_at:               string
        }
        Insert: {
          tenant_id:                  string
          customer_id:                string
          points_balance?:            number
          lifetime_points_earned?:    number
          lifetime_points_redeemed?:  number
        }
        Update: {
          points_balance?:            number
          lifetime_points_earned?:    number
          lifetime_points_redeemed?:  number
          updated_at?:                string
        }
        Relationships: []
      }
      rewards_transactions: {
        Row: {
          id:               string
          tenant_id:        string
          customer_id:      string
          program_id:       string | null
          transaction_type: string
          points_delta:     number
          source_type:      string | null
          source_id:        string | null
          metadata:         Json
          created_at:       string
        }
        Insert: {
          tenant_id:         string
          customer_id:       string
          program_id?:       string | null
          transaction_type:  string
          points_delta:      number
          source_type?:      string | null
          source_id?:        string | null
          metadata?:         Json
        }
        Update: {
          transaction_type?: string
          points_delta?:     number
          source_type?:      string | null
          metadata?:         Json
        }
        Relationships: []
      }
      reward_shop_items: {
        Row: {
          id:                           string
          tenant_id:                    string
          name:                         string
          description:                  string | null
          points_cost:                  number
          is_active:                    boolean
          image_url:                    string | null
          product_id:                   string | null
          redemption_type:              string
          discount_type:                string | null
          discount_value:               number | null
          inventory_count:              number
          max_redemptions_per_customer: number | null
          settings:                     Json
          created_at:                   string
        }
        Insert: {
          tenant_id:                     string
          name:                          string
          points_cost:                   number
          description?:                  string | null
          is_active?:                    boolean
          image_url?:                    string | null
          product_id?:                   string | null
          redemption_type?:              string
          discount_type?:                string | null
          discount_value?:               number | null
          inventory_count?:              number
          max_redemptions_per_customer?: number | null
          settings?:                     Json
        }
        Update: {
          name?:                         string
          points_cost?:                  number
          description?:                  string | null
          is_active?:                    boolean
          image_url?:                    string | null
          inventory_count?:              number
          settings?:                     Json
        }
        Relationships: []
      }
      reward_redemptions: {
        Row: {
          id:             string
          tenant_id:      string
          customer_id:    string
          reward_item_id: string | null
          points_used:    number
          status:         string
          metadata:       Json
          created_at:     string
          updated_at:     string
        }
        Insert: {
          tenant_id:       string
          customer_id:     string
          reward_item_id?: string | null
          points_used:     number
          status?:         string
          metadata?:       Json
        }
        Update: {
          status?:     string
          metadata?:   Json
          updated_at?: string
        }
        Relationships: []
      }
      reward_punch_cards: {
        Row: {
          id:              string
          tenant_id:       string
          customer_id:     string
          product_id:      string | null
          title:           string
          punch_goal:      number
          current_punches: number
          reward_type:     string
          reward_value:    number | null
          status:          string
          metadata:        Json
          created_at:      string
          updated_at:      string
        }
        Insert: {
          tenant_id:        string
          customer_id:      string
          product_id?:      string | null
          title:            string
          punch_goal:       number
          current_punches?: number
          reward_type:      string
          reward_value?:    number | null
          status?:          string
          metadata?:        Json
        }
        Update: {
          current_punches?: number
          reward_type?:     string
          reward_value?:    number | null
          status?:          string
          metadata?:        Json
          updated_at?:      string
        }
        Relationships: []
      }
      website_import_jobs: {
        Row: {
          id:             string
          tenant_id:      string
          created_by:     string
          status:         string
          source_urls:    Json
          notes:          string | null
          target_site_id: string | null
          target_page_id: string | null
          error_message:  string | null
          progress:       number
          started_at:     string | null
          completed_at:   string | null
          created_at:     string
          updated_at:     string
        }
        Insert: {
          tenant_id:       string
          created_by:      string
          status?:         string
          source_urls?:    Json
          notes?:          string | null
          target_site_id?: string | null
          target_page_id?: string | null
          progress?:       number
        }
        Update: {
          status?:         string
          source_urls?:    Json
          notes?:          string | null
          error_message?:  string | null
          progress?:       number
          started_at?:     string | null
          completed_at?:   string | null
          updated_at?:     string
        }
        Relationships: []
      }
      website_import_results: {
        Row: {
          id:               string
          tenant_id:        string
          job_id:           string
          result_key:       string
          source_key:       string | null
          mapped_section:   string | null
          result_value:     Json
          confidence_score: number
          approved:         boolean
          created_at:       string
          updated_at:       string
        }
        Insert: {
          tenant_id:         string
          job_id:            string
          result_key:        string
          source_key?:       string | null
          mapped_section?:   string | null
          result_value?:     Json
          confidence_score?: number
          approved?:         boolean
        }
        Update: {
          result_key?:       string
          result_value?:     Json
          confidence_score?: number
          approved?:         boolean
          mapped_section?:   string | null
          updated_at?:       string
        }
        Relationships: []
      }
      website_import_sources: {
        Row: {
          id:               string
          tenant_id:        string
          job_id:           string
          source_url:       string
          source_type:      string | null
          page_title:       string | null
          fetched_status:   string
          confidence_score: number
          raw_metadata:     Json | null
          raw_text:         string | null
          created_at:       string
          updated_at:       string
        }
        Insert: {
          tenant_id:         string
          job_id:            string
          source_url:        string
          source_type?:      string | null
          page_title?:       string | null
          fetched_status?:   string
          confidence_score?: number
          raw_metadata?:     Json | null
          raw_text?:         string | null
        }
        Update: {
          fetched_status?:   string
          confidence_score?: number
          raw_metadata?:     Json | null
          raw_text?:         string | null
          updated_at?:       string
        }
        Relationships: []
      }
    }
    Views:     Record<string, never>
    Functions: {
      set_tenant_context: {
        Args:    { p_tenant_id: string }
        Returns: void
      }
      is_platform_owner: {
        Args:    Record<string, never>
        Returns: boolean
      }
      decrement_product_inventory: {
        Args:    { p_product_id: string; p_quantity: number }
        Returns: void
      }
      set_platform_admin_context: {
        Args:    Record<string, never>
        Returns: void
      }
      upsert_rewards_balance: {
        Args:    { p_tenant_id: string; p_customer_id: string; p_points_delta: number }
        Returns: { new_balance: number; lifetime_earned: number; lifetime_redeemed: number } | null
      }
    }
    Enums: Record<string, never>
  }
}
