// app/api/customers/[id]/profile/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { hasPermission } from '@/lib/auth/permissions'
import { getCustomerProfile } from '@/lib/customers/getCustomerProfile'
import { updateCustomerProfile, addCustomerNote } from '@/lib/customers/updateCustomerProfile'
import { getCustomerContext } from '@/lib/auth/customerGuard'
import { headers } from 'next/headers'

type Params = { params: Promise<{ id: string }> }

// ─── GET /api/customers/[id]/profile ─────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params

  const ctx = await getUserContext()
  if (ctx && hasPermission(ctx.role, 'view_customers')) {
    const tenantId = ctx.tenant_id
    if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

    const profile = await getCustomerProfile(tenantId, id)
    return NextResponse.json({ profile })
  }

  const host = (await headers()).get('host') ?? ''
  const customerCtx = await getCustomerContext(host)
  if (customerCtx && customerCtx.customer_id === id) {
    const profile = await getCustomerProfile(customerCtx.tenant_id, id)
    return NextResponse.json({ profile })
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

// ─── PATCH /api/customers/[id]/profile ───────────────────────────────────────
// admin → full profile update + notes
// customer → limited (marketing_opt_in + preferences only, no notes)
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Admin path
  const ctx = await getUserContext()
  if (ctx && hasPermission(ctx.role, 'manage_customers')) {
    const tenantId = ctx.tenant_id
    if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

    try {
      // Handle note append
      if (typeof body.note_text === 'string' && body.note_text.trim()) {
        const profile = await addCustomerNote({
          tenantId,
          customerId: id,
          text:       body.note_text as string,
          author:     ctx.email,
        })
        return NextResponse.json({ profile })
      }

      const updates: { preferences?: Record<string, unknown>; marketing_opt_in?: boolean } = {}
      if (body.preferences && typeof body.preferences === 'object') {
        updates.preferences = body.preferences as Record<string, unknown>
      }
      if (typeof body.marketing_opt_in === 'boolean') {
        updates.marketing_opt_in = body.marketing_opt_in
      }

      const profile = await updateCustomerProfile(tenantId, id, updates)
      return NextResponse.json({ profile })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  // Customer portal — limited fields only
  const host = (await headers()).get('host') ?? ''
  const customerCtx = await getCustomerContext(host)
  if (customerCtx && customerCtx.customer_id === id) {
    try {
      const updates: { preferences?: Record<string, unknown>; marketing_opt_in?: boolean } = {}
      if (body.preferences && typeof body.preferences === 'object') {
        updates.preferences = body.preferences as Record<string, unknown>
      }
      if (typeof body.marketing_opt_in === 'boolean') {
        updates.marketing_opt_in = body.marketing_opt_in
      }
      const profile = await updateCustomerProfile(customerCtx.tenant_id, id, updates)
      return NextResponse.json({ profile })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
