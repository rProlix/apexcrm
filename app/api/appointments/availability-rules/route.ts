// app/api/appointments/availability-rules/route.ts
// Granular CRUD for individual availability rules.
// Admin-only for all write operations; GET is accessible to authenticated users.
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { getSupabaseServerClient } from '@/lib/supabase/server'

function requireAdmin(staffUser: Awaited<ReturnType<typeof resolveStoreUser>>) {
  return !staffUser || (staffUser.role !== 'admin' && staffUser.role !== 'owner')
}

// ─── GET /api/appointments/availability-rules ─────────────────────────────────
// Returns all availability rules for the tenant.
export async function GET(req: NextRequest) {
  const staffUser = await resolveStoreUser(req)
  if (requireAdmin(staffUser)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase  = getSupabaseServerClient()
  const tenant_id = staffUser!.tenant_id

  const { data, error } = await supabase
    .from('availability_rules')
    .select('*')
    .eq('tenant_id', tenant_id)
    .order('day_of_week', { ascending: true })
    .order('start_time',  { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ rules: data ?? [] })
}

// ─── POST /api/appointments/availability-rules ────────────────────────────────
// Creates a single new availability rule.
export async function POST(req: NextRequest) {
  const staffUser = await resolveStoreUser(req)
  if (requireAdmin(staffUser)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    day_of_week,
    start_time,
    end_time,
    slot_interval_minutes,
    repeat_type,
    repeat_days,
    is_active,
  } = body

  // Validate required fields
  if (typeof start_time !== 'string' || !/^\d{2}:\d{2}$/.test(start_time)) {
    return NextResponse.json({ error: 'start_time must be HH:MM' }, { status: 400 })
  }
  if (typeof end_time !== 'string' || !/^\d{2}:\d{2}$/.test(end_time)) {
    return NextResponse.json({ error: 'end_time must be HH:MM' }, { status: 400 })
  }
  if (start_time >= end_time) {
    return NextResponse.json({ error: 'start_time must be before end_time' }, { status: 400 })
  }

  const repeatType = ['daily', 'weekly', 'custom'].includes(repeat_type as string)
    ? repeat_type as string
    : 'weekly'

  if (repeatType === 'custom') {
    if (!Array.isArray(repeat_days) || repeat_days.length === 0) {
      return NextResponse.json(
        { error: 'repeat_days array required for custom repeat type' },
        { status: 400 }
      )
    }
  }

  const intervalMins = Number(slot_interval_minutes ?? 30)
  if (intervalMins < 5 || intervalMins > 480) {
    return NextResponse.json({ error: 'slot_interval_minutes must be 5–480' }, { status: 400 })
  }

  const supabase  = getSupabaseServerClient()
  const tenant_id = staffUser!.tenant_id

  const { data, error } = await supabase
    .from('availability_rules')
    .insert({
      tenant_id,
      day_of_week:           repeatType === 'weekly' ? Number(day_of_week ?? 1) : null,
      start_time,
      end_time,
      slot_interval_minutes: intervalMins,
      slot_duration_minutes: intervalMins,
      repeat_type:           repeatType,
      repeat_days:           repeatType === 'custom' ? repeat_days : null,
      is_active:             is_active !== false,
      is_available:          is_active !== false,
    })
    .select()
    .single()

  if (error) {
    console.error('[POST /api/appointments/availability-rules]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ rule: data }, { status: 201 })
}

// ─── PATCH /api/appointments/availability-rules ───────────────────────────────
// Updates a single rule by id (query param: ?id=...)
export async function PATCH(req: NextRequest) {
  const staffUser = await resolveStoreUser(req)
  if (requireAdmin(staffUser)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id query param is required' }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const supabase  = getSupabaseServerClient()
  const tenant_id = staffUser!.tenant_id

  // Only patch fields that were provided
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.start_time  !== undefined) patch.start_time  = body.start_time
  if (body.end_time    !== undefined) patch.end_time    = body.end_time
  if (body.day_of_week !== undefined) patch.day_of_week = Number(body.day_of_week)

  if (body.slot_interval_minutes !== undefined) {
    const m = Number(body.slot_interval_minutes)
    patch.slot_interval_minutes = m
    patch.slot_duration_minutes = m
  }

  if (body.repeat_type !== undefined) {
    patch.repeat_type = body.repeat_type
    if (body.repeat_type !== 'custom') patch.repeat_days = null
  }
  if (body.repeat_days !== undefined) patch.repeat_days = body.repeat_days

  if (body.is_active !== undefined) {
    patch.is_active    = body.is_active
    patch.is_available = body.is_active
  }

  const { data, error } = await supabase
    .from('availability_rules')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', tenant_id)
    .select()
    .single()

  if (error) {
    console.error('[PATCH /api/appointments/availability-rules]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ rule: data })
}

// ─── DELETE /api/appointments/availability-rules ──────────────────────────────
// Deletes a rule by id (query param: ?id=...)
export async function DELETE(req: NextRequest) {
  const staffUser = await resolveStoreUser(req)
  if (requireAdmin(staffUser)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id query param is required' }, { status: 400 })
  }

  const supabase  = getSupabaseServerClient()
  const tenant_id = staffUser!.tenant_id

  const { error } = await supabase
    .from('availability_rules')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenant_id)

  if (error) {
    console.error('[DELETE /api/appointments/availability-rules]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
