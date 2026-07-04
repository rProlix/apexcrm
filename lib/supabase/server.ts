import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { getSupabaseEnv } from '@/lib/env'

/**
 * Returns service-role key at call time (never at module scope).
 * SUPABASE_SERVICE_ROLE_KEY is a server-side secret — it is intentionally
 * kept out of lib/env.ts (which is importable by client code) and accessed
 * only here in this server-only file.
 */
function getServiceRoleKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
}

/**
 * Service-role server client for admin/write operations.
 * Bypasses RLS — never expose to the client. Use for tenant creation,
 * platform admin tasks, and other privileged server-side work.
 */
export function getSupabaseServerClient() {
  const { url: publicUrl } = getSupabaseEnv()
  const url = process.env.SUPABASE_URL?.trim() || publicUrl
  const serviceRole = getServiceRoleKey()
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
 * Applies the same cross-subdomain cookie domain as the browser and
 * middleware clients so that refreshed tokens written here (e.g. from
 * route handlers) are readable across all *.nexoranow.com subdomains.
 *
 * Must be awaited — Next.js 15 made cookies() and headers() async APIs.
 */
export async function createSessionServerClient() {
  const { url, key: anon } = getSupabaseEnv()
  const [cookieStore, headersList] = await Promise.all([cookies(), headers()])

  const rootDomain   = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? ''
  const hostname     = headersList.get('host')?.split(':')[0] ?? ''
  const cookieDomain = rootDomain && (
    hostname === rootDomain || hostname.endsWith(`.${rootDomain}`)
  ) ? `.${rootDomain}` : undefined

  return createServerClient<Database>(url, anon, {
    ...(cookieDomain ? {
      cookieOptions: {
        domain:   cookieDomain,
        path:     '/',
        sameSite: 'lax' as const,
        secure:   true,
      },
    } : {}),
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
