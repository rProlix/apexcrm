'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import {
  deleteNotificationRule,
  saveNotificationRule,
  setNotificationRuleEnabled,
} from '@/lib/command-center/notificationActions'
import type {
  NotificationChannel,
  NotificationChannelCapability,
  NotificationEventDefinition,
} from '@/lib/command-center/notificationPolicy'

interface RuleRow {
  id: string
  event_type: string
  module_key: string
  enabled: boolean
  recipient_type: string
  recipient_user_id: string | null
  recipient_role: string | null
  channel: NotificationChannel
}

export function NotificationRuleEditor({
  events,
  channels,
  rules,
  users,
}: {
  events: NotificationEventDefinition[]
  channels: NotificationChannelCapability[]
  rules: RuleRow[]
  users: Array<{ id: string; email: string; role: string }>
}) {
  const router = useRouter()
  const [eventType, setEventType] = useState(events[0]?.eventType ?? '')
  const [recipientType, setRecipientType] = useState<
    'role' | 'specific_user' | 'assigned_user' | 'record_owner'
  >('role')
  const [recipientRole, setRecipientRole] = useState<'admin' | 'manager' | 'staff'>('admin')
  const [recipientUserId, setRecipientUserId] = useState(users[0]?.id ?? '')
  const [channel, setChannel] = useState<NotificationChannel>('in_app')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function addRule() {
    const selectedEvent = events.find((item) => item.eventType === eventType)
    if (!selectedEvent) return
    setError(null)
    startTransition(async () => {
      try {
        await saveNotificationRule({
          eventType: selectedEvent.eventType,
          moduleKey: selectedEvent.moduleKey,
          enabled: true,
          recipientType,
          recipientRole: recipientType === 'role' ? recipientRole : null,
          recipientUserId: recipientType === 'specific_user' ? recipientUserId : null,
          channel,
        })
        router.refresh()
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Rule could not be saved.')
      }
    })
  }

  function changeRule(task: () => Promise<void>) {
    setError(null)
    startTransition(async () => {
      try {
        await task()
        router.refresh()
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Rule could not be updated.')
      }
    })
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 rounded-2xl border border-white/10 bg-graphite-900/60 p-4 md:grid-cols-5">
        <label className="text-xs text-white/45 md:col-span-2">
          Event
          <select
            value={eventType}
            onChange={(event) => setEventType(event.target.value)}
            className="mt-1.5 w-full rounded-lg border border-white/10 bg-graphite-950 px-2.5 py-2 text-xs text-white"
          >
            {events.map((event) => (
              <option key={`${event.moduleKey}:${event.eventType}`} value={event.eventType}>
                {event.label} · {event.moduleKey}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-white/45">
          Recipient
          <select
            value={recipientType}
            onChange={(event) => setRecipientType(event.target.value as typeof recipientType)}
            className="mt-1.5 w-full rounded-lg border border-white/10 bg-graphite-950 px-2.5 py-2 text-xs text-white"
          >
            <option value="role">Role</option>
            <option value="specific_user">Specific user</option>
            <option value="assigned_user">Assigned user</option>
            <option value="record_owner">Record owner</option>
          </select>
        </label>
        {recipientType === 'role' ? (
          <label className="text-xs text-white/45">
            Role
            <select
              value={recipientRole}
              onChange={(event) => setRecipientRole(event.target.value as typeof recipientRole)}
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-graphite-950 px-2.5 py-2 text-xs text-white"
            >
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="staff">Staff</option>
            </select>
          </label>
        ) : recipientType === 'specific_user' ? (
          <label className="text-xs text-white/45">
            User
            <select
              value={recipientUserId}
              onChange={(event) => setRecipientUserId(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-graphite-950 px-2.5 py-2 text-xs text-white"
            >
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.email}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="flex items-end pb-2 text-xs text-white/35">
            The recipient is resolved from each source record.
          </div>
        )}
        <label className="text-xs text-white/45">
          Channel
          <select
            value={channel}
            onChange={(event) => setChannel(event.target.value as NotificationChannel)}
            className="mt-1.5 w-full rounded-lg border border-white/10 bg-graphite-950 px-2.5 py-2 text-xs text-white"
          >
            {channels
              .filter((item) => item.enabled)
              .map((item) => (
                <option key={item.channel} value={item.channel}>
                  {item.label}
                </option>
              ))}
          </select>
        </label>
        <div className="md:col-span-5 flex items-center justify-between gap-3">
          <p className="text-xs text-white/30">
            Unsupported delivery channels remain unavailable until a real provider is configured.
          </p>
          <button
            type="button"
            disabled={pending || !eventType}
            onClick={addRule}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-gold-500 px-3 py-2 text-xs font-semibold text-graphite-950 disabled:opacity-40"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Add rule
          </button>
        </div>
        {error && (
          <p role="alert" className="md:col-span-5 text-xs text-red-400">
            {error}
          </p>
        )}
      </div>

      <div className="space-y-2">
        {rules.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-white/35">
            No notification rules yet.
          </div>
        )}
        {rules.map((rule) => {
          const event = events.find((item) => item.eventType === rule.event_type)
          const user = users.find((item) => item.id === rule.recipient_user_id)
          return (
            <div
              key={rule.id}
              className="flex flex-col gap-3 rounded-xl border border-white/8 bg-white/[0.025] p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-medium text-white/75">
                  {event?.label ?? rule.event_type}
                </p>
                <p className="mt-1 text-xs text-white/35">
                  {rule.channel.replace('_', ' ')} ·{' '}
                  {rule.recipient_type === 'role'
                    ? rule.recipient_role
                    : rule.recipient_type === 'specific_user'
                      ? (user?.email ?? 'Specific user')
                      : rule.recipient_type === 'assigned_user'
                        ? 'Assigned user'
                        : 'Record owner'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    changeRule(() => setNotificationRuleEnabled(rule.id, !rule.enabled))
                  }
                  className="text-xs text-white/40 hover:text-white disabled:opacity-40"
                >
                  {rule.enabled ? 'Pause' : 'Enable'}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => changeRule(() => deleteNotificationRule(rule.id))}
                  className="inline-flex items-center gap-1.5 text-xs text-white/30 hover:text-red-400 disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
