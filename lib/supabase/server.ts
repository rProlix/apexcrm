import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

const supabaseUrl         = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnon        = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * Service-role server client for admin/write operations.
 * Bypasses RLS — never expose to the client. Use for tenant creation,
 * platform admin tasks, and other privileged server-side work.
 */
export function getSupabaseServerClient() {
  return createClient<Database>(supabaseUrl, supabaseServiceRole, {
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
 */
export function createSessionServerClient() {
  const cookieStore = cookies()

  return createServerClient<Database>(supabaseUrl, supabaseAnon, {
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
  const client = getSupabaseServerClient()

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
