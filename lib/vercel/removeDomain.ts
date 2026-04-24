// lib/vercel/removeDomain.ts
// Removes a custom domain from the Vercel project.

import { vercelClient, isVercelConfigured } from './client'

export interface VercelRemoveDomainResult {
  ok:         boolean
  error:      string | null
  configured: boolean
}

/**
 * Removes a domain from the Vercel project.
 * Gracefully no-ops when Vercel is not configured.
 */
export async function removeDomainFromVercel(domain: string): Promise<VercelRemoveDomainResult> {
  if (!isVercelConfigured()) {
    return { ok: true, error: null, configured: false }
  }

  const { error } = await vercelClient.delete(
    `/v9/projects/${vercelClient.projectId}/domains/${domain}`,
  )

  if (error) {
    // 404 means already removed — treat as success
    if (error.includes('404') || error.toLowerCase().includes('not found')) {
      return { ok: true, error: null, configured: true }
    }
    return { ok: false, error, configured: true }
  }

  return { ok: true, error: null, configured: true }
}
