'use client'

import { motion } from 'framer-motion'
import { staggerContainer } from '@/lib/motion'
import { ModuleCard } from '@/components/dashboard/ModuleCard'
import type { ModuleDefinition, ModuleStat } from '@/modules/shared/moduleTypes'

interface ModuleGridProps {
  modules: ModuleDefinition[]
  statsMap?: Record<string, ModuleStat[]>
}

export function ModuleGrid({ modules, statsMap = {} }: ModuleGridProps) {
  if (modules.length === 0) {
    return (
      <div className="rounded-2xl premium-panel premium-border p-12 text-center text-white/30 text-sm">
        No modules enabled. Visit Settings → Modules to enable features.
      </div>
    )
  }

  return (
    <motion.div
      variants={staggerContainer(0.06)}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
    >
      {modules.map((mod) => (
        <ModuleCard
          key={mod.key}
          module={mod}
          stats={statsMap[mod.key]}
        />
      ))}
    </motion.div>
  )
}
