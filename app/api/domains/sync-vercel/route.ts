// app/api/domains/sync-vercel/route.ts
// POST /api/domains/sync-vercel — (owner only) syncs all verified custom domains
// for a tenant to the Vercel project.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient }   from '@/lib/supabase/server'
import { requireOwner }               from '@/lib/auth/requireRole'
import { addDomainToVercel }          from '@/lib/vercel/addDomain'
import { getDomainStatusFromVercel }  from '@/lib/vercel/getDomainStatus'
import { isVercelConfigured }         from '@/lib/vercel/client'

export async function POST(req: NextRequest) {
  try {
    await requireOwner()
  } catch {
    return NextResponse.json({ error: 'Owner access required' }, { status: 403 })
  }

  if (!isVercelConfigured()) {
    return NextResponse.json({
      ok:      false,
      message: 'Vercel is not configured. Set VERCEL_TOKEN and VERCEL_PROJECT_ID.',
    }, { status: 422 })
  }

  const body = await req.json().catch(() => ({})) as { tenant_id?: string }
  const db   = getSupabaseServerClient()

  let query = db
    .from('tenant_domains')
    .select('id, tenant_id, hostname, is_verified, ssl_status')
    .eq('domain_type', 'custom')

  if (body.tenant_id) query = query.eq('tenant_id', body.tenant_id)

  const { data: domains, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results: Array<{ domain: string; ok: boolean; sslStatus: string; error: string | null }> = []

  for (const row of domains ?? []) {
    // Add / re-register the domain
    const addResult = await addDomainToVercel(row.hostname)
    // Check current status
    const statusResult = await getDomainStatusFromVercel(row.hostname)

    // Sync back to DB
    await db
      .from('tenant_domains')
      .update({
        ssl_status:       statusResult.sslStatus,
        is_verified:      statusResult.verified,
        verified:         statusResult.verified,
        last_verified_at: new Date().toISOString(),
      })
      .eq('id', row.id)

    results.push({
      domain:    row.hostname,
      ok:        addResult.ok,
      sslStatus: statusResult.sslStatus,
      error:     addResult.error ?? statusResult.error,
    })
  }

  return NextResponse.json({ ok: true, synced: results.length, results })
}
