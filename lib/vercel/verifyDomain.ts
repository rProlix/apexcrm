// lib/vercel/verifyDomain.ts
// Triggers domain verification on Vercel and syncs the result back to the DB.

import { vercelClient, isVercelConfigured } from './client'
import { getSupabaseServerClient }           from '@/lib/supabase/server'

export interface VerifyDomainResult {
  verified:   boolean
  sslStatus:  'pending' | 'active' | 'failed'
  error:      string | null
  configured: boolean
}

/**
 * Asks Vercel to re-check domain verification, then updates the
 * tenant_domains row with the result.
 *
 * Safe to call when Vercel is not configured — returns verified=false
 * and logs the DB update only.
 */
export async function verifyDomainOnVercel(
  domain:   string,
  tenantId: string,
): Promise<VerifyDomainResult> {
  if (!isVercelConfigured()) {
    return { verified: false, sslStatus: 'pending', error: null, configured: false }
  }

  const { data, error } = await vercelClient.post<{ verified: boolean }>(
    `/v9/projects/${vercelClient.projectId}/domains/${domain}/verify`,
    {},
  )

  const verified  = !error && (data?.verified ?? false)
  const sslStatus: 'pending' | 'active' | 'failed' = error
    ? 'failed'
    : verified
      ? 'active'
      : 'pending'

  // Sync state back to DB
  const db = getSupabaseServerClient()
  await db
    .from('tenant_domains')
    .update({
      is_verified:      verified,
      verified:         verified,
      ssl_status:       sslStatus,
      last_verified_at: new Date().toISOString(),
    })
    .eq('hostname', domain)
    .eq('tenant_id', tenantId)

  // When verified, promote to primary custom domain in site_settings
  if (verified) {
    await db
      .from('site_settings')
      .update({
        custom_domain: domain,
        domain_type:   'custom',
        domain_mode:   'custom',
      })
      .eq('tenant_id', tenantId)
  }

  return { verified, sslStatus, error: error ?? null, configured: true }
}
