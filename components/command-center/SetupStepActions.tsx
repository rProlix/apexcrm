'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, X } from 'lucide-react'
import { dismissOptionalSetupStep } from '@/lib/command-center/setupActions'

export function SetupStepActions({ moduleKey, stepKey }: { moduleKey: string; stepKey: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function dismiss() {
    const reason = window.prompt('Why are you dismissing this optional setup step?')?.trim()
    if (reason === undefined) return
    setError(null)
    startTransition(async () => {
      try {
        await dismissOptionalSetupStep({ moduleKey, stepKey, reason })
        router.refresh()
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Setup step could not be dismissed.')
      }
    })
  }

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={dismiss}
        className="inline-flex items-center gap-1 text-xs text-white/30 hover:text-white disabled:opacity-40"
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
        Dismiss optional step
      </button>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
