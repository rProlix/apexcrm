// app/api/pos/kitchen/[ticketId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { getPOSClient } from '@/lib/pos/supabasePOS'

type Params = { params: Promise<{ ticketId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ticketId } = await params
  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const newStatus = body.status as string
  const validStatuses = ['accepted','preparing','ready','completed','cancelled']
  if (!validStatuses.includes(newStatus)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const update: Record<string, unknown> = { status: newStatus }
  if (newStatus === 'accepted')   update.accepted_at  = now
  if (newStatus === 'ready')      update.ready_at     = now
  if (newStatus === 'completed')  update.completed_at = now

  const supabase = getPOSClient()
  const { data, error } = await supabase
    .from('pos_kitchen_tickets')
    .update(update)
    .eq('id', ticketId)
    .eq('tenant_id', user.tenant_id)
    .select('id, status, order_id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // When kitchen marks ready, update order status
  if (newStatus === 'ready') {
    await supabase.from('pos_orders')
      .update({ status: 'ready', fulfillment_status: 'ready' })
      .eq('id', data.order_id)
      .eq('tenant_id', user.tenant_id)
      .in('status', ['sent_to_kitchen','preparing'])
  }

  return NextResponse.json({ ticket: data })
}
