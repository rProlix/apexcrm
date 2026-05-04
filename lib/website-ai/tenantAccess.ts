// lib/website-ai/tenantAccess.ts
// Server-side tenant access resolution for AI Autofill routes.
// Mirrors the pattern used in app/api/website/pages/route.ts.

import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { sanitizeTenantId } from '@/lib/website/resolveWebsiteTenant'
import type { UserContext } from '@/lib/auth/types'

export interface TenantAccessResult {
  ctx:      UserContext
  tenantId: string
}

/**
 * Resolves tenantId safely for an authenticated owner or admin.
 * - Owner: uses hintTenantId if provided, else ctx.tenant_id
 * - Admin: always uses their own ctx.tenant_id; rejects mismatches
 * Returns null if resolution fails (caller should return 400/403).
 */
export function resolveTenantAccess(
  ctx:           UserContext,
  hintTenantId?: string | null,
): string | null {
  const hint = sanitizeTenantId(hintTenantId)
  const self = sanitizeTenantId(ctx.tenant_id)

  if (ctx.role === 'owner') return hint ?? self
  if (self && hint && self !== hint) return null   // mismatch — block
  return self ?? hint
}

/**
 * Full auth + tenant resolution for API route handlers.
 * Returns null if auth fails or role is insufficient.
 */
export async function requireAiAutofillAccess(
  hintTenantId?: string | null,
): Promise<TenantAccessResult | null> {
  const ctx = await getUserContext()
  if (!ctx) return null
  if (!['owner', 'admin'].includes(ctx.role)) return null

  const tenantId = resolveTenantAccess(ctx, hintTenantId)
  if (!tenantId) return null

  return { ctx, tenantId }
}

/**
 * Verifies that a specific job belongs to the resolved tenant.
 */
export async function verifyJobAccess(
  jobId:    string,
  tenantId: string,
): Promise<boolean> {
  const db = getSupabaseServerClient()
  const { data } = await db
    .from('website_ai_import_jobs')
    .select('id')
    .eq('id', jobId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  return !!data
}

/**
 * Verifies that a specific suggestion belongs to the resolved tenant.
 */
export async function verifySuggestionAccess(
  suggestionId: string,
  tenantId:     string,
): Promise<boolean> {
  const db = getSupabaseServerClient()
  const { data } = await db
    .from('website_ai_suggestions')
    .select('id')
    .eq('id', suggestionId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  return !!data
}
