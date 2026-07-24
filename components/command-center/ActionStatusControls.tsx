'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Clock3, Loader2, X } from 'lucide-react'
import { updateActionItemStatus } from '@/lib/command-center/actionItemActions'

export function ActionStatusControls({
  actionItemId,
  canDismiss,
}: {
  actionItemId: string
  canDismiss: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function update(status: 'in_progress' | 'resolved' | 'dismissed' | 'snoozed') {
    setError(null)
    startTransition(async () => {
      try {
        let reason: string | undefined
        let snoozedUntil: string | undefined
        if (status === 'dismissed') {
          reason = window.prompt('Why is this action safe to dismiss?')?.trim()
          if (!reason) return
        }
        if (status === 'snoozed') {
          const nextHour = new Date(Date.now() + 60 * 60 * 1000)
          const input = window.prompt(
            'Snooze until (ISO date/time):',
            nextHour.toISOString().slice(0, 16)
          )
          if (!input) return
          snoozedUntil = new Date(input).toISOString()
        }
        await updateActionItemStatus({
          actionItemId,
          status,
          reason,
          snoozedUntil,
        })
        router.refresh()
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'The action could not be updated.')
      }
    })
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => update('in_progress')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-white/50 hover:text-white disabled:opacity-40"
        >
          {isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Clock3 className="h-3 w-3" />
          )}
          Start
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => update('snoozed')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-white/50 hover:text-white disabled:opacity-40"
        >
          <Clock3 className="h-3 w-3" /> Snooze
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => update('resolved')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/8 px-2.5 py-1.5 text-xs text-emerald-400 disabled:opacity-40"
        >
          <Check className="h-3 w-3" /> Resolve
        </button>
        {canDismiss && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => update('dismissed')}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-white/30 hover:text-red-400 disabled:opacity-40"
          >
            <X className="h-3 w-3" /> Dismiss
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
