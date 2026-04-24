// app/api/appointments/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser, resolveStoreCustomer } from '@/lib/auth/resolveStoreUser'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { updateAppointment } from '@/lib/appointments/updateAppointment'
import { deleteAppointment } from '@/lib/appointments/deleteAppointment'
import type { Appointment } from '@/lib/appointments/types'

type Ctx = { params: Promise<{ id: string }> }

// ─── GET /api/appointments/[id] ───────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const supabase = getSupabaseServerClient()

  const staffUser = await resolveStoreUser(req)

  if (staffUser && (staffUser.role === 'admin' || staffUser.role === 'owner')) {
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        id, tenant_id, customer_id, title, description, status,
        starts_at, ends_at, location, notes, timezone, created_by,
        created_at, updated_at,
        customer:customers ( id, name, email )
      `)
      .eq('id', id)
      .eq('tenant_id', staffUser.tenant_id)
      .maybeSingle()

    if (error || !data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ appointment: data })
  }

  const customerUser = await resolveStoreCustomer(req)
  if (customerUser) {
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        id, tenant_id, customer_id, title, description, status,
        starts_at, ends_at, location, notes, timezone,
        created_at, updated_at
      `)
      .eq('id', id)
      .eq('tenant_id', customerUser.tenant_id)
      .eq('customer_id', customerUser.customer_id)
      .maybeSingle()

    if (error || !data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ appointment: data })
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

// ─── PATCH /api/appointments/[id] ─────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const staffUser = await resolveStoreUser(req)

  if (staffUser && (staffUser.role === 'admin' || staffUser.role === 'owner')) {
    const result = await updateAppointment(id, staffUser.tenant_id, {
      title:       typeof body.title       === 'string' ? body.title       : undefined,
      description: typeof body.description === 'string' ? body.description : undefined,
      status:      typeof body.status      === 'string' ? body.status as Appointment['status'] : undefined,
      starts_at:   typeof body.starts_at   === 'string' ? body.starts_at   : undefined,
      ends_at:     typeof body.ends_at     === 'string' ? body.ends_at     : undefined,
      location:    typeof body.location    === 'string' ? body.location    : undefined,
      notes:       typeof body.notes       === 'string' ? body.notes       : undefined,
      timezone:    typeof body.timezone    === 'string' ? body.timezone    : undefined,
    })
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 422 })
    }
    return NextResponse.json({ appointment: result.appointment })
  }

  const customerUser = await resolveStoreCustomer(req)
  if (customerUser) {
    // Customers may only reschedule or cancel — not change status to completed
    const allowedStatuses = ['canceled']
    const status = typeof body.status === 'string' ? body.status : undefined

    if (status && !allowedStatuses.includes(status)) {
      return NextResponse.json({ error: 'Customers can only cancel appointments' }, { status: 403 })
    }

    // Verify ownership
    const supabase = getSupabaseServerClient()
    const { data: existing } = await supabase
      .from('appointments')
      .select('customer_id')
      .eq('id', id)
      .eq('tenant_id', customerUser.tenant_id)
      .maybeSingle()

    if (!existing || existing.customer_id !== customerUser.customer_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = await updateAppointment(id, customerUser.tenant_id, {
      starts_at:   typeof body.starts_at   === 'string' ? body.starts_at   : undefined,
      ends_at:     typeof body.ends_at     === 'string' ? body.ends_at     : undefined,
      notes:       typeof body.notes       === 'string' ? body.notes       : undefined,
      status:      status as Appointment['status'] | undefined,
    })
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 422 })
    }
    return NextResponse.json({ appointment: result.appointment })
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

// ─── DELETE /api/appointments/[id] ────────────────────────────────────────────
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id } = await params

  const staffUser = await resolveStoreUser(req)

  if (staffUser && (staffUser.role === 'admin' || staffUser.role === 'owner')) {
    const result = await deleteAppointment(id, staffUser.tenant_id)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 422 })
    }
    return NextResponse.json({ success: true })
  }

  const customerUser = await resolveStoreCustomer(req)
  if (customerUser) {
    const supabase = getSupabaseServerClient()
    const { data: existing } = await supabase
      .from('appointments')
      .select('customer_id')
      .eq('id', id)
      .eq('tenant_id', customerUser.tenant_id)
      .maybeSingle()

    if (!existing || existing.customer_id !== customerUser.customer_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = await deleteAppointment(id, customerUser.tenant_id)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 422 })
    }
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
