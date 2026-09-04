import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getRewardsProgram } from '@/lib/rewards/getRewardsProgram'
import { recordCommandAudit } from '@/lib/command-center/audit'

type Context = { params: Promise<{ resource: string }> }
const resources: Record<
  string,
  { table: string; allowed: string[]; defaults?: Record<string, unknown> }
> = {
  rules: {
    table: 'reward_rules',
    allowed: [
      'name',
      'event_type',
      'earning_basis',
      'amount_threshold',
      'points_awarded',
      'points_per_currency',
      'minimum_spend',
      'maximum_per_event',
      'starts_at',
      'ends_at',
      'enabled',
    ],
    defaults: { enabled: true },
  },
  'punch-definitions': {
    table: 'reward_punch_definitions',
    allowed: [
      'name',
      'description',
      'required_punches',
      'reward_type',
      'reward_value',
      'reward_item_id',
      'earning_method',
      'repeatable',
      'maximum_active_cards',
      'starts_at',
      'ends_at',
      'expires_after_days',
      'enabled',
    ],
    defaults: { enabled: true, repeatable: true },
  },
  tiers: {
    table: 'reward_tiers',
    allowed: [
      'name',
      'rank',
      'qualification_type',
      'threshold',
      'qualification_window',
      'points_multiplier',
      'benefits',
      'color',
      'enabled',
    ],
    defaults: { enabled: true },
  },
  promotions: {
    table: 'reward_promotions',
    allowed: [
      'name',
      'status',
      'rule_type',
      'multiplier',
      'bonus_points',
      'bonus_punches',
      'minimum_spend',
      'budget_limit',
      'starts_at',
      'ends_at',
    ],
    defaults: { status: 'draft' },
  },
  'referral-programs': {
    table: 'reward_referral_programs',
    allowed: ['enabled', 'qualification_type', 'referrer_points', 'referred_points', 'terms'],
    defaults: { enabled: false },
  },
}

async function context(request: NextRequest, route: Context) {
  const user = await resolveStoreUser(request)
  const config = resources[(await route.params).resource]
  if (!user || !['owner', 'admin'].includes(user.role) || !config) return null
  return { user, config, db: getSupabaseServerClient() as any }
}

export async function GET(request: NextRequest, route: Context) {
  const loaded = await context(request, route)
  if (!loaded) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data, error } = await loaded.db
    .from(loaded.config.table)
    .select('*')
    .eq('tenant_id', loaded.user.tenant_id)
    .order('created_at', { ascending: false })
  if (error)
    return NextResponse.json({ error: 'Unable to load rewards configuration' }, { status: 500 })
  return NextResponse.json({ records: data ?? [] })
}

export async function POST(request: NextRequest, route: Context) {
  const loaded = await context(request, route)
  if (!loaded) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  const program = await getRewardsProgram(loaded.user.tenant_id)
  if (!program)
    return NextResponse.json({ error: 'Create an active rewards program first' }, { status: 409 })
  const values: Record<string, unknown> = {
    ...loaded.config.defaults,
    tenant_id: loaded.user.tenant_id,
    program_id: program.id,
  }
  for (const field of loaded.config.allowed) if (field in body) values[field] = body[field]
  const { data, error } = await loaded.db
    .from(loaded.config.table)
    .insert(values)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 422 })
  await recordCommandAudit({
    tenantId: loaded.user.tenant_id,
    actorUserId: loaded.user.id,
    action: `rewards.${(await route.params).resource}.created`,
    metadata: { record_id: data.id },
  })
  return NextResponse.json({ record: data }, { status: 201 })
}

export async function PATCH(request: NextRequest, route: Context) {
  const loaded = await context(request, route)
  if (!loaded) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const values: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const field of loaded.config.allowed) if (field in body!) values[field] = body![field]
  const { data, error } = await loaded.db
    .from(loaded.config.table)
    .update(values)
    .eq('tenant_id', loaded.user.tenant_id)
    .eq('id', id)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 422 })
  await recordCommandAudit({
    tenantId: loaded.user.tenant_id,
    actorUserId: loaded.user.id,
    action: `rewards.${(await route.params).resource}.updated`,
    metadata: { record_id: id },
  })
  return NextResponse.json({ record: data })
}

export async function DELETE(request: NextRequest, route: Context) {
  const loaded = await context(request, route)
  if (!loaded) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const { error } = await loaded.db
    .from(loaded.config.table)
    .delete()
    .eq('tenant_id', loaded.user.tenant_id)
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 422 })
  await recordCommandAudit({
    tenantId: loaded.user.tenant_id,
    actorUserId: loaded.user.id,
    action: `rewards.${(await route.params).resource}.deleted`,
    metadata: { record_id: id },
  })
  return NextResponse.json({ ok: true })
}
