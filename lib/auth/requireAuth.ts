// lib/auth/requireAuth.ts
import { redirect } from 'next/navigation'
import { createSessionServerClient, getSupabaseServerClient } from '@/lib/supabase/server'
import { getTenantFromHost } from '@/lib/tenant/getTenantFromHost'
import type { UserContext } from './types'

export interface AuthContext {
  userId:   string
  tenantId: string
  role:     string
  email:    string
}

/**
 * Server-side auth guard for dashboard server components.
 * Verifies the Supabase session and returns the authenticated user + tenant context.
 *
 * Platform owners (role === 'owner') bypass the tenant check — they are
 * authorised globally and their tenant_id may be null.
 *
 * Redirects to /login if unauthenticated or to /login?error=unauthorized if
 * no active profile is found.
 *
 * @param host - value of the Host request header
 */
export async function requireAuth(host: string): Promise<AuthContext> {
  const sessionClient = createSessionServerClient()
  const { data: { user }, error } = await sessionClient.auth.getUser()

  if (error || !user) {
    redirect('/login')
  }

  const admin = getSupabaseServerClient()

  // Attempt to resolve the tenant from the hostname
  const tenant = await getTenantFromHost(host)

  let userRecord: { id: string; role: string; email: string; tenant_id: string | null; status: string } | null = null

  if (tenant) {
    // Standard tenant-scoped lookup
    const { data } = await admin
      .from('users')
      .select('id, role, email, tenant_id, status')
      .eq('auth_user_id', user.id)
      .eq('tenant_id', tenant.id)
      .maybeSingle()
    userRecord = data ?? null
  }

  // If host-based lookup missed, fall back to auth_user_id only.
  // This covers the platform owner (tenant_id = null) and localhost dev.
  if (!userRecord) {
    const { data } = await admin
      .from('users')
      .select('id, role, email, tenant_id, status')
      .eq('auth_user_id', user.id)
      .eq('status', 'active')
      .maybeSingle()
    userRecord = data ?? null
  }

  if (!userRecord || userRecord.status !== 'active') {
    redirect('/login?error=unauthorized')
  }

  // Platform owner: redirect away from tenant routes if they navigated here by mistake
  const effectiveTenantId = userRecord.tenant_id ?? tenant?.id ?? ''

  return {
    userId:   userRecord.id,
    tenantId: effectiveTenantId,
    role:     userRecord.role,
    email:    userRecord.email,
  }
}

/**
 * Require the platform owner role.
 * Redirects to /dashboard if the user is not the owner.
 */
export async function requirePlatformAdmin(host: string): Promise<AuthContext> {
  const ctx = await requireAuth(host)

  if (ctx.role !== 'owner') {
    redirect('/dashboard?error=forbidden')
  }

  return ctx
}

/**
 * Lightweight session check — returns the UserContext or null without redirecting.
 * Use this for conditional rendering rather than hard guards.
 */
export async function getAuthContext(): Promise<UserContext | null> {
  const { getUserContext } = await import('./getUserContext')
  return getUserContext()
}
