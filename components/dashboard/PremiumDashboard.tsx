'use client'

import { motion } from 'framer-motion'
import { AdaptiveStatCard } from '@/components/dashboard/AdaptiveStatCard'
import { staggerContainer, fadeUp } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { DashboardConfig, StatCategory } from '@/modules/shared/moduleTypes'

interface PremiumDashboardProps {
  config:     DashboardConfig
  tenantName: string
}

const CATEGORY_ICON_COLOR: Record<StatCategory, string> = {
  operations: 'bg-blue-400/15  border-blue-400/20  text-blue-400',
  financial:  'bg-emerald-400/15 border-emerald-400/20 text-emerald-400',
  usage:      'bg-purple-400/15 border-purple-400/20 text-purple-400',
}

const CATEGORY_DOT_COLOR: Record<StatCategory, string> = {
  operations: 'bg-blue-400',
  financial:  'bg-emerald-400',
  usage:      'bg-purple-400',
}

export function PremiumDashboard({ config, tenantName }: PremiumDashboardProps) {
  if (config.sections.length === 0) {
    return (
      <motion.div
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        className="rounded-2xl premium-panel premium-border p-16 text-center"
      >
        <div className="h-12 w-12 rounded-2xl bg-gold-500/10 border border-gold-500/20 flex items-center justify-center mx-auto mb-4">
          <span className="text-gold-400 text-xl font-bold">
            {tenantName.slice(0, 1)}
          </span>
        </div>
        <h3 className="text-sm font-semibold text-white mb-1">No data yet</h3>
        <p className="text-xs text-white/35 max-w-xs mx-auto">
          Enable modules and add data to see your dashboard come to life.
        </p>
      </motion.div>
    )
  }

  return (
    <motion.div
      variants={staggerContainer(0.12)}
      initial="hidden"
      animate="visible"
      className="space-y-10"
    >
      {config.sections.map((section) => (
        <motion.section key={section.category} variants={fadeUp}>
          {/* Section header */}
          <div className="flex items-center gap-3 mb-5">
            <div
              className={cn(
                'h-6 w-6 rounded-lg border flex items-center justify-center',
                CATEGORY_ICON_COLOR[section.category]
              )}
            >
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  CATEGORY_DOT_COLOR[section.category]
                )}
              />
            </div>
            <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest">
              {section.title}
            </h2>
            <div className="flex-1 h-px bg-white/5" />
            <span className="text-2xs text-white/20">
              {section.stats.filter((s) => !s.isEmpty).length} / {section.stats.length}
            </span>
          </div>

          {/* Stat card grid */}
          <motion.div
            variants={staggerContainer(0.06)}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
          >
            {section.stats.map((stat, i) => (
              <AdaptiveStatCard key={stat.key} stat={stat} index={i} />
            ))}
          </motion.div>
        </motion.section>
      ))}
    </motion.div>
  )
}
