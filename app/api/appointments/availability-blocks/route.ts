// app/api/appointments/availability-blocks/route.ts
// GET  — list availability blocks for the tenant
// POST — create a new availability block
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser, resolveStoreCustomer } from '@/lib/auth/resolveStoreUser'
import { listAvailabilityBlocks, createAvailabilityBlock } from '@/lib/appointments/availabilityBlocks'
import type { AppointmentBlockType } from '@/lib/appointments/types'

export const dynamic = 'force-dynamic'

function ok(data: unknown, status = 200) {
  return NextResponse.json({ ok: true, data }, { status })
}
function err(message: string, code: string, status: number, details?: unknown) {
  return NextResponse.json({ ok: false, error: message, code, details }, { status })
}

// ─── GET /api/appointments/availability-blocks ────────────────────────────────
export async function GET(req: NextRequest) {
  const params   = req.nextUrl.searchParams
  const staffId  = params.get('staffId')
  const active   = params.get('active')
  const typeFilter = params.get('blockType') as AppointmentBlockType | null

  let tenant_id: string | null = null
  let isAdmin = false

  const staffUser = await resolveStoreUser(req)
  if (staffUser?.tenant_id) {
    tenant_id = staffUser.tenant_id
    isAdmin   = staffUser.role === 'admin' || staffUser.role === 'owner'
  }

  if (!tenant_id) {
    const customer = await resolveStoreCustomer(req)
    if (customer?.tenant_id) tenant_id = customer.tenant_id
  }

  if (!tenant_id) return err('Unauthorized', 'UNAUTHORIZED', 401)

  const activeOnly = !isAdmin || active !== 'false'

  const blocks = await listAvailabilityBlocks({
    tenant_id,
    staff_id:    staffId ?? undefined,
    block_type:  typeFilter,
    active_only: activeOnly,
  })

  return ok({ blocks })
}

// ─── POST /api/appointments/availability-blocks ───────────────────────────────
export async function POST(req: NextRequest) {
  const staffUser = await resolveStoreUser(req)
  if (!staffUser || (staffUser.role !== 'admin' && staffUser.role !== 'owner')) {
    return err('Unauthorized — requires admin or owner role', 'UNAUTHORIZED', 401)
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return err('Invalid JSON body', 'INVALID_JSON', 400)
  }

  const {
    staffId, title, description, blockType,
    isRecurring, dayOfWeek, startTime, endTime,
    startsAt, endsAt,
    timezone, slotDurationMinutes,
    bufferBeforeMinutes, bufferAfterMinutes,
    maxBookingsPerSlot, isActive,
    recurrenceRule,
  } = body

  const result = await createAvailabilityBlock({
    tenant_id:             staffUser.tenant_id,
    staff_id:              (staffId as string) || null,
    title:                 (title as string)   || null,
    description:           (description as string) || null,
    block_type:            (blockType as AppointmentBlockType) || 'available',
    is_recurring:          isRecurring !== false,
    day_of_week:           dayOfWeek !== undefined ? Number(dayOfWeek) : null,
    start_time:            (startTime as string) || null,
    end_time:              (endTime   as string) || null,
    starts_at:             (startsAt  as string) || null,
    ends_at:               (endsAt    as string) || null,
    timezone:              (timezone  as string) || 'America/Los_Angeles',
    slot_duration_minutes: slotDurationMinutes !== undefined ? Number(slotDurationMinutes) : 30,
    buffer_before_minutes: bufferBeforeMinutes !== undefined ? Number(bufferBeforeMinutes) : 0,
    buffer_after_minutes:  bufferAfterMinutes  !== undefined ? Number(bufferAfterMinutes)  : 0,
    max_bookings_per_slot: maxBookingsPerSlot  !== undefined ? Number(maxBookingsPerSlot)  : 1,
    is_active:             isActive !== false,
    recurrence_rule:       (recurrenceRule as string) || null,
    created_by:            staffUser.auth_id || null,
  })

  if (!result.ok) {
    const status = result.code === 'VALIDATION_ERROR' ? 400
                 : result.code === 'NOT_FOUND'        ? 404
                 : 500
    return err(result.error, result.code, status)
  }

  return ok({ block: result.block }, 201)
}
