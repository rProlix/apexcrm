import 'server-only'

import { revalidatePath } from 'next/cache'
import { hasPermission } from '@/lib/auth/permissions'
import type { AnyRole } from '@/lib/auth/types'
import type { Json } from '@/lib/supabase/types'
import { validateEmailConfig } from '@/lib/email/config'
import { sendEmail } from '@/lib/email/sendEmail'
import { recordCommandAudit } from './audit'
import {
  assertActiveModule,
  isTenantAdmin,
  requireCommandCenterContext,
  type CommandCenterContext,
} from './context'
import {
  getAvailableNotificationEvents,
  NOTIFICATION_EVENT_REGISTRY,
  type NotificationChannel,
  type NotificationChannelCapability,
} from './notificationPolicy'
export { getAvailableNotificationEvents, NOTIFICATION_EVENT_REGISTRY } from './notificationPolicy'
export type {
  NotificationChannel,
  NotificationChannelCapability,
  NotificationEventDefinition,
} from './notificationPolicy'

export interface NotificationEventInput {
  eventType: string
  moduleKey: string
  sourceRecordType: string
  sourceRecordId: string
  title: string
  body: string
  sourceHref: string
  priority?: string
  assignedUserId?: string | null
  recordOwnerUserId?: string | null
}

export function getNotificationChannelCapabilities(): NotificationChannelCapability[] {
  const email = validateEmailConfig()
  return [
    { channel: 'in_app', label: 'In-app', enabled: true },
    {
      channel: 'email',
      label: 'Email',
      enabled: email.ok,
      reason: email.ok ? undefined : 'Email delivery is not configured.',
    },
    {
      channel: 'sms',
      label: 'SMS',
      enabled: false,
      reason: 'No SMS provider is configured.',
    },
    {
      channel: 'slack',
      label: 'Slack',
      enabled: false,
      reason: 'Outbound Slack notifications are not enabled.',
    },
  ]
}

export async function loadNotificationSettings() {
  const context = await requireCommandCenterContext('view_modules')
  if (!isTenantAdmin(context.role)) throw new Error('Administrator access is required.')
  const { data: rules, error } = await context.db
    .from('notification_rules')
    .select('*')
    .eq('tenant_id', context.tenantId)
    .in('module_key', [...context.activeModuleKeys, 'core'])
    .order('created_at', { ascending: true })
  if (error) throw new Error(`Notification rules could not be loaded: ${error.code}`)
  return {
    rules: rules ?? [],
    events: getAvailableNotificationEvents(context.activeModuleKeys),
    channels: getNotificationChannelCapabilities(),
    activeModuleKeys: context.activeModuleKeys,
  }
}

export async function saveNotificationRule(input: {
  id?: string
  eventType: string
  moduleKey: string
  enabled: boolean
  recipientType: 'specific_user' | 'role' | 'assigned_user' | 'record_owner'
  recipientUserId?: string | null
  recipientRole?: 'admin' | 'manager' | 'staff' | null
  channel: NotificationChannel
  conditions?: Record<string, unknown>
  quietHours?: Record<string, unknown>
}): Promise<void> {
  const context = await requireCommandCenterContext('view_modules')
  if (!isTenantAdmin(context.role)) throw new Error('Administrator access is required.')
  if (input.moduleKey !== 'core') assertActiveModule(context, input.moduleKey)

  const definition = NOTIFICATION_EVENT_REGISTRY.find(
    (candidate) =>
      candidate.eventType === input.eventType && candidate.moduleKey === input.moduleKey
  )
  if (!definition) throw new Error('Unsupported notification event.')
  const capability = getNotificationChannelCapabilities().find(
    (candidate) => candidate.channel === input.channel
  )
  if (!capability?.enabled) {
    throw new Error(capability?.reason || 'That notification channel is unavailable.')
  }
  validateRecipient(input)
  if (
    input.recipientType === 'specific_user' &&
    (await queryUsers(context, { id: input.recipientUserId! })).length === 0
  ) {
    throw new Error('Choose an active user from this workspace.')
  }

  const row = {
    tenant_id: context.tenantId,
    event_type: input.eventType,
    module_key: input.moduleKey,
    enabled: input.enabled,
    recipient_type: input.recipientType,
    recipient_user_id: input.recipientType === 'specific_user' ? input.recipientUserId : null,
    recipient_role: input.recipientType === 'role' ? input.recipientRole : null,
    channel: input.channel,
    conditions: (input.conditions ?? {}) as Json,
    quiet_hours: (input.quietHours ?? {}) as Json,
    created_by: context.user.id,
  }

  if (input.id) {
    const { error } = await context.db
      .from('notification_rules')
      .update(row)
      .eq('id', input.id)
      .eq('tenant_id', context.tenantId)
    if (error) throw new Error(`Notification rule could not be updated: ${error.code}`)
  } else {
    const { error } = await context.db.from('notification_rules').insert(row)
    if (error) throw new Error(`Notification rule could not be created: ${error.code}`)
  }

  await recordCommandAudit({
    tenantId: context.tenantId,
    actorUserId: context.user.id,
    action: input.id
      ? 'command_center.notification.rule_updated'
      : 'command_center.notification.rule_created',
    metadata: {
      module_key: input.moduleKey,
      event_type: input.eventType,
      channel: input.channel,
    },
  })
  revalidatePath('/settings/notifications')
}

export async function deleteNotificationRule(ruleId: string): Promise<void> {
  const context = await requireCommandCenterContext('view_modules')
  if (!isTenantAdmin(context.role)) throw new Error('Administrator access is required.')
  const { data: rule, error } = await context.db
    .from('notification_rules')
    .delete()
    .eq('id', ruleId)
    .eq('tenant_id', context.tenantId)
    .select('id, module_key, event_type')
    .single()
  if (error || !rule) throw new Error('Notification rule was not found.')
  await recordCommandAudit({
    tenantId: context.tenantId,
    actorUserId: context.user.id,
    action: 'command_center.notification.rule_deleted',
    metadata: {
      module_key: rule.module_key,
      event_type: rule.event_type,
    },
  })
  revalidatePath('/settings/notifications')
}

export async function setNotificationRuleEnabled(ruleId: string, enabled: boolean): Promise<void> {
  const context = await requireCommandCenterContext('view_modules')
  if (!isTenantAdmin(context.role)) throw new Error('Administrator access is required.')
  const { data: rule, error } = await context.db
    .from('notification_rules')
    .select('id, module_key, event_type')
    .eq('id', ruleId)
    .eq('tenant_id', context.tenantId)
    .single()
  if (error || !rule) throw new Error('Notification rule was not found.')
  if (rule.module_key !== 'core') assertActiveModule(context, rule.module_key)
  const { error: updateError } = await context.db
    .from('notification_rules')
    .update({ enabled })
    .eq('id', rule.id)
    .eq('tenant_id', context.tenantId)
  if (updateError) throw new Error(`Notification rule could not be updated: ${updateError.code}`)

  await recordCommandAudit({
    tenantId: context.tenantId,
    actorUserId: context.user.id,
    action: 'command_center.notification.rule_updated',
    metadata: {
      module_key: rule.module_key,
      event_type: rule.event_type,
      enabled,
    },
  })
  revalidatePath('/settings/notifications')
}

export async function emitNotificationEvent(
  context: CommandCenterContext,
  input: NotificationEventInput
): Promise<void> {
  if (input.moduleKey !== 'core' && !context.activeModuleSet.has(input.moduleKey)) return
  if (
    !NOTIFICATION_EVENT_REGISTRY.some(
      (definition) =>
        definition.eventType === input.eventType && definition.moduleKey === input.moduleKey
    )
  ) {
    return
  }

  const { data: rules, error } = await context.db
    .from('notification_rules')
    .select('*')
    .eq('tenant_id', context.tenantId)
    .eq('module_key', input.moduleKey)
    .eq('event_type', input.eventType)
    .eq('enabled', true)
  if (error) {
    console.error('[notifications] rule query failed', { code: error.code })
    return
  }

  for (const rule of rules ?? []) {
    if (!conditionsMatch(rule.conditions, input)) continue
    if (isQuietTime(rule.quiet_hours, context.timeZone)) continue
    const recipients = await resolveRecipients(context, rule, input)
    for (const recipient of recipients) {
      await deliverNotification(context, rule, input, recipient)
    }
  }
}

export async function loadNotifications(limit = 100) {
  const context = await requireCommandCenterContext('view_dashboard')
  const { data, error } = await context.db
    .from('notifications')
    .select('*')
    .eq('tenant_id', context.tenantId)
    .eq('recipient_user_id', context.user.id)
    .in('module_key', [...context.activeModuleKeys, 'core'])
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`Notifications could not be loaded: ${error.code}`)
  return {
    notifications: data ?? [],
    unread: (data ?? []).filter((item) => !item.read_at).length,
  }
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const context = await requireCommandCenterContext('view_dashboard')
  const now = new Date().toISOString()
  const { error } = await context.db
    .from('notifications')
    .update({ status: 'read', read_at: now })
    .eq('id', notificationId)
    .eq('tenant_id', context.tenantId)
    .eq('recipient_user_id', context.user.id)
  if (error) throw new Error(`Notification could not be marked read: ${error.code}`)
  revalidatePath('/notifications')
}

async function resolveRecipients(
  context: CommandCenterContext,
  rule: {
    recipient_type: string
    recipient_user_id: string | null
    recipient_role: string | null
  },
  input: NotificationEventInput
): Promise<Array<{ id: string; email: string; role: string }>> {
  if (rule.recipient_type === 'specific_user' && rule.recipient_user_id) {
    return queryUsers(context, { id: rule.recipient_user_id })
  }
  if (rule.recipient_type === 'role' && rule.recipient_role) {
    if (!['owner', 'admin', 'manager', 'staff'].includes(rule.recipient_role)) return []
    return queryUsers(context, {
      role: rule.recipient_role as 'owner' | 'admin' | 'manager' | 'staff',
    })
  }
  if (rule.recipient_type === 'assigned_user' && input.assignedUserId) {
    return queryUsers(context, { id: input.assignedUserId })
  }
  if (rule.recipient_type === 'record_owner' && input.recordOwnerUserId) {
    return queryUsers(context, { id: input.recordOwnerUserId })
  }
  return []
}

async function queryUsers(
  context: CommandCenterContext,
  filter: { id?: string; role?: 'owner' | 'admin' | 'manager' | 'staff' }
): Promise<Array<{ id: string; email: string; role: string }>> {
  let query = context.db
    .from('users')
    .select('id, email, role')
    .eq('tenant_id', context.tenantId)
    .eq('status', 'active')
  if (filter.id) query = query.eq('id', filter.id)
  if (filter.role) query = query.eq('role', filter.role)
  const { data, error } = await query
  if (error) {
    console.error('[notifications] recipient query failed', { code: error.code })
    return []
  }
  return data ?? []
}

async function deliverNotification(
  context: CommandCenterContext,
  rule: {
    id: string
    channel: NotificationChannel
    recipient_role: string | null
  },
  input: NotificationEventInput,
  recipient: { id: string; email: string; role: string }
): Promise<void> {
  const capability = getNotificationChannelCapabilities().find(
    (candidate) => candidate.channel === rule.channel
  )
  if (!capability?.enabled) {
    await storeDelivery(context, rule, input, recipient, 'failed', 'channel_unavailable')
    return
  }

  if (rule.channel === 'in_app') {
    await storeDelivery(context, rule, input, recipient, 'sent', null)
    return
  }
  if (rule.channel === 'email') {
    const result = await sendEmail({
      to: recipient.email,
      subject: input.title,
      html: `<p>${escapeHtml(input.body)}</p><p><a href="${escapeHtml(absoluteUrl(input.sourceHref))}">Open record</a></p>`,
      text: `${input.body}\n\nOpen record: ${absoluteUrl(input.sourceHref)}`,
      category: 'notification',
      tenantId: context.tenantId,
      userId: recipient.id,
      metadata: {
        eventType: input.eventType,
        moduleKey: input.moduleKey,
      },
      idempotencyKey: `${context.tenantId}:${input.eventType}:${input.sourceRecordType}:${input.sourceRecordId}:${recipient.id}`,
    })
    await storeDelivery(
      context,
      rule,
      input,
      recipient,
      result.success ? 'sent' : 'failed',
      result.success ? null : 'email_delivery_failed'
    )
  }
}

async function storeDelivery(
  context: CommandCenterContext,
  rule: { id: string; channel: NotificationChannel; recipient_role: string | null },
  input: NotificationEventInput,
  recipient: { id: string; email: string; role: string },
  status: 'sent' | 'failed',
  errorCode: string | null
): Promise<void> {
  const { error } = await context.db.from('notifications').upsert(
    {
      tenant_id: context.tenantId,
      rule_id: rule.id,
      event_type: input.eventType,
      module_key: input.moduleKey,
      source_record_type: input.sourceRecordType,
      source_record_id: input.sourceRecordId,
      recipient_user_id: recipient.id,
      recipient_role: recipient.role,
      channel: rule.channel,
      title: input.title,
      body: input.body,
      source_href: input.sourceHref,
      status,
      error_code: errorCode,
      sent_at: status === 'sent' ? new Date().toISOString() : null,
    },
    {
      onConflict:
        'tenant_id,event_type,source_record_type,source_record_id,recipient_user_id,channel,rule_id',
    }
  )
  if (error) {
    console.error('[notifications] delivery write failed', { code: error.code })
    return
  }
  await recordCommandAudit({
    tenantId: context.tenantId,
    actorUserId: null,
    action:
      status === 'sent'
        ? 'command_center.notification.delivered'
        : 'command_center.notification.failed',
    metadata: {
      module_key: input.moduleKey,
      event_type: input.eventType,
      channel: rule.channel,
      recipient_user_id: recipient.id,
      error_code: errorCode,
    },
  })
}

function validateRecipient(input: {
  recipientType: string
  recipientUserId?: string | null
  recipientRole?: string | null
}): void {
  if (input.recipientType === 'specific_user' && !input.recipientUserId) {
    throw new Error('Choose a notification recipient.')
  }
  if (input.recipientType === 'role' && !input.recipientRole) {
    throw new Error('Choose a recipient role.')
  }
}

function conditionsMatch(conditions: unknown, input: NotificationEventInput): boolean {
  const value =
    conditions && typeof conditions === 'object' && !Array.isArray(conditions)
      ? (conditions as Record<string, unknown>)
      : {}
  if (value.onlyUrgent === true && input.priority !== 'urgent') return false
  if (value.onlyLevel3 === true && input.eventType !== 'damage.level_3_found') return false
  return true
}

function isQuietTime(quietHours: unknown, timeZone: string): boolean {
  const value =
    quietHours && typeof quietHours === 'object' && !Array.isArray(quietHours)
      ? (quietHours as Record<string, unknown>)
      : {}
  if (value.enabled !== true || typeof value.start !== 'string' || typeof value.end !== 'string') {
    return false
  }
  const hourMinute = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date())
  return value.start <= value.end
    ? hourMinute >= value.start && hourMinute < value.end
    : hourMinute >= value.start || hourMinute < value.end
}

function absoluteUrl(href: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://app.nexoranow.com'
  return href.startsWith('http') ? href : `${base}${href.startsWith('/') ? href : `/${href}`}`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function canManageNotificationRules(role: AnyRole): boolean {
  return isTenantAdmin(role) && hasPermission(role, 'view_modules')
}
