// app/api/rewards/redemptions/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'

type Params = { params: Promise<{ id: string }> }

// ─── GET /api/rewards/redemptions/[id] ───────────────────────────────────────
export async function GET(req: NextRequest, { params }: Params) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin' && user.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase
    .from('reward_redemptions')
    .select('*, reward_shop_items(name, redemption_type), customers(name, email)')
    .eq('id', (await params).id)
    .eq('tenant_id', user.tenant_id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ redemption: data })
}

// ─── PATCH /api/rewards/redemptions/[id] ─────────────────────────────────────
// admin/owner — update redemption status (approve, fulfill, cancel)
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin' && user.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const { status } = body
  const validStatuses = ['pending', 'approved', 'fulfilled', 'canceled']
  if (typeof status !== 'string' || !validStatuses.includes(status)) {
    return NextResponse.json({ error: `status must be one of: ${validStatuses.join(', ')}` }, { status: 400 })
  }

  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase
    .from('reward_redemptions')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', (await params).id)
    .eq('tenant_id', user.tenant_id)
    .select()
    .single()

  if (error) {
    console.error('[PATCH /api/rewards/redemptions/[id]]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ redemption: data })
}
