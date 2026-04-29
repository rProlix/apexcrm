/**
 * lib/api/requireTenant.ts — API route tenant enforcement.
 *
 * Use in every Route Handler to ensure queries are always scoped
 * to the correct tenant. Reads from headers (set by middleware) OR
 * falls back to the authenticated user's own tenant.
 *
 * Example usage in a Route Handler:
 *
 *   import { requireApiTenant } from '@/lib/api/requireTenant'
 *
 *   export async function GET(req: NextRequest) {
 *     const { tenant, user, supabase, errorResponse } = await requireApiTenant(req)
 *     if (errorResponse) return errorResponse
 *
 *     const { data } = await supabase
 *       .from('products')
 *       .select('*')
 *       .eq('tenant_id', tenant.id)
 *
 *     return NextResponse.json({ data })
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSessionServerClient, getSupabaseServerClient } from '@/lib/supabase/server'
import type { TenantRecord } from '@/lib/tenant/getTenantFromHost'
import type { User } from '@supabase/supabase-js'

export interface ApiTenantContext {
  tenant:        TenantRecord
  user:          User
  tenantId:      string
  supabase:      ReturnType<typeof getSupabaseServerClient>
  errorResponse: null
}

export interface ApiTenantError {
  tenant:        null
  user:          null
  tenantId:      null
  supabase:      null
  errorResponse: NextResponse
}

export type ApiTenantResult = ApiTenantContext | ApiTenantError

/**
 * Validates authentication and resolves the tenant for the current API request.
 *
 * Returns either a populated context (errorResponse = null) or an error response
 * (all other fields null). Callers must check `errorResponse` before using other fields.
 */
export async function requireApiTenant(req: NextRequest): Promise<ApiTenantResult> {
  const admin  = getSupabaseServerClient()
  const err    = (status: number, message: string): ApiTenantError => ({
    tenant: null, user: null, tenantId: null, supabase: null,
    errorResponse: NextResponse.json({ error: message }, { status }),
  })

  // ── 1. Authenticate ───────────────────────────────────────────────────────
  let user: User | null = null
  try {
    const sessionClient = await createSessionServerClient()
    const { data } = await sessionClient.auth.getUser()
    user = data.user
  } catch {
    return err(401, 'Authentication error')
  }

  if (!user) return err(401, 'Authentication required')

  // ── 2. Resolve tenant ─────────────────────────────────────────────────────
  const tenantSlugHeader = req.headers.get('x-tenant-slug') ?? ''
  let tenantId: string | null = null

  if (tenantSlugHeader) {
    const { data } = await admin
      .from('tenants')
      .select('id')
      .or(`slug.eq.${tenantSlugHeader},subdomain.eq.${tenantSlugHeader}`)
      .eq('status', 'active')
      .maybeSingle()
    tenantId = data?.id ?? null
  }

  // Fall back to user's own tenant (platform-host requests)
  if (!tenantId) {
    const { data: userRecord } = await admin
      .from('users')
      .select('tenant_id')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    tenantId = userRecord?.tenant_id ?? null
  }

  if (!tenantId) return err(404, 'Tenant not found')

  // ── 3. Load full tenant record ────────────────────────────────────────────
  const { data: tenant } = await admin
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .eq('status', 'active')
    .maybeSingle()

  if (!tenant) return err(404, 'Tenant not found or inactive')

  return {
    tenant:        tenant as TenantRecord,
    user,
    tenantId,
    supabase:      admin,
    errorResponse: null,
  }
}

/**
 * Lightweight version that only returns tenant_id + supabase client.
 * Does NOT verify authentication — only use for public API routes that
 * still need tenant scoping (e.g. public storefront APIs).
 */
export async function resolveTenantFromRequest(
  req: NextRequest,
): Promise<{ tenantId: string; supabase: ReturnType<typeof getSupabaseServerClient> } | null> {
  const admin     = getSupabaseServerClient()
  const slugHeader = req.headers.get('x-tenant-slug') ?? ''

  if (!slugHeader) return null

  const { data } = await admin
    .from('tenants')
    .select('id')
    .or(`slug.eq.${slugHeader},subdomain.eq.${slugHeader}`)
    .eq('status', 'active')
    .maybeSingle()

  if (!data?.id) return null
  return { tenantId: data.id, supabase: admin }
}
