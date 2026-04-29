'use client'

import { useTransition } from 'react'
import { toggleModule } from '@/app/(dashboard)/modules/actions'
import { cn } from '@/lib/utils'

interface ModuleToggleProps {
  tenantId:  string
  moduleKey: string
  enabled:   boolean
}

export function ModuleToggle({ tenantId, moduleKey, enabled }: ModuleToggleProps) {
  const [pending, startTransition] = useTransition()

  function handleToggle() {
    startTransition(async () => {
      await toggleModule(tenantId, moduleKey, !enabled)
    })
  }

  return (
    <button
      onClick={handleToggle}
      disabled={pending}
      aria-label={enabled ? `Disable ${moduleKey}` : `Enable ${moduleKey}`}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent',
        'transition-colors duration-200 ease-in-out focus:outline-none',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        enabled ? 'bg-gold-500' : 'bg-graphite-600',
      )}
    >
      <span className="sr-only">{enabled ? 'Enabled' : 'Disabled'}</span>
      <span
        className={cn(
          'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg',
          'transform ring-0 transition duration-200 ease-in-out',
          enabled ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  )
}
