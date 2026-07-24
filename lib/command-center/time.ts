export function getTenantDayRange(now: Date, timeZone: string) {
  const dateKey = formatDateKey(now, timeZone)
  const start = zonedDateTimeToUtc(`${dateKey}T00:00:00`, timeZone)
  const nextDateKey = addCalendarDays(dateKey, 1)
  const end = zonedDateTimeToUtc(`${nextDateKey}T00:00:00`, timeZone)

  return {
    dateKey,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    label: new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(now),
  }
}

export function getTenantDateRange(dateFrom: string, dateTo: string, timeZone: string) {
  const start = zonedDateTimeToUtc(`${dateFrom}T00:00:00`, timeZone)
  const endDateKey = addCalendarDays(dateTo, 1)
  const end = zonedDateTimeToUtc(`${endDateKey}T00:00:00`, timeZone)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

export function formatInTenantTime(
  value: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = {}
): string {
  const usesStyles = options.dateStyle !== undefined || options.timeStyle !== undefined
  return new Intl.DateTimeFormat(
    'en-US',
    usesStyles
      ? { timeZone, ...options }
      : {
          timeZone,
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          ...options,
        }
  ).format(new Date(value))
}

export function groupDateLabel(value: string, now: Date, timeZone: string): string {
  const current = formatDateKey(now, timeZone)
  const target = formatDateKey(new Date(value), timeZone)
  if (target === current) return 'Today'
  if (target === addCalendarDays(current, -1)) return 'Yesterday'

  const diffDays = Math.round(
    (Date.parse(`${current}T00:00:00Z`) - Date.parse(`${target}T00:00:00Z`)) / 86_400_000
  )
  if (diffDays >= 0 && diffDays < 7) return 'Earlier this week'
  return 'Older'
}

function formatDateKey(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function addCalendarDays(dateKey: string, amount: number): string {
  const date = new Date(`${dateKey}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

function zonedDateTimeToUtc(localIso: string, timeZone: string): Date {
  let guess = new Date(`${localIso}Z`)
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const rendered = partsFor(guess, timeZone)
    const desired = Date.parse(`${localIso}Z`)
    const actual = Date.UTC(
      rendered.year,
      rendered.month - 1,
      rendered.day,
      rendered.hour,
      rendered.minute,
      rendered.second
    )
    guess = new Date(guess.getTime() + (desired - actual))
  }
  return guess
}

function partsFor(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(value)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour) === 24 ? 0 : Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  }
}
