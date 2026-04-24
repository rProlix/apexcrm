// lib/vercel/getDomainStatus.ts
// Fetches the current DNS / SSL status of a domain from Vercel.

import { vercelClient, isVercelConfigured } from './client'

export type VercelSslState = 'pending' | 'active' | 'failed'

export interface VercelDomainStatus {
  domain:        string
  verified:      boolean
  sslStatus:     VercelSslState
  configured:    boolean
  error:         string | null
  cname?:        string
  aRecord?:      string
}

interface VercelDomainResponse {
  name:            string
  verified:        boolean
  cname?:          string
  apexName?:       string
  projectId?:      string
  redirect?:       string | null
  gitBranch?:      string | null
  updatedAt?:      number
  createdAt?:      number
  verification?:   Array<{ domain: string; reason: string; type: string; value: string }>
}

/**
 * Returns the DNS + SSL status of a domain as recorded by Vercel.
 * Returns sslStatus='pending' and configured=false when Vercel is unconfigured.
 */
export async function getDomainStatusFromVercel(domain: string): Promise<VercelDomainStatus> {
  if (!isVercelConfigured()) {
    return { domain, verified: false, sslStatus: 'pending', configured: false, error: null }
  }

  const { data, error } = await vercelClient.get<VercelDomainResponse>(
    `/v9/projects/${vercelClient.projectId}/domains/${domain}`,
  )

  if (error) {
    return { domain, verified: false, sslStatus: 'failed', configured: true, error }
  }

  const verified = data?.verified ?? false

  return {
    domain,
    verified,
    sslStatus:  verified ? 'active' : 'pending',
    configured: true,
    error:      null,
    cname:      data?.cname,
  }
}
