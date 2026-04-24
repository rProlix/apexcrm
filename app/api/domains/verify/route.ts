// app/api/domains/verify/route.ts
// POST /api/domains/verify — verify domain ownership via DNS TXT record check.
// Runs in Node.js runtime (not Edge) so it can use dns.promises.

export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient }   from '@/lib/supabase/server'
import { getUserContext }             from '@/lib/auth/getUserContext'
import { verifyDomainOnVercel }       from '@/lib/vercel/verifyDomain'
import dns                            from 'dns/promises'

export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as { domain_id?: string } | null
  if (!body?.domain_id) {
    return NextResponse.json({ error: 'domain_id is required' }, { status: 400 })
  }

  const db = getSupabaseServerClient()

  const { data: domainRow } = await db
    .from('tenant_domains')
    .select('id, tenant_id, hostname, domain_type, verification_token, verification_method, is_verified')
    .eq('id', body.domain_id)
    .maybeSingle()

  if (!domainRow) return NextResponse.json({ error: 'Domain not found' }, { status: 404 })

  if (domainRow.domain_type === 'subdomain') {
    return NextResponse.json({ error: 'Platform subdomains do not require verification' }, { status: 400 })
  }

  // Admin scope check
  if (ctx.role === 'admin' && domainRow.tenant_id !== ctx.tenant_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (domainRow.is_verified) {
    return NextResponse.json({ ok: true, verified: true, message: 'Already verified' })
  }

  const { hostname, verification_token: token } = domainRow

  if (!token) {
    return NextResponse.json({ error: 'No verification token found for this domain' }, { status: 400 })
  }

  // ── DNS TXT check ─────────────────────────────────────────────────────────
  const expectedTxt = `yourcrm-verify=${token}`
  let dnsVerified   = false

  try {
    const records = await dns.resolveTxt(`_yourcrm-verify.${hostname}`)
    dnsVerified = records.some((r) => r.join('').includes(expectedTxt))
  } catch {
    // DNS lookup failed — record may not exist yet
    dnsVerified = false
  }

  // Also accept top-level TXT on the domain itself as fallback
  if (!dnsVerified) {
    try {
      const records = await dns.resolveTxt(hostname)
      dnsVerified = records.some((r) => r.join('').includes(expectedTxt))
    } catch {
      dnsVerified = false
    }
  }

  if (!dnsVerified) {
    // Update last attempt timestamp
    await db
      .from('tenant_domains')
      .update({ last_verified_at: new Date().toISOString() })
      .eq('id', domainRow.id)

    return NextResponse.json({
      ok:       false,
      verified: false,
      message:  'DNS TXT record not found. Please add the verification record and try again.',
      hint:     `Add TXT record: _yourcrm-verify.${hostname} → ${expectedTxt}`,
    })
  }

  // ── Mark verified in DB ───────────────────────────────────────────────────
  await db
    .from('tenant_domains')
    .update({
      is_verified:      true,
      verified:         true,
      last_verified_at: new Date().toISOString(),
    })
    .eq('id', domainRow.id)

  // Trigger Vercel verification (best-effort)
  const vercelResult = await verifyDomainOnVercel(hostname, domainRow.tenant_id)

  // Update SSL status
  await db
    .from('tenant_domains')
    .update({ ssl_status: vercelResult.sslStatus })
    .eq('id', domainRow.id)

  return NextResponse.json({
    ok:       true,
    verified: true,
    ssl:      vercelResult.sslStatus,
    vercel:   { ok: vercelResult.verified, configured: vercelResult.configured },
    message:  'Domain verified successfully',
  })
}
