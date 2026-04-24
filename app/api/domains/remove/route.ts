// app/api/domains/remove/route.ts
// POST /api/domains/remove — removes a domain by hostname (alternative to DELETE /[id]).
// Useful when the caller only knows the hostname, not the row ID.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient }   from '@/lib/supabase/server'
import { getUserContext }             from '@/lib/auth/getUserContext'
import { removeDomainFromVercel }     from '@/lib/vercel/removeDomain'
import { normalizeHost }              from '@/lib/domain/normalizeHost'

export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as { hostname?: string; tenant_id?: string } | null
  if (!body?.hostname) return NextResponse.json({ error: 'hostname is required' }, { status: 400 })

  const hostname = normalizeHost(body.hostname)
  const db       = getSupabaseServerClient()

  const { data: domainRow } = await db
    .from('tenant_domains')
    .select('id, tenant_id, hostname, domain_type, is_verified')
    .eq('hostname', hostname)
    .maybeSingle()

  if (!domainRow) return NextResponse.json({ error: 'Domain not found' }, { status: 404 })
  if (domainRow.domain_type === 'subdomain') {
    return NextResponse.json({ error: 'Cannot remove platform subdomain' }, { status: 400 })
  }

  // Admin scope check
  if (ctx.role === 'admin' && domainRow.tenant_id !== ctx.tenant_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await db.from('tenant_domains').delete().eq('id', domainRow.id)

  if (domainRow.is_verified) {
    await db
      .from('site_settings')
      .update({ custom_domain: null, domain_type: 'subdomain', domain_mode: 'subdomain' })
      .eq('tenant_id', domainRow.tenant_id)
      .eq('custom_domain', hostname)
  }

  await removeDomainFromVercel(hostname)

  await db
    .from('tenant_domains')
    .update({ is_primary: true })
    .eq('tenant_id', domainRow.tenant_id)
    .eq('domain_type', 'subdomain')

  return NextResponse.json({ ok: true, removed: hostname })
}
