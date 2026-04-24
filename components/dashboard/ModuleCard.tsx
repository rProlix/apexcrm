'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { cardHover, fadeUp } from '@/lib/motion'
import type { ModuleDefinition, ModuleStat } from '@/modules/shared/moduleTypes'

interface ModuleCardProps {
  module: ModuleDefinition
  stats?: ModuleStat[]
}

export function ModuleCard({ module: mod, stats }: ModuleCardProps) {
  const Icon = mod.icon

  return (
    <motion.div variants={fadeUp} initial="rest" whileHover="hover">
      <Link href={mod.href} className="block focus-ring rounded-2xl">
        <motion.div
          variants={cardHover}
          className={cn(
            'relative overflow-hidden rounded-2xl p-5',
            'premium-panel premium-border noise-overlay',
            'group transition-shadow duration-300 hover:shadow-panel-lg'
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div
              className={cn(
                'h-10 w-10 rounded-xl flex items-center justify-center',
                mod.bgColor,
                'border border-white/10'
              )}
            >
              <Icon className={cn('h-5 w-5', mod.color)} strokeWidth={1.75} />
            </div>
            <ArrowRight
              className="h-4 w-4 text-white/20 group-hover:text-gold-400 transition-colors duration-200"
              strokeWidth={2}
            />
          </div>

          {/* Label + description */}
          <p className="text-sm font-semibold text-white mb-0.5">{mod.label}</p>
          <p className="text-xs text-white/40 leading-relaxed line-clamp-2 mb-4">
            {mod.description}
          </p>

          {/* Stats */}
          {stats && stats.length > 0 && (
            <div className="grid grid-cols-3 gap-2 pt-4 border-t border-white/6">
              {stats.slice(0, 3).map((stat) => (
                <div key={stat.label} className="text-center">
                  <p className={cn('text-base font-bold tabular-nums', mod.color)}>{stat.value}</p>
                  <p className="text-2xs text-white/35 truncate">{stat.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Corner glow */}
          <div
            className={cn(
              'pointer-events-none absolute -bottom-8 -right-8 h-28 w-28 rounded-full blur-3xl opacity-30',
              mod.bgColor
            )}
          />
        </motion.div>
      </Link>
    </motion.div>
  )
}
