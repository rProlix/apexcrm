// lib/appointments/availabilityBlocks.ts
// Server-side helpers for the appointment availability block system.
// All operations are tenant-scoped. Never call these from client components.

import { getSupabaseServerClient } from '@/lib/supabase/server'
import type {
  AppointmentAvailabilityBlock,
  AppointmentBlockType,
  AvailableSlot,
} from './types'

// ── Internal DB type (avoids Supabase codegen drift) ─────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any

const BLOCK_SELECT = `
  id, tenant_id, staff_id, title, description, block_type,
  day_of_week, start_time, end_time,
  starts_at, ends_at,
  timezone, slot_duration_minutes,
  buffer_before_minutes, buffer_after_minutes,
  max_bookings_per_slot, is_recurring, is_active,
  recurrence_rule, created_by, created_at, updated_at,
  professional:professionals ( id, name, avatar_url )
`

// ── List ──────────────────────────────────────────────────────────────────────

export interface ListBlocksOptions {
  tenant_id: string
  staff_id?: string | null
  block_type?: AppointmentBlockType | null
  active_only?: boolean
}

export async function listAvailabilityBlocks(
  opts: ListBlocksOptions
): Promise<AppointmentAvailabilityBlock[]> {
  const db: DB = getSupabaseServerClient()

  let q = db
    .from('appointment_availability_blocks')
    .select(BLOCK_SELECT)
    .eq('tenant_id', opts.tenant_id)
    .order('day_of_week', { ascending: true, nullsFirst: false })
    .order('start_time',  { ascending: true, nullsFirst: false })
    .order('starts_at',   { ascending: true, nullsFirst: false })

  if (opts.active_only !== false) q = q.eq('is_active', true)

  if (opts.block_type) q = q.eq('block_type', opts.block_type)

  if (opts.staff_id) {
    q = q.or(`staff_id.eq.${opts.staff_id},staff_id.is.null`)
  }

  const { data, error } = await q
  if (error) {
    console.error('[listAvailabilityBlocks]', error.message)
    return []
  }
  return (data ?? []) as AppointmentAvailabilityBlock[]
}

export async function getAvailabilityBlocksForStaff(
  tenant_id: string,
  staff_id: string
): Promise<AppointmentAvailabilityBlock[]> {
  return listAvailabilityBlocks({ tenant_id, staff_id, active_only: true })
}

// ── Create ────────────────────────────────────────────────────────────────────

export interface CreateBlockInput {
  tenant_id:             string
  staff_id?:             string | null
  title?:                string | null
  description?:          string | null
  block_type?:           AppointmentBlockType
  is_recurring:          boolean
  day_of_week?:          number | null
  start_time?:           string | null
  end_time?:             string | null
  starts_at?:            string | null
  ends_at?:              string | null
  timezone?:             string
  slot_duration_minutes?: number
  buffer_before_minutes?: number
  buffer_after_minutes?:  number
  max_bookings_per_slot?: number
  is_active?:            boolean
  recurrence_rule?:      string | null
  created_by?:           string | null
}

export type BlockResult =
  | { ok: true; block: AppointmentAvailabilityBlock }
  | { ok: false; error: string; code: string }

export async function createAvailabilityBlock(
  input: CreateBlockInput
): Promise<BlockResult> {
  const err = validateBlockInput(input)
  if (err) return { ok: false, error: err, code: 'VALIDATION_ERROR' }

  const db: DB = getSupabaseServerClient()

  // Validate staff belongs to this tenant
  if (input.staff_id) {
    const { data: prof } = await db
      .from('professionals')
      .select('id')
      .eq('id', input.staff_id)
      .eq('tenant_id', input.tenant_id)
      .maybeSingle()
    if (!prof) return { ok: false, error: 'Professional not found in this tenant', code: 'NOT_FOUND' }
  }

  const { data, error } = await db
    .from('appointment_availability_blocks')
    .insert({
      tenant_id:             input.tenant_id,
      staff_id:              input.staff_id              ?? null,
      title:                 input.title                 ?? null,
      description:           input.description           ?? null,
      block_type:            input.block_type            ?? 'available',
      is_recurring:          input.is_recurring,
      day_of_week:           input.is_recurring ? (input.day_of_week ?? null) : null,
      start_time:            input.is_recurring ? (input.start_time  ?? null) : null,
      end_time:              input.is_recurring ? (input.end_time    ?? null) : null,
      starts_at:             input.is_recurring ? null : (input.starts_at ?? null),
      ends_at:               input.is_recurring ? null : (input.ends_at   ?? null),
      timezone:              input.timezone              ?? 'America/Los_Angeles',
      slot_duration_minutes: input.slot_duration_minutes ?? 30,
      buffer_before_minutes: input.buffer_before_minutes ?? 0,
      buffer_after_minutes:  input.buffer_after_minutes  ?? 0,
      max_bookings_per_slot: input.max_bookings_per_slot ?? 1,
      is_active:             input.is_active             ?? true,
      recurrence_rule:       input.recurrence_rule       ?? null,
      created_by:            input.created_by            ?? null,
    })
    .select(BLOCK_SELECT)
    .single()

  if (error) {
    console.error('[createAvailabilityBlock]', error.message)
    return { ok: false, error: error.message, code: 'DB_ERROR' }
  }
  return { ok: true, block: data as AppointmentAvailabilityBlock }
}

// ── Update ────────────────────────────────────────────────────────────────────

export interface UpdateBlockInput extends Partial<CreateBlockInput> {
  tenant_id: string
}

export async function updateAvailabilityBlock(
  id: string,
  input: UpdateBlockInput
): Promise<BlockResult> {
  const db: DB = getSupabaseServerClient()

  // Confirm ownership
  const { data: existing } = await db
    .from('appointment_availability_blocks')
    .select('id, tenant_id')
    .eq('id', id)
    .eq('tenant_id', input.tenant_id)
    .maybeSingle()

  if (!existing) return { ok: false, error: 'Block not found', code: 'NOT_FOUND' }

  // Validate staff if changing
  if (input.staff_id) {
    const { data: prof } = await db
      .from('professionals')
      .select('id')
      .eq('id', input.staff_id)
      .eq('tenant_id', input.tenant_id)
      .maybeSingle()
    if (!prof) return { ok: false, error: 'Professional not found in this tenant', code: 'NOT_FOUND' }
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const setIfDefined = <T>(key: string, val: T | undefined) => {
    if (val !== undefined) patch[key] = val
  }

  setIfDefined('staff_id',              input.staff_id)
  setIfDefined('title',                 input.title)
  setIfDefined('description',           input.description)
  setIfDefined('block_type',            input.block_type)
  setIfDefined('is_recurring',          input.is_recurring)
  setIfDefined('day_of_week',           input.day_of_week)
  setIfDefined('start_time',            input.start_time)
  setIfDefined('end_time',              input.end_time)
  setIfDefined('starts_at',             input.starts_at)
  setIfDefined('ends_at',               input.ends_at)
  setIfDefined('timezone',              input.timezone)
  setIfDefined('slot_duration_minutes', input.slot_duration_minutes)
  setIfDefined('buffer_before_minutes', input.buffer_before_minutes)
  setIfDefined('buffer_after_minutes',  input.buffer_after_minutes)
  setIfDefined('max_bookings_per_slot', input.max_bookings_per_slot)
  setIfDefined('is_active',             input.is_active)
  setIfDefined('recurrence_rule',       input.recurrence_rule)

  const { data, error } = await db
    .from('appointment_availability_blocks')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', input.tenant_id)
    .select(BLOCK_SELECT)
    .single()

  if (error) {
    console.error('[updateAvailabilityBlock]', error.message)
    return { ok: false, error: error.message, code: 'DB_ERROR' }
  }
  return { ok: true, block: data as AppointmentAvailabilityBlock }
}

// ── Delete (soft) ─────────────────────────────────────────────────────────────

export async function deleteAvailabilityBlock(
  id: string,
  tenant_id: string
): Promise<{ ok: boolean; error?: string }> {
  const db: DB = getSupabaseServerClient()

  const { error } = await db
    .from('appointment_availability_blocks')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenant_id)

  if (error) {
    console.error('[deleteAvailabilityBlock]', error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

// ── Available slots generation ────────────────────────────────────────────────

export interface GetAvailableSlotsOptions {
  tenant_id:        string
  date:             string          // YYYY-MM-DD
  staff_id?:        string | null   // null = any professional
  duration_minutes?: number         // override slot_duration_minutes
}

/**
 * Generate available booking slots for a date, respecting:
 * - Available blocks (defines when slots exist)
 * - Unavailable / blackout blocks (override and remove slots)
 * - Existing non-canceled appointments (double-booking prevention)
 * - Past times (same-day only)
 * - Buffer times before/after slots
 */
export async function getAvailableSlots(
  opts: GetAvailableSlotsOptions
): Promise<AvailableSlot[]> {
  const db: DB = getSupabaseServerClient()
  const { tenant_id, date, staff_id } = opts

  const dayOfWeek = new Date(`${date}T12:00:00Z`).getUTCDay()
  const dayStart  = `${date}T00:00:00.000Z`
  const dayEnd    = `${date}T23:59:59.999Z`

  // Load ALL active blocks for this tenant + staff combo
  let blockQuery = db
    .from('appointment_availability_blocks')
    .select('*, professional:professionals(id, name, avatar_url)')
    .eq('tenant_id', tenant_id)
    .eq('is_active', true)

  if (staff_id) {
    blockQuery = blockQuery.or(`staff_id.eq.${staff_id},staff_id.is.null`)
  }

  const { data: allBlocks, error: blockErr } = await blockQuery
  if (blockErr) {
    console.error('[getAvailableSlots] blocks error:', blockErr.message)
    return []
  }

  const blocks = (allBlocks ?? []) as Array<{
    id: string
    block_type: string
    is_recurring: boolean
    day_of_week: number | null
    start_time: string | null
    end_time: string | null
    starts_at: string | null
    ends_at: string | null
    slot_duration_minutes: number
    buffer_before_minutes: number
    buffer_after_minutes: number
    max_bookings_per_slot: number
    staff_id: string | null
    professional: { id: string; name: string; avatar_url: string | null } | null
  }>

  // Split into available blocks vs blocking blocks
  const availableBlocks  = blocks.filter((b) => b.block_type === 'available')
  const blockingIntervals = blocks.filter((b) => b.block_type === 'unavailable' || b.block_type === 'blackout')

  if (availableBlocks.length === 0) return []

  // Filter blocks applicable to this date
  function appliesToDate(b: typeof blocks[0]) {
    if (b.is_recurring) {
      return b.day_of_week === dayOfWeek && !!b.start_time && !!b.end_time
    }
    if (!b.starts_at || !b.ends_at) return false
    return b.starts_at <= dayEnd && b.ends_at >= dayStart
  }

  const applicableAvailable = availableBlocks.filter(appliesToDate)
  if (applicableAvailable.length === 0) return []

  // Build blocking intervals (unavailable + blackout blocks for this date)
  const applicableBlocking = blockingIntervals.filter(appliesToDate)
  const blockingRanges: Array<{ s: number; e: number }> = []

  for (const b of applicableBlocking) {
    if (b.is_recurring && b.start_time && b.end_time) {
      const [sh, sm] = parseTime(b.start_time)
      const [eh, em] = parseTime(b.end_time)
      const base = new Date(`${date}T00:00:00.000Z`)
      const s = new Date(base); s.setUTCHours(sh, sm, 0, 0)
      const e = new Date(base); e.setUTCHours(eh, em, 0, 0)
      blockingRanges.push({ s: s.getTime(), e: e.getTime() })
    } else if (!b.is_recurring && b.starts_at && b.ends_at) {
      const s = Math.max(new Date(b.starts_at).getTime(), new Date(dayStart).getTime())
      const e = Math.min(new Date(b.ends_at).getTime(),   new Date(dayEnd).getTime())
      if (s < e) blockingRanges.push({ s, e })
    }
  }

  // Load existing appointments (busy intervals)
  let apptQuery = db
    .from('appointments')
    .select('starts_at, ends_at, staff_id')
    .eq('tenant_id', tenant_id)
    .neq('status', 'canceled')
    .lt('starts_at', dayEnd)
    .gt('ends_at', dayStart)

  if (staff_id) {
    apptQuery = apptQuery.eq('staff_id', staff_id)
  }

  const [apptRes, legacyBlockRes] = await Promise.all([
    apptQuery,
    db
      .from('blocked_times')
      .select('start_time, end_time')
      .eq('tenant_id', tenant_id)
      .lt('start_time', dayEnd)
      .gt('end_time', dayStart),
  ])

  const busyRanges: Array<{ s: number; e: number }> = [
    ...(apptRes.data ?? []).map((a: { starts_at: string; ends_at: string }) => ({
      s: new Date(a.starts_at).getTime(),
      e: new Date(a.ends_at).getTime(),
    })),
    ...(legacyBlockRes.data ?? []).map((b: { start_time: string; end_time: string }) => ({
      s: new Date(b.start_time).getTime(),
      e: new Date(b.end_time).getTime(),
    })),
    ...blockingRanges,
  ]

  // Generate raw slots from each available block
  const allSlots: AvailableSlot[] = []
  const seen = new Set<string>()
  const now   = Date.now()
  const isToday = date === new Date().toISOString().slice(0, 10)

  for (const block of applicableAvailable) {
    const durationMins = opts.duration_minutes ?? block.slot_duration_minutes ?? 30
    const bufferBefore = block.buffer_before_minutes ?? 0
    const bufferAfter  = block.buffer_after_minutes  ?? 0
    const staffId      = block.staff_id
    const staffName    = block.professional?.name ?? null

    let windowStart: Date
    let windowEnd:   Date

    if (block.is_recurring && block.start_time && block.end_time) {
      const [sh, sm] = parseTime(block.start_time)
      const [eh, em] = parseTime(block.end_time)
      const base = new Date(`${date}T00:00:00.000Z`)
      windowStart = new Date(base); windowStart.setUTCHours(sh, sm, 0, 0)
      windowEnd   = new Date(base); windowEnd.setUTCHours(eh, em, 0, 0)
    } else if (!block.is_recurring && block.starts_at && block.ends_at) {
      windowStart = new Date(Math.max(new Date(block.starts_at).getTime(), new Date(dayStart).getTime()))
      windowEnd   = new Date(Math.min(new Date(block.ends_at).getTime(),   new Date(dayEnd).getTime()))
    } else {
      continue
    }

    const step = durationMins * 60_000
    let cursor = windowStart.getTime()

    while (cursor < windowEnd.getTime()) {
      const slotEnd = cursor + step
      if (slotEnd > windowEnd.getTime()) break

      const slotKey = new Date(cursor).toISOString()
      if (!seen.has(slotKey)) {
        seen.add(slotKey)

        // Past slots
        const isPast = isToday && cursor <= now

        // Conflict check (including buffers)
        const effectiveStart = cursor  - bufferBefore * 60_000
        const effectiveEnd   = slotEnd + bufferAfter  * 60_000
        const conflict = isPast || busyRanges.some(
          (b) => b.s < effectiveEnd && b.e > effectiveStart
        )

        allSlots.push({
          starts_at:  slotKey,
          ends_at:    new Date(slotEnd).toISOString(),
          staff_id:   staffId ?? null,
          staff_name: staffName,
          block_id:   block.id,
          available:  !conflict,
        })
      }
      cursor = slotEnd
    }
  }

  // Sort ascending by start time
  return allSlots
    .filter((s) => s.available)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
}

// ── Slot availability check ───────────────────────────────────────────────────

export interface CheckSlotOptions {
  tenant_id:   string
  starts_at:   string
  ends_at:     string
  staff_id?:   string | null
  exclude_id?: string   // appointment id to exclude (for rescheduling)
}

export interface SlotCheckResult {
  available: boolean
  reason?:   string
}

export async function checkSlotAvailability(
  opts: CheckSlotOptions
): Promise<SlotCheckResult> {
  const db: DB = getSupabaseServerClient()
  const { tenant_id, starts_at, ends_at, staff_id, exclude_id } = opts

  const startMs = new Date(starts_at).getTime()
  const endMs   = new Date(ends_at).getTime()

  if (isNaN(startMs) || isNaN(endMs)) return { available: false, reason: 'Invalid timestamp' }
  if (startMs >= endMs) return { available: false, reason: 'Start time must be before end time' }
  if (startMs < Date.now() - 60_000) return { available: false, reason: 'Cannot book a time in the past' }

  // Check for blocking (unavailable/blackout) blocks covering this slot
  const date       = starts_at.slice(0, 10)
  const dayOfWeek  = new Date(`${date}T12:00:00Z`).getUTCDay()

  let blockQuery = db
    .from('appointment_availability_blocks')
    .select('id, block_type, is_recurring, day_of_week, start_time, end_time, starts_at, ends_at')
    .eq('tenant_id', tenant_id)
    .eq('is_active', true)
    .in('block_type', ['unavailable', 'blackout'])

  if (staff_id) blockQuery = blockQuery.or(`staff_id.eq.${staff_id},staff_id.is.null`)

  const { data: blockingBlocks } = await blockQuery

  for (const b of (blockingBlocks ?? [])) {
    let bs: number, be: number
    if (b.is_recurring && b.start_time && b.end_time && b.day_of_week === dayOfWeek) {
      const [sh, sm] = parseTime(b.start_time)
      const [eh, em] = parseTime(b.end_time)
      const base = new Date(`${date}T00:00:00.000Z`)
      const s = new Date(base); s.setUTCHours(sh, sm, 0, 0)
      const e = new Date(base); e.setUTCHours(eh, em, 0, 0)
      bs = s.getTime(); be = e.getTime()
    } else if (!b.is_recurring && b.starts_at && b.ends_at) {
      bs = new Date(b.starts_at).getTime()
      be = new Date(b.ends_at).getTime()
    } else {
      continue
    }
    if (bs < endMs && be > startMs) {
      return { available: false, reason: 'This time is blocked by the business' }
    }
  }

  // Check for appointment conflicts
  let apptQuery = db
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant_id)
    .neq('status', 'canceled')
    .lt('starts_at', ends_at)
    .gt('ends_at', starts_at)

  if (staff_id) apptQuery = apptQuery.eq('staff_id', staff_id)
  if (exclude_id) apptQuery = apptQuery.neq('id', exclude_id)

  const { count: apptCount, error: apptErr } = await apptQuery
  if (apptErr) return { available: false, reason: 'Could not verify availability' }
  if ((apptCount ?? 0) > 0) return { available: false, reason: 'This time slot is already booked' }

  // Legacy blocked_times check
  const { count: blockCount } = await db
    .from('blocked_times')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant_id)
    .lt('start_time', ends_at)
    .gt('end_time', starts_at)

  if ((blockCount ?? 0) > 0) return { available: false, reason: 'This time is blocked by the business' }

  return { available: true }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseTime(t: string): [number, number] {
  const parts = (t ?? '00:00').split(':').map(Number)
  return [parts[0] ?? 0, parts[1] ?? 0]
}

function validateBlockInput(input: CreateBlockInput): string | null {
  if (input.is_recurring) {
    if (input.day_of_week === null || input.day_of_week === undefined || input.day_of_week < 0 || input.day_of_week > 6) {
      return 'day_of_week (0–6) is required for recurring blocks'
    }
    if (!input.start_time) return 'start_time is required for recurring blocks'
    if (!input.end_time)   return 'end_time is required for recurring blocks'
    if (input.start_time >= input.end_time) return 'start_time must be before end_time'
  } else {
    if (!input.starts_at) return 'starts_at is required for one-time blocks'
    if (!input.ends_at)   return 'ends_at is required for one-time blocks'
    if (new Date(input.starts_at) >= new Date(input.ends_at)) {
      return 'starts_at must be before ends_at'
    }
  }
  const dur = input.slot_duration_minutes ?? 30
  if (dur < 5 || dur > 480) return 'slot_duration_minutes must be between 5 and 480'
  const max = input.max_bookings_per_slot ?? 1
  if (max < 1) return 'max_bookings_per_slot must be at least 1'
  const blockType = input.block_type ?? 'available'
  if (!['available', 'unavailable', 'blackout'].includes(blockType)) {
    return 'block_type must be available, unavailable, or blackout'
  }
  return null
}
