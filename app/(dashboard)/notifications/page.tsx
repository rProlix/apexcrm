import Link from 'next/link'
import { Bell, Settings } from 'lucide-react'
import { loadNotifications } from '@/lib/command-center/notifications'
import { formatInTenantTime } from '@/lib/command-center/time'
import { requireCommandCenterContext, isTenantAdmin } from '@/lib/command-center/context'
import { MarkNotificationRead } from '@/components/command-center/NotificationActions'

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
  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gold-300/70">
            Command center
          </p>
          <h1 className="mt-1 text-2xl font-bold text-white">Notifications</h1>
          <p className="mt-2 text-sm text-white/45">
            {unread} unread notification{unread === 1 ? '' : 's'} from active modules.
          </p>
        </div>
        {isTenantAdmin(context.role) && (
          <Link
            href="/settings/notifications"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/55 hover:text-white"
          >
            <Settings className="h-3.5 w-3.5" />
            Notification rules
          </Link>
        )}
      </header>
      {notificationLoadFailed && (
        <div
          role="alert"
          className="rounded-xl border border-red-500/20 bg-red-500/5 p-5 text-sm text-red-200/75"
        >
          We couldn’t load notifications.
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-graphite-900/60">
        {notifications.length === 0 && !notificationLoadFailed && (
          <div className="p-12 text-center">
            <Bell className="mx-auto h-6 w-6 text-white/20" />
            <p className="mt-3 text-sm text-white/40">No notifications yet.</p>
          </div>
        )}
        {notifications.map((notification, index) => (
          <article
            key={notification.id}
            className={`p-4 ${index > 0 ? 'border-t border-white/5' : ''} ${notification.read_at ? 'opacity-60' : ''}`}
          >
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${notification.read_at ? 'bg-white/15' : 'bg-gold-400'}`}
                  />
                  <h2 className="text-sm font-medium text-white/75">{notification.title}</h2>
                </div>
                <p className="mt-1 pl-4 text-xs leading-5 text-white/40">{notification.body}</p>
                <p className="mt-2 pl-4 text-2xs capitalize text-white/25">
                  {notification.module_key.replace('_', ' ')} ·{' '}
                  {formatInTenantTime(notification.created_at, context.timeZone)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {notification.source_href && (
                  <Link href={notification.source_href} className="text-xs text-gold-400">
                    Open
                  </Link>
                )}
                {!notification.read_at && <MarkNotificationRead id={notification.id} />}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
