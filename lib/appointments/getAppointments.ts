// lib/appointments/getAppointments.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { Appointment } from './types'

const APPOINTMENT_SELECT = `
  id, tenant_id, customer_id, staff_id, appointment_block_id,
  title, description, status,
  starts_at, ends_at, location, notes, timezone, created_by,
  created_at, updated_at,
  customer:customers ( id, name, email ),
  professional:professionals ( id, name, avatar_url )
`

interface GetAppointmentsOptions {
  tenant_id:    string
  customer_id?: string
  staff_id?:    string
  status?:      string
  from?:        string
  to?:          string
  limit?:       number
  offset?:      number
}

/**
 * Fetches appointments for a tenant, joining customer name + email + professional.
 * Suitable for admin views (all) and customer views (pass customer_id).
 */
export async function getAppointments({
  tenant_id,
  customer_id,
  staff_id,
  status,
  from,
  to,
  limit  = 200,
  offset = 0,
}: GetAppointmentsOptions): Promise<Appointment[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  let query = supabase
    .from('appointments')
    .select(APPOINTMENT_SELECT)
    .eq('tenant_id', tenant_id)
    .order('starts_at', { ascending: true })
    .range(offset, offset + limit - 1)

  if (customer_id) query = query.eq('customer_id', customer_id)
  if (staff_id)    query = query.eq('staff_id', staff_id)
  if (status)      query = query.eq('status', status)
  if (from)        query = query.gte('starts_at', from)
  if (to)          query = query.lte('starts_at', to)

  const { data, error } = await query

  if (error) {
    console.error('[getAppointments]', error.message)
    return []
  }

  return (data ?? []) as unknown as Appointment[]
}
