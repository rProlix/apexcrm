import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

/**
 * Reads Supabase env vars at call time (not module load time).
 * This prevents "supabaseUrl is required" errors during Next.js build-time
 * prerendering, where env vars may not yet be injected.
 */
function getEnv() {
  const url         = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon        = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !anon) {
    throw new Error(
      'Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.'
    )
  }
  return { url, anon, serviceRole: serviceRole ?? '' }
}

/**
 * Service-role server client for admin/write operations.
 * Bypasses RLS — never expose to the client. Use for tenant creation,
 * platform admin tasks, and other privileged server-side work.
 */
export function getSupabaseServerClient() {
  const { url, serviceRole } = getEnv()
  return createClient<Database>(url, serviceRole, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

/**
 * Cookie-backed session client for App Router server components,
 * route handlers, and server actions. Reads the session from the
 * request cookies set by the browser's @supabase/ssr client.
 *
 * Must be awaited — Next.js 15 made cookies() an async API.
 */
export async function createSessionServerClient() {
  const { url, anon } = getEnv()
  const cookieStore = await cookies()

  return createServerClient<Database>(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Server Components are read-only; writes are no-ops here.
          // Route handlers and server actions handle cookie writes correctly.
        }
      },
    },
  })
}

/**
 * Returns a server client pre-configured with tenant context.
 * Sets `app.current_tenant_id` as a Postgres session setting so RLS policies
 * apply correctly for the duration of this client's queries.
 */
export function getSupabaseTenantClient(tenantId: string) {
  const client = getSupabaseServerClient() // uses getEnv() internally

  return {
    client,
    tenantId,
    async setContext() {
      await client.rpc('set_tenant_context', { p_tenant_id: tenantId })
    },
  }
}

/**
 * SQL function to create in Supabase (run once):
 *
 * create or replace function set_tenant_context(p_tenant_id uuid)
 * returns void language plpgsql security definer as $$
 * begin
 *   perform set_config('app.current_tenant_id', p_tenant_id::text, true);
 * end;
 * $$;
 */
