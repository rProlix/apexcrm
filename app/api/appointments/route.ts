// app/api/appointments/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser, resolveStoreCustomer } from '@/lib/auth/resolveStoreUser'
import { getAppointments }       from '@/lib/appointments/getAppointments'
import { createAppointment }     from '@/lib/appointments/createAppointment'
import { isTimeSlotAvailable }   from '@/lib/appointments/isTimeSlotAvailable'

// ─── GET /api/appointments ────────────────────────────────────────────────────
// admin/owner → all tenant appointments (filterable)
// customer    → only their own appointments
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams

  const staffUser = await resolveStoreUser(req)

  if (staffUser && (staffUser.role === 'admin' || staffUser.role === 'owner')) {
    const tenant_id = staffUser.role === 'owner'
      ? (params.get('tenant_id') ?? staffUser.tenant_id)
      : staffUser.tenant_id

    const appointments = await getAppointments({
      tenant_id,
      customer_id: params.get('customer_id') ?? undefined,
      status:      params.get('status')      ?? undefined,
      from:        params.get('from')        ?? undefined,
      to:          params.get('to')          ?? undefined,
      limit:       params.get('limit')  ? parseInt(params.get('limit')!)  : 200,
      offset:      params.get('offset') ? parseInt(params.get('offset')!) : 0,
    })

    return NextResponse.json({ appointments })
  }

  const customerUser = await resolveStoreCustomer(req)

  if (customerUser) {
    const appointments = await getAppointments({
      tenant_id:   customerUser.tenant_id,
      customer_id: customerUser.customer_id,
      status:      params.get('status') ?? undefined,
      from:        params.get('from')   ?? undefined,
      to:          params.get('to')     ?? undefined,
    })
    return NextResponse.json({ appointments })
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

// ─── POST /api/appointments ───────────────────────────────────────────────────
// admin/owner → can create for any tenant customer; rule check is SKIPPED
//               (admins may manually book outside configured hours)
// customer    → can create for themselves; FULL availability check enforced
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // ── Admin/owner path ───────────────────────────────────────────────────────
  const staffUser = await resolveStoreUser(req)

  if (staffUser && (staffUser.role === 'admin' || staffUser.role === 'owner')) {
    const { customer_id, title, starts_at, ends_at, description, location, notes, timezone } = body

    if (typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 })
    }
    if (typeof starts_at !== 'string' || typeof ends_at !== 'string') {
      return NextResponse.json({ error: 'starts_at and ends_at are required' }, { status: 400 })
    }

    // Admins bypass availability-window check but still get conflict-checked
    // inside createAppointment (which calls checkConflicts).
    const result = await createAppointment({
      tenant_id:   staffUser.tenant_id,
      customer_id: typeof customer_id === 'string' && customer_id ? customer_id : null,
      title,
      description: typeof description === 'string' ? description : null,
      starts_at,
      ends_at,
      location:    typeof location === 'string' ? location : null,
      notes:       typeof notes    === 'string' ? notes    : null,
      timezone:    typeof timezone === 'string' ? timezone : 'UTC',
      created_by:  staffUser.id,
    })

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 422 })
    }
    return NextResponse.json({ appointment: result.appointment }, { status: 201 })
  }

  // ── Customer path ──────────────────────────────────────────────────────────
  const customerUser = await resolveStoreCustomer(req)

  if (customerUser) {
    const { title, starts_at, ends_at, description, location, notes, timezone } = body

    if (typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 })
    }
    if (typeof starts_at !== 'string' || typeof ends_at !== 'string') {
      return NextResponse.json({ error: 'starts_at and ends_at are required' }, { status: 400 })
    }

    // ── CRITICAL: full availability + conflict check before insert ─────────
    const avail = await isTimeSlotAvailable({
      tenant_id: customerUser.tenant_id,
      starts_at,
      ends_at,
      skip_rule_check: false,  // customers must book within defined windows
    })

    if (!avail.available) {
      return NextResponse.json(
        { error: avail.reason ?? 'Time slot is not available' },
        { status: 409 }  // 409 Conflict
      )
    }

    // createAppointment also calls checkConflicts internally — this is the
    // second defense layer against race conditions.
    const result = await createAppointment({
      tenant_id:   customerUser.tenant_id,
      customer_id: customerUser.customer_id,
      title,
      description: typeof description === 'string' ? description : null,
      starts_at,
      ends_at,
      location:    typeof location === 'string' ? location : null,
      notes:       typeof notes    === 'string' ? notes    : null,
      timezone:    typeof timezone === 'string' ? timezone : 'UTC',
    })

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 422 })
    }
    return NextResponse.json({ appointment: result.appointment }, { status: 201 })
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
