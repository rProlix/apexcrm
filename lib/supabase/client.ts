'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/supabase/types'

/**
 * Cookie-backed browser Supabase client.
 * Reads env vars at call time to avoid undefined values during SSR/build.
 * Sessions are stored in cookies so middleware and server components can
 * read them server-side via @supabase/ssr.
 */
export function getSupabaseBrowserClient() {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createBrowserClient<Database>(url, anon)
}
