import 'server-only'

import type { Json } from '@/lib/supabase/types'
import { requireCommandCenterContext, type CommandCenterContext } from './context'
import { getTenantDayRange } from './time'
import type { DailySummary, DailySummaryBullet } from './types'

export async function loadDailySummary(
  suppliedContext?: CommandCenterContext
): Promise<DailySummary> {
  const context = suppliedContext ?? (await requireCommandCenterContext('view_dashboard'))
  const range = getTenantDayRange(new Date(), context.timeZone)
  const sections: DailySummary['sections'] = []

  try {
    for (const moduleKey of context.activeModuleKeys) {
      const section = await loadModuleSection(context, moduleKey, range)
      if (section && section.bullets.length > 0) sections.push(section)
    }

    const { data: urgentActions, error } = await context.db
      .from('command_action_items')
      .select('id, module_key, title, metadata, priority')
      .eq('tenant_id', context.tenantId)
      .in('module_key', context.activeModuleKeys)
      .in('status', ['open', 'in_progress', 'snoozed'])
      .in('priority', ['urgent', 'high'])
      .order('first_detected_at', { ascending: true })
      .limit(10)
    if (error) throw new Error(error.code)

    const criticalAlerts: DailySummaryBullet[] = (urgentActions ?? []).map((action) => {
      const metadata = asRecord(action.metadata)
      return {
        id: `action:${action.id}`,
        moduleKey: action.module_key,
        text: action.title,
        value: action.priority,
        href: typeof metadata.href === 'string' ? metadata.href : '/actions',
        critical: action.priority === 'urgent',
      }
    })
    const suggestedNextActions = criticalAlerts.slice(0, 4).map((alert) => ({
      label: alert.text,
      href: alert.href,
    }))

    return {
      dateLabel: range.label,
      startIso: range.startIso,
      endIso: range.endIso,
      timeZone: context.timeZone,
      sections,
      criticalAlerts,
      suggestedNextActions,
      freshnessTimestamp: new Date().toISOString(),
      state: sections.length === 0 && criticalAlerts.length === 0 ? 'empty' : 'ready',
    }
  } catch (error) {
    console.error('[command-center:daily-summary] load failed', {
      error: error instanceof Error ? error.message : 'unknown',
    })
    return {
      dateLabel: range.label,
      startIso: range.startIso,
      endIso: range.endIso,
      timeZone: context.timeZone,
      sections: [],
      criticalAlerts: [],
      suggestedNextActions: [],
      freshnessTimestamp: new Date().toISOString(),
      state: 'error',
    }
  }
}

async function loadModuleSection(
  context: CommandCenterContext,
  moduleKey: string,
  range: ReturnType<typeof getTenantDayRange>
): Promise<DailySummary['sections'][number] | null> {
  if (moduleKey === 'damage_ai') {
    const [{ count: inspections, error }, { count: needsReview, error: reviewError }] =
      await Promise.all([
        context.db
          .from('van_damage_inspections')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', context.tenantId)
          .gte('created_at', range.startIso)
          .lt('created_at', range.endIso),
        context.db
          .from('van_damage_inspections')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', context.tenantId)
          .in('status', ['needs_review', 'failed'])
          .gte('created_at', range.startIso)
          .lt('created_at', range.endIso),
      ])
    if (error || reviewError) throw new Error(error?.code ?? reviewError?.code)
    return section('damage_ai', 'Van Damage AI', [
      countBullet(
        'damage:inspections',
        'damage_ai',
        inspections,
        'inspection received',
        'inspections received',
        '/dashboard/damage-ai'
      ),
      countBullet(
        'damage:review',
        'damage_ai',
        needsReview,
        'inspection needs review',
        'inspections need review',
        '/actions?module=damage_ai'
      ),
    ])
  }

  if (moduleKey === 'maintenance') {
    const [
      { count: created, error },
      { count: completed, error: completedError },
      { count: urgent, error: urgentError },
    ] = await Promise.all([
      context.db
        .from('fleet_maintenance_items')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', context.tenantId)
        .gte('created_at', range.startIso)
        .lt('created_at', range.endIso),
      context.db
        .from('fleet_maintenance_items')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', context.tenantId)
        .gte('completed_at', range.startIso)
        .lt('completed_at', range.endIso),
      context.db
        .from('fleet_maintenance_items')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', context.tenantId)
        .eq('effective_priority', 'urgent')
        .in('status', [
          'reported',
          'needs_review',
          'approved',
          'scheduled',
          'waiting_for_parts',
          'in_progress',
          'reopened',
        ]),
    ])
    if (error || completedError || urgentError) {
      throw new Error(error?.code ?? completedError?.code ?? urgentError?.code)
    }
    return section('maintenance', 'Maintenance', [
      countBullet(
        'maintenance:created',
        'maintenance',
        created,
        'maintenance item created',
        'maintenance items created',
        '/dashboard/vehicles/maintenance'
      ),
      countBullet(
        'maintenance:completed',
        'maintenance',
        completed,
        'maintenance item completed',
        'maintenance items completed',
        '/dashboard/vehicles/maintenance'
      ),
      countBullet(
        'maintenance:urgent',
        'maintenance',
        urgent,
        'urgent maintenance item is open',
        'urgent maintenance items are open',
        '/actions?module=maintenance',
        true
      ),
    ])
  }

  if (moduleKey === 'appointments') {
    const { data, error } = await context.db
      .from('appointments')
      .select('status')
      .eq('tenant_id', context.tenantId)
      .gte('starts_at', range.startIso)
      .lt('starts_at', range.endIso)
    if (error) throw new Error(error.code)
    const rows = data ?? []
    return section('appointments', 'Appointments', [
      countBullet(
        'appointments:scheduled',
        'appointments',
        rows.length,
        'appointment scheduled',
        'appointments scheduled',
        '/appointments'
      ),
      countBullet(
        'appointments:completed',
        'appointments',
        rows.filter((row) => row.status === 'completed').length,
        'appointment completed',
        'appointments completed',
        '/appointments/list'
      ),
      countBullet(
        'appointments:cancelled',
        'appointments',
        rows.filter((row) => row.status === 'cancelled').length,
        'appointment cancelled',
        'appointments cancelled',
        '/appointments/list'
      ),
      countBullet(
        'appointments:noshow',
        'appointments',
        rows.filter((row) => /no.?show/i.test(row.status)).length,
        'no-show needs follow-up',
        'no-shows need follow-up',
        '/actions?module=appointments',
        true
      ),
    ])
  }

  if (moduleKey === 'store') {
    const { data, error } = await context.db
      .from('orders')
      .select('status, total_amount')
      .eq('tenant_id', context.tenantId)
      .gte('created_at', range.startIso)
      .lt('created_at', range.endIso)
    if (error) throw new Error(error.code)
    const orders = data ?? []
    const revenue = orders
      .filter((order) => /paid|completed|fulfilled/i.test(order.status))
      .reduce((sum, order) => sum + (Number(order.total_amount) || 0), 0)
    const needsFulfillment = orders.filter((order) =>
      /paid|processing|pending_fulfillment/i.test(order.status)
    ).length
    return section('store', 'Store', [
      countBullet(
        'store:orders',
        'store',
        orders.length,
        'order received',
        'orders received',
        '/store/orders'
      ),
      revenue > 0
        ? {
            id: 'store:revenue',
            moduleKey: 'store',
            text: `${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(revenue)} recorded revenue`,
            value: revenue,
            href: '/store/orders',
          }
        : null,
      countBullet(
        'store:fulfillment',
        'store',
        needsFulfillment,
        'order needs fulfillment',
        'orders need fulfillment',
        '/actions?module=store',
        needsFulfillment > 0
      ),
    ])
  }

  if (moduleKey === 'payments') {
    const { data, error } = await context.db
      .from('payments')
      .select('status, amount_cents')
      .eq('tenant_id', context.tenantId)
      .gte('created_at', range.startIso)
      .lt('created_at', range.endIso)
    if (error) throw new Error(error.code)
    const payments = data ?? []
    return section('payments', 'Payments', [
      countBullet(
        'payments:activity',
        'payments',
        payments.length,
        'payment recorded',
        'payments recorded',
        '/payments'
      ),
      countBullet(
        'payments:failed',
        'payments',
        payments.filter((payment) => payment.status === 'failed').length,
        'payment failed',
        'payments failed',
        '/actions?module=payments',
        true
      ),
    ])
  }

  if (moduleKey === 'customers') {
    const { count, error } = await context.db
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', context.tenantId)
      .gte('created_at', range.startIso)
      .lt('created_at', range.endIso)
    if (error) throw new Error(error.code)
    return section('customers', 'Customers', [
      countBullet(
        'customers:new',
        'customers',
        count,
        'customer added',
        'customers added',
        '/customers'
      ),
    ])
  }

  if (moduleKey === 'website') {
    const { count, error } = await context.db
      .from('site_pages')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', context.tenantId)
      .gte('updated_at', range.startIso)
      .lt('updated_at', range.endIso)
    if (error) throw new Error(error.code)
    return section('website', 'Website', [
      countBullet(
        'website:pages',
        'website',
        count,
        'website page changed',
        'website pages changed',
        '/website'
      ),
    ])
  }

  if (moduleKey === 'vehicles') {
    const { count, error } = await context.db
      .from('vehicles')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', context.tenantId)
      .gte('created_at', range.startIso)
      .lt('created_at', range.endIso)
    if (error) throw new Error(error.code)
    return section('vehicles', 'Fleet', [
      countBullet(
        'vehicles:new',
        'vehicles',
        count,
        'vehicle added',
        'vehicles added',
        '/dashboard/vehicles'
      ),
    ])
  }

  if (moduleKey === 'rewards') {
    const { count, error } = await context.db
      .from('reward_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', context.tenantId)
      .gte('created_at', range.startIso)
      .lt('created_at', range.endIso)
    if (error) throw new Error(error.code)
    return section('rewards', 'Rewards', [
      countBullet(
        'rewards:redemptions',
        'rewards',
        count,
        'reward redemption requested',
        'reward redemptions requested',
        '/rewards'
      ),
    ])
  }
  return null
}

function section(
  moduleKey: string,
  title: string,
  bullets: Array<DailySummaryBullet | null>
): DailySummary['sections'][number] {
  return {
    moduleKey,
    title,
    bullets: bullets.filter((item): item is DailySummaryBullet => item !== null),
  }
}

function countBullet(
  id: string,
  moduleKey: string,
  count: number | null,
  singular: string,
  plural: string,
  href: string,
  critical = false
): DailySummaryBullet | null {
  const value = count ?? 0
  if (value === 0) return null
  return {
    id,
    moduleKey,
    text: `${value} ${value === 1 ? singular : plural}`,
    value,
    href,
    critical,
  }
}

function asRecord(value: Json): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
