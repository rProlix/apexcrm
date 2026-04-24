import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { WidgetDefinition, WidgetData } from '@/lib/dashboard/types'

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
    key:            'stat_vehicles_total',
    label:          'Total Vehicles',
    type:           'stat',
    description:    'Number of vehicles in fleet',
    moduleKey:      'vehicles',
    defaultSection: 'operations',
    async fetcher(tenantId) {
      const supabase = getSupabaseServerClient()
      const { count } = await supabase
        .from('vehicles')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
      return { type: 'stat', value: count ?? 0, formatted: String(count ?? 0), label: 'Total Vehicles', color: 'text-gold-400' }
    },
  },

  stat_vehicles_available: {
    key:            'stat_vehicles_available',
    label:          'Available Fleet',
    type:           'stat',
    description:    'Vehicles ready to rent',
    moduleKey:      'vehicles',
    defaultSection: 'operations',
    async fetcher(tenantId) {
      const supabase = getSupabaseServerClient()
      const { count } = await supabase
        .from('vehicles')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'available')
      return { type: 'stat', value: count ?? 0, formatted: String(count ?? 0), label: 'Available', color: 'text-emerald-400' }
    },
  },

  // ── Appointments ───────────────────────────────────────────────

  stat_appts_upcoming: {
    key:            'stat_appts_upcoming',
    label:          'Upcoming Appointments',
    type:           'stat',
    description:    'Confirmed future bookings',
    moduleKey:      'appointments',
    defaultSection: 'operations',
    async fetcher(tenantId) {
      const supabase = getSupabaseServerClient()
      const { count } = await supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .gt('starts_at', new Date().toISOString())
        .neq('status', 'cancelled')
      return { type: 'stat', value: count ?? 0, formatted: String(count ?? 0), label: 'Upcoming', color: 'text-blue-400' }
    },
  },

  stat_appts_today: {
    key:            'stat_appts_today',
    label:          'Today\'s Schedule',
    type:           'stat',
    description:    'Appointments today',
    moduleKey:      'appointments',
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
      return { type: 'stat', value: count, formatted: String(count), label: 'Today', color: 'text-sky-400' }
    },
  },

  stat_returning_customers: {
    key:            'stat_returning_customers',
    label:          'Returning Customers',
    type:           'stat',
    description:    'Customers with 2+ visits',
    moduleKey:      'appointments',
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
      return { type: 'stat', value: returning, formatted: String(returning), label: 'Returning', color: 'text-purple-400' }
    },
  },

  // ── Payments ───────────────────────────────────────────────────

  stat_revenue_month: {
    key:            'stat_revenue_month',
    label:          'Monthly Revenue',
    type:           'stat',
    description:    'Completed payments this month',
    moduleKey:      'payments',
    defaultSection: 'financial',
    async fetcher(tenantId) {
      const supabase  = getSupabaseServerClient()
      const monthStart = new Date()
      monthStart.setDate(1)
      monthStart.setHours(0, 0, 0, 0)
      const { data } = await supabase
        .from('payments')
        .select('amount_cents')
        .eq('tenant_id', tenantId)
        .eq('status', 'completed')
        .gte('created_at', monthStart.toISOString())
      const total  = (data ?? []).reduce((s, p) => s + p.amount_cents, 0)
      const formatted = `$${(total / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      return { type: 'stat', value: total / 100, formatted, label: 'Monthly Revenue', color: 'text-emerald-400' }
    },
  },

  stat_revenue_total: {
    key:            'stat_revenue_total',
    label:          'Total Revenue',
    type:           'stat',
    description:    'All-time completed revenue',
    moduleKey:      'payments',
    defaultSection: 'financial',
    async fetcher(tenantId) {
      const supabase = getSupabaseServerClient()
      const { data } = await supabase
        .from('payments')
        .select('amount_cents')
        .eq('tenant_id', tenantId)
        .eq('status', 'completed')
      const total     = (data ?? []).reduce((s, p) => s + p.amount_cents, 0)
      const formatted = `$${(total / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      return { type: 'stat', value: total / 100, formatted, label: 'Total Revenue', color: 'text-gold-400' }
    },
  },

  stat_outstanding: {
    key:            'stat_outstanding',
    label:          'Outstanding Balance',
    type:           'stat',
    description:    'Pending payments',
    moduleKey:      'payments',
    defaultSection: 'financial',
    async fetcher(tenantId) {
      const supabase = getSupabaseServerClient()
      const { data } = await supabase
        .from('payments')
        .select('amount_cents')
        .eq('tenant_id', tenantId)
        .eq('status', 'pending')
      const total     = (data ?? []).reduce((s, p) => s + p.amount_cents, 0)
      const formatted = `$${(total / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      return { type: 'stat', value: total / 100, formatted, label: 'Outstanding', color: 'text-yellow-400' }
    },
  },

  // ── Leads ──────────────────────────────────────────────────────

  stat_leads_new: {
    key:            'stat_leads_new',
    label:          'New Leads',
    type:           'stat',
    description:    'Uncontacted leads',
    moduleKey:      'leads',
    defaultSection: 'operations',
    async fetcher(tenantId) {
      const supabase = getSupabaseServerClient()
      const { count } = await supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'new')
      return { type: 'stat', value: count ?? 0, formatted: String(count ?? 0), label: 'New Leads', color: 'text-purple-400' }
    },
  },

  // ── Rewards ────────────────────────────────────────────────────

  stat_rewards_members: {
    key:            'stat_rewards_members',
    label:          'Loyalty Members',
    type:           'stat',
    description:    'Active rewards members',
    moduleKey:      'rewards',
    defaultSection: 'usage',
    async fetcher(tenantId) {
      const supabase = getSupabaseServerClient()
      const { count } = await supabase
        .from('reward_points')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
      return { type: 'stat', value: count ?? 0, formatted: String(count ?? 0), label: 'Members', color: 'text-yellow-400' }
    },
  },

  // ── Charts ─────────────────────────────────────────────────────

  chart_revenue_trend: {
    key:            'chart_revenue_trend',
    label:          'Revenue Trend',
    type:           'chart',
    description:    '30-day revenue chart',
    moduleKey:      'payments',
    defaultSection: 'financial',
    async fetcher(tenantId) {
      const supabase     = getSupabaseServerClient()
      const thirtyAgo    = new Date()
      thirtyAgo.setDate(thirtyAgo.getDate() - 30)
      const { data }     = await supabase
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
        type:   'chart',
        label:  'Revenue (30d)',
        points: Object.entries(buckets).map(([date, value]) => ({ date, value: Math.round(value * 100) / 100 })),
        color:  '#c9a84c',
      }
    },
  },

  chart_appts_trend: {
    key:            'chart_appts_trend',
    label:          'Appointment Trend',
    type:           'chart',
    description:    '30-day booking chart',
    moduleKey:      'appointments',
    defaultSection: 'operations',
    async fetcher(tenantId) {
      const supabase  = getSupabaseServerClient()
      const thirtyAgo = new Date()
      thirtyAgo.setDate(thirtyAgo.getDate() - 30)
      const { data }  = await supabase
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
        type:   'chart',
        label:  'Bookings (30d)',
        points: Object.entries(buckets).map(([date, value]) => ({ date, value })),
        color:  '#60a5fa',
      }
    },
  },

  // ── Usage ──────────────────────────────────────────────────────

  widget_usage_cost: {
    key:            'widget_usage_cost',
    label:          'Usage & Cost',
    type:           'usage',
    description:    'Module usage breakdown for this billing cycle',
    defaultSection: 'usage',
    async fetcher(tenantId) {
      const supabase  = getSupabaseServerClient()
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
        vehicles:     '#c9a84c',
        payments:     '#34d399',
        appointments: '#60a5fa',
        rewards:      '#fbbf24',
        leads:        '#a78bfa',
        messages:     '#38bdf8',
        damage_ai:    '#fb7185',
        contacts:     '#2dd4bf',
      }

      const total_cents = Object.values(byModule).reduce((s, v) => s + v, 0)
      const items = Object.entries(byModule)
        .sort(([, a], [, b]) => b - a)
        .map(([label, cents]) => ({ label, cents, color: colors[label] ?? '#6b7280' }))

      return { type: 'usage', label: 'Usage & Cost', total_cents, items }
    },
  },

  widget_usage_chart: {
    key:            'widget_usage_chart',
    label:          'Usage Over Time',
    type:           'chart',
    description:    'Daily usage events (30 days)',
    defaultSection: 'usage',
    async fetcher(tenantId) {
      const supabase  = getSupabaseServerClient()
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
        type:   'chart',
        label:  'Usage Events (30d)',
        points: Object.entries(buckets).map(([date, value]) => ({ date, value })),
        color:  '#a78bfa',
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
