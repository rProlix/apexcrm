'use server'

import {
  deleteNotificationRule as deleteNotificationRuleInternal,
  markNotificationRead as markNotificationReadInternal,
  saveNotificationRule as saveNotificationRuleInternal,
  setNotificationRuleEnabled as setNotificationRuleEnabledInternal,
} from './notifications'
import type { NotificationChannel } from './notificationPolicy'

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
  return saveNotificationRuleInternal(input)
}

export async function deleteNotificationRule(ruleId: string): Promise<void> {
  return deleteNotificationRuleInternal(ruleId)
}

export async function setNotificationRuleEnabled(ruleId: string, enabled: boolean): Promise<void> {
  return setNotificationRuleEnabledInternal(ruleId, enabled)
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  return markNotificationReadInternal(notificationId)
}
