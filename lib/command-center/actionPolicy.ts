import type { AnyRole } from '@/lib/auth/types'
import type { ActionItem, CommandActionStatus, CommandPriority } from './types'

const OPEN_STATUSES: CommandActionStatus[] = ['open', 'in_progress', 'snoozed']

export interface ActionFilterQuery {
  search?: string
  status?: string
  priority?: string
  module?: string
  sourceType?: string
  assignedToMe?: boolean
  overdue?: boolean
  needsReview?: boolean
  sort?: 'priority' | 'due' | 'newest' | 'oldest' | 'activity'
}

export function canRoleSeeAction(
  item: Pick<ActionItem, 'assignedRole' | 'assignedUserId'>,
  userId: string,
  role: AnyRole
): boolean {
  if (['owner', 'admin', 'manager'].includes(role)) return true
  if (role !== 'staff') return false
  if (item.assignedRole === 'admin' || item.assignedRole === 'manager') return false
  return !item.assignedUserId || item.assignedUserId === userId
}

export function filterAndSortActionItems(
  items: ActionItem[],
  query: ActionFilterQuery,
  currentUserId: string,
  now = new Date()
): ActionItem[] {
  const search = query.search?.trim().toLocaleLowerCase() ?? ''
  const status = query.status || 'open'

  return items
    .filter((item) => {
      if (status === 'open' && !OPEN_STATUSES.includes(item.status)) return false
      if (status && status !== 'all' && status !== 'open' && item.status !== status) return false
      if (query.priority && query.priority !== 'all' && item.priority !== query.priority)
        return false
      if (query.module && query.module !== 'all' && item.moduleKey !== query.module) return false
      if (
        query.sourceType &&
        query.sourceType !== 'all' &&
        item.sourceRecordType !== query.sourceType
      ) {
        return false
      }
      if (query.assignedToMe && item.assignedUserId !== currentUserId) return false
      if (query.overdue && (!item.dueAt || new Date(item.dueAt) >= now)) return false
      if (query.needsReview && !/review|confirmation/i.test(item.actionType)) return false
      if (
        search &&
        ![
          item.title,
          item.description,
          item.sourceRecordLabel ?? '',
          item.moduleKey,
          item.sourceRecordType,
        ]
          .join(' ')
          .toLocaleLowerCase()
          .includes(search)
      ) {
        return false
      }
      return true
    })
    .sort(actionComparator(query.sort ?? 'priority'))
}

function actionComparator(sort: NonNullable<ActionFilterQuery['sort']>) {
  const priorities: Record<CommandPriority, number> = {
    urgent: 0,
    high: 1,
    normal: 2,
    low: 3,
  }
  return (a: ActionItem, b: ActionItem): number => {
    if (sort === 'due') {
      return safeTime(a.dueAt, Number.MAX_SAFE_INTEGER) - safeTime(b.dueAt, Number.MAX_SAFE_INTEGER)
    }
    if (sort === 'newest') return safeTime(b.firstDetectedAt, 0) - safeTime(a.firstDetectedAt, 0)
    if (sort === 'oldest') return safeTime(a.firstDetectedAt, 0) - safeTime(b.firstDetectedAt, 0)
    if (sort === 'activity') {
      return safeTime(b.latestActivityAt, 0) - safeTime(a.latestActivityAt, 0)
    }
    return (
      priorities[a.priority] - priorities[b.priority] ||
      safeTime(a.dueAt, Number.MAX_SAFE_INTEGER) - safeTime(b.dueAt, Number.MAX_SAFE_INTEGER) ||
      safeTime(a.firstDetectedAt, 0) - safeTime(b.firstDetectedAt, 0)
    )
  }
}

function safeTime(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? fallback : time
}
