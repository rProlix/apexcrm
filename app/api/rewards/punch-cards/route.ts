// app/api/rewards/punch-cards/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { resolveStoreUser, resolveStoreCustomer } from '@/lib/auth/resolveStoreUser'

// ─── GET /api/rewards/punch-cards ─────────────────────────────────────────────
// admin/owner → all punch cards for tenant; customer → own punch cards
export async function GET(req: NextRequest) {
  const supabase = getSupabaseServerClient()

  const dashUser = await resolveStoreUser(req)
  if (dashUser && (dashUser.role === 'admin' || dashUser.role === 'owner')) {
    const tenantId = dashUser.role === 'owner'
      ? (req.nextUrl.searchParams.get('tenant_id') ?? dashUser.tenant_id)
      : dashUser.tenant_id

    const { data, error } = await supabase
      .from('reward_punch_cards')
      .select('*, products(name), customers(name, email)')
      .eq('tenant_id', tenantId)
      .order('updated_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ punch_cards: data })
  }

  const customer = await resolveStoreCustomer(req)
  if (!customer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('reward_punch_cards')
    .select('*, products(name)')
    .eq('tenant_id', customer.tenant_id)
    .eq('customer_id', customer.customer_id)
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ punch_cards: data })
}
