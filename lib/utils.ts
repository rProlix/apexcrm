import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge Tailwind class names safely */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/** Format cents to currency string: 4990 → "$49.90" */
export function formatCurrency(cents: number, currency = 'usd'): string {
  return new Intl.NumberFormat('en-US', {
    style:    'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(cents / 100)
}

/** Format an ISO date string to a human-readable short date */
export function formatDate(iso: string, opts?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day:   'numeric',
    year:  'numeric',
    ...opts,
  }).format(new Date(iso))
}

/** Format an ISO date to relative time: "2 days ago", "in 3 hours" */
export function formatRelative(iso: string): string {
  const rtf  = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  const diff  = (new Date(iso).getTime() - Date.now()) / 1000

  if (Math.abs(diff) < 60)    return rtf.format(Math.round(diff), 'second')
  if (Math.abs(diff) < 3600)  return rtf.format(Math.round(diff / 60), 'minute')
  if (Math.abs(diff) < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  return rtf.format(Math.round(diff / 86400), 'day')
}

/** Truncate a string with ellipsis */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return `${str.slice(0, maxLength - 1)}…`
}

/** Extract initials from a full name: "John Doe" → "JD" */
export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join('')
}

/** Sleep for ms milliseconds (useful in dev/testing) */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Return a status color class for badge styling */
export function statusColor(status: string): string {
  const map: Record<string, string> = {
    active:    'text-emerald-400',
    confirmed: 'text-emerald-400',
    completed: 'text-emerald-400',
    available: 'text-emerald-400',
    scheduled: 'text-blue-400',
    pending:   'text-yellow-400',
    new:       'text-yellow-400',
    contacted: 'text-blue-400',
    qualified: 'text-purple-400',
    rented:    'text-blue-400',
    suspended: 'text-red-400',
    cancelled: 'text-red-400',
    failed:    'text-red-400',
    lost:      'text-red-400',
    retired:   'text-graphite-400',
    maintenance:'text-orange-400',
  }
  return map[status] ?? 'text-graphite-400'
}
