// app/api/domains/route.ts
// GET /api/domains  — list domains for the current tenant (or all, for owner)
// POST /api/domains — add a custom domain to a tenant

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient }   from '@/lib/supabase/server'
import { getUserContext }             from '@/lib/auth/getUserContext'
import { isValidDomain, isPublicHostname, normalizeHost } from '@/lib/domain/normalizeHost'
import { addDomainToVercel }          from '@/lib/vercel/addDomain'
import crypto                         from 'crypto'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'yourcrm.com'

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((ctx.role as string) === 'customer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const db = getSupabaseServerClient()
  const { searchParams } = req.nextUrl
  const filterTenantId   = searchParams.get('tenant_id')

  let query = db
    .from('tenant_domains')
    .select('*')
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true })

  if (ctx.role === 'owner') {
    if (filterTenantId) query = query.eq('tenant_id', filterTenantId)
  } else {
    // admin — only their own tenant
    if (!ctx.tenant_id) return NextResponse.json({ domains: [] })
    query = query.eq('tenant_id', ctx.tenant_id)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ domains: data ?? [] })
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const { domain: rawDomain, tenant_id: bodyTenantId } = body as {
    domain?: string
    tenant_id?: string
  }

  // Determine which tenant this domain is for
  const tenantId = ctx.role === 'owner' ? (bodyTenantId ?? ctx.tenant_id) : ctx.tenant_id
  if (!tenantId) return NextResponse.json({ error: 'tenant_id is required' }, { status: 400 })

  // Admins can only add domains to their own tenant
  if (ctx.role === 'admin' && tenantId !== ctx.tenant_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!rawDomain) return NextResponse.json({ error: 'domain is required' }, { status: 400 })

  const domain = normalizeHost(rawDomain)

  // Validate domain format
  if (!isValidDomain(domain)) {
    return NextResponse.json({ error: 'Invalid domain format' }, { status: 400 })
  }

  // Block private / dangerous hosts
  if (!isPublicHostname(domain)) {
    return NextResponse.json({ error: 'Domain is not a public hostname' }, { status: 400 })
  }

  // Block registering the platform domain
  if (domain === ROOT_DOMAIN || domain.endsWith(`.${ROOT_DOMAIN}`)) {
    return NextResponse.json({ error: 'Cannot register the platform domain' }, { status: 400 })
  }

  const db = getSupabaseServerClient()

  // Check for duplicate across all tenants
  const { data: existing } = await db
    .from('tenant_domains')
    .select('tenant_id')
    .eq('hostname', domain)
    .maybeSingle()

  if (existing) {
    if (existing.tenant_id === tenantId) {
      return NextResponse.json({ error: 'Domain already registered for this tenant' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Domain is already taken by another tenant' }, { status: 409 })
  }

  // Generate verification token
  const verificationToken = crypto.randomBytes(24).toString('hex')

  const { data: domainRow, error: insertError } = await db
    .from('tenant_domains')
    .insert({
      tenant_id:           tenantId,
      hostname:            domain,
      domain_type:         'custom',
      is_primary:          false,
      is_verified:         false,
      verified:            false,
      verification_token:  verificationToken,
      verification_method: 'dns_txt',
      ssl_status:          'pending',
      metadata:            {},
    })
    .select('*')
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Attempt to register with Vercel (non-blocking)
  const vercelResult = await addDomainToVercel(domain)

  const dnsInstructions = buildDnsInstructions(domain, verificationToken)

  return NextResponse.json({
    ok:              true,
    domain:          domainRow,
    vercel:          { ok: vercelResult.ok, configured: vercelResult.configured },
    dnsInstructions,
  }, { status: 201 })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildDnsInstructions(domain: string, token: string) {
  return {
    txt: {
      host:  `_yourcrm-verify.${domain}`,
      value: `yourcrm-verify=${token}`,
      type:  'TXT',
      ttl:   '300',
    },
    cname: {
      host:  domain.startsWith('www.') ? domain : `www.${domain}`,
      value: `cname.${ROOT_DOMAIN}`,
      type:  'CNAME',
      ttl:   '300',
    },
    apex: {
      host:  '@',
      value: '76.76.21.21',
      type:  'A',
      ttl:   '300',
    },
  }
}
