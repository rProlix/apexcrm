import type { ActivityItem } from './types'
import { getTenantDateRange } from './time'

export interface ActivityFilterQuery {
  search?: string
  module?: string
  actor?: string
  actionType?: string
  dateFrom?: string
  dateTo?: string
  timeZone?: string
}

export function filterActivityItems(
  items: ActivityItem[],
  query: ActivityFilterQuery
): ActivityItem[] {
  const search = query.search?.trim().toLocaleLowerCase() ?? ''
  const range =
    query.dateFrom && query.dateTo && query.timeZone
      ? getTenantDateRange(query.dateFrom, query.dateTo, query.timeZone)
      : null
  const from = range
    ? new Date(range.startIso).getTime()
    : query.dateFrom
      ? new Date(`${query.dateFrom}T00:00:00Z`).getTime()
      : null
  const to = range
    ? new Date(range.endIso).getTime() - 1
    : query.dateTo
      ? new Date(`${query.dateTo}T23:59:59.999Z`).getTime()
      : null

  return items
    .filter((item) => {
      if (query.module && query.module !== 'all' && item.moduleKey !== query.module) return false
      if (query.actor && query.actor !== 'all' && item.actor !== query.actor) return false
      if (query.actionType && query.actionType !== 'all' && item.actionType !== query.actionType) {
        return false
      }
      const occurred = new Date(item.occurredAt).getTime()
      if (from !== null && occurred < from) return false
      if (to !== null && occurred > to) return false
      if (
        search &&
        !`${item.actor} ${item.title} ${item.description}`.toLocaleLowerCase().includes(search)
      ) {
        return false
      }
      return true
    })
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
}
