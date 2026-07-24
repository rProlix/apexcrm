import 'server-only'

import { revalidatePath } from 'next/cache'
import type { Json } from '@/lib/supabase/types'
import { recordCommandAudit } from './audit'
import {
  assertActiveModule,
  isTenantAdmin,
  requireCommandCenterContext,
  type CommandCenterContext,
} from './context'
import type { ActionCandidate, ActionItem, CommandActionStatus, CommandPriority } from './types'
import { emitNotificationEvent } from './notifications'
import { canRoleSeeAction, filterAndSortActionItems, type ActionFilterQuery } from './actionPolicy'

const OPEN_STATUSES: CommandActionStatus[] = ['open', 'in_progress', 'snoozed']
const MAINTENANCE_ACTIVE_STATUSES = [
  'reported',
  'needs_review',
  'approved',
  'scheduled',
  'waiting_for_parts',
  'in_progress',
  'reopened',
]

interface SourceResult {
  candidates: ActionCandidate[]
  trackedActionTypes: string[]
  error?: string
}

export type ActionInboxQuery = ActionFilterQuery

export async function syncAndLoadActionInbox(
  query: ActionInboxQuery = {}
): Promise<{ items: ActionItem[]; loadWarnings: string[] }> {
  const context = await requireCommandCenterContext('view_dashboard')
  const sourceResults = await loadAllActionSources(context)
  const candidates = sourceResults.flatMap((result) => result.candidates)
  const loadWarnings = sourceResults.flatMap((result) => (result.error ? [result.error] : []))

  await synchronizeCandidates(
    context,
    candidates,
    sourceResults.flatMap((result) => result.trackedActionTypes)
  )

  const { data, error } = await context.db
    .from('command_action_items')
    .select('*')
    .eq('tenant_id', context.tenantId)
    .in('module_key', context.activeModuleKeys)
    .order('latest_activity_at', { ascending: false })

  if (error) {
    throw new Error(`Action inbox query failed: ${error.code}`)
  }

  const items = (data ?? [])
    .map(mapActionRow)
    .filter((item) => canRoleSeeAction(item, context.user.id, context.role))

  return {
    items: filterAndSortActionItems(items, query, context.user.id),
    loadWarnings,
  }
}

export async function loadTopActionItems(limit = 5): Promise<ActionItem[]> {
  const { items } = await syncAndLoadActionInbox({
    status: 'open',
    sort: 'priority',
  })
  return items.slice(0, limit)
}

export async function updateActionItemStatus(input: {
  actionItemId: string
  status: Extract<CommandActionStatus, 'in_progress' | 'resolved' | 'dismissed' | 'snoozed'>
  reason?: string
  snoozedUntil?: string
}): Promise<void> {
  const context = await requireCommandCenterContext('use_modules')
  const { data: item, error } = await context.db
    .from('command_action_items')
    .select('id, tenant_id, module_key, action_type, assigned_user_id, assigned_role, priority')
    .eq('id', input.actionItemId)
    .eq('tenant_id', context.tenantId)
    .single()

  if (error || !item) throw new Error('Action item was not found.')
  assertActiveModule(context, item.module_key)

  const admin = isTenantAdmin(context.role)
  const assignedToUser = item.assigned_user_id === context.user.id
  const permittedUnassigned =
    !item.assigned_user_id && (!item.assigned_role || item.assigned_role === 'staff')
  if (!admin && !assignedToUser && !permittedUnassigned) {
    await recordCommandAudit({
      tenantId: context.tenantId,
      actorUserId: context.user.id,
      action: 'command_center.action.unauthorized',
      metadata: { action_item_id: item.id, requested_status: input.status },
    })
    throw new Error('You can only update action items assigned to you.')
  }
  if (input.status === 'dismissed' && !admin) {
    throw new Error('Only an administrator can dismiss an action item.')
  }
  if (
    input.status === 'dismissed' &&
    (item.priority === 'urgent' || item.priority === 'high') &&
    !input.reason?.trim()
  ) {
    throw new Error('A reason is required to dismiss a high-priority action.')
  }
  if (input.status === 'snoozed') {
    const until = input.snoozedUntil ? new Date(input.snoozedUntil) : null
    if (!until || Number.isNaN(until.getTime()) || until <= new Date()) {
      throw new Error('Choose a future time to snooze this action.')
    }
  }

  const now = new Date().toISOString()
  const patch =
    input.status === 'resolved'
      ? {
          status: 'resolved',
          resolved_at: now,
          resolved_by: context.user.id,
          dismissed_at: null,
          dismissed_by: null,
          dismissal_reason: null,
          snoozed_until: null,
        }
      : input.status === 'dismissed'
        ? {
            status: 'dismissed',
            dismissed_at: now,
            dismissed_by: context.user.id,
            dismissal_reason: input.reason?.trim() || null,
            resolved_at: null,
            resolved_by: null,
            snoozed_until: null,
          }
        : input.status === 'snoozed'
          ? {
              status: 'snoozed',
              snoozed_until: new Date(input.snoozedUntil!).toISOString(),
            }
          : { status: 'in_progress' }

  const { error: updateError } = await context.db
    .from('command_action_items')
    .update(patch)
    .eq('id', item.id)
    .eq('tenant_id', context.tenantId)

  if (updateError) throw new Error(`Unable to update action item: ${updateError.code}`)

  await recordCommandAudit({
    tenantId: context.tenantId,
    actorUserId: context.user.id,
    action: `command_center.action.${input.status}`,
    metadata: {
      action_item_id: item.id,
      action_type: item.action_type,
      module_key: item.module_key,
      reason: input.reason?.trim(),
    },
  })
  revalidatePath('/actions')
  revalidatePath('/dashboard')
}

async function loadAllActionSources(context: CommandCenterContext): Promise<SourceResult[]> {
  const loaders: Array<Promise<SourceResult>> = []
  if (context.activeModuleSet.has('damage_ai')) loaders.push(loadDamageActions(context))
  if (context.activeModuleSet.has('maintenance')) loaders.push(loadMaintenanceActions(context))
  if (context.activeModuleSet.has('damage_ai') || context.activeModuleSet.has('maintenance')) {
    loaders.push(loadSlackActions(context))
  }
  if (context.activeModuleSet.has('payments')) loaders.push(loadPaymentActions(context))
  if (context.activeModuleSet.has('appointments')) loaders.push(loadAppointmentActions(context))
  if (context.activeModuleSet.has('store')) loaders.push(loadStoreActions(context))
  if (context.activeModuleSet.has('customers') || context.activeModuleSet.has('leads')) {
    loaders.push(loadLeadActions(context))
  }
  if (context.activeModuleSet.has('website')) loaders.push(loadWebsiteActions(context))
  if (context.activeModuleSet.has('rewards')) loaders.push(loadRewardActions(context))
  return Promise.all(loaders)
}

async function loadDamageActions(context: CommandCenterContext): Promise<SourceResult> {
  const trackedActionTypes = [
    'inspection_needs_review',
    'level_3_confirmation',
    'analysis_failed',
    'vehicle_image_missing',
    'inspection_vehicle_unresolved',
  ]
  try {
    const [{ data: inspections, error }, { data: runs, error: runError }] = await Promise.all([
      context.db
        .from('van_damage_inspections')
        .select(
          'id, van_id, title, status, review_status, image_count, error_message, created_at, updated_at'
        )
        .eq('tenant_id', context.tenantId)
        .order('created_at', { ascending: false })
        .limit(250),
      context.db
        .from('van_damage_ai_runs')
        .select('inspection_id, status, parsed_response, created_at')
        .eq('tenant_id', context.tenantId)
        .order('created_at', { ascending: false })
        .limit(250),
    ])
    if (error || runError) throw new Error(error?.code ?? runError?.code ?? 'query_failed')

    const latestRun = new Map<string, typeof runs extends Array<infer R> | null ? R : never>()
    for (const run of runs ?? []) {
      if (!latestRun.has(run.inspection_id)) latestRun.set(run.inspection_id, run)
    }

    const candidates: ActionCandidate[] = []
    for (const inspection of inspections ?? []) {
      const label = inspection.title || `Inspection ${inspection.created_at.slice(0, 10)}`
      const href = `/dashboard/damage-ai/inspections/${inspection.id}`
      const base = {
        moduleKey: 'damage_ai',
        sourceRecordType: 'inspection',
        sourceRecordId: inspection.id,
        sourceRecordLabel: label,
        latestActivityAt: inspection.updated_at,
        href,
      }

      if (
        inspection.status === 'needs_review' ||
        inspection.review_status === 'needs_review' ||
        inspection.review_status === 'pending'
      ) {
        candidates.push({
          ...base,
          actionType: 'inspection_needs_review',
          title: `${label} needs review`,
          description: 'Automated inspection results need a person to verify them.',
          priority: 'high',
          assignedRole: 'admin',
        })
      }
      if (
        inspection.status === 'failed' ||
        Boolean(inspection.error_message) ||
        latestRun.get(inspection.id)?.status === 'failed'
      ) {
        candidates.push({
          ...base,
          actionType: 'analysis_failed',
          title: `Review ${label} manually`,
          description: 'Automated analysis could not complete. The saved images remain available.',
          priority: 'high',
          assignedRole: 'admin',
        })
      }
      if (inspection.image_count === 0) {
        candidates.push({
          ...base,
          actionType: 'vehicle_image_missing',
          title: `${label} has no usable image`,
          description: 'Add a supported vehicle image before this inspection can be completed.',
          priority: 'normal',
          assignedRole: 'staff',
        })
      }
      if (!inspection.van_id) {
        candidates.push({
          ...base,
          actionType: 'inspection_vehicle_unresolved',
          title: `Assign a van to ${label}`,
          description: 'This inspection could not be linked to a vehicle profile.',
          priority: 'high',
          assignedRole: 'admin',
        })
      }

      const parsed = asRecord(latestRun.get(inspection.id)?.parsed_response)
      const rating = Number(parsed.damageRating ?? parsed.damage_rating)
      if (
        rating === 3 &&
        !['confirmed', 'approved', 'resolved', 'dismissed'].includes(inspection.review_status)
      ) {
        candidates.push({
          ...base,
          actionType: 'level_3_confirmation',
          title: `Confirm Level 3 damage for ${label}`,
          description: 'Potential dents or vehicle damage require human confirmation.',
          priority: 'urgent',
          assignedRole: 'admin',
          metadata: { damage_rating: 3 },
        })
      }
    }
    return { candidates, trackedActionTypes }
  } catch (error) {
    return sourceFailure('Van Damage AI actions', error)
  }
}

async function loadMaintenanceActions(context: CommandCenterContext): Promise<SourceResult> {
  const trackedActionTypes = [
    'maintenance_needs_van',
    'maintenance_urgent',
    'maintenance_overdue',
    'maintenance_waiting_parts',
  ]
  try {
    const { data, error } = await context.db
      .from('fleet_maintenance_items')
      .select(
        'id, maintenance_number, van_id, title, status, effective_priority, due_at, assigned_user_id, latest_activity_at, updated_at'
      )
      .eq('tenant_id', context.tenantId)
      .in('status', MAINTENANCE_ACTIVE_STATUSES)
      .order('latest_activity_at', { ascending: false })
      .limit(300)
    if (error) throw new Error(error.code)

    const candidates: ActionCandidate[] = []
    for (const item of data ?? []) {
      const label = `Maintenance #${item.maintenance_number}`
      const base = {
        moduleKey: 'maintenance',
        sourceRecordType: 'maintenance_item',
        sourceRecordId: item.id,
        sourceRecordLabel: label,
        latestActivityAt: item.latest_activity_at || item.updated_at,
        href: `/dashboard/vehicles/maintenance?itemId=${item.id}`,
        assignedUserId: item.assigned_user_id,
      }
      if (!item.van_id) {
        candidates.push({
          ...base,
          actionType: 'maintenance_needs_van',
          title: `Assign a van to ${label}`,
          description: item.title,
          priority: 'high',
          assignedRole: 'admin',
        })
      }
      if (item.effective_priority === 'urgent') {
        candidates.push({
          ...base,
          actionType: 'maintenance_urgent',
          title: `Urgent: ${item.title}`,
          description: `${label} requires immediate attention.`,
          priority: 'urgent',
          assignedRole: item.assigned_user_id ? null : 'admin',
          dueAt: item.due_at,
        })
      }
      if (item.due_at && new Date(item.due_at) < new Date()) {
        candidates.push({
          ...base,
          actionType: 'maintenance_overdue',
          title: `${label} is overdue`,
          description: item.title,
          priority: item.effective_priority === 'urgent' ? 'urgent' : 'high',
          dueAt: item.due_at,
        })
      }
      if (
        item.status === 'waiting_for_parts' &&
        Date.now() - new Date(item.latest_activity_at).getTime() > 7 * 86_400_000
      ) {
        candidates.push({
          ...base,
          actionType: 'maintenance_waiting_parts',
          title: `${label} is still waiting for parts`,
          description: 'There has been no recorded progress for more than seven days.',
          priority: 'normal',
        })
      }
    }
    return { candidates, trackedActionTypes }
  } catch (error) {
    return sourceFailure('Maintenance actions', error)
  }
}

async function loadSlackActions(context: CommandCenterContext): Promise<SourceResult> {
  const trackedActionTypes = [
    'slack_workspace_disconnected',
    'slack_inspection_channel_missing',
    'slack_maintenance_channel_missing',
  ]
  try {
    const [{ data: integrations, error }, { data: channels, error: channelError }] =
      await Promise.all([
        context.db
          .from('van_slack_integrations')
          .select('id, status, last_error, updated_at')
          .eq('tenant_id', context.tenantId)
          .is('deleted_at', null)
          .order('updated_at', { ascending: false }),
        context.db
          .from('van_slack_channels')
          .select('id, integration_id, purpose, is_enabled, updated_at')
          .eq('tenant_id', context.tenantId)
          .eq('is_enabled', true),
      ])
    if (error || channelError) throw new Error(error?.code ?? channelError?.code ?? 'query_failed')

    const activeIntegration = (integrations ?? []).find((item) => item.status === 'active')
    const candidates: ActionCandidate[] = []
    if (!activeIntegration) {
      candidates.push({
        moduleKey: context.activeModuleSet.has('damage_ai') ? 'damage_ai' : 'maintenance',
        sourceRecordType: 'slack_integration',
        sourceRecordId: 'workspace',
        sourceRecordLabel: 'Slack workspace',
        actionType: 'slack_workspace_disconnected',
        title: 'Reconnect Slack',
        description: 'An active module depends on Slack, but the workspace is disconnected.',
        priority: 'high',
        assignedRole: 'admin',
        latestActivityAt: integrations?.[0]?.updated_at ?? new Date().toISOString(),
        href: '/dashboard/damage-ai/settings/slack',
      })
    } else {
      const activeChannels = (channels ?? []).filter(
        (channel) => channel.integration_id === activeIntegration.id
      )
      if (
        context.activeModuleSet.has('damage_ai') &&
        !activeChannels.some((channel) => channel.purpose === 'damage_inspection')
      ) {
        candidates.push({
          moduleKey: 'damage_ai',
          sourceRecordType: 'slack_channel',
          sourceRecordId: 'damage_inspection',
          sourceRecordLabel: 'Inspection image channel',
          actionType: 'slack_inspection_channel_missing',
          title: 'Select an inspection image channel',
          description:
            'Slack is connected, but no joined channel is selected for inspection images.',
          priority: 'high',
          assignedRole: 'admin',
          latestActivityAt: activeIntegration.updated_at,
          href: '/dashboard/damage-ai/settings/slack',
        })
      }
      if (
        context.activeModuleSet.has('maintenance') &&
        !activeChannels.some((channel) => channel.purpose === 'maintenance')
      ) {
        candidates.push({
          moduleKey: 'maintenance',
          sourceRecordType: 'slack_channel',
          sourceRecordId: 'maintenance',
          sourceRecordLabel: 'Maintenance reporting channel',
          actionType: 'slack_maintenance_channel_missing',
          title: 'Select a maintenance reporting channel',
          description: 'Slack is connected, but no joined channel is selected for maintenance.',
          priority: 'high',
          assignedRole: 'admin',
          latestActivityAt: activeIntegration.updated_at,
          href: '/dashboard/damage-ai/settings/slack',
        })
      }
    }
    return { candidates, trackedActionTypes }
  } catch (error) {
    return sourceFailure('Slack connection actions', error)
  }
}

async function loadPaymentActions(context: CommandCenterContext): Promise<SourceResult> {
  const trackedActionTypes = ['payment_failed']
  try {
    const { data, error } = await context.db
      .from('payments')
      .select('id, amount_cents, currency, status, created_at, updated_at')
      .eq('tenant_id', context.tenantId)
      .eq('status', 'failed')
      .order('updated_at', { ascending: false })
      .limit(100)
    if (error) throw new Error(error.code)
    return {
      trackedActionTypes,
      candidates: (data ?? []).map((payment) => ({
        moduleKey: 'payments',
        sourceRecordType: 'payment',
        sourceRecordId: payment.id,
        sourceRecordLabel: `Payment from ${payment.created_at.slice(0, 10)}`,
        actionType: 'payment_failed',
        title: 'Review failed payment',
        description: `${formatMoney(payment.amount_cents, payment.currency)} did not complete.`,
        priority: 'high',
        assignedRole: 'admin',
        latestActivityAt: payment.updated_at,
        href: '/payments',
      })),
    }
  } catch (error) {
    return sourceFailure('Payment actions', error)
  }
}

async function loadAppointmentActions(context: CommandCenterContext): Promise<SourceResult> {
  const trackedActionTypes = ['appointment_pending', 'appointment_staff_missing']
  try {
    const { data, error } = await context.db
      .from('appointments')
      .select('id, service_name, starts_at, status, staff_id, updated_at')
      .eq('tenant_id', context.tenantId)
      .in('status', ['pending', 'confirmed'])
      .order('starts_at', { ascending: true })
      .limit(150)
    if (error) throw new Error(error.code)
    const appointments = data ?? []
    return {
      trackedActionTypes,
      candidates: [
        ...appointments
          .filter((appointment) => appointment.status === 'pending')
          .map(
            (appointment): ActionCandidate => ({
              moduleKey: 'appointments',
              sourceRecordType: 'appointment',
              sourceRecordId: appointment.id,
              sourceRecordLabel: appointment.service_name,
              actionType: 'appointment_pending',
              title: `Review ${appointment.service_name} request`,
              description: 'Accept, reschedule, or decline this appointment request.',
              priority: 'normal',
              assignedRole: 'admin',
              dueAt: appointment.starts_at,
              latestActivityAt: appointment.updated_at,
              href: '/appointments/list',
            })
          ),
        ...appointments
          .filter((appointment) => !appointment.staff_id)
          .map(
            (appointment): ActionCandidate => ({
              moduleKey: 'appointments',
              sourceRecordType: 'appointment',
              sourceRecordId: appointment.id,
              sourceRecordLabel: appointment.service_name,
              actionType: 'appointment_staff_missing',
              title: `Assign staff for ${appointment.service_name}`,
              description: 'This appointment does not have a staff member assigned.',
              priority: 'normal',
              assignedRole: 'admin',
              dueAt: appointment.starts_at,
              latestActivityAt: appointment.updated_at,
              href: '/appointments/list',
            })
          ),
      ],
    }
  } catch (error) {
    return sourceFailure('Appointment actions', error)
  }
}

async function loadStoreActions(context: CommandCenterContext): Promise<SourceResult> {
  const trackedActionTypes = ['order_needs_fulfillment', 'order_payment_pending', 'inventory_low']
  try {
    const [{ data: orders, error }, { data: products, error: productError }] = await Promise.all([
      context.db
        .from('orders')
        .select('id, status, created_at')
        .eq('tenant_id', context.tenantId)
        .in('status', ['pending', 'confirmed', 'processing'])
        .order('created_at', { ascending: true })
        .limit(200),
      context.db
        .from('products')
        .select('id, name, inventory_count, created_at')
        .eq('tenant_id', context.tenantId)
        .eq('is_active', true)
        .lte('inventory_count', 5)
        .order('inventory_count', { ascending: true })
        .limit(100),
    ])
    if (error || productError) throw new Error(error?.code ?? productError?.code ?? 'query_failed')
    return {
      trackedActionTypes,
      candidates: [
        ...(orders ?? [])
          .filter((order) => ['confirmed', 'processing'].includes(order.status))
          .map(
            (order): ActionCandidate => ({
              moduleKey: 'store',
              sourceRecordType: 'order',
              sourceRecordId: order.id,
              sourceRecordLabel: `Order ${order.id.slice(0, 8).toUpperCase()}`,
              actionType: 'order_needs_fulfillment',
              title: 'Order needs fulfillment',
              description: 'This confirmed order has not been marked shipped or delivered.',
              priority: 'normal',
              assignedRole: 'staff',
              latestActivityAt: order.created_at,
              href: '/store/orders',
            })
          ),
        ...(orders ?? [])
          .filter((order) => order.status === 'pending')
          .map(
            (order): ActionCandidate => ({
              moduleKey: 'store',
              sourceRecordType: 'order',
              sourceRecordId: order.id,
              sourceRecordLabel: `Order ${order.id.slice(0, 8).toUpperCase()}`,
              actionType: 'order_payment_pending',
              title: 'Order payment is pending',
              description: 'Confirm payment before this order enters fulfillment.',
              priority: 'normal',
              assignedRole: 'admin',
              latestActivityAt: order.created_at,
              href: '/store/orders',
            })
          ),
        ...(products ?? []).map(
          (product): ActionCandidate => ({
            moduleKey: 'store',
            sourceRecordType: 'product',
            sourceRecordId: product.id,
            sourceRecordLabel: product.name,
            actionType: 'inventory_low',
            title: `${product.name} inventory is low`,
            description: `${product.inventory_count} item${product.inventory_count === 1 ? '' : 's'} remaining.`,
            priority: product.inventory_count === 0 ? 'high' : 'normal',
            assignedRole: 'admin',
            latestActivityAt: product.created_at,
            href: '/store/products',
          })
        ),
      ],
    }
  } catch (error) {
    return sourceFailure('Store actions', error)
  }
}

async function loadLeadActions(context: CommandCenterContext): Promise<SourceResult> {
  const trackedActionTypes = ['lead_follow_up']
  try {
    const { data, error } = await context.db
      .from('leads')
      .select('id, name, source, status, created_at, updated_at')
      .eq('tenant_id', context.tenantId)
      .in('status', ['new', 'needs_follow_up'])
      .order('created_at', { ascending: true })
      .limit(200)
    if (error) throw new Error(error.code)
    const moduleKey = context.activeModuleSet.has('leads') ? 'leads' : 'customers'
    return {
      trackedActionTypes,
      candidates: (data ?? []).map((lead) => ({
        moduleKey,
        sourceRecordType: 'lead',
        sourceRecordId: lead.id,
        sourceRecordLabel: lead.name,
        actionType: 'lead_follow_up',
        title: `Follow up with ${lead.name}`,
        description: lead.source ? `New lead from ${lead.source}.` : 'New lead needs follow-up.',
        priority: 'normal',
        assignedRole: 'staff',
        latestActivityAt: lead.updated_at,
        href: '/dashboard/leads',
      })),
    }
  } catch (error) {
    return sourceFailure('Customer follow-up actions', error)
  }
}

async function loadWebsiteActions(context: CommandCenterContext): Promise<SourceResult> {
  const trackedActionTypes = ['website_unpublished', 'website_domain_missing']
  try {
    const [{ data: settings, error }, { count: verifiedDomains, error: domainError }] =
      await Promise.all([
        context.db
          .from('site_settings')
          .select('id, is_published, custom_domain, updated_at')
          .eq('tenant_id', context.tenantId)
          .maybeSingle(),
        context.db
          .from('tenant_domains')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', context.tenantId)
          .eq('is_verified', true)
          .eq('domain_type', 'custom'),
      ])
    if (error || domainError) throw new Error(error?.code ?? domainError?.code ?? 'query_failed')
    if (!settings) return { candidates: [], trackedActionTypes }

    const candidates: ActionCandidate[] = []
    if (!settings.is_published) {
      candidates.push({
        moduleKey: 'website',
        sourceRecordType: 'website',
        sourceRecordId: settings.id,
        sourceRecordLabel: 'Business website',
        actionType: 'website_unpublished',
        title: 'Publish your website',
        description: 'The website is still a draft and is not visible to customers.',
        priority: 'normal',
        assignedRole: 'admin',
        latestActivityAt: settings.updated_at,
        href: '/website',
      })
    }
    if (!settings.custom_domain && !verifiedDomains) {
      candidates.push({
        moduleKey: 'website',
        sourceRecordType: 'website',
        sourceRecordId: settings.id,
        sourceRecordLabel: 'Business website',
        actionType: 'website_domain_missing',
        title: 'Connect a website domain',
        description: 'No verified custom domain is connected.',
        priority: 'low',
        assignedRole: 'admin',
        latestActivityAt: settings.updated_at,
        href: '/settings/domain',
      })
    }
    return { candidates, trackedActionTypes }
  } catch (error) {
    return sourceFailure('Website actions', error)
  }
}

async function loadRewardActions(context: CommandCenterContext): Promise<SourceResult> {
  const trackedActionTypes = ['reward_redemption_review']
  try {
    const { data, error } = await context.db
      .from('reward_redemptions')
      .select('id, status, points_used, created_at')
      .eq('tenant_id', context.tenantId)
      .in('status', ['pending', 'requested'])
      .order('created_at', { ascending: true })
      .limit(100)
    if (error) throw new Error(error.code)
    return {
      trackedActionTypes,
      candidates: (data ?? []).map((redemption) => ({
        moduleKey: 'rewards',
        sourceRecordType: 'reward_redemption',
        sourceRecordId: redemption.id,
        sourceRecordLabel: 'Reward redemption',
        actionType: 'reward_redemption_review',
        title: 'Review reward redemption',
        description: `${redemption.points_used} points are waiting for approval.`,
        priority: 'normal',
        assignedRole: 'admin',
        latestActivityAt: redemption.created_at,
        href: '/dashboard/rewards/history',
      })),
    }
  } catch (error) {
    return sourceFailure('Rewards actions', error)
  }
}

async function synchronizeCandidates(
  context: CommandCenterContext,
  candidates: ActionCandidate[],
  trackedActionTypes: string[]
): Promise<void> {
  const { data: existing, error } = await context.db
    .from('command_action_items')
    .select(
      'id, module_key, source_record_type, source_record_id, action_type, status, snoozed_until'
    )
    .eq('tenant_id', context.tenantId)
    .in('module_key', context.activeModuleKeys)

  if (error) throw new Error(`Action synchronization failed: ${error.code}`)

  const existingByKey = new Map((existing ?? []).map((item) => [candidateKey(item), item]))
  const activeKeys = new Set(candidates.map(candidateKey))
  const insertedCandidates: ActionCandidate[] = []

  for (const candidate of candidates) {
    const key = candidateKey(candidate)
    const current = existingByKey.get(key)
    if (!current) {
      const { data: inserted, error: insertError } = await context.db
        .from('command_action_items')
        .upsert(
          {
            tenant_id: context.tenantId,
            module_key: candidate.moduleKey,
            source_record_type: candidate.sourceRecordType,
            source_record_id: candidate.sourceRecordId,
            source_record_label: candidate.sourceRecordLabel,
            action_type: candidate.actionType,
            title: candidate.title,
            description: candidate.description,
            priority: candidate.priority,
            status: 'open',
            assigned_user_id: candidate.assignedUserId,
            assigned_role: candidate.assignedRole,
            due_at: candidate.dueAt,
            latest_activity_at: candidate.latestActivityAt,
            metadata: {
              ...(asRecord(candidate.metadata) as Record<string, Json>),
              href: candidate.href,
            },
          },
          {
            onConflict: 'tenant_id,module_key,source_record_type,source_record_id,action_type',
            ignoreDuplicates: true,
          }
        )
        .select('id')
        .maybeSingle()
      if (insertError) throw new Error(`Action insert failed: ${insertError.code}`)
      if (inserted) insertedCandidates.push(candidate)
      continue
    }

    const snoozeExpired =
      current.status === 'snoozed' &&
      current.snoozed_until &&
      new Date(current.snoozed_until) <= new Date()
    if (current.status === 'dismissed') continue
    const sourceIssueRecurred = current.status === 'resolved'

    const { error: updateError } = await context.db
      .from('command_action_items')
      .update({
        title: candidate.title,
        description: candidate.description,
        source_record_label: candidate.sourceRecordLabel,
        priority: candidate.priority,
        assigned_user_id: candidate.assignedUserId,
        assigned_role: candidate.assignedRole,
        due_at: candidate.dueAt,
        latest_activity_at: candidate.latestActivityAt,
        status: snoozeExpired || sourceIssueRecurred ? 'open' : current.status,
        snoozed_until: snoozeExpired ? null : current.snoozed_until,
        resolved_at: sourceIssueRecurred ? null : undefined,
        resolved_by: sourceIssueRecurred ? null : undefined,
        metadata: {
          ...(asRecord(candidate.metadata) as Record<string, Json>),
          href: candidate.href,
        },
      })
      .eq('id', current.id)
      .eq('tenant_id', context.tenantId)
    if (updateError) throw new Error(`Action update failed: ${updateError.code}`)
  }

  const tracked = new Set(trackedActionTypes)
  const staleIds = (existing ?? [])
    .filter(
      (item) =>
        tracked.has(item.action_type) &&
        OPEN_STATUSES.includes(item.status as CommandActionStatus) &&
        !activeKeys.has(candidateKey(item))
    )
    .map((item) => item.id)

  if (staleIds.length > 0) {
    const { error: resolveError } = await context.db
      .from('command_action_items')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        resolved_by: null,
        snoozed_until: null,
      })
      .eq('tenant_id', context.tenantId)
      .in('id', staleIds)
    if (resolveError) throw new Error(`Action resolution failed: ${resolveError.code}`)
    await Promise.all(
      staleIds.map((actionItemId) =>
        recordCommandAudit({
          tenantId: context.tenantId,
          actorUserId: null,
          action: 'command_center.action.resolved',
          metadata: {
            action_item_id: actionItemId,
            resolution: 'source_issue_fixed',
          },
        })
      )
    )
  }

  await Promise.all(
    insertedCandidates.map((candidate) =>
      recordCommandAudit({
        tenantId: context.tenantId,
        actorUserId: null,
        action: 'command_center.action.created',
        metadata: {
          action_type: candidate.actionType,
          module_key: candidate.moduleKey,
          source_record_type: candidate.sourceRecordType,
          source_record_id: candidate.sourceRecordId,
        },
      })
    )
  )
  await Promise.all(
    insertedCandidates.map((candidate) => {
      const eventType = notificationEventForAction(candidate.actionType)
      if (!eventType) return Promise.resolve()
      return emitNotificationEvent(context, {
        eventType,
        moduleKey: candidate.moduleKey,
        sourceRecordType: candidate.sourceRecordType,
        sourceRecordId: candidate.sourceRecordId,
        title: candidate.title,
        body: candidate.description,
        sourceHref: candidate.href,
        priority: candidate.priority,
        assignedUserId: candidate.assignedUserId,
      })
    })
  )
}

function mapActionRow(row: {
  id: string
  tenant_id: string
  module_key: string
  source_record_type: string
  source_record_id: string
  source_record_label: string | null
  action_type: string
  title: string
  description: string
  priority: CommandPriority
  status: CommandActionStatus
  assigned_user_id: string | null
  assigned_role: 'admin' | 'manager' | 'staff' | null
  due_at: string | null
  first_detected_at: string
  latest_activity_at: string
  resolved_at: string | null
  dismissed_at: string | null
  snoozed_until: string | null
  metadata: Json
}): ActionItem {
  const metadata = asRecord(row.metadata)
  return {
    id: row.id,
    tenantId: row.tenant_id,
    moduleKey: row.module_key,
    sourceRecordType: row.source_record_type,
    sourceRecordId: row.source_record_id,
    sourceRecordLabel: row.source_record_label,
    actionType: row.action_type,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    assignedUserId: row.assigned_user_id,
    assignedRole: row.assigned_role,
    dueAt: row.due_at,
    firstDetectedAt: row.first_detected_at,
    latestActivityAt: row.latest_activity_at,
    resolvedAt: row.resolved_at,
    dismissedAt: row.dismissed_at,
    snoozedUntil: row.snoozed_until,
    href: typeof metadata.href === 'string' ? metadata.href : '/actions',
    metadata: row.metadata,
  }
}

function candidateKey(candidate: {
  moduleKey?: string
  module_key?: string
  sourceRecordType?: string
  source_record_type?: string
  sourceRecordId?: string
  source_record_id?: string
  actionType?: string
  action_type?: string
}): string {
  return [
    candidate.moduleKey ?? candidate.module_key,
    candidate.sourceRecordType ?? candidate.source_record_type,
    candidate.sourceRecordId ?? candidate.source_record_id,
    candidate.actionType ?? candidate.action_type,
  ].join(':')
}

function sourceFailure(label: string, error: unknown): SourceResult {
  console.error('[command-center:actions] source failed', {
    source: label,
    error: error instanceof Error ? error.message : 'unknown',
  })
  return {
    candidates: [],
    trackedActionTypes: [],
    error: `We couldn’t refresh ${label.toLowerCase()}. Existing actions were preserved.`,
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100)
}

function notificationEventForAction(actionType: string): string | null {
  const events: Record<string, string> = {
    level_3_confirmation: 'damage.level_3_found',
    inspection_needs_review: 'damage.inspection_needs_review',
    analysis_failed: 'damage.analysis_failed',
    maintenance_urgent: 'maintenance.urgent',
    maintenance_overdue: 'maintenance.overdue',
    payment_failed: 'payments.failed',
    order_needs_fulfillment: 'store.order_fulfillment',
    slack_workspace_disconnected: 'slack.disconnected',
    website_domain_missing: 'website.domain_disconnected',
  }
  return events[actionType] ?? null
}
