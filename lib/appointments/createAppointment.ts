// lib/appointments/createAppointment.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { checkConflicts } from './checkConflicts'
import type { Appointment, CreateAppointmentInput } from './types'

export interface CreateResult {
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
 * Creates a new appointment after validating:
 * - start_time < end_time
 * - no conflicts with existing appointments or blocked times
 * - staff (if provided) has no conflicting appointment
 */
export async function createAppointment(
  input: CreateAppointmentInput
): Promise<CreateResult> {
  const { tenant_id, customer_id, title, starts_at, ends_at, staff_id } = input

  if (!title?.trim()) {
    return { error: 'Title is required' }
  }

  const start = new Date(starts_at)
  const end   = new Date(ends_at)

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { error: 'Invalid start or end time' }
  }
  if (start >= end) {
    return { error: 'Start time must be before end time' }
  }
  if (start < new Date(Date.now() - 60_000)) {
    return { error: 'Cannot book appointments in the past' }
  }

  const conflict = await checkConflicts({ tenant_id, starts_at, ends_at, staff_id: staff_id ?? undefined })
  if (conflict) {
    return { error: 'This time slot is already booked or unavailable' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  const { data, error } = await supabase
    .from('appointments')
    .insert({
      tenant_id,
      customer_id,
      staff_id:             staff_id             ?? null,
      appointment_block_id: input.appointment_block_id ?? null,
      title:       title.trim(),
      description: input.description ?? null,
      starts_at,
      ends_at,
      location:    input.location    ?? null,
      notes:       input.notes       ?? null,
      timezone:    input.timezone    ?? 'UTC',
      created_by:  input.created_by  ?? null,
      status:      'pending',
    })
    .select(APPOINTMENT_SELECT)
    .single()

  if (error) {
    console.error('[createAppointment]', error.message)
    return { error: error.message }
  }

  return { appointment: data as unknown as Appointment }
}
