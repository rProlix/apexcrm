// app/api/payments/invoices/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser, resolveStoreCustomer } from '@/lib/auth/resolveStoreUser'
import { getSupabaseServerClient } from '@/lib/supabase/server'

// ── GET /api/payments/invoices/[id] ──────────────────────────────────────────
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  const dashUser = await resolveStoreUser(req)
  if (dashUser && ['admin', 'owner'].includes(dashUser.role)) {
    const { data, error } = await supabase
      .from('invoices')
      .select('*, invoice_items(*), payment_transactions(*), payment_links(*)')
      .eq('id', params.id)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data)  return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Enforce tenant scope for admin
    if (dashUser.role !== 'owner' && data.tenant_id !== dashUser.tenant_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({ invoice: data })
  }

  // Customer: own invoice only
  const customer = await resolveStoreCustomer(req)
  if (!customer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('invoices')
    .select('*, invoice_items(*)')
    .eq('id', params.id)
    .eq('tenant_id', customer.tenant_id)
    .eq('customer_id', customer.customer_id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data)  return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ invoice: data })
}

// ── PATCH /api/payments/invoices/[id] ────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await resolveStoreUser(req)
  if (!user || !['admin', 'owner'].includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  const { data: existing } = await supabase
    .from('invoices')
    .select('id, tenant_id, status')
    .eq('id', params.id)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (user.role !== 'owner' && existing.tenant_id !== user.tenant_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const allowed = ['title', 'description', 'status', 'due_date', 'provider_key', 'metadata']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if (updates.status) {
    const valid = ['draft', 'pending', 'paid', 'failed', 'canceled', 'refunded', 'partially_refunded']
    if (!valid.includes(updates.status as string)) {
      return NextResponse.json({ error: `Invalid status: ${updates.status}` }, { status: 400 })
    }
  }

  const { data, error } = await supabase
    .from('invoices')
    .update(updates)
    .eq('id', params.id)
    .select('id, invoice_number, status, amount, currency, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ invoice: data })
}

// ── DELETE /api/payments/invoices/[id] ───────────────────────────────────────
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await resolveStoreUser(req)
  if (!user || !['admin', 'owner'].includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  const { data: existing } = await supabase
    .from('invoices')
    .select('id, tenant_id, status')
    .eq('id', params.id)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (user.role !== 'owner' && existing.tenant_id !== user.tenant_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (['paid', 'partially_refunded'].includes(existing.status)) {
    return NextResponse.json({ error: 'Cannot delete a paid invoice' }, { status: 400 })
  }

  const { error } = await supabase.from('invoices').delete().eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
