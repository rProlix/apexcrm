'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/supabase/types'

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * Cookie-backed browser Supabase client.
 * Sessions are stored in cookies so the middleware and server components
 * can read the session server-side via @supabase/ssr.
 */
export function getSupabaseBrowserClient() {
  return createBrowserClient<Database>(supabaseUrl, supabaseAnon)
}
