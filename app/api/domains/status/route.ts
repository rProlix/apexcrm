// app/api/domains/status/route.ts
// GET /api/domains/status?domain_id=xxx — fetch Vercel DNS/SSL status for a domain.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient }   from '@/lib/supabase/server'
import { getUserContext }             from '@/lib/auth/getUserContext'
import { getDomainStatusFromVercel }  from '@/lib/vercel/getDomainStatus'

export async function GET(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const domainId = req.nextUrl.searchParams.get('domain_id')
  if (!domainId) return NextResponse.json({ error: 'domain_id is required' }, { status: 400 })

  const db = getSupabaseServerClient()

  const { data: domainRow } = await db
    .from('tenant_domains')
    .select('id, tenant_id, hostname, is_verified, ssl_status')
    .eq('id', domainId)
    .maybeSingle()

  if (!domainRow) return NextResponse.json({ error: 'Domain not found' }, { status: 404 })

  if (ctx.role === 'admin' && domainRow.tenant_id !== ctx.tenant_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const vercelStatus = await getDomainStatusFromVercel(domainRow.hostname)

  // Sync ssl_status back to DB if Vercel is configured and state changed
  if (vercelStatus.configured && vercelStatus.sslStatus !== domainRow.ssl_status) {
    await db
      .from('tenant_domains')
      .update({
        ssl_status:       vercelStatus.sslStatus,
        is_verified:      vercelStatus.verified,
        verified:         vercelStatus.verified,
        last_verified_at: new Date().toISOString(),
      })
      .eq('id', domainRow.id)
  }

  return NextResponse.json({
    domain:     domainRow.hostname,
    is_verified: vercelStatus.verified,
    ssl_status:  vercelStatus.sslStatus,
    vercel:      vercelStatus,
  })
}
