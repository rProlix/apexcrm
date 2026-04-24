// components/modules/ModuleList.tsx
'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, XCircle } from 'lucide-react'
import { ModuleToggleCard } from '@/components/modules/ModuleToggleCard'
import type { TenantModuleState } from '@/lib/modules/getTenantModules'

interface ModuleListProps {
  tenantId: string
  /** Initial module states. Component manages its own optimistic state. */
  modules:  TenantModuleState[]
}

export function ModuleList({ tenantId, modules: initial }: ModuleListProps) {
  const [modules, setModules] = useState<TenantModuleState[]>(initial)

  function handleToggle(moduleKey: string, newState: boolean) {
    setModules((prev) =>
      prev.map((m) =>
        m.key === moduleKey ? { ...m, is_enabled: newState } : m
      )
    )
  }

  const enabledCount  = modules.filter((m) => m.is_enabled).length
  const disabledCount = modules.length - enabledCount

  return (
    <div className="space-y-5">
      {/* Summary counts */}
      <div className="flex items-center gap-4 text-sm">
        <span className="flex items-center gap-1.5 text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
          <span className="font-semibold">{enabledCount}</span>
          <span className="text-white/30">enabled</span>
        </span>
        <span className="flex items-center gap-1.5 text-white/30">
          <XCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
          <span className="font-semibold text-white/30">{disabledCount}</span>
          <span>disabled</span>
        </span>
      </div>

      {/* Module card grid */}
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4"
        initial="hidden"
        animate="visible"
        variants={{
          hidden:  {},
          visible: { transition: { staggerChildren: 0.04 } },
        }}
      >
        {modules.map((mod) => (
          <ModuleToggleCard
            key={mod.key}
            tenantId={tenantId}
            module={mod}
            onToggle={handleToggle}
          />
        ))}
      </motion.div>
    </div>
  )
}
