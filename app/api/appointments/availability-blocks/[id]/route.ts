// app/api/appointments/availability-blocks/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { getSupabaseServerClient } from '@/lib/supabase/server'

type Ctx = { params: Promise<{ id: string }> }

function ok(data: unknown) {
  return NextResponse.json({ ok: true, data })
}
function err(message: string, code: string, status: number) {
  return NextResponse.json({ ok: false, error: message, code }, { status })
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

function requireAdmin(staffUser: Awaited<ReturnType<typeof resolveStoreUser>>) {
  return !staffUser || (staffUser.role !== 'admin' && staffUser.role !== 'owner')
}

// ─── PATCH /api/appointments/availability-blocks/[id] ────────────────────────
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const staffUser = await resolveStoreUser(req)
  if (requireAdmin(staffUser)) return err('Unauthorized', 'UNAUTHORIZED', 401)

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return err('Invalid JSON body', 'INVALID_JSON', 400)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase  = getSupabaseServerClient() as any
  const tenant_id = staffUser!.tenant_id

  // Confirm block belongs to this tenant
  const { data: existing } = await supabase
    .from('appointment_availability_blocks')
    .select('id, is_recurring, tenant_id')
    .eq('id', id)
    .eq('tenant_id', tenant_id)
    .maybeSingle()

  if (!existing) return err('Not found', 'NOT_FOUND', 404)

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.staffId            !== undefined) patch.staff_id              = body.staffId ?? null
  if (body.title              !== undefined) patch.title                 = body.title   ?? null
  if (body.isActive           !== undefined) patch.is_active             = Boolean(body.isActive)
  if (body.timezone           !== undefined) patch.timezone              = body.timezone
  if (body.maxBookingsPerSlot !== undefined) patch.max_bookings_per_slot = Number(body.maxBookingsPerSlot)
  if (body.bufferBeforeMinutes !== undefined) patch.buffer_before_minutes = Number(body.bufferBeforeMinutes)
  if (body.bufferAfterMinutes  !== undefined) patch.buffer_after_minutes  = Number(body.bufferAfterMinutes)

  if (body.slotDurationMinutes !== undefined) {
    const dur = Number(body.slotDurationMinutes)
    if (dur < 5 || dur > 480) return err('slotDurationMinutes must be between 5 and 480', 'VALIDATION_ERROR', 400)
    patch.slot_duration_minutes = dur
  }

  // Recurring-specific fields
  if (body.isRecurring !== undefined) patch.is_recurring = Boolean(body.isRecurring)

  if (body.dayOfWeek  !== undefined) patch.day_of_week = body.dayOfWeek !== null ? Number(body.dayOfWeek) : null
  if (body.startTime  !== undefined) {
    if (body.startTime !== null && typeof body.startTime === 'string' && !/^\d{2}:\d{2}$/.test(body.startTime)) {
      return err('startTime must be HH:MM', 'VALIDATION_ERROR', 400)
    }
    patch.start_time = body.startTime ?? null
  }
  if (body.endTime !== undefined) {
    if (body.endTime !== null && typeof body.endTime === 'string' && !/^\d{2}:\d{2}$/.test(body.endTime)) {
      return err('endTime must be HH:MM', 'VALIDATION_ERROR', 400)
    }
    patch.end_time = body.endTime ?? null
  }

  // One-time fields
  if (body.startsAt !== undefined) patch.starts_at = body.startsAt ?? null
  if (body.endsAt   !== undefined) patch.ends_at   = body.endsAt   ?? null

  // Validate staff belongs to tenant if changing staff_id
  if (body.staffId) {
    const { data: prof } = await supabase
      .from('professionals')
      .select('id')
      .eq('id', body.staffId)
      .eq('tenant_id', tenant_id)
      .maybeSingle()
    if (!prof) return err('Professional not found in this tenant', 'NOT_FOUND', 404)
  }

  const { data, error } = await supabase
    .from('appointment_availability_blocks')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', tenant_id)
    .select(SELECT_COLS)
    .single()

  if (error) {
    console.error('[PATCH /api/appointments/availability-blocks/[id]]', error.message)
    return err(error.message, 'DB_ERROR', 500)
  }

  return ok({ block: data })
}

// ─── DELETE /api/appointments/availability-blocks/[id] ───────────────────────
// Soft delete: set is_active = false
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const staffUser = await resolveStoreUser(req)
  if (requireAdmin(staffUser)) return err('Unauthorized', 'UNAUTHORIZED', 401)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase  = getSupabaseServerClient() as any
  const tenant_id = staffUser!.tenant_id

  const { error } = await supabase
    .from('appointment_availability_blocks')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenant_id)

  if (error) {
    console.error('[DELETE /api/appointments/availability-blocks/[id]]', error.message)
    return err(error.message, 'DB_ERROR', 500)
  }

  return ok({ deleted: true })
}
