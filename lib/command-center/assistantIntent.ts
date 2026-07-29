import { getTenantDayRange } from './time'

export type CommandAssistantIntent =
  | { type: 'unreviewed_vans' }
  | { type: 'missing_inspections'; date: string; dateLabel: string }
  | { type: 'general' }

export function resolveCommandAssistantIntent(
  input: string,
  options: { now?: Date; timeZone: string }
): CommandAssistantIntent {
  const query = input.trim().toLowerCase().replace(/\s+/g, ' ')
  const referencesInspection = /\b(inspections?|inspection photos?|van photos?|checks?)\b/.test(
    query
  )
  const referencesMissing =
    /\b(missing|missed|overdue|not submitted|never submitted|haven't submitted|hasn't submitted|without)\b/.test(
      query
    )
  if (referencesInspection && referencesMissing) {
    const date = resolveDate(query, options.now ?? new Date(), options.timeZone)
    return {
      type: 'missing_inspections',
      date,
      dateLabel: query.includes('yesterday') ? 'yesterday' : date,
    }
  }

  const referencesFleet = /\b(vans?|vehicles?|fleet|inspections?)\b/.test(query)
  const referencesReview =
    /\b(unreviewed|needs? review|awaiting review|pending review|not reviewed|have not been reviewed|has not been reviewed|haven't been reviewed|hasn't been reviewed)\b/.test(
      query
    )
  if (referencesFleet && referencesReview) return { type: 'unreviewed_vans' }

  return { type: 'general' }
}

export function normalizeAssistantQuestion(input: string): string {
  return input.trim().replace(/\s+/g, ' ').slice(0, 500)
}

function resolveDate(query: string, now: Date, timeZone: string): string {
  const explicit = query.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1]
  if (explicit) return explicit
  const today = getTenantDayRange(now, timeZone).dateKey
  return query.includes('yesterday') ? addCalendarDays(today, -1) : today
}

function addCalendarDays(dateKey: string, amount: number): string {
  const date = new Date(`${dateKey}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}
