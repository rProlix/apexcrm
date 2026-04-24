// lib/appointments/generateTimeSlots.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { AvailabilityRule, TimeSlot } from './types'

interface GenerateOptions {
  tenant_id: string
  date:      string  // YYYY-MM-DD
}

/**
 * Core time-slot generation engine.
 *
 * Algorithm:
 * 1. Derive day-of-week from date.
 * 2. Load ALL active availability_rules for the tenant.
 * 3. Filter rules applicable to the date:
 *    - 'daily'  → always applies
 *    - 'weekly' → applies when rule.day_of_week matches
 *    - 'custom' → applies when date's DOW is in rule.repeat_days
 * 4. For each matching rule generate slots at slot_interval_minutes granularity.
 * 5. Deduplicate by start ISO string, sort ascending.
 * 6. Load busy intervals (appointments + blocked_times) in parallel.
 * 7. Mark each slot available/unavailable via strict overlap check.
 * 8. Remove slots that started in the past (same-day only).
 * 9. Return ALL slots with their availability flag.
 *    (Callers decide whether to filter to available-only.)
 */
export async function generateTimeSlots({
  tenant_id,
  date,
}: GenerateOptions): Promise<TimeSlot[]> {
  const supabase = getSupabaseServerClient()

  // day_of_week: 0=Sun … 6=Sat, derived from UTC noon to avoid DST edge-cases
  const dayOfWeek = new Date(`${date}T12:00:00Z`).getUTCDay()

  // ── Load active rules ─────────────────────────────────────────────────────
  const { data: rulesData, error: ruleErr } = await supabase
    .from('availability_rules')
    .select('*')
    .eq('tenant_id', tenant_id)
    .eq('is_active', true)

  if (ruleErr) {
    console.error('[generateTimeSlots] rules error:', ruleErr.message)
    return []
  }

  const rules = (rulesData ?? []) as unknown as AvailabilityRule[]

  // ── Filter rules applicable to this date ──────────────────────────────────
  const applicable = rules.filter((r) => {
    const type = r.repeat_type ?? 'weekly'
    if (type === 'daily')  return true
    if (type === 'weekly') return r.day_of_week === dayOfWeek
    if (type === 'custom') {
      const days = Array.isArray(r.repeat_days) ? r.repeat_days : []
      return days.includes(dayOfWeek)
    }
    return r.day_of_week === dayOfWeek  // safe fallback
  })

  if (applicable.length === 0) return []

  // ── Generate raw slots from each rule ─────────────────────────────────────
  const allSlots: TimeSlot[] = []

  for (const rule of applicable) {
    const intervalMins = rule.slot_interval_minutes
      ?? rule.slot_duration_minutes
      ?? 60
    const ruleSlots = buildSlotsFromRule(date, rule.start_time, rule.end_time, intervalMins)
    allSlots.push(...ruleSlots)
  }

  if (allSlots.length === 0) return []

  // ── Deduplicate by start ISO, sort ascending ──────────────────────────────
  const seen    = new Set<string>()
  const deduped = allSlots
    .filter((s) => {
      if (seen.has(s.start)) return false
      seen.add(s.start)
      return true
    })
    .sort((a, b) => a.start.localeCompare(b.start))

  // ── Load busy intervals (parallel DB queries) ─────────────────────────────
  const dayStart = `${date}T00:00:00.000Z`
  const dayEnd   = `${date}T23:59:59.999Z`

  const [apptRes, blockRes] = await Promise.all([
    supabase
      .from('appointments')
      .select('starts_at, ends_at')
      .eq('tenant_id', tenant_id)
      .neq('status', 'canceled')
      .lt('starts_at', dayEnd)
      .gt('ends_at', dayStart),
    supabase
      .from('blocked_times')
      .select('start_time, end_time')
      .eq('tenant_id', tenant_id)
      .lt('start_time', dayEnd)
      .gt('end_time', dayStart),
  ])

  if (apptRes.error)  console.error('[generateTimeSlots] appt error:', apptRes.error.message)
  if (blockRes.error) console.error('[generateTimeSlots] block error:', blockRes.error.message)

  const busy: Array<{ s: number; e: number }> = [
    ...(apptRes.data  ?? []).map((a) => ({
      s: new Date(a.starts_at).getTime(),
      e: new Date(a.ends_at).getTime(),
    })),
    ...(blockRes.data ?? []).map((b) => ({
      s: new Date(b.start_time).getTime(),
      e: new Date(b.end_time).getTime(),
    })),
  ]

  // ── Annotate each slot ────────────────────────────────────────────────────
  const now      = Date.now()
  const isToday  = date === new Date().toISOString().slice(0, 10)

  return deduped.map((slot) => {
    const slotS = new Date(slot.start).getTime()
    const slotE = new Date(slot.end).getTime()

    // Past-slot removal for same-day bookings
    if (isToday && slotS <= now) {
      return { ...slot, available: false }
    }

    // Strict overlap: busy.start < slot.end AND busy.end > slot.start
    const conflict = busy.some((b) => b.s < slotE && b.e > slotS)
    return { ...slot, available: !conflict }
  })
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function buildSlotsFromRule(
  date:         string,
  startTimeStr: string,
  endTimeStr:   string,
  intervalMins: number,
): TimeSlot[] {
  if (intervalMins <= 0) return []

  const [sh, sm] = parseTime(startTimeStr)
  const [eh, em] = parseTime(endTimeStr)

  const base = new Date(`${date}T00:00:00.000Z`)

  const windowStart = new Date(base)
  windowStart.setUTCHours(sh, sm, 0, 0)

  const windowEnd = new Date(base)
  windowEnd.setUTCHours(eh, em, 0, 0)

  const slots: TimeSlot[] = []
  let cursor = windowStart.getTime()
  const endMs = windowEnd.getTime()
  const step  = intervalMins * 60_000

  while (cursor < endMs) {
    const slotEndMs = cursor + step
    if (slotEndMs > endMs) break  // don't generate partial slot at boundary

    slots.push({
      start:     new Date(cursor).toISOString(),
      end:       new Date(slotEndMs).toISOString(),
      available: true,
    })

    cursor = slotEndMs
  }

  return slots
}

function parseTime(t: string): [number, number] {
  const parts = t.split(':').map(Number)
  return [parts[0] ?? 0, parts[1] ?? 0]
}
