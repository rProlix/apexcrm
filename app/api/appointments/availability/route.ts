// app/api/appointments/availability/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser, resolveStoreCustomer } from '@/lib/auth/resolveStoreUser'
import { generateTimeSlots } from '@/lib/appointments/generateTimeSlots'
import { generateTimeSlotsForStaff } from '@/lib/appointments/generateTimeSlotsForStaff'
import { getSupabaseServerClient } from '@/lib/supabase/server'

// ─── GET /api/appointments/availability ───────────────────────────────────────
// Query params:
//   date       YYYY-MM-DD  (required)
//   staffId    optional professional/employee filter
//   tenant_id  optional override for owner role
export async function GET(req: NextRequest) {
  const params  = req.nextUrl.searchParams
  const date    = params.get('date')
  const staffId = params.get('staffId') ?? undefined

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: 'date param is required (YYYY-MM-DD)' },
      { status: 400 }
    )
  }

  const requestedDate = new Date(date + 'T12:00:00Z')
  const maxDate       = new Date()
  maxDate.setFullYear(maxDate.getFullYear() + 1)
  if (requestedDate > maxDate) {
    return NextResponse.json({ error: 'Date too far in the future' }, { status: 400 })
  }

  let tenant_id: string | null = null
  let isAdmin                  = false

  const staffUser = await resolveStoreUser(req)
  if (staffUser && (staffUser.role === 'admin' || staffUser.role === 'owner')) {
    tenant_id = staffUser.role === 'owner'
      ? (params.get('tenant_id') ?? staffUser.tenant_id)
      : staffUser.tenant_id
    isAdmin = true
  }

  if (!tenant_id) {
    const customerUser = await resolveStoreCustomer(req)
    if (customerUser) {
      tenant_id = customerUser.tenant_id
    }
  }

  if (!tenant_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Use staff-scoped slot generation when staffId is provided
  const allSlots = staffId
    ? await generateTimeSlotsForStaff({ tenant_id, date, staff_id: staffId })
    : await generateTimeSlots({ tenant_id, date })

  const slots = isAdmin
    ? allSlots
    : allSlots.filter((s) => s.available)

  return NextResponse.json({
    slots,
    date,
    total:     allSlots.length,
    available: slots.filter((s) => s.available).length,
  })
}

// ─── POST /api/appointments/availability ──────────────────────────────────────
// Bulk upsert availability rules (legacy — kept for backward compatibility).
export async function POST(req: NextRequest) {
  const staffUser = await resolveStoreUser(req)
  if (!staffUser || (staffUser.role !== 'admin' && staffUser.role !== 'owner')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { rules } = body
  if (!Array.isArray(rules)) {
    return NextResponse.json({ error: 'rules array is required' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase  = getSupabaseServerClient() as any
  const tenant_id = staffUser.tenant_id

  const upserts = rules.map((rule: Record<string, unknown>) => {
    const repeatType  = ['daily', 'weekly', 'custom'].includes(rule.repeat_type as string)
      ? rule.repeat_type
      : 'weekly'
    const repeatDays  = Array.isArray(rule.repeat_days) ? rule.repeat_days : null
    const intervalMin = Number(rule.slot_interval_minutes ?? rule.slot_duration_minutes ?? 30)

    return {
      tenant_id,
      day_of_week:           Number(rule.day_of_week ?? 0),
      start_time:            rule.start_time ?? '09:00',
      end_time:              rule.end_time   ?? '17:00',
      slot_interval_minutes: intervalMin,
      slot_duration_minutes: intervalMin,
      repeat_type:           repeatType,
      repeat_days:           repeatDays,
      is_active:             rule.is_active !== false,
      is_available:          rule.is_active !== false,
      updated_at:            new Date().toISOString(),
    }
  })

  const { data, error } = await supabase
    .from('availability_rules')
    .upsert(upserts, { onConflict: 'id' })
    .select()

  if (error) {
    console.error('[POST /api/appointments/availability]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ rules: data })
}
