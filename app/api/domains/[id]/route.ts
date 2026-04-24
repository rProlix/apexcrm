// app/api/domains/[id]/route.ts
// PATCH /api/domains/[id] — update domain settings (primary, verified state)
// DELETE /api/domains/[id] — remove a domain

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient }   from '@/lib/supabase/server'
import { getUserContext }             from '@/lib/auth/getUserContext'
import { removeDomainFromVercel }     from '@/lib/vercel/removeDomain'

interface RouteContext {
  params: Promise<{ id: string }>
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = getSupabaseServerClient() as any

  const { data: existing } = await db
    .from('tenant_domains')
    .select('id, tenant_id, hostname, domain_type, is_primary')
    .eq('id', (await params).id)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Domain not found' }, { status: 404 })

  // Admin scope check
  if (ctx.role === 'admin' && existing.tenant_id !== ctx.tenant_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as {
    is_primary?:  boolean
    is_verified?: boolean
    ssl_status?:  string
    metadata?:    Record<string, unknown>
  }

  const updates: Record<string, unknown> = {}

  if (typeof body.is_primary === 'boolean') {
    updates.is_primary = body.is_primary

    // Only owner can force-set primary; admin can set their own
    if (body.is_primary) {
      // Clear existing primary for this tenant (of same domain_type)
      await db
        .from('tenant_domains')
        .update({ is_primary: false })
        .eq('tenant_id', existing.tenant_id)
        .eq('domain_type', existing.domain_type)
        .neq('id', existing.id)
    }
  }

  if (ctx.role === 'owner') {
    if (typeof body.is_verified === 'boolean') {
      updates.is_verified = body.is_verified
      updates.verified    = body.is_verified
      if (body.is_verified) updates.last_verified_at = new Date().toISOString()
    }
    if (body.ssl_status) updates.ssl_status = body.ssl_status
  }

  if (body.metadata) updates.metadata = body.metadata

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data: updated, error } = await db
    .from('tenant_domains')
    .update(updates)
    .eq('id', existing.id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, domain: updated })
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = getSupabaseServerClient() as any

  const { data: existing } = await db
    .from('tenant_domains')
    .select('id, tenant_id, hostname, domain_type, is_primary, is_verified')
    .eq('id', (await params).id)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Domain not found' }, { status: 404 })

  // Prevent deleting platform subdomain — it is auto-managed
  if (existing.domain_type === 'subdomain') {
    return NextResponse.json({ error: 'Cannot delete the platform subdomain' }, { status: 400 })
  }

  // Admin scope check
  if (ctx.role === 'admin' && existing.tenant_id !== ctx.tenant_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error: deleteError } = await db
    .from('tenant_domains')
    .delete()
    .eq('id', existing.id)

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  // If this was the active custom domain in site_settings, revert to subdomain
  if (existing.is_verified) {
    await db
      .from('site_settings')
      .update({ custom_domain: null, domain_type: 'subdomain', domain_mode: 'subdomain' })
      .eq('tenant_id', existing.tenant_id)
      .eq('custom_domain', existing.hostname)
  }

  // Remove from Vercel (best-effort)
  await removeDomainFromVercel(existing.hostname)

  // Re-ensure the subdomain is still primary
  await db
    .from('tenant_domains')
    .update({ is_primary: true })
    .eq('tenant_id', existing.tenant_id)
    .eq('domain_type', 'subdomain')

  return NextResponse.json({ ok: true, removed: existing.hostname })
}
