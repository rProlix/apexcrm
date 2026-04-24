'use client'

import { motion } from 'framer-motion'
import { Sparkles, Plus } from 'lucide-react'
import { staggerContainer, fadeUp } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { WidgetConfig } from '@/lib/dashboard/types'

interface SuggestedWidgetsMeta {
  key:            string
  label:          string
  description:    string
  type?:          WidgetConfig['type']
  defaultSection: string
}

interface SuggestedWidgetsProps {
  widgetKeys:     string[]
  widgetRegistry: Record<string, SuggestedWidgetsMeta>
  onAdd:          (key: string, type: WidgetConfig['type'], defaultSection: string) => void
}

export function SuggestedWidgets({ widgetKeys, widgetRegistry, onAdd }: SuggestedWidgetsProps) {
  const widgets = widgetKeys
    .map((k) => widgetRegistry[k])
    .filter(Boolean)
    .slice(0, 8) // show max 8

  if (widgets.length === 0) return null

  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      className="rounded-2xl premium-panel premium-border p-6"
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-5">
        <div className="h-6 w-6 rounded-lg bg-gold-500/10 border border-gold-500/20 flex items-center justify-center">
          <Sparkles className="h-3.5 w-3.5 text-gold-400" strokeWidth={1.75} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Suggested for your business</h3>
          <p className="text-xs text-white/35">Based on your enabled modules</p>
        </div>
      </div>

      {/* Widget suggestions */}
      <motion.div
        variants={staggerContainer(0.05)}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
      >
        {widgets.map((w) => (
          <motion.div key={w.key} variants={fadeUp}>
            <button
              onClick={() => onAdd(w.key, w.type ?? 'stat', w.defaultSection)}
              className={cn(
                'w-full text-left rounded-xl p-4 group',
                'bg-graphite-800 border border-graphite-600',
                'hover:border-gold-500/30 hover:bg-graphite-700',
                'transition-all duration-150 focus-ring'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white/70 mb-1 truncate">{w.label}</p>
                  <p className="text-xs text-white/30 leading-relaxed line-clamp-2">{w.description}</p>
                </div>
                <div
                  className={cn(
                    'shrink-0 h-6 w-6 rounded-lg border flex items-center justify-center',
                    'border-white/10 bg-white/5',
                    'group-hover:border-gold-500/40 group-hover:bg-gold-500/10',
                    'transition-colors duration-150'
                  )}
                >
                  <Plus className="h-3.5 w-3.5 text-white/30 group-hover:text-gold-400 transition-colors duration-150" strokeWidth={2} />
                </div>
              </div>
              {w.type && w.type !== 'stat' && (
                <span className="mt-2 inline-flex items-center text-2xs text-white/20 border border-white/8 rounded px-1.5 py-0.5">
                  {w.type}
                </span>
              )}
            </button>
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  )
}
