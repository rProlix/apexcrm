// app/api/appointments/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser, resolveStoreCustomer } from '@/lib/auth/resolveStoreUser'
import { getAppointments }       from '@/lib/appointments/getAppointments'
import { createAppointment }     from '@/lib/appointments/createAppointment'
import { isTimeSlotAvailable }   from '@/lib/appointments/isTimeSlotAvailable'
import { sendEmail }                         from '@/lib/email/sendEmail'
import { buildAppointmentConfirmationEmail } from '@/lib/email/templates/appointmentConfirmation'

// Sends a confirmation email after a successful appointment creation (fire-and-forget)
async function sendAppointmentConfirmation(opts: {
  tenantId:        string
  tenantName:      string
  customerEmail?:  string
  customerName?:   string
  starts_at:       string
  ends_at:         string
  title:           string
  location?:       string | null
}) {
  if (!opts.customerEmail) return
  const start = new Date(opts.starts_at)
  const end   = new Date(opts.ends_at)

  const tpl = buildAppointmentConfirmationEmail({
    businessName:    opts.tenantName,
    customerName:    opts.customerName,
    appointmentDate: start.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    appointmentTime: `${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} – ${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
    serviceName:     opts.title,
    location:        opts.location ?? undefined,
  })

  await sendEmail({
    to:       opts.customerEmail,
    subject:  tpl.subject,
    html:     tpl.html,
    text:     tpl.text,
    category: 'appointment',
    tenantId: opts.tenantId,
    fromName: opts.tenantName,   // white-label: business name as From display name
    metadata: { appointmentStart: opts.starts_at },
  }).catch(e => console.error('[appointments] confirmation email failed:', e))
}

// ─── GET /api/appointments ────────────────────────────────────────────────────
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
      staff_id:    params.get('staff_id')    ?? undefined,
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
    const {
      customer_id, staff_id, appointment_block_id,
      title, starts_at, ends_at,
      description, location, notes, timezone,
    } = body

    if (typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 })
    }
    if (typeof starts_at !== 'string' || typeof ends_at !== 'string') {
      return NextResponse.json({ error: 'starts_at and ends_at are required' }, { status: 400 })
    }

    const result = await createAppointment({
      tenant_id:            staffUser.tenant_id,
      customer_id:          typeof customer_id === 'string' && customer_id ? customer_id : null,
      staff_id:             typeof staff_id    === 'string' && staff_id    ? staff_id    : null,
      appointment_block_id: typeof appointment_block_id === 'string' && appointment_block_id ? appointment_block_id : null,
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

    // Fire-and-forget confirmation email to customer when customer_id is set
    if (result.appointment?.customer_id) {
      const supabase = (await import('@/lib/supabase/server')).getSupabaseServerClient()
      const { data: customer } = await supabase
        .from('customers')
        .select('email, name')
        .eq('id', result.appointment.customer_id)
        .maybeSingle()
      const { data: tenant } = await supabase
        .from('tenants')
        .select('name')
        .eq('id', staffUser.tenant_id)
        .maybeSingle()
      if (customer?.email) {
        void sendAppointmentConfirmation({
          tenantId:       staffUser.tenant_id,
          tenantName:     tenant?.name ?? 'Your appointment',
          customerEmail:  customer.email,
          customerName:   customer.name ?? undefined,
          starts_at:      String(starts_at),
          ends_at:        String(ends_at),
          title:          String(title),
          location:       typeof location === 'string' ? location : null,
        })
      }
    }

    return NextResponse.json({ appointment: result.appointment }, { status: 201 })
  }

  // ── Customer path ──────────────────────────────────────────────────────────
  const customerUser = await resolveStoreCustomer(req)

  if (customerUser) {
    const {
      title, starts_at, ends_at,
      description, location, notes, timezone,
      staff_id, appointment_block_id,
    } = body

    if (typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 })
    }
    if (typeof starts_at !== 'string' || typeof ends_at !== 'string') {
      return NextResponse.json({ error: 'starts_at and ends_at are required' }, { status: 400 })
    }

    // CRITICAL: full availability + conflict check before insert
    const avail = await isTimeSlotAvailable({
      tenant_id: customerUser.tenant_id,
      starts_at,
      ends_at,
      skip_rule_check: false,
    })

    if (!avail.available) {
      return NextResponse.json(
        { error: avail.reason ?? 'Time slot is not available' },
        { status: 409 }
      )
    }

    const result = await createAppointment({
      tenant_id:            customerUser.tenant_id,
      customer_id:          customerUser.customer_id,
      staff_id:             typeof staff_id === 'string' && staff_id ? staff_id : null,
      appointment_block_id: typeof appointment_block_id === 'string' && appointment_block_id ? appointment_block_id : null,
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
