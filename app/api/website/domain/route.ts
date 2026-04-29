// app/api/website/domain/route.ts
// Domain management API: add / remove custom domains for a tenant.
// Only owner and admin roles may call this endpoint.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/requireRole'

// POST /api/website/domain — register a custom domain
export async function POST(req: NextRequest) {
  try {
    await requireRole(['owner', 'admin'])
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const { tenant_id, hostname } = body ?? {}

  if (!tenant_id || !hostname) {
    return NextResponse.json({ error: 'tenant_id and hostname are required' }, { status: 400 })
  }

  const domain = String(hostname)
    .toLowerCase()
    .replace(/https?:\/\//, '')
    .replace(/\/$/, '')
    .trim()

  if (!isValidHostname(domain)) {
    return NextResponse.json({ error: 'Invalid domain format' }, { status: 400 })
  }

  // Block platform domain
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'nexoranow.com'
  if (domain === rootDomain || domain.endsWith(`.${rootDomain}`)) {
    return NextResponse.json({ error: 'Cannot register the platform domain' }, { status: 400 })
  }

  const db = getSupabaseServerClient()

  // Check for duplicate
  const { data: existing } = await db
    .from('tenant_domains')
    .select('tenant_id')
    .eq('hostname', domain)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'Domain is already registered' }, { status: 409 })
  }

  const { error } = await db
    .from('tenant_domains')
    .insert({ tenant_id, hostname: domain, verified: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, hostname: domain, verified: false })
}

// DELETE /api/website/domain — remove a custom domain
export async function DELETE(req: NextRequest) {
  try {
    await requireRole(['owner', 'admin'])
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const { tenant_id, hostname } = body ?? {}

  if (!tenant_id || !hostname) {
    return NextResponse.json({ error: 'tenant_id and hostname are required' }, { status: 400 })
  }

  const db = getSupabaseServerClient()

  const { error } = await db
    .from('tenant_domains')
    .delete()
    .eq('tenant_id', tenant_id)
    .eq('hostname', hostname)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // If this domain was the active custom domain in site_settings, clear it
  await db
    .from('site_settings')
    .update({ custom_domain: null, domain_type: 'subdomain' })
    .eq('tenant_id', tenant_id)
    .eq('custom_domain', hostname)

  return NextResponse.json({ ok: true })
}

// PATCH /api/website/domain — mark a domain as verified (platform owner only)
export async function PATCH(req: NextRequest) {
  try {
    await requireRole(['owner'])
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const { hostname, verified } = body ?? {}

  if (!hostname) {
    return NextResponse.json({ error: 'hostname is required' }, { status: 400 })
  }

  const db = getSupabaseServerClient()
  const { error } = await db
    .from('tenant_domains')
    .update({ verified: Boolean(verified) })
    .eq('hostname', hostname)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isValidHostname(host: string): boolean {
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(host)
}
