// app/api/rewards/punch-cards/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'

type Params = { params: { id: string } }

// ─── GET /api/rewards/punch-cards/[id] ───────────────────────────────────────
export async function GET(req: NextRequest, { params }: Params) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin' && user.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase
    .from('reward_punch_cards')
    .select('*, products(name), customers(name, email), reward_punch_card_events(*)')
    .eq('id', params.id)
    .eq('tenant_id', user.tenant_id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ punch_card: data })
}

// ─── PATCH /api/rewards/punch-cards/[id] ─────────────────────────────────────
// admin/owner — update punch card status or reset
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin' && user.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const supabase = getSupabaseServerClient()
  const allowed = ['status', 'current_punches', 'metadata']
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  const { data, error } = await supabase
    .from('reward_punch_cards')
    .update(updates)
    .eq('id', params.id)
    .eq('tenant_id', user.tenant_id)
    .select()
    .single()

  if (error) {
    console.error('[PATCH /api/rewards/punch-cards/[id]]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ punch_card: data })
}
