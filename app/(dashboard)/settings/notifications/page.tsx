import { NotificationRuleEditor } from '@/components/command-center/NotificationRuleEditor'
import { isTenantAdmin, requireCommandCenterContext } from '@/lib/command-center/context'
import { loadNotificationSettings } from '@/lib/command-center/notifications'

export const dynamic = 'force-dynamic'

export default async function NotificationSettingsPage() {
  const context = await requireCommandCenterContext('view_modules')
  if (!isTenantAdmin(context.role)) {
    return (
      <div className="rounded-2xl border border-white/10 p-8 text-sm text-white/45">
        Administrator access is required to manage notification rules.
      </div>
    )
  }
  let settings: Awaited<ReturnType<typeof loadNotificationSettings>>
  let users: Array<{ id: string; email: string; role: string }>
  try {
    const [loadedSettings, staffResult] = await Promise.all([
      loadNotificationSettings(),
      context.db
        .from('users')
        .select('id, email, role')
        .eq('tenant_id', context.tenantId)
        .eq('status', 'active')
        .order('email'),
    ])
    if (staffResult.error) throw new Error(staffResult.error.code)
    settings = loadedSettings
    users = staffResult.data ?? []
  } catch {
    return (
      <div className="space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-widest text-gold-300/70">
            Settings
          </p>
          <h1 className="mt-1 text-2xl font-bold text-white">Notification Rules</h1>
        </header>
        <div
          role="alert"
          className="rounded-xl border border-red-500/20 bg-red-500/5 p-5 text-sm text-red-200/75"
        >
          We couldn’t load notification settings.
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-gold-300/70">Settings</p>
        <h1 className="mt-1 text-2xl font-bold text-white">Notification Rules</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/45">
          Choose supported events, recipients, and working delivery channels. Events for inactive
          modules stay hidden.
        </p>
      </header>
      <NotificationRuleEditor
        events={settings.events}
        channels={settings.channels}
        rules={settings.rules}
        users={users}
      />
    </div>
  )
}
