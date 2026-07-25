import Link from 'next/link'
import { Bell, Settings } from 'lucide-react'
import { loadNotifications } from '@/lib/command-center/notifications'
import { formatInTenantTime } from '@/lib/command-center/time'
import { requireCommandCenterContext, isTenantAdmin } from '@/lib/command-center/context'
import { MarkNotificationRead } from '@/components/command-center/NotificationActions'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { EmptyState, ErrorState } from '@/components/ui/StatePanel'

export const dynamic = 'force-dynamic'

export default async function NotificationsPage() {
  const context = await requireCommandCenterContext('view_dashboard')
  let notificationLoadFailed = false
  let result: Awaited<ReturnType<typeof loadNotifications>>
  try {
    result = await loadNotifications()
  } catch {
    notificationLoadFailed = true
    result = { notifications: [], unread: 0 }
  }
  const { notifications, unread } = result
  const groups = Array.from(
    notifications.reduce<Map<string, typeof notifications>>((map, notification) => {
      const label = new Intl.DateTimeFormat('en-US', {
        timeZone: context.timeZone,
        dateStyle: 'medium',
      }).format(new Date(notification.created_at))
      map.set(label, [...(map.get(label) ?? []), notification])
      return map
    }, new Map())
  )
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Command center"
        title="Notifications"
        description="Updates from active modules, organized around the work that matters."
        icon={Bell}
        meta={
          <StatusBadge status={unread > 0 ? 'pending' : 'complete'} label={`${unread} unread`} />
        }
        actions={
          isTenantAdmin(context.role) ? (
            <Link href="/settings/notifications" className="ui-button-secondary text-xs">
              <Settings className="h-3.5 w-3.5" />
              Notification rules
            </Link>
          ) : null
        }
      />
      {notificationLoadFailed && (
        <ErrorState
          title="We couldn’t load notifications"
          description="Try again to refresh updates from active modules."
          compact
        />
      )}
      {notifications.length === 0 && !notificationLoadFailed && (
        <EmptyState
          title="No notifications yet"
          description="New updates from active modules will appear here."
        />
      )}
      {groups.map(([label, group]) => (
        <section key={label}>
          <h2 className="mb-3 text-sm font-medium text-white/45">{label}</h2>
          <div className="ui-surface overflow-hidden">
            {group.map((notification, index) => (
              <article
                key={notification.id}
                className={`p-4 transition-colors ${
                  index > 0 ? 'border-t border-white/[0.06]' : ''
                } ${notification.read_at ? 'bg-transparent' : 'bg-brand/[0.025]'}`}
              >
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          notification.read_at ? 'bg-white/15' : 'bg-brand'
                        }`}
                        aria-label={notification.read_at ? 'Read' : 'Unread'}
                      />
                      <h3 className="text-sm font-medium text-white/78">{notification.title}</h3>
                    </div>
                    <p className="mt-1 pl-4 text-xs leading-5 text-white/40">{notification.body}</p>
                    <p className="mt-2 pl-4 text-2xs capitalize text-white/25">
                      {notification.module_key.replace('_', ' ')} ·{' '}
                      {formatInTenantTime(notification.created_at, context.timeZone)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {notification.source_href && (
                      <Link href={notification.source_href} className="text-xs text-brand">
                        Open
                      </Link>
                    )}
                    {!notification.read_at && <MarkNotificationRead id={notification.id} />}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
