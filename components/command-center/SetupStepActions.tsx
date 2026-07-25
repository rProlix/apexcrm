'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, X } from 'lucide-react'
import { dismissOptionalSetupStep } from '@/lib/command-center/setupActions'

export function SetupStepActions({ moduleKey, stepKey }: { moduleKey: string; stepKey: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [reason, setReason] = useState('')

  function dismiss() {
    const normalizedReason = reason.trim()
    if (!normalizedReason) {
      setError('Add a short reason before dismissing this optional step.')
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        await dismissOptionalSetupStep({ moduleKey, stepKey, reason: normalizedReason })
        setEditing(false)
        setReason('')
        router.refresh()
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Setup step could not be dismissed.')
      }
    })
  }

  return (
    <div>
      {editing ? (
        <div className="mt-2 max-w-sm rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
          <label
            className="block text-xs font-medium text-white/55"
            htmlFor={`dismiss-${moduleKey}-${stepKey}`}
          >
            Dismissal reason
          </label>
          <textarea
            id={`dismiss-${moduleKey}-${stepKey}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            maxLength={300}
            autoFocus
            className="ui-input mt-2 w-full resize-y"
            placeholder="Why is this optional step not needed?"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={dismiss}
              className="ui-button ui-button-primary min-h-9 px-3 text-xs"
            >
              {pending && <Loader2 className="h-3 w-3 animate-spin" />}
              Confirm dismissal
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setEditing(false)
                setReason('')
                setError(null)
              }}
              className="ui-button ui-button-ghost min-h-9 px-3 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1 text-xs text-white/30 hover:text-white disabled:opacity-40"
        >
          <X className="h-3 w-3" />
          Dismiss optional step
        </button>
      )}
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
