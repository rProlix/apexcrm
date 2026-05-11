'use client'

import { cn } from '@/lib/utils'
import type { CRMModuleKey, CRMPlanKey } from '@/lib/plans/planCatalog'
import { MODULE_CATALOG } from '@/lib/plans/planCatalog'

interface ModuleFeatureListProps {
  modules:     CRMModuleKey[]
  lockedKeys?: CRMModuleKey[]
  planKey?:    CRMPlanKey
  compact?:    boolean
}

export function ModuleFeatureList({ modules, lockedKeys = [], compact = false }: ModuleFeatureListProps) {
  return (
    <ul className={cn('space-y-1', compact && 'space-y-0.5')}>
      {modules.map((key) => {
        const catalog = MODULE_CATALOG[key]
        const isLocked = lockedKeys.includes(key)
        if (!catalog) return null
        return (
          <li
            key={key}
            className={cn(
              'flex items-center gap-2 text-sm',
              compact ? 'text-xs' : 'text-sm',
              isLocked ? 'text-white/30' : 'text-white/70'
            )}
          >
            <span className={cn(compact ? 'text-sm' : 'text-base', isLocked && 'grayscale opacity-40')}>
              {catalog.icon}
            </span>
            <span className={isLocked ? 'line-through decoration-white/20' : ''}>
              {catalog.label}
            </span>
            {isLocked && (
              <span className="text-xs text-white/25 ml-auto">Locked</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
