// app/api/payments/invoices/[id]/send/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { createPaymentLink } from '@/lib/payments/createPaymentLink'

// ── POST /api/payments/invoices/[id]/send ─────────────────────────────────────
// Creates a payment link for the invoice and marks it as pending
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await resolveStoreUser(req)
  if (!user || !['admin', 'owner'].includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  const { data: invoice } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', (await params).id)
    .maybeSingle()

  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  if (user.role !== 'owner' && invoice.tenant_id !== user.tenant_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (invoice.status === 'paid') {
    return NextResponse.json({ error: 'Invoice is already paid' }, { status: 400 })
  }

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* no body required */ }

  try {
    const link = await createPaymentLink({
      tenantId:   invoice.tenant_id,
      invoiceId:  invoice.id,
      title:      invoice.title ?? `Invoice ${invoice.invoice_number}`,
      amount:     Number(invoice.amount),
      currency:   invoice.currency,
      providerKey: body.provider_key as string | undefined,
    })

    // Mark invoice as pending and attach provider reference
    await supabase
      .from('invoices')
      .update({
        status:             'pending',
        provider_key:       link.providerKey,
        provider_reference: link.providerLinkId,
      })
      .eq('id', invoice.id)

    return NextResponse.json({ link }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/payments/invoices/[id]/send]', (err as Error).message)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
