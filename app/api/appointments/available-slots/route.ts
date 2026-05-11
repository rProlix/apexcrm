// app/api/appointments/available-slots/route.ts
// GET — returns available booking slots for a specific date.
//
// Query params:
//   date           required  YYYY-MM-DD
//   staffId        optional  filter to a specific professional
//   durationMinutes optional  override the block's slot_duration_minutes
//   tenantId       optional  only needed if not inferable from host/cookie
//
// Response: { ok: true, slots: AvailableSlot[], date: string }
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser, resolveStoreCustomer } from '@/lib/auth/resolveStoreUser'
import { getAvailableSlots } from '@/lib/appointments/availabilityBlocks'

export const dynamic = 'force-dynamic'

function ok(data: Record<string, unknown>) {
  return NextResponse.json({ ok: true, ...data })
}
function err(message: string, code: string, status: number) {
  return NextResponse.json({ ok: false, error: message, code }, { status })
}

export async function GET(req: NextRequest) {
  const params          = req.nextUrl.searchParams
  const date            = params.get('date')
  const staffId         = params.get('staffId')   || null
  const durationParam   = params.get('durationMinutes')

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return err('date (YYYY-MM-DD) is required', 'VALIDATION_ERROR', 400)
  }

  // Resolve tenant from either dashboard user or customer session
  let tenant_id: string | null = null

  const storeUser = await resolveStoreUser(req)
  if (storeUser?.tenant_id) {
    tenant_id = storeUser.tenant_id
  } else {
    const customer = await resolveStoreCustomer(req)
    if (customer?.tenant_id) tenant_id = customer.tenant_id
  }

  // Allow explicit tenantId override for public storefronts
  if (!tenant_id) {
    tenant_id = params.get('tenantId')
  }

  if (!tenant_id) {
    return err('Unable to resolve tenant', 'UNAUTHORIZED', 401)
  }

  const duration = durationParam ? Number(durationParam) : undefined

  const slots = await getAvailableSlots({
    tenant_id,
    date,
    staff_id:         staffId,
    duration_minutes: duration,
  })

  return ok({
    slots,
    date,
    staff_id: staffId,
    count:    slots.length,
  })
}
