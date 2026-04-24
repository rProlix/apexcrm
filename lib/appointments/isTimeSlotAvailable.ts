// lib/appointments/isTimeSlotAvailable.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { AvailabilityRule, SlotAvailabilityResult } from './types'

interface CheckOptions {
  tenant_id:   string
  starts_at:   string   // ISO 8601
  ends_at:     string   // ISO 8601
  exclude_id?: string   // skip this appointment id (for rescheduling)
  /** When true, skip the availability-rule window check (admin override). */
  skip_rule_check?: boolean
}

/**
 * Authoritative availability check used in booking creation/update.
 *
 * Validates in order:
 *  1. Time range sanity (start < end, not in the past)
 *  2. Slot falls within at least one active availability rule (skippable for admins)
 *  3. No overlapping non-canceled appointment exists
 *  4. No overlapping blocked_time exists
 *
 * Returns { available: true } or { available: false, reason: string }.
 * Never throws — all errors surface through the return value.
 */
export async function isTimeSlotAvailable({
  tenant_id,
  starts_at,
  ends_at,
  exclude_id,
  skip_rule_check = false,
}: CheckOptions): Promise<SlotAvailabilityResult> {
  const startMs = new Date(starts_at).getTime()
  const endMs   = new Date(ends_at).getTime()

  // ── 1. Sanity checks ───────────────────────────────────────────────────────
  if (isNaN(startMs) || isNaN(endMs)) {
    return { available: false, reason: 'Invalid timestamp' }
  }
  if (startMs >= endMs) {
    return { available: false, reason: 'Start time must be before end time' }
  }
  // Allow 1-minute grace to handle slight clock differences
  if (startMs < Date.now() - 60_000) {
    return { available: false, reason: 'Cannot book a time slot in the past' }
  }

  const supabase  = getSupabaseServerClient()
  const date      = starts_at.slice(0, 10)
  const dayOfWeek = new Date(`${date}T12:00:00Z`).getUTCDay()

  // ── 2. Availability rule check ─────────────────────────────────────────────
  if (!skip_rule_check) {
    const { data: rulesData, error: ruleErr } = await supabase
      .from('availability_rules')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('is_active', true)

    if (ruleErr) {
      console.error('[isTimeSlotAvailable] rule error:', ruleErr.message)
      // Fail safe: allow booking if rules can't be loaded
    } else {
      const rules = (rulesData ?? []) as unknown as AvailabilityRule[]

      // Find rules that apply to this date
      const applicable = rules.filter((r) => {
        const type = r.repeat_type ?? 'weekly'
        if (type === 'daily')  return true
        if (type === 'weekly') return r.day_of_week === dayOfWeek
        if (type === 'custom') {
          const days = Array.isArray(r.repeat_days) ? r.repeat_days : []
          return days.includes(dayOfWeek)
        }
        return r.day_of_week === dayOfWeek
      })

      if (applicable.length === 0) {
        return { available: false, reason: 'No availability configured for this day' }
      }

      // Slot must be fully contained within at least one rule window
      const withinAWindow = applicable.some((r) => {
        const base = new Date(`${date}T00:00:00.000Z`)

        const [rsh, rsm] = parseTime(r.start_time)
        const [reh, rem] = parseTime(r.end_time)

        const windowStart = new Date(base)
        windowStart.setUTCHours(rsh, rsm, 0, 0)

        const windowEnd = new Date(base)
        windowEnd.setUTCHours(reh, rem, 0, 0)

        return startMs >= windowStart.getTime() && endMs <= windowEnd.getTime()
      })

      if (!withinAWindow) {
        return { available: false, reason: 'Requested time is outside availability hours' }
      }
    }
  }

  // ── 3. Appointment conflict check ─────────────────────────────────────────
  // Using inclusive-exclusive overlap: existing.start < new.end AND existing.end > new.start
  let apptQuery = supabase
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant_id)
    .neq('status', 'canceled')
    .lt('starts_at', ends_at)
    .gt('ends_at', starts_at)

  if (exclude_id) {
    apptQuery = apptQuery.neq('id', exclude_id)
  }

  const { count: apptCount, error: apptErr } = await apptQuery

  if (apptErr) {
    console.error('[isTimeSlotAvailable] appt conflict error:', apptErr.message)
    return { available: false, reason: 'Could not verify availability (DB error)' }
  }
  if ((apptCount ?? 0) > 0) {
    return { available: false, reason: 'This time slot is already booked' }
  }

  // ── 4. Blocked time check ─────────────────────────────────────────────────
  const { count: blockCount, error: blockErr } = await supabase
    .from('blocked_times')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant_id)
    .lt('start_time', ends_at)
    .gt('end_time', starts_at)

  if (blockErr) {
    console.error('[isTimeSlotAvailable] block conflict error:', blockErr.message)
    return { available: false, reason: 'Could not verify blocked times (DB error)' }
  }
  if ((blockCount ?? 0) > 0) {
    return { available: false, reason: 'This time is blocked by the business' }
  }

  return { available: true }
}

function parseTime(t: string): [number, number] {
  const parts = (t ?? '00:00').split(':').map(Number)
  return [parts[0] ?? 0, parts[1] ?? 0]
}
