// lib/appointments/getAvailableSlots.ts
import { generateTimeSlots } from './generateTimeSlots'
import type { TimeSlot } from './types'

interface GetSlotsOptions {
  tenant_id:         string
  date:              string   // YYYY-MM-DD
  /** Kept for backward compatibility — ignored when rules define slot_interval_minutes. */
  duration_minutes?: number
  /** When true, only return slots marked available. Default: false (return all). */
  available_only?: boolean
}

/**
 * Public interface for retrieving time slots.
 * Delegates to generateTimeSlots for the core logic.
 *
 * Kept as a thin wrapper so existing call-sites don't break.
 */
export async function getAvailableSlots({
  tenant_id,
  date,
  available_only = false,
}: GetSlotsOptions): Promise<TimeSlot[]> {
  const slots = await generateTimeSlots({ tenant_id, date })

  return available_only
    ? slots.filter((s) => s.available)
    : slots
}
