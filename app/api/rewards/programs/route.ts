// app/api/rewards/programs/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import type { EarningRules, PunchCardRule, ProgramSettings } from '@/types/rewards'

// ─── GET /api/rewards/programs ────────────────────────────────────────────────
// admin/owner → returns all programs for their tenant
export async function GET(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin' && user.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const tenantId = user.role === 'owner'
    ? (req.nextUrl.searchParams.get('tenant_id') ?? user.tenant_id)
    : user.tenant_id

  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase
    .from('rewards_programs')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[GET /api/rewards/programs]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ programs: data })
}

// ─── POST /api/rewards/programs ───────────────────────────────────────────────
// admin/owner only — create a rewards program
export async function POST(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin' && user.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const { name, description, status, earning_rules, punch_card_rules, settings } = body

  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const tenantId = user.tenant_id
  const supabase = getSupabaseServerClient()

  const { data, error } = await supabase
    .from('rewards_programs')
    .insert({
      tenant_id:        tenantId,
      name:             name.trim(),
      description:      typeof description === 'string' ? description.trim() || null : null,
      status:           typeof status === 'string' ? status : 'active',
      earning_rules:    (earning_rules as EarningRules)     ?? { points_per_dollar: 10, enabled: true, bonus_points_products: [] },
      punch_card_rules: (punch_card_rules as PunchCardRule[]) ?? [],
      settings:         (settings as ProgramSettings)       ?? { points_enabled: true, punch_cards_enabled: true, shop_enabled: true, min_redemption_points: 100 },
    })
    .select()
    .single()

  if (error) {
    console.error('[POST /api/rewards/programs]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ program: data }, { status: 201 })
}
