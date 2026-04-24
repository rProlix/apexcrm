// lib/appointments/getAppointments.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { Appointment } from './types'

interface GetAppointmentsOptions {
  tenant_id:    string
  customer_id?: string   // filter to a specific customer
  status?:      string   // filter by status
  from?:        string   // ISO date lower bound (starts_at >=)
  to?:          string   // ISO date upper bound (starts_at <=)
  limit?:       number
  offset?:      number
}

/**
 * Fetches appointments for a tenant, joining customer name + email.
 * Suitable for admin views (all) and customer views (pass customer_id).
 */
export async function getAppointments({
  tenant_id,
  customer_id,
  status,
  from,
  to,
  limit  = 200,
  offset = 0,
}: GetAppointmentsOptions): Promise<Appointment[]> {
  const supabase = getSupabaseServerClient()

  let query = supabase
    .from('appointments')
    .select(`
      id, tenant_id, customer_id, title, description, status,
      starts_at, ends_at, location, notes, timezone, created_by,
      created_at, updated_at,
      customer:customers ( id, name, email )
    `)
    .eq('tenant_id', tenant_id)
    .order('starts_at', { ascending: true })
    .range(offset, offset + limit - 1)

  if (customer_id) query = query.eq('customer_id', customer_id)
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
