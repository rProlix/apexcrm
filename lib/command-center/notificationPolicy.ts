export type NotificationChannel = 'in_app' | 'email' | 'sms' | 'slack'

export interface NotificationEventDefinition {
  eventType: string
  moduleKey: string
  label: string
  description: string
}

export interface NotificationChannelCapability {
  channel: NotificationChannel
  label: string
  enabled: boolean
  reason?: string
}

export const NOTIFICATION_EVENT_REGISTRY: NotificationEventDefinition[] = [
  event('damage.level_3_found', 'damage_ai', 'Level 3 damage found'),
  event('damage.inspection_needs_review', 'damage_ai', 'Inspection needs review'),
  event('damage.analysis_failed', 'damage_ai', 'Automated analysis failed'),
  event('maintenance.urgent', 'maintenance', 'Urgent maintenance created'),
  event('maintenance.assigned', 'maintenance', 'Maintenance assigned'),
  event('maintenance.overdue', 'maintenance', 'Maintenance became overdue'),
  event('appointments.created', 'appointments', 'Appointment created'),
  event('appointments.changed', 'appointments', 'Appointment changed'),
  event('appointments.cancelled', 'appointments', 'Appointment cancelled'),
  event('payments.failed', 'payments', 'Payment failed'),
  event('store.order_fulfillment', 'store', 'Order needs fulfillment'),
  event('customers.message_received', 'customers', 'Customer message received'),
  event('slack.disconnected', 'damage_ai', 'Slack disconnected'),
  event('website.domain_disconnected', 'website', 'Website domain disconnected'),
  event('reports.generated', 'core', 'Report generated'),
]

export function getAvailableNotificationEvents(
  activeModuleKeys: Iterable<string>
): NotificationEventDefinition[] {
  const active = new Set(activeModuleKeys)
  return NOTIFICATION_EVENT_REGISTRY.filter(
    (definition) => definition.moduleKey === 'core' || active.has(definition.moduleKey)
  )
}

function event(eventType: string, moduleKey: string, label: string): NotificationEventDefinition {
  return {
    eventType,
    moduleKey,
    label,
    description: `Notify recipients when ${label.toLocaleLowerCase()}.`,
  }
}
