import { MessageSquare } from 'lucide-react'
import type { ModuleDefinition } from '@/modules/shared/moduleTypes'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export const messagesModule: ModuleDefinition = {
  key:         'messages',
  label:       'Messages',
  description: 'Inbox for all customer communications',
  icon:        MessageSquare,
  href:        '/dashboard/messages',
  color:       'text-sky-400',
  bgColor:     'bg-sky-400/10',
  order:       7,

  stats: [
    {
      key:      'messages_unread',
      label:    'Unread',
      category: 'operations',
      color:    'text-sky-400',
      emptyMessage: 'No unread messages',
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const { count } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('direction', 'inbound')
          .eq('status', 'delivered')
        return count ?? 0
      },
    },
    {
      key:      'messages_inbound',
      label:    'Inbound (Total)',
      category: 'usage',
      color:    'text-blue-400',
      emptyMessage: 'No messages received',
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const { count } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('direction', 'inbound')
        return count ?? 0
      },
    },
    {
      key:      'messages_outbound',
      label:    'Sent',
      category: 'usage',
      color:    'text-indigo-400',
      emptyMessage: 'No messages sent',
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const { count } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('direction', 'outbound')
        return count ?? 0
      },
    },
  ],

  async getStats(tenantId) {
    const supabase = getSupabaseServerClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: dataRaw } = await (supabase as any)
      .from('messages')
      .select('direction, status')
      .eq('tenant_id', tenantId)

    const data = (dataRaw ?? []) as Array<{ direction: string; status: string }>
    if (!data.length) return []

    return [
      { label: 'Total',   value: data.length },
      { label: 'Inbound', value: data.filter((m) => m.direction === 'inbound').length },
      { label: 'Unread',  value: data.filter((m) => m.status === 'delivered').length },
    ]
  },
}
