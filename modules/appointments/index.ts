// modules/appointments/index.ts
import { CalendarDays } from 'lucide-react'
import type { ModuleDefinition } from '@/modules/shared/moduleTypes'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export const appointmentsModule: ModuleDefinition = {
  key:         'appointments',
  label:       'Appointments',
  description: 'Schedule and manage service bookings',
  icon:        CalendarDays,
  href:        '/appointments',
  color:       'text-gold-400',
  bgColor:     'bg-gold-400/10',
  order:       2,

  stats: [
    {
      key:          'appts_upcoming',
      label:        'Upcoming',
      category:     'operations',
      color:        'text-gold-400',
      emptyMessage: 'No upcoming appointments',
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const { count } = await supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .gt('starts_at', new Date().toISOString())
          .neq('status', 'canceled')
        return count ?? 0
      },
    },
    {
      key:          'appts_today',
      label:        'Today',
      category:     'operations',
      color:        'text-sky-400',
      emptyMessage: 'Nothing scheduled today',
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const today = new Date().toISOString().slice(0, 10)
        const { data } = await supabase
          .from('appointments')
          .select('starts_at')
          .eq('tenant_id', tenantId)
          .neq('status', 'canceled')
        return (data ?? []).filter((a) => a.starts_at.slice(0, 10) === today).length
      },
    },
    {
      key:          'appts_completed',
      label:        'Completed',
      category:     'usage',
      color:        'text-emerald-400',
      emptyMessage: 'No completed appointments yet',
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const { count } = await supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('status', 'completed')
        return count ?? 0
      },
    },
    {
      key:          'appts_pending',
      label:        'Pending Review',
      category:     'operations',
      color:        'text-amber-400',
      emptyMessage: 'No pending appointments',
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const { count } = await supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('status', 'pending')
        return count ?? 0
      },
    },
  ],

  async getStats(tenantId) {
    const supabase = getSupabaseServerClient()
    const now = new Date().toISOString()

    const { data } = await supabase
      .from('appointments')
      .select('status, starts_at')
      .eq('tenant_id', tenantId)

    if (!data) return []

    const upcoming  = data.filter((a) => a.starts_at > now && a.status !== 'canceled')
    const today     = data.filter((a) => a.starts_at.slice(0, 10) === now.slice(0, 10))
    const confirmed = data.filter((a) => a.status === 'confirmed')

    return [
      { label: 'Upcoming',  value: upcoming.length  },
      { label: 'Today',     value: today.length      },
      { label: 'Confirmed', value: confirmed.length  },
    ]
  },
}
