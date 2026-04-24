// app/api/payments/invoices/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser, resolveStoreCustomer } from '@/lib/auth/resolveStoreUser'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { createInvoice } from '@/lib/payments/createInvoice'
import type { InvoiceItemInput, InvoiceSourceType } from '@/lib/payments/createInvoice'

// ── GET /api/payments/invoices ────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  const dashUser = await resolveStoreUser(req)
  if (dashUser && ['admin', 'owner'].includes(dashUser.role)) {
    const tenantId = dashUser.role === 'owner'
      ? (req.nextUrl.searchParams.get('tenant_id') ?? dashUser.tenant_id)
      : dashUser.tenant_id

    const statusFilter = req.nextUrl.searchParams.get('status')

    let query = supabase
      .from('invoices')
      .select('*, invoice_items(*)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })

    if (statusFilter) query = query.eq('status', statusFilter)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ invoices: data ?? [] })
  }

  // Customer: own invoices only
  const customer = await resolveStoreCustomer(req)
  if (!customer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('invoices')
    .select('*, invoice_items(*)')
    .eq('tenant_id', customer.tenant_id)
    .eq('customer_id', customer.customer_id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ invoices: data ?? [] })
}

// ── POST /api/payments/invoices ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user || !['admin', 'owner'].includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized — admin required' }, { status: 401 })
  }

  const tenantId = user.role === 'owner'
    ? (req.nextUrl.searchParams.get('tenant_id') ?? user.tenant_id)
    : user.tenant_id

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const {
    customer_id,
    contact_id,
    order_id,
    appointment_id,
    title,
    description,
    currency,
    due_date,
    provider_key,
    items,
    metadata,
  } = body

  if (!title || typeof title !== 'string') {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items array is required and must not be empty' }, { status: 400 })
  }

  const parsedItems: InvoiceItemInput[] = (items as Record<string, unknown>[]).map((item, idx) => {
    if (!item.name || typeof item.name !== 'string') {
      throw new Error(`Item ${idx}: name is required`)
    }
    const qty   = Number(item.quantity) || 1
    const price = Number(item.unit_price)
    if (isNaN(price) || price < 0) {
      throw new Error(`Item ${idx}: unit_price must be a non-negative number`)
    }
    return {
      name:        item.name,
      description: item.description as string | undefined,
      quantity:    Math.max(1, Math.floor(qty)),
      unit_price:  price,
      source_type: item.source_type as InvoiceSourceType | undefined,
      source_id:   item.source_id   as string | undefined,
    }
  })

  try {
    const invoice = await createInvoice({
      tenantId,
      customerId:    customer_id    as string | undefined,
      contactId:     contact_id    as string | undefined,
      orderId:       order_id      as string | undefined,
      appointmentId: appointment_id as string | undefined,
      title,
      description:  description   as string | undefined,
      currency:     currency      as string | undefined,
      dueDate:      due_date      as string | undefined,
      providerKey:  provider_key  as string | undefined,
      items:        parsedItems,
      metadata:     metadata      as Record<string, unknown> | undefined,
    })

    return NextResponse.json({ invoice }, { status: 201 })
  } catch (err) {
    const msg = (err as Error).message
    if (msg.includes('required') || msg.includes('negative') || msg.includes('quantity')) {
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    console.error('[POST /api/payments/invoices]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
