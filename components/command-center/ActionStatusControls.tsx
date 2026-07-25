'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Clock3, Loader2, X } from 'lucide-react'
import { updateActionItemStatus } from '@/lib/command-center/actionItemActions'

export function ActionStatusControls({
  actionItemId,
  canDismiss,
  onConfirmed,
}: {
  actionItemId: string
  canDismiss: boolean
  onConfirmed?: (status: 'in_progress' | 'resolved' | 'dismissed' | 'snoozed') => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<'dismissed' | 'snoozed' | null>(null)
  const [reason, setReason] = useState('')
  const [snoozedUntil, setSnoozedUntil] = useState(() =>
    new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16)
  )

  function update(
    status: 'in_progress' | 'resolved' | 'dismissed' | 'snoozed',
    detail?: { reason?: string; snoozedUntil?: string }
  ) {
    setError(null)
    startTransition(async () => {
      try {
        await updateActionItemStatus({
          actionItemId,
          status,
          reason: detail?.reason,
          snoozedUntil: detail?.snoozedUntil,
        })
        setConfirmation(null)
        setReason('')
        onConfirmed?.(status)
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
          onClick={() => setConfirmation('snoozed')}
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
            onClick={() => setConfirmation('dismissed')}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-white/30 hover:text-red-400 disabled:opacity-40"
          >
            <X className="h-3 w-3" /> Dismiss
          </button>
        )}
      </div>
      {confirmation && (
        <div className="mt-3 rounded-xl border border-white/10 bg-black/15 p-3">
          {confirmation === 'dismissed' ? (
            <label className="block">
              <span className="ui-label text-xs">Why is this safe to dismiss?</span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="ui-input mt-2 min-h-20 resize-y"
                maxLength={500}
                autoFocus
              />
            </label>
          ) : (
            <label className="block">
              <span className="ui-label text-xs">Resume review at</span>
              <input
                type="datetime-local"
                value={snoozedUntil}
                onChange={(event) => setSnoozedUntil(event.target.value)}
                className="ui-input mt-2"
                autoFocus
              />
            </label>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={
                isPending ||
                (confirmation === 'dismissed' ? reason.trim().length < 3 : !snoozedUntil)
              }
              onClick={() =>
                update(
                  confirmation,
                  confirmation === 'dismissed'
                    ? { reason: reason.trim() }
                    : { snoozedUntil: new Date(snoozedUntil).toISOString() }
                )
              }
              className={confirmation === 'dismissed' ? 'ui-button-danger' : 'ui-button-primary'}
            >
              Confirm {confirmation === 'dismissed' ? 'dismissal' : 'snooze'}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setConfirmation(null)}
              className="ui-button-ghost"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
