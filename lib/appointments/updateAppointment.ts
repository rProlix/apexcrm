// lib/appointments/updateAppointment.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { checkConflicts } from './checkConflicts'
import type { Appointment, UpdateAppointmentInput } from './types'

export interface UpdateResult {
  appointment?: Appointment
  error?:       string
}

const APPOINTMENT_SELECT = `
  id, tenant_id, customer_id, staff_id, appointment_block_id,
  title, description, status,
  starts_at, ends_at, location, notes, timezone, created_by,
  created_at, updated_at,
  customer:customers ( id, name, email ),
  professional:professionals ( id, name, avatar_url )
`

/**
 * Updates an appointment by id within a tenant.
 * If starts_at/ends_at/staff_id are changed, re-validates conflicts.
 */
export async function updateAppointment(
  id:        string,
  tenant_id: string,
  input:     UpdateAppointmentInput
): Promise<UpdateResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  // Fetch current record to merge times
  const { data: current, error: fetchErr } = await supabase
    .from('appointments')
    .select('starts_at, ends_at, status, staff_id')
    .eq('id', id)
    .eq('tenant_id', tenant_id)
    .maybeSingle()

  if (fetchErr || !current) {
    return { error: 'Appointment not found' }
  }

  if (current.status === 'canceled') {
    return { error: 'Cannot modify a canceled appointment' }
  }

  const starts_at = input.starts_at ?? current.starts_at
  const ends_at   = input.ends_at   ?? current.ends_at
  const staff_id  = input.staff_id !== undefined ? input.staff_id : current.staff_id

  if (input.starts_at || input.ends_at || input.staff_id !== undefined) {
    const start = new Date(starts_at)
    const end   = new Date(ends_at)

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return { error: 'Invalid start or end time' }
    }
    if (start >= end) {
      return { error: 'Start time must be before end time' }
    }

    const conflict = await checkConflicts({
      tenant_id,
      starts_at,
      ends_at,
      exclude_id: id,
      staff_id:   staff_id ?? undefined,
    })
    if (conflict) {
      return { error: 'This time slot is already booked or unavailable' }
    }
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (input.title       !== undefined) patch.title       = input.title?.trim()
  if (input.description !== undefined) patch.description = input.description
  if (input.status      !== undefined) patch.status      = input.status
  if (input.starts_at   !== undefined) patch.starts_at   = input.starts_at
  if (input.ends_at     !== undefined) patch.ends_at     = input.ends_at
  if (input.location    !== undefined) patch.location    = input.location
  if (input.notes       !== undefined) patch.notes       = input.notes
  if (input.timezone    !== undefined) patch.timezone    = input.timezone
  if (input.staff_id    !== undefined) patch.staff_id    = input.staff_id
  if (input.appointment_block_id !== undefined) patch.appointment_block_id = input.appointment_block_id

  const { data, error } = await supabase
    .from('appointments')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', tenant_id)
    .select(APPOINTMENT_SELECT)
    .single()

  if (error) {
    console.error('[updateAppointment]', error.message)
    return { error: error.message }
  }

  return { appointment: data as unknown as Appointment }
}
