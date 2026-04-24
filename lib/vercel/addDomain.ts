// lib/vercel/addDomain.ts
// Adds a custom domain to the Vercel project.
// Falls back gracefully when Vercel is not configured.

import { vercelClient, isVercelConfigured } from './client'

export interface VercelAddDomainResult {
  ok:         boolean
  verified:   boolean
  error:      string | null
  configured: boolean
}

/**
 * Registers a domain with the Vercel project.
 *
 * When Vercel is not configured (missing env vars), returns ok=true with
 * configured=false so callers can show manual DNS instructions instead.
 */
export async function addDomainToVercel(domain: string): Promise<VercelAddDomainResult> {
  if (!isVercelConfigured()) {
    return { ok: true, verified: false, error: null, configured: false }
  }

  const { data, error } = await vercelClient.post<{
    name:     string
    verified: boolean
    verification?: Array<{ domain: string; reason: string; type: string; value: string }>
  }>(
    `/v10/projects/${vercelClient.projectId}/domains`,
    { name: domain },
  )

  if (error) {
    return { ok: false, verified: false, error, configured: true }
  }

  return {
    ok:         true,
    verified:   data?.verified ?? false,
    error:      null,
    configured: true,
  }
}
