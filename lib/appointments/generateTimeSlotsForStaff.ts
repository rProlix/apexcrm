// lib/appointments/generateTimeSlotsForStaff.ts
// Generates available time slots for a specific professional using
// appointment_availability_blocks (the new staff-scoped scheduling system).
import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { TimeSlot } from './types'

interface Options {
  tenant_id: string
  date:      string    // YYYY-MM-DD
  staff_id:  string
}

/**
 * Staff-scoped slot generation using appointment_availability_blocks.
 *
 * Algorithm:
 * 1. Derive day-of-week from date.
 * 2. Load all active availability blocks for tenant where:
 *    - staff_id = provided staff_id  OR  staff_id IS NULL (applies to all)
 * 3. Filter blocks applicable to the date:
 *    - Recurring (is_recurring=true)  → day_of_week matches
 *    - One-time  (is_recurring=false) → starts_at/ends_at spans the date
 * 4. Generate slots at slot_duration_minutes intervals for each matching block.
 * 5. Deduplicate, sort ascending.
 * 6. Load existing non-canceled appointments for the staff member on this date.
 * 7. Mark slots available/unavailable via strict overlap check.
 * 8. Remove past slots (same-day only).
 */
export async function generateTimeSlotsForStaff({
  tenant_id,
  date,
  staff_id,
}: Options): Promise<TimeSlot[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  const dayOfWeek = new Date(`${date}T12:00:00Z`).getUTCDay()

  // Load active blocks for this professional (and null-staff blocks)
  const { data: blocksData, error: blockErr } = await supabase
    .from('appointment_availability_blocks')
    .select('*')
    .eq('tenant_id', tenant_id)
    .eq('is_active', true)
    .or(`staff_id.eq.${staff_id},staff_id.is.null`)

  if (blockErr) {
    console.error('[generateTimeSlotsForStaff] blocks error:', blockErr.message)
    return []
  }

  const blocks = (blocksData ?? []) as Array<{
    id: string
    is_recurring: boolean
    day_of_week: number | null
    start_time: string | null
    end_time: string | null
    starts_at: string | null
    ends_at: string | null
    slot_duration_minutes: number
    buffer_before_minutes: number
    buffer_after_minutes: number
  }>

  if (blocks.length === 0) return []

  // Filter blocks applicable to this date
  const dayStart = `${date}T00:00:00.000Z`
  const dayEnd   = `${date}T23:59:59.999Z`

  const applicable = blocks.filter((b) => {
    if (b.is_recurring) {
      return b.day_of_week === dayOfWeek && b.start_time && b.end_time
    } else {
      // One-time block: check it overlaps the date
      if (!b.starts_at || !b.ends_at) return false
      return b.starts_at <= dayEnd && b.ends_at >= dayStart
    }
  })

  if (applicable.length === 0) return []

  // Generate raw slots from each block
  const allSlots: TimeSlot[] = []

  for (const block of applicable) {
    const durationMins = block.slot_duration_minutes ?? 30

    if (block.is_recurring && block.start_time && block.end_time) {
      const slots = buildSlotsFromTimeRange(date, block.start_time, block.end_time, durationMins)
      allSlots.push(...slots)
    } else if (!block.is_recurring && block.starts_at && block.ends_at) {
      // For one-time blocks, clip to the requested date
      const blockStart = new Date(Math.max(new Date(block.starts_at).getTime(), new Date(dayStart).getTime()))
      const blockEnd   = new Date(Math.min(new Date(block.ends_at).getTime(),   new Date(dayEnd).getTime()))
      if (blockStart < blockEnd) {
        const slots = buildSlotsFromRange(blockStart, blockEnd, durationMins)
        allSlots.push(...slots)
      }
    }
  }

  if (allSlots.length === 0) return []

  // Deduplicate by start ISO, sort ascending
  const seen    = new Set<string>()
  const deduped = allSlots
    .filter((s) => {
      if (seen.has(s.start)) return false
      seen.add(s.start)
      return true
    })
    .sort((a, b) => a.start.localeCompare(b.start))

  // Load busy intervals: appointments for this staff member on this date
  const [apptRes, blockRes] = await Promise.all([
    supabase
      .from('appointments')
      .select('starts_at, ends_at')
      .eq('tenant_id', tenant_id)
      .eq('staff_id', staff_id)
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

  if (apptRes.error)  console.error('[generateTimeSlotsForStaff] appt error:', apptRes.error.message)
  if (blockRes.error) console.error('[generateTimeSlotsForStaff] block error:', blockRes.error.message)

  const busy: Array<{ s: number; e: number }> = [
    ...(apptRes.data  ?? []).map((a: { starts_at: string; ends_at: string }) => ({
      s: new Date(a.starts_at).getTime(),
      e: new Date(a.ends_at).getTime(),
    })),
    ...(blockRes.data ?? []).map((b: { start_time: string; end_time: string }) => ({
      s: new Date(b.start_time).getTime(),
      e: new Date(b.end_time).getTime(),
    })),
  ]

  const now     = Date.now()
  const isToday = date === new Date().toISOString().slice(0, 10)

  return deduped.map((slot) => {
    const slotS = new Date(slot.start).getTime()
    const slotE = new Date(slot.end).getTime()

    if (isToday && slotS <= now) {
      return { ...slot, available: false }
    }

    const conflict = busy.some((b) => b.s < slotE && b.e > slotS)
    return { ...slot, available: !conflict }
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSlotsFromTimeRange(
  date:         string,
  startTimeStr: string,
  endTimeStr:   string,
  durationMins: number,
): TimeSlot[] {
  if (durationMins <= 0) return []

  const [sh, sm] = parseTime(startTimeStr)
  const [eh, em] = parseTime(endTimeStr)

  const base        = new Date(`${date}T00:00:00.000Z`)
  const windowStart = new Date(base); windowStart.setUTCHours(sh, sm, 0, 0)
  const windowEnd   = new Date(base); windowEnd.setUTCHours(eh, em, 0, 0)

  return buildSlotsFromRange(windowStart, windowEnd, durationMins)
}

function buildSlotsFromRange(
  windowStart: Date,
  windowEnd:   Date,
  durationMins: number,
): TimeSlot[] {
  const slots: TimeSlot[] = []
  const step  = durationMins * 60_000
  let cursor  = windowStart.getTime()
  const endMs = windowEnd.getTime()

  while (cursor < endMs) {
    const slotEnd = cursor + step
    if (slotEnd > endMs) break

    slots.push({
      start:     new Date(cursor).toISOString(),
      end:       new Date(slotEnd).toISOString(),
      available: true,
    })
    cursor = slotEnd
  }

  return slots
}

function parseTime(t: string): [number, number] {
  const parts = t.split(':').map(Number)
  return [parts[0] ?? 0, parts[1] ?? 0]
}
