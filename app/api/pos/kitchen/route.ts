// app/api/pos/kitchen/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { getPOSClient } from '@/lib/pos/supabasePOS'

export async function GET(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getPOSClient()
  const { searchParams } = req.nextUrl
  const status = searchParams.get('status') // 'new,accepted,preparing,ready'

  let query = supabase
    .from('pos_kitchen_tickets')
    .select(`
      *,
      pos_orders(id, order_number, order_type, table_name, guest_count, notes, kitchen_notes,
        pos_order_items(id, name, quantity, notes, kitchen_notes, fulfillment_status,
          pos_order_item_modifiers(id, name, modifier_type, quantity, price_delta_cents)
        )
      )
    `)
    .eq('tenant_id', user.tenant_id)
    .order('sent_at', { ascending: true })

  if (status) {
    query = query.in('status', status.split(','))
  } else {
    query = query.in('status', ['new','accepted','preparing','ready'])
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ tickets: data ?? [] })
}
