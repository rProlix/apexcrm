import { Car } from 'lucide-react'
import type { ModuleDefinition } from '@/modules/shared/moduleTypes'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export const vehiclesModule: ModuleDefinition = {
  key:         'vehicles',
  label:       'Fleet',
  description: 'Manage vehicles, assignments, and availability',
  icon:        Car,
  href:        '/dashboard/vehicles',
  color:       'text-gold-400',
  bgColor:     'bg-gold-400/10',
  order:       4,

  stats: [
    {
      key:      'vehicles_total',
      label:    'Total Vehicles',
      category: 'operations',
      color:    'text-gold-400',
      emptyMessage: 'No vehicles added yet',
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const { count } = await supabase
          .from('vehicles')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
        return count ?? 0
      },
    },
    {
      key:      'vehicles_available',
      label:    'Available Now',
      category: 'operations',
      color:    'text-emerald-400',
      emptyMessage: 'No vehicles available',
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const { count } = await supabase
          .from('vehicles')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('status', 'available')
        return count ?? 0
      },
    },
    {
      key:      'vehicles_maintenance',
      label:    'In Maintenance',
      category: 'operations',
      color:    'text-orange-400',
      emptyMessage: 'No alerts',
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const { count } = await supabase
          .from('vehicles')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('status', 'maintenance')
        return count ?? 0
      },
    },
    {
      key:      'vehicles_utilization',
      label:    'Fleet Utilization',
      category: 'usage',
      color:    'text-blue-400',
      emptyMessage: 'No data',
      format:   (v) => `${v}%`,
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const { data } = await supabase
          .from('vehicles')
          .select('status')
          .eq('tenant_id', tenantId)
        if (!data || data.length === 0) return 0
        const rented = data.filter((v) => v.status === 'rented').length
        return Math.round((rented / data.length) * 100)
      },
    },
  ],

  async getStats(tenantId) {
    const supabase = getSupabaseServerClient()
    const { data } = await supabase
      .from('vehicles')
      .select('status')
      .eq('tenant_id', tenantId)

    if (!data) return []

    return [
      { label: 'Total',     value: data.length },
      { label: 'Available', value: data.filter((v) => v.status === 'available').length },
      { label: 'Rented',    value: data.filter((v) => v.status === 'rented').length },
    ]
  },
}
