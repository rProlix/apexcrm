// app/api/appointments/reschedule/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser, resolveStoreCustomer } from '@/lib/auth/resolveStoreUser'
import { updateAppointment } from '@/lib/appointments/updateAppointment'
import { getSupabaseServerClient } from '@/lib/supabase/server'

// ─── POST /api/appointments/reschedule ────────────────────────────────────────
// Safely reschedules an existing appointment.
// Body: { id, starts_at, ends_at }
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { id, starts_at, ends_at } = body

  if (typeof id !== 'string' || !id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }
  if (typeof starts_at !== 'string' || typeof ends_at !== 'string') {
    return NextResponse.json({ error: 'starts_at and ends_at are required' }, { status: 400 })
  }

  const staffUser = await resolveStoreUser(req)

  if (staffUser && (staffUser.role === 'admin' || staffUser.role === 'owner')) {
    const result = await updateAppointment(id, staffUser.tenant_id, { starts_at, ends_at })
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 422 })
    }
    return NextResponse.json({ appointment: result.appointment })
  }

  const customerUser = await resolveStoreCustomer(req)
  if (customerUser) {
    // Verify ownership before rescheduling
    const supabase = getSupabaseServerClient()
    const { data: existing } = await supabase
      .from('appointments')
      .select('customer_id, status')
      .eq('id', id)
      .eq('tenant_id', customerUser.tenant_id)
      .maybeSingle()

    if (!existing || existing.customer_id !== customerUser.customer_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (existing.status === 'completed') {
      return NextResponse.json({ error: 'Cannot reschedule a completed appointment' }, { status: 422 })
    }

    const result = await updateAppointment(id, customerUser.tenant_id, { starts_at, ends_at })
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 422 })
    }
    return NextResponse.json({ appointment: result.appointment })
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
