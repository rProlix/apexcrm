'use client'

// lib/supabase/customer-client.ts
//
// Browser-safe Supabase client for customer-facing storefront components.
//
// Sessions are stored in cookies (not localStorage) so they can be read by
// middleware and server components via @supabase/ssr. Never use localStorage
// for auth in this project.

export { getSupabaseBrowserClient as getCustomerBrowserClient } from '@/lib/supabase/client'
