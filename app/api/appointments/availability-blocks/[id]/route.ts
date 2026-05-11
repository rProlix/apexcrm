// app/api/appointments/availability-blocks/[id]/route.ts
// PATCH  — update a block
// DELETE — soft-delete (is_active = false)
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { updateAvailabilityBlock, deleteAvailabilityBlock } from '@/lib/appointments/availabilityBlocks'
import type { AppointmentBlockType } from '@/lib/appointments/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

function ok(data: unknown) {
  return NextResponse.json({ ok: true, data })
}
function err(message: string, code: string, status: number) {
  return NextResponse.json({ ok: false, error: message, code }, { status })
}

function requireAdmin(u: Awaited<ReturnType<typeof resolveStoreUser>>) {
  return !u || (u.role !== 'admin' && u.role !== 'owner')
}

// ─── PATCH /api/appointments/availability-blocks/[id] ────────────────────────
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const user = await resolveStoreUser(req)
  if (requireAdmin(user)) return err('Unauthorized', 'UNAUTHORIZED', 401)

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return err('Invalid JSON body', 'INVALID_JSON', 400)
  }

  const result = await updateAvailabilityBlock(id, {
    tenant_id:             user!.tenant_id,
    staff_id:              body.staffId    !== undefined ? ((body.staffId as string) || null) : undefined,
    title:                 body.title      !== undefined ? ((body.title   as string) || null) : undefined,
    description:           body.description !== undefined ? ((body.description as string) || null) : undefined,
    block_type:            body.blockType   !== undefined ? (body.blockType as AppointmentBlockType) : undefined,
    is_recurring:          body.isRecurring !== undefined ? Boolean(body.isRecurring) : undefined,
    day_of_week:           body.dayOfWeek   !== undefined ? (body.dayOfWeek !== null ? Number(body.dayOfWeek) : null) : undefined,
    start_time:            body.startTime   !== undefined ? ((body.startTime as string) || null) : undefined,
    end_time:              body.endTime     !== undefined ? ((body.endTime   as string) || null) : undefined,
    starts_at:             body.startsAt    !== undefined ? ((body.startsAt  as string) || null) : undefined,
    ends_at:               body.endsAt      !== undefined ? ((body.endsAt    as string) || null) : undefined,
    timezone:              body.timezone             !== undefined ? (body.timezone as string)        : undefined,
    slot_duration_minutes: body.slotDurationMinutes  !== undefined ? Number(body.slotDurationMinutes)  : undefined,
    buffer_before_minutes: body.bufferBeforeMinutes  !== undefined ? Number(body.bufferBeforeMinutes)  : undefined,
    buffer_after_minutes:  body.bufferAfterMinutes   !== undefined ? Number(body.bufferAfterMinutes)   : undefined,
    max_bookings_per_slot: body.maxBookingsPerSlot   !== undefined ? Number(body.maxBookingsPerSlot)   : undefined,
    is_active:             body.isActive             !== undefined ? Boolean(body.isActive)            : undefined,
    recurrence_rule:       body.recurrenceRule       !== undefined ? ((body.recurrenceRule as string) || null) : undefined,
  })

  if (!result.ok) {
    const status = result.code === 'NOT_FOUND' ? 404 : result.code === 'VALIDATION_ERROR' ? 400 : 500
    return err(result.error, result.code, status)
  }

  return ok({ block: result.block })
}

// ─── DELETE /api/appointments/availability-blocks/[id] ───────────────────────
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const user = await resolveStoreUser(req)
  if (requireAdmin(user)) return err('Unauthorized', 'UNAUTHORIZED', 401)

  const result = await deleteAvailabilityBlock(id, user!.tenant_id)

  if (!result.ok) {
    return err(result.error ?? 'Failed to delete block', 'DB_ERROR', 500)
  }

  return ok({ deleted: true, id })
}
