export const dynamic = 'force-dynamic'

import { MessageSquare, Send, Inbox, Clock } from 'lucide-react'
import { requirePermission } from '@/lib/auth/requirePermission'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export const metadata = { title: 'Messages — ApexCRM' }

interface MessageCounts {
  total:    number
  unread:   number
  sent:     number
  pending:  number
}

async function getMessageCounts(tenantId: string): Promise<MessageCounts> {
  try {
    const db = getSupabaseServerClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (db as any)
      .from('messages')
      .select('status, direction')
      .eq('tenant_id', tenantId)

    if (!data) return { total: 0, unread: 0, sent: 0, pending: 0 }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = data as any[]
    return {
      total:   rows.length,
      unread:  rows.filter((m) => m.status === 'unread').length,
      sent:    rows.filter((m) => m.direction === 'outbound').length,
      pending: rows.filter((m) => m.status === 'pending').length,
    }
  } catch {
    return { total: 0, unread: 0, sent: 0, pending: 0 }
  }
}

export default async function MessagesPage() {
  const ctx = await requirePermission('use_modules')
  const tenantId = ctx.tenant_id!

  await guardModuleAccess(tenantId, 'messages', ctx.role)

  const counts = await getMessageCounts(tenantId)

  const stats = [
    { label: 'Total',    value: counts.total,   icon: MessageSquare, color: 'text-blue-400',   bg: 'bg-blue-400/10'   },
    { label: 'Unread',   value: counts.unread,  icon: Inbox,         color: 'text-amber-400',  bg: 'bg-amber-400/10'  },
    { label: 'Sent',     value: counts.sent,    icon: Send,          color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
    { label: 'Pending',  value: counts.pending, icon: Clock,         color: 'text-orange-400', bg: 'bg-orange-400/10' },
  ]

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Messages</h1>
        <p className="text-sm text-white/40 mt-1">Customer communications and messaging</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="rounded-xl bg-graphite-800 border border-graphite-600 p-4">
            <div className={`inline-flex items-center justify-center h-9 w-9 rounded-lg ${bg} mb-3`}>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <p className="text-2xl font-bold text-white">{value}</p>
            <p className="text-xs text-white/40 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-graphite-800 border border-graphite-600 p-8 text-center">
        <MessageSquare className="h-10 w-10 text-blue-400/60 mx-auto mb-3" />
        <p className="text-white/60 text-sm">
          {counts.total === 0
            ? 'No messages yet. They will appear here once sent or received.'
            : `${counts.total} message${counts.total === 1 ? '' : 's'} — full messaging UI coming soon.`}
        </p>
      </div>
    </div>
  )
}
