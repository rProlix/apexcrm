// lib/appointments/getCustomerAppointments.ts
import { getAppointments } from './getAppointments'
import type { Appointment } from './types'

/**
 * Fetches appointments belonging to a specific customer within a tenant.
 * Enforces both tenant_id and customer_id scoping.
 */
export async function getCustomerAppointments(
  tenant_id:   string,
  customer_id: string,
  options?: {
    upcoming?: boolean
    past?:     boolean
    limit?:    number
  }
): Promise<Appointment[]> {
  const now = new Date().toISOString()

  return getAppointments({
    tenant_id,
    customer_id,
    from:  options?.upcoming ? now   : undefined,
    to:    options?.past     ? now   : undefined,
    limit: options?.limit ?? 100,
  })
}
