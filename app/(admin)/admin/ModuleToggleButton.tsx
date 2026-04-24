// app/(admin)/admin/ModuleToggleButton.tsx
'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'

interface ModuleToggleButtonProps {
  tenantId:  string
  moduleKey: string
  enabled:   boolean
}

export function ModuleToggleButton({ tenantId, moduleKey, enabled: initialEnabled }: ModuleToggleButtonProps) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [isPending, startTransition] = useTransition()

  function toggle() {
    const next = !enabled
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/toggle-module', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenant_id: tenantId, module_key: moduleKey, enabled: next }),
        })
        if (res.ok) setEnabled(next)
      } catch {
        // revert on failure — no-op, state stays as previous
      }
    })
  }

  return (
    <button
      onClick={toggle}
      disabled={isPending}
      title={`${enabled ? 'Disable' : 'Enable'} ${moduleKey}`}
      className={cn(
        'px-2.5 py-1 rounded-lg text-xs font-medium border transition-all duration-150',
        isPending && 'opacity-50 cursor-wait',
        enabled
          ? 'bg-emerald-500/12 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
          : 'bg-white/4 border-white/10 text-white/30 hover:bg-white/8 hover:text-white/50'
      )}
    >
      {moduleKey.replace('_', ' ')}
    </button>
  )
}
