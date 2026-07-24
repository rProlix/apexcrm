import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { WidgetDefinition } from '@/lib/dashboard/types'

// ─── helpers ─────────────────────────────────────────────────────

function dailyBuckets(days = 30): Record<string, number> {
  const map: Record<string, number> = {}
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    map[d.toISOString().slice(0, 10)] = 0
  }
  return map
}

// ─── Registry ────────────────────────────────────────────────────

export const WIDGET_REGISTRY: Record<string, WidgetDefinition> = {
  // ── Fleet ──────────────────────────────────────────────────────

  stat_vehicles_total: {
    key: 'stat_vehicles_total',
    label: 'Total Vehicles',
    type: 'stat',
    description: 'Number of vehicles in fleet',
    moduleKey: 'vehicles',
    requiredPermission: 'use_modules',
    emptyMessage: 'No active vehicles yet',
    priority: 30,
    defaultSection: 'operations',
    async fetcher(tenantId) {
      const supabase = getSupabaseServerClient()
      const { count } = await supabase
        .from('vehicles')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .neq('status', 'retired')
      return {
        type: 'stat',
        value: count ?? 0,
        formatted: String(count ?? 0),
        label: 'Total Vehicles',
        color: 'text-gold-400',
        emptyMessage: 'No active vehicles yet',
      }
    },
  },

  stat_vehicles_available: {
    key: 'stat_vehicles_available',
    label: 'Available Fleet',
    type: 'stat',
    description: 'Vehicles ready to rent',
    moduleKey: 'vehicles',
    requiredPermission: 'use_modules',
    emptyMessage: 'No available vehicles',
    priority: 40,
    defaultSection: 'operations',
    async fetcher(tenantId) {
      const supabase = getSupabaseServerClient()
      const { count } = await supabase
        .from('vehicles')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'available')
      return {
        type: 'stat',
        value: count ?? 0,
        formatted: String(count ?? 0),
        label: 'Available',
        color: 'text-emerald-400',
        emptyMessage: 'No available vehicles',
      }
    },
  },

  stat_maintenance_active: {
    key: 'stat_maintenance_active',
    label: 'Active Maintenance',
    type: 'stat',
    description: 'Open fleet maintenance items',
    moduleKey: 'maintenance',
    requiredPermission: 'use_modules',
    emptyMessage: 'No active maintenance items',
    priority: 20,
    defaultSection: 'operations',
    async fetcher(tenantId) {
      const supabase = getSupabaseServerClient()
      const activeStatuses = [
        'reported',
        'needs_review',
        'approved',
        'scheduled',
        'waiting_for_parts',
        'in_progress',
        'reopened',
      ]
      const { count } = await supabase
        .from('fleet_maintenance_items')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .in('status', activeStatuses)
      return {
        type: 'stat',
        value: count ?? 0,
        formatted: String(count ?? 0),
        label: 'Active Maintenance',
        color: 'text-orange-400',
        emptyMessage: 'No active maintenance items',
      }
    },
  },

  stat_maintenance_urgent: {
    key: 'stat_maintenance_urgent',
    label: 'Urgent Maintenance',
    type: 'stat',
    description: 'Maintenance items with urgent priority',
    moduleKey: 'maintenance',
    requiredPermission: 'use_modules',
    emptyMessage: 'No urgent maintenance',
    priority: 10,
    defaultSection: 'operations',
    async fetcher(tenantId) {
      const supabase = getSupabaseServerClient()
      const activeStatuses = [
        'reported',
        'needs_review',
        'approved',
        'scheduled',
        'waiting_for_parts',
        'in_progress',
        'reopened',
      ]
      const { count } = await supabase
        .from('fleet_maintenance_items')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .in('status', activeStatuses)
        .eq('effective_priority', 'urgent')
      return {
        type: 'stat',
        value: count ?? 0,
        formatted: String(count ?? 0),
        label: 'Urgent Maintenance',
        color: 'text-red-400',
        emptyMessage: 'No urgent maintenance',
      }
    },
  },

  stat_damage_inspections_today: {
    key: 'stat_damage_inspections_today',
    label: 'Inspections Today',
    type: 'stat',
    description: 'Van damage inspections received today',
    moduleKey: 'damage_ai',
    requiredPermission: 'use_modules',
    emptyMessage: 'No inspections have been received yet',
    priority: 35,
    defaultSection: 'operations',
    async fetcher(tenantId) {
      const supabase = getSupabaseServerClient()
      const today = new Date().toISOString().slice(0, 10)
      const { count } = await supabase
        .from('van_damage_inspections')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .gte('created_at', `${today}T00:00:00.000Z`)
      return {
        type: 'stat',
        value: count ?? 0,
        formatted: String(count ?? 0),
        label: 'Inspections Today',
        color: 'text-rose-400',
        emptyMessage: 'No inspections have been received yet',
      }
    },
  },

  stat_damage_needs_review: {
    key: 'stat_damage_needs_review',
    label: 'Damage Needs Review',
    type: 'stat',
    description: 'Inspections waiting for human review',
    moduleKey: 'damage_ai',
    requiredPermission: 'use_modules',
    emptyMessage: 'No inspections need review',
    priority: 25,
    defaultSection: 'operations',
    async fetcher(tenantId) {
      const supabase = getSupabaseServerClient()
      const { count } = await supabase
        .from('van_damage_inspections')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'needs_review')
      return {
        type: 'stat',
        value: count ?? 0,
        formatted: String(count ?? 0),
        label: 'Damage Needs Review',
        color: 'text-orange-400',
        emptyMessage: 'No inspections need review',
      }
    },
  },

  stat_damage_level3_active: {
    key: 'stat_damage_level3_active',
    label: 'Level 3 Damage',
    type: 'stat',
    description: 'Active severe damage cases',
    moduleKey: 'damage_ai',
    requiredPermission: 'use_modules',
    emptyMessage: 'No active Level 3 damage',
    priority: 15,
    defaultSection: 'operations',
    async fetcher(tenantId) {
      const supabase = getSupabaseServerClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count } = await (supabase as any)
        .from('van_damage_cases')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .in('current_severity', ['high', 'critical', 'level_3'])
        .not('lifecycle_status', 'in', '(dismissed,false_positive,repaired,resolved)')
      return {
        type: 'stat',
        value: count ?? 0,
        formatted: String(count ?? 0),
        label: 'Level 3 Damage',
        color: 'text-red-400',
        emptyMessage: 'No active Level 3 damage',
      }
    },
  },

  // ── Appointments ───────────────────────────────────────────────

  stat_appts_upcoming: {
    key: 'stat_appts_upcoming',
    label: 'Upcoming Appointments',
    type: 'stat',
    description: 'Confirmed future bookings',
    moduleKey: 'appointments',
    requiredPermission: 'use_modules',
    emptyMessage: 'No upcoming appointments yet',
    priority: 50,
    defaultSection: 'operations',
    async fetcher(tenantId) {
      const supabase = getSupabaseServerClient()
      const { count } = await supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .gt('starts_at', new Date().toISOString())
        .neq('status', 'cancelled')
      return {
        type: 'stat',
        value: count ?? 0,
        formatted: String(count ?? 0),
        label: 'Upcoming',
        color: 'text-blue-400',
        emptyMessage: 'No upcoming appointments yet',
      }
    },
  },

  stat_appts_today: {
    key: 'stat_appts_today',
    label: "Today's Schedule",
    type: 'stat',
    description: 'Appointments today',
    moduleKey: 'appointments',
    requiredPermission: 'use_modules',
    emptyMessage: 'No appointments today',
    priority: 45,
    defaultSection: 'operations',
    async fetcher(tenantId) {
      const supabase = getSupabaseServerClient()
      const today = new Date().toISOString().slice(0, 10)
      const { data } = await supabase
        .from('appointments')
        .select('starts_at')
        .eq('tenant_id', tenantId)
        .neq('status', 'cancelled')
      const count = (data ?? []).filter((a) => a.starts_at.slice(0, 10) === today).length
      return {
        type: 'stat',
        value: count,
        formatted: String(count),
        label: 'Today',
        color: 'text-sky-400',
        emptyMessage: 'No appointments today',
      }
    },
  },

  stat_returning_customers: {
    key: 'stat_returning_customers',
    label: 'Returning Customers',
    type: 'stat',
    description: 'Customers with 2+ visits',
    moduleKey: 'appointments',
    requiredPermission: 'view_customers',
    emptyMessage: 'No returning customers yet',
    priority: 90,
    defaultSection: 'usage',
    async fetcher(tenantId) {
      const supabase = getSupabaseServerClient()
      const { data } = await supabase
        .from('appointments')
        .select('customer_id')
        .eq('tenant_id', tenantId)
        .not('customer_id', 'is', null)
      const counts: Record<string, number> = {}
      for (const a of data ?? []) {
        if (a.customer_id) counts[a.customer_id] = (counts[a.customer_id] ?? 0) + 1
      }
      const returning = Object.values(counts).filter((n) => n > 1).length
      return {
        type: 'stat',
        value: returning,
        formatted: String(returning),
        label: 'Returning',
        color: 'text-purple-400',
        emptyMessage: 'No returning customers yet',
      }
    },
  },

  // ── Payments ───────────────────────────────────────────────────

  stat_revenue_month: {
    key: 'stat_revenue_month',
    label: 'Monthly Revenue',
    type: 'stat',
    description: 'Completed payments this month',
    moduleKey: 'payments',
    requiredPermission: 'view_reports',
    emptyMessage: 'No revenue this month',
    priority: 60,
    defaultSection: 'financial',
    async fetcher(tenantId) {
      const supabase = getSupabaseServerClient()
      const monthStart = new Date()
      monthStart.setDate(1)
      monthStart.setHours(0, 0, 0, 0)
      const { data } = await supabase
        .from('payments')
        .select('amount_cents')
        .eq('tenant_id', tenantId)
        .eq('status', 'completed')
        .gte('created_at', monthStart.toISOString())
      const total = (data ?? []).reduce((s, p) => s + p.amount_cents, 0)
      const formatted = `$${(total / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      return {
        type: 'stat',
        value: total / 100,
        formatted,
        label: 'Monthly Revenue',
        color: 'text-emerald-400',
        emptyMessage: 'No revenue this month',
      }
    },
  },

  stat_revenue_total: {
    key: 'stat_revenue_total',
    label: 'Total Revenue',
    type: 'stat',
    description: 'All-time completed revenue',
    moduleKey: 'payments',
    requiredPermission: 'view_reports',
    emptyMessage: 'No completed revenue yet',
    priority: 75,
    defaultSection: 'financial',
    async fetcher(tenantId) {
      const supabase = getSupabaseServerClient()
      const { data } = await supabase
        .from('payments')
        .select('amount_cents')
        .eq('tenant_id', tenantId)
        .eq('status', 'completed')
      const total = (data ?? []).reduce((s, p) => s + p.amount_cents, 0)
      const formatted = `$${(total / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      return {
        type: 'stat',
        value: total / 100,
        formatted,
        label: 'Total Revenue',
        color: 'text-gold-400',
        emptyMessage: 'No completed revenue yet',
      }
    },
  },

  stat_outstanding: {
    key: 'stat_outstanding',
    label: 'Outstanding Balance',
    type: 'stat',
    description: 'Pending payments',
    moduleKey: 'payments',
    requiredPermission: 'view_reports',
    emptyMessage: 'No pending payments',
    priority: 65,
    defaultSection: 'financial',
    async fetcher(tenantId) {
      const supabase = getSupabaseServerClient()
      const { data } = await supabase
        .from('payments')
        .select('amount_cents')
        .eq('tenant_id', tenantId)
        .eq('status', 'pending')
      const total = (data ?? []).reduce((s, p) => s + p.amount_cents, 0)
      const formatted = `$${(total / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      return {
        type: 'stat',
        value: total / 100,
        formatted,
        label: 'Outstanding',
        color: 'text-yellow-400',
        emptyMessage: 'No pending payments',
      }
    },
  },

  // ── Leads ──────────────────────────────────────────────────────

  stat_leads_new: {
    key: 'stat_leads_new',
    label: 'New Leads',
    type: 'stat',
    description: 'Uncontacted leads',
    moduleKey: 'leads',
    requiredPermission: 'use_modules',
    emptyMessage: 'No new leads',
    priority: 70,
    defaultSection: 'operations',
    async fetcher(tenantId) {
      const supabase = getSupabaseServerClient()
      const { count } = await supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'new')
      return {
        type: 'stat',
        value: count ?? 0,
        formatted: String(count ?? 0),
        label: 'New Leads',
        color: 'text-purple-400',
        emptyMessage: 'No new leads',
      }
    },
  },

  stat_customers_total: {
    key: 'stat_customers_total',
    label: 'Active Customers',
    type: 'stat',
    description: 'Tenant customer records currently active',
    moduleKey: 'customers',
    requiredPermission: 'view_customers',
    emptyMessage: 'No customers yet',
    priority: 80,
    defaultSection: 'usage',
    async fetcher(tenantId) {
      const supabase = getSupabaseServerClient()
      const { count } = await supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
      return {
        type: 'stat',
        value: count ?? 0,
        formatted: String(count ?? 0),
        label: 'Active Customers',
        color: 'text-teal-400',
        emptyMessage: 'No customers yet',
      }
    },
  },

  stat_store_orders_today: {
    key: 'stat_store_orders_today',
    label: 'Orders Today',
    type: 'stat',
    description: 'Store orders received today',
    moduleKey: 'store',
    requiredPermission: 'use_modules',
    emptyMessage: 'No orders have been received yet',
    priority: 55,
    defaultSection: 'operations',
    async fetcher(tenantId) {
      const supabase = getSupabaseServerClient()
      const today = new Date().toISOString().slice(0, 10)
      const { count } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .gte('created_at', `${today}T00:00:00.000Z`)
        .not('status', 'in', '(cancelled,refunded,failed,test)')
      return {
        type: 'stat',
        value: count ?? 0,
        formatted: String(count ?? 0),
        label: 'Orders Today',
        color: 'text-amber-400',
        emptyMessage: 'No orders have been received yet',
      }
    },
  },

  stat_store_revenue_today: {
    key: 'stat_store_revenue_today',
    label: 'Store Revenue Today',
    type: 'stat',
    description: 'Paid store revenue received today',
    moduleKey: 'store',
    requiredPermission: 'view_reports',
    emptyMessage: 'No store revenue today',
    priority: 85,
    defaultSection: 'financial',
    async fetcher(tenantId) {
      const supabase = getSupabaseServerClient()
      const today = new Date().toISOString().slice(0, 10)
      const { data } = await supabase
        .from('orders')
        .select('total_amount')
        .eq('tenant_id', tenantId)
        .gte('created_at', `${today}T00:00:00.000Z`)
        .in('status', ['paid', 'completed', 'fulfilled'])
      const total = (data ?? []).reduce((sum, order) => sum + (Number(order.total_amount) || 0), 0)
      const formatted = `$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      return {
        type: 'stat',
        value: total,
        formatted,
        label: 'Store Revenue Today',
        color: 'text-emerald-400',
        emptyMessage: 'No store revenue today',
      }
    },
  },

  stat_website_pages: {
    key: 'stat_website_pages',
    label: 'Website Pages',
    type: 'stat',
    description: 'Published website pages that are not archived',
    moduleKey: 'website',
    requiredPermission: 'use_modules',
    emptyMessage: 'No website pages yet',
    priority: 110,
    defaultSection: 'usage',
    async fetcher(tenantId) {
      const supabase = getSupabaseServerClient()
      const { count } = await supabase
        .from('site_pages')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .neq('status', 'archived')
      return {
        type: 'stat',
        value: count ?? 0,
        formatted: String(count ?? 0),
        label: 'Website Pages',
        color: 'text-violet-400',
        emptyMessage: 'No website pages yet',
      }
    },
  },

  // ── Rewards ────────────────────────────────────────────────────

  stat_rewards_members: {
    key: 'stat_rewards_members',
    label: 'Loyalty Members',
    type: 'stat',
    description: 'Active rewards members',
    moduleKey: 'rewards',
    requiredPermission: 'use_modules',
    emptyMessage: 'No rewards activity yet',
    priority: 95,
    defaultSection: 'usage',
    async fetcher(tenantId) {
      const supabase = getSupabaseServerClient()
      const { count } = await supabase
        .from('reward_points')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
      return {
        type: 'stat',
        value: count ?? 0,
        formatted: String(count ?? 0),
        label: 'Members',
        color: 'text-yellow-400',
        emptyMessage: 'No rewards activity yet',
      }
    },
  },

  // ── Charts ─────────────────────────────────────────────────────

  chart_revenue_trend: {
    key: 'chart_revenue_trend',
    label: 'Revenue Trend',
    type: 'chart',
    description: '30-day revenue chart',
    moduleKey: 'payments',
    requiredPermission: 'view_reports',
    emptyMessage: 'No revenue for this period',
    priority: 120,
    defaultSection: 'financial',
    async fetcher(tenantId) {
      const supabase = getSupabaseServerClient()
      const thirtyAgo = new Date()
      thirtyAgo.setDate(thirtyAgo.getDate() - 30)
      const { data } = await supabase
        .from('payments')
        .select('amount_cents, created_at')
        .eq('tenant_id', tenantId)
        .eq('status', 'completed')
        .gte('created_at', thirtyAgo.toISOString())
      const buckets = dailyBuckets(30)
      for (const p of data ?? []) {
        const day = p.created_at.slice(0, 10)
        if (day in buckets) buckets[day] += p.amount_cents / 100
      }
      return {
        type: 'chart',
        label: 'Revenue (30d)',
        points: Object.entries(buckets).map(([date, value]) => ({
          date,
          value: Math.round(value * 100) / 100,
        })),
        color: '#c9a84c',
      }
    },
  },

  chart_appts_trend: {
    key: 'chart_appts_trend',
    label: 'Appointment Trend',
    type: 'chart',
    description: '30-day booking chart',
    moduleKey: 'appointments',
    requiredPermission: 'use_modules',
    emptyMessage: 'No appointments for this period',
    priority: 130,
    defaultSection: 'operations',
    async fetcher(tenantId) {
      const supabase = getSupabaseServerClient()
      const thirtyAgo = new Date()
      thirtyAgo.setDate(thirtyAgo.getDate() - 30)
      const { data } = await supabase
        .from('appointments')
        .select('starts_at')
        .eq('tenant_id', tenantId)
        .gte('starts_at', thirtyAgo.toISOString())
        .neq('status', 'cancelled')
      const buckets = dailyBuckets(30)
      for (const a of data ?? []) {
        const day = a.starts_at.slice(0, 10)
        if (day in buckets) buckets[day] += 1
      }
      return {
        type: 'chart',
        label: 'Bookings (30d)',
        points: Object.entries(buckets).map(([date, value]) => ({ date, value })),
        color: '#60a5fa',
      }
    },
  },

  // ── Usage ──────────────────────────────────────────────────────

  widget_usage_cost: {
    key: 'widget_usage_cost',
    label: 'Usage & Cost',
    type: 'usage',
    description: 'Module usage breakdown for this billing cycle',
    requiredPermission: 'view_reports',
    tenantFacing: false,
    defaultSection: 'usage',
    async fetcher(tenantId) {
      const supabase = getSupabaseServerClient()
      const monthStart = new Date()
      monthStart.setDate(1)
      monthStart.setHours(0, 0, 0, 0)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: dataRaw } = await (supabase as any)
        .from('usage_events')
        .select('module_key, cost_cents')
        .eq('tenant_id', tenantId)
        .gte('created_at', monthStart.toISOString())

      const data = (dataRaw ?? []) as Array<{ module_key: string; cost_cents: number }>
      const byModule: Record<string, number> = {}
      for (const e of data) {
        byModule[e.module_key] = (byModule[e.module_key] ?? 0) + e.cost_cents
      }

      const colors: Record<string, string> = {
        vehicles: '#c9a84c',
        payments: '#34d399',
        appointments: '#60a5fa',
        rewards: '#fbbf24',
        leads: '#a78bfa',
        messages: '#38bdf8',
        damage_ai: '#fb7185',
        contacts: '#2dd4bf',
      }

      const total_cents = Object.values(byModule).reduce((s, v) => s + v, 0)
      const items = Object.entries(byModule)
        .sort(([, a], [, b]) => b - a)
        .map(([label, cents]) => ({ label, cents, color: colors[label] ?? '#6b7280' }))

      return { type: 'usage', label: 'Usage & Cost', total_cents, items }
    },
  },

  widget_usage_chart: {
    key: 'widget_usage_chart',
    label: 'Usage Over Time',
    type: 'chart',
    description: 'Daily usage events (30 days)',
    requiredPermission: 'view_reports',
    tenantFacing: false,
    defaultSection: 'usage',
    async fetcher(tenantId) {
      const supabase = getSupabaseServerClient()
      const thirtyAgo = new Date()
      thirtyAgo.setDate(thirtyAgo.getDate() - 30)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: usageRaw } = await (supabase as any)
        .from('usage_events')
        .select('created_at, quantity')
        .eq('tenant_id', tenantId)
        .gte('created_at', thirtyAgo.toISOString())
      const usageData = (usageRaw ?? []) as Array<{ created_at: string; quantity: number }>
      const buckets = dailyBuckets(30)
      for (const e of usageData) {
        const day = e.created_at.slice(0, 10)
        if (day in buckets) buckets[day] += e.quantity
      }
      return {
        type: 'chart',
        label: 'Usage Events (30d)',
        points: Object.entries(buckets).map(([date, value]) => ({ date, value })),
        color: '#a78bfa',
      }
    },
  },
}

/** All widget keys that belong to a given module, including module-agnostic ones */
export function getWidgetKeysForModules(enabledModuleKeys: string[]): string[] {
  return Object.values(WIDGET_REGISTRY)
    .filter((w) => !w.moduleKey || enabledModuleKeys.includes(w.moduleKey))
    .map((w) => w.key)
}
