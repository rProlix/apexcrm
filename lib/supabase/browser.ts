'use client'

/**
 * Standard browser Supabase client entry point.
 *
 * Re-exports getSupabaseBrowserClient as createClient so code can follow
 * the @supabase/ssr naming convention while keeping the cross-subdomain
 * cookie domain configuration defined in client.ts.
 *
 * Usage:
 *   import { createClient } from '@/lib/supabase/browser'
 *   const supabase = createClient()
 */
export { getSupabaseBrowserClient as createClient } from '@/lib/supabase/client'
