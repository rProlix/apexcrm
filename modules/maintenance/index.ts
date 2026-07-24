import { Wrench } from 'lucide-react'
import type { ModuleDefinition } from '@/modules/shared/moduleTypes'
import { getSupabaseServerClient } from '@/lib/supabase/server'

const ACTIVE_STATUSES = [
  'reported',
  'needs_review',
  'approved',
  'scheduled',
  'waiting_for_parts',
  'in_progress',
  'reopened',
]

export const maintenanceModule: ModuleDefinition = {
  key: 'maintenance',
  label: 'Maintenance',
  description: 'Fleet maintenance reporting, triage, and repair tracking',
  icon: Wrench,
  href: '/dashboard/vehicles/maintenance',
  color: 'text-orange-400',
  bgColor: 'bg-orange-400/10',
  order: 6,

  stats: [
    {
      key: 'maintenance_active',
      label: 'Active Maintenance',
      category: 'operations',
      color: 'text-orange-400',
      emptyMessage: 'No active maintenance items',
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const { count } = await supabase
          .from('fleet_maintenance_items')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .in('status', ACTIVE_STATUSES)
        return count ?? 0
      },
    },
    {
      key: 'maintenance_urgent',
      label: 'Urgent Maintenance',
      category: 'operations',
      color: 'text-red-400',
      emptyMessage: 'No urgent maintenance',
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const { count } = await supabase
          .from('fleet_maintenance_items')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .in('status', ACTIVE_STATUSES)
          .eq('effective_priority', 'urgent')
        return count ?? 0
      },
    },
    {
      key: 'maintenance_waiting_parts',
      label: 'Waiting for Parts',
      category: 'operations',
      color: 'text-yellow-400',
      emptyMessage: 'No parts blockers',
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const { count } = await supabase
          .from('fleet_maintenance_items')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('status', 'waiting_for_parts')
        return count ?? 0
      },
    },
  ],

  async getStats(tenantId) {
    const supabase = getSupabaseServerClient()
    const { data } = await supabase
      .from('fleet_maintenance_items')
      .select('status, effective_priority')
      .eq('tenant_id', tenantId)

    const rows = data ?? []
    const active = rows.filter((row) => ACTIVE_STATUSES.includes(row.status))

    return [
      { label: 'Active', value: active.length },
      {
        label: 'Urgent',
        value: active.filter((row) => row.effective_priority === 'urgent').length,
      },
      {
        label: 'Waiting Parts',
        value: rows.filter((row) => row.status === 'waiting_for_parts').length,
      },
    ]
  },
}
