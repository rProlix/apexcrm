// app/api/appointments/availability-blocks/route.ts
// GET  — list availability blocks for the tenant (optionally filtered by staffId)
// POST — create a new availability block
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser, resolveStoreCustomer } from '@/lib/auth/resolveStoreUser'
import { getSupabaseServerClient } from '@/lib/supabase/server'

function ok(data: unknown, status = 200) {
  return NextResponse.json({ ok: true, data }, { status })
}
function err(message: string, code: string, status: number, details?: unknown) {
  return NextResponse.json({ ok: false, error: message, code, details }, { status })
}

const SELECT_COLS = `
  id, tenant_id, staff_id, title,
  day_of_week, start_time, end_time,
  starts_at, ends_at,
  timezone, slot_duration_minutes,
  buffer_before_minutes, buffer_after_minutes,
  max_bookings_per_slot, is_recurring, is_active,
  created_at, updated_at,
  professional:professionals ( id, name, avatar_url )
`

// ─── GET /api/appointments/availability-blocks ────────────────────────────────
// Query params: staffId (optional), active (optional, default true)
export async function GET(req: NextRequest) {
  const params   = req.nextUrl.searchParams
  const staffId  = params.get('staffId')
  const active   = params.get('active')

  let tenant_id: string | null = null
  let isAdmin = false

  const staffUser = await resolveStoreUser(req)
  if (staffUser && (staffUser.role === 'admin' || staffUser.role === 'owner')) {
    tenant_id = staffUser.tenant_id
    isAdmin   = true
  }

  if (!tenant_id) {
    const customerUser = await resolveStoreCustomer(req)
    if (customerUser) {
      tenant_id = customerUser.tenant_id
    }
  }

  if (!tenant_id) {
    return err('Unauthorized', 'UNAUTHORIZED', 401)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  let query = supabase
    .from('appointment_availability_blocks')
    .select(SELECT_COLS)
    .eq('tenant_id', tenant_id)
    .order('day_of_week', { ascending: true, nullsFirst: false })
    .order('start_time',  { ascending: true, nullsFirst: false })
    .order('starts_at',   { ascending: true, nullsFirst: false })

  // Customers only see active blocks; admins can see all unless filtered
  if (!isAdmin || active === 'true') {
    query = query.eq('is_active', true)
  } else if (active === 'false') {
    query = query.eq('is_active', false)
  }

  if (staffId) {
    // Match blocks for this staff member OR blocks with no staff (applies to all)
    query = query.or(`staff_id.eq.${staffId},staff_id.is.null`)
  }

  const { data, error } = await query
  if (error) {
    console.error('[GET /api/appointments/availability-blocks]', error.message)
    return err(error.message, 'DB_ERROR', 500)
  }

  return ok({ blocks: data ?? [] })
}

// ─── POST /api/appointments/availability-blocks ───────────────────────────────
export async function POST(req: NextRequest) {
  const staffUser = await resolveStoreUser(req)
  if (!staffUser || (staffUser.role !== 'admin' && staffUser.role !== 'owner')) {
    return err('Unauthorized', 'UNAUTHORIZED', 401)
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return err('Invalid JSON body', 'INVALID_JSON', 400)
  }

  const {
    staffId, title, isRecurring,
    dayOfWeek, startTime, endTime,
    startsAt, endsAt,
    timezone, slotDurationMinutes,
    bufferBeforeMinutes, bufferAfterMinutes,
    maxBookingsPerSlot, isActive,
  } = body

  const recurring = isRecurring !== false

  // Validate based on type
  if (recurring) {
    if (dayOfWeek === null || dayOfWeek === undefined || typeof Number(dayOfWeek) !== 'number' || Number(dayOfWeek) < 0 || Number(dayOfWeek) > 6) {
      return err('dayOfWeek (0–6) is required for recurring blocks', 'VALIDATION_ERROR', 400)
    }
    if (!startTime || typeof startTime !== 'string' || !/^\d{2}:\d{2}$/.test(startTime as string)) {
      return err('startTime (HH:MM) is required for recurring blocks', 'VALIDATION_ERROR', 400)
    }
    if (!endTime || typeof endTime !== 'string' || !/^\d{2}:\d{2}$/.test(endTime as string)) {
      return err('endTime (HH:MM) is required for recurring blocks', 'VALIDATION_ERROR', 400)
    }
    if ((startTime as string) >= (endTime as string)) {
      return err('startTime must be before endTime', 'VALIDATION_ERROR', 400)
    }
  } else {
    if (!startsAt || !endsAt) {
      return err('startsAt and endsAt are required for one-time blocks', 'VALIDATION_ERROR', 400)
    }
    if (new Date(startsAt as string) >= new Date(endsAt as string)) {
      return err('startsAt must be before endsAt', 'VALIDATION_ERROR', 400)
    }
  }

  const duration = Number(slotDurationMinutes ?? 30)
  if (duration < 5 || duration > 480) {
    return err('slotDurationMinutes must be between 5 and 480', 'VALIDATION_ERROR', 400)
  }

  // Validate staff belongs to this tenant
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase  = getSupabaseServerClient() as any
  const tenant_id = staffUser.tenant_id

  if (staffId) {
    const { data: prof } = await supabase
      .from('professionals')
      .select('id')
      .eq('id', staffId)
      .eq('tenant_id', tenant_id)
      .maybeSingle()

    if (!prof) {
      return err('Professional not found in this tenant', 'NOT_FOUND', 404)
    }
  }

  const { data, error } = await supabase
    .from('appointment_availability_blocks')
    .insert({
      tenant_id,
      staff_id:              staffId   ?? null,
      title:                 title     ?? null,
      is_recurring:          recurring,
      day_of_week:           recurring ? Number(dayOfWeek) : null,
      start_time:            recurring ? startTime          : null,
      end_time:              recurring ? endTime            : null,
      starts_at:             recurring ? null               : startsAt,
      ends_at:               recurring ? null               : endsAt,
      timezone:              typeof timezone === 'string' ? timezone : 'America/Los_Angeles',
      slot_duration_minutes: duration,
      buffer_before_minutes: Number(bufferBeforeMinutes ?? 0),
      buffer_after_minutes:  Number(bufferAfterMinutes  ?? 0),
      max_bookings_per_slot: Number(maxBookingsPerSlot  ?? 1),
      is_active:             isActive !== false,
    })
    .select(SELECT_COLS)
    .single()

  if (error) {
    console.error('[POST /api/appointments/availability-blocks]', error.message)
    return err(error.message, 'DB_ERROR', 500)
  }

  return ok({ block: data }, 201)
}
