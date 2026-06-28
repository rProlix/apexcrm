// lib/pov/events.ts
// ─────────────────────────────────────────────────────────────────────────────
// SERVER-ONLY helpers for resolving POV events and computing reveal state.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only'
import { povDb } from '@/lib/pov/db'
import type { PovEventRow } from '@/lib/pov/types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Resolves an event by either its UUID id or its slug. Public routing uses the
 * slug; admin routing may use either. Returns null if not found.
 */
export async function resolveEvent(idOrSlug: string): Promise<PovEventRow | null> {
  const ref = (idOrSlug ?? '').trim()
  if (!ref) return null

  const db = povDb()
  const column = UUID_RE.test(ref) ? 'id' : 'slug'
  const { data } = await db
    .from('pov_events')
    .select('*')
    .eq(column, ref)
    .limit(1)
    .maybeSingle()

  return (data as PovEventRow | null) ?? null
}

/** True once the gallery reveal time has passed. */
export function isGalleryUnlocked(event: Pick<PovEventRow, 'gallery_reveal_at'>, now: Date = new Date()): boolean {
  const reveal = new Date(event.gallery_reveal_at).getTime()
  if (Number.isNaN(reveal)) return false
  return now.getTime() >= reveal
}

/**
 * Computes a sensible default gallery reveal time: the next day at 9:00 AM in
 * the event's timezone, relative to the event date (or today). Returns an ISO
 * string in UTC.
 *
 * Note: this performs a timezone-aware calculation using Intl so the 9:00 AM is
 * local to the event's timezone, then converts back to a UTC instant.
 */
export function defaultRevealAt(opts: {
  eventDate?: string | null   // 'YYYY-MM-DD'
  timezone?: string | null
  hour?: number               // local hour, default 9
}): string {
  const tz = opts.timezone || 'America/Los_Angeles'
  const hour = opts.hour ?? 9

  // Determine the base day (event date if provided, else today in tz).
  let baseY: number, baseM: number, baseD: number
  if (opts.eventDate && /^\d{4}-\d{2}-\d{2}$/.test(opts.eventDate)) {
    const [y, m, d] = opts.eventDate.split('-').map(Number)
    baseY = y; baseM = m; baseD = d
  } else {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date())
    baseY = Number(parts.find((p) => p.type === 'year')?.value)
    baseM = Number(parts.find((p) => p.type === 'month')?.value)
    baseD = Number(parts.find((p) => p.type === 'day')?.value)
  }

  // Next day.
  const nextDay = new Date(Date.UTC(baseY, baseM - 1, baseD))
  nextDay.setUTCDate(nextDay.getUTCDate() + 1)
  const ny = nextDay.getUTCFullYear()
  const nm = nextDay.getUTCMonth() + 1
  const nd = nextDay.getUTCDate()

  // Find the UTC instant that corresponds to `hour:00` local time in tz on the
  // next day. We do this by computing the tz offset for a guess instant.
  const guess = new Date(Date.UTC(ny, nm - 1, nd, hour, 0, 0))
  const offsetMin = tzOffsetMinutes(tz, guess)
  const utc = new Date(guess.getTime() - offsetMin * 60_000)
  return utc.toISOString()
}

/** Returns the timezone offset (minutes) for a given instant in a tz. */
function tzOffsetMinutes(timeZone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const parts = dtf.formatToParts(date)
  const map: Record<string, number> = {}
  for (const p of parts) if (p.type !== 'literal') map[p.type] = Number(p.value)
  const asUTC = Date.UTC(map.year, map.month - 1, map.day, map.hour, map.minute, map.second)
  return Math.round((asUTC - date.getTime()) / 60_000)
}
