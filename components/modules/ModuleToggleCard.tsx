// components/modules/ModuleToggleCard.tsx
'use client'

import { useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CreditCard, CalendarDays, Star, Car, ScanLine,
  UserPlus, MessageSquare, BookUser, Globe, ShoppingBag,
  type LucideIcon,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TenantModuleState } from '@/lib/modules/getTenantModules'

const MODULE_ICONS: Record<string, LucideIcon> = {
  payments:     CreditCard,
  appointments: CalendarDays,
  rewards:      Star,
  vehicles:     Car,
  damage_ai:    ScanLine,
  leads:        UserPlus,
  messages:     MessageSquare,
  contacts:     BookUser,
  website:      Globe,
  store:        ShoppingBag,
}

// Keys that are considered critical — show a warning before disabling
const CRITICAL_KEYS = new Set(['contacts', 'leads'])

interface ModuleToggleCardProps {
  tenantId: string
  module:   TenantModuleState
  /** Called after a successful toggle so parent can update state */
  onToggle?: (moduleKey: string, newState: boolean) => void
  /**
   * Optional override for the toggle API call.
   * Receives (moduleKey, enabled) and should return true on success.
   * When omitted, defaults to POST /api/admin/toggle-module.
   */
  onToggleRequest?: (moduleKey: string, enabled: boolean) => Promise<boolean>
}

export function ModuleToggleCard({ tenantId, module: mod, onToggle, onToggleRequest }: ModuleToggleCardProps) {
  const [enabled, setEnabled]     = useState(mod.is_enabled)
  const [isPending, startTransition] = useTransition()
  const [error, setError]         = useState<string | null>(null)
  const [showWarn, setShowWarn]   = useState(false)

  const Icon = MODULE_ICONS[mod.key] ?? CreditCard
  const isCritical = CRITICAL_KEYS.has(mod.key)

  function requestToggle() {
    const next = !enabled
    // Warn before disabling a critical module
    if (!next && isCritical && !showWarn) {
      setShowWarn(true)
      return
    }
    setShowWarn(false)
    performToggle(next)
  }

  function performToggle(next: boolean) {
    setError(null)
    const prev = enabled

    // Optimistic update
    setEnabled(next)

    startTransition(async () => {
      try {
        if (onToggleRequest) {
          // Custom handler provided by parent (e.g. owner tenant detail page)
          const ok = await onToggleRequest(mod.key, next)
          if (!ok) throw new Error('Toggle failed')
        } else {
          // Default: POST /api/admin/toggle-module
          const res = await fetch('/api/admin/toggle-module', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              tenant_id:  tenantId,
              module_key: mod.key,
              enabled:    next,
            }),
          })

          if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            throw new Error(body.error ?? `HTTP ${res.status}`)
          }
        }

        onToggle?.(mod.key, next)
      } catch (err) {
        // Revert optimistic update on failure
        setEnabled(prev)
        setError((err as Error).message)
      }
    })
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'relative rounded-2xl border p-5 flex flex-col gap-4 transition-all duration-300',
        enabled
          ? 'border-white/10 bg-graphite-900/70'
          : 'border-white/5  bg-graphite-950/60 opacity-70'
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'h-9 w-9 rounded-xl flex items-center justify-center shrink-0 transition-colors duration-300',
              enabled ? mod.bgColor : 'bg-white/5'
            )}
          >
            <Icon
              className={cn(
                'h-4 w-4 transition-colors duration-300',
                enabled ? mod.color : 'text-white/20'
              )}
              strokeWidth={1.75}
            />
          </div>
          <div>
            <p className={cn(
              'text-sm font-semibold transition-colors duration-200',
              enabled ? 'text-white' : 'text-white/30'
            )}>
              {mod.label}
            </p>
            <p className={cn(
              'text-xs transition-colors duration-200 leading-snug mt-0.5 max-w-[180px]',
              enabled ? 'text-white/40' : 'text-white/20'
            )}>
              {mod.description}
            </p>
          </div>
        </div>

        {/* Gold toggle switch */}
        <button
          onClick={requestToggle}
          disabled={isPending}
          aria-label={`${enabled ? 'Disable' : 'Enable'} ${mod.label}`}
          className={cn(
            'relative shrink-0 inline-flex h-6 w-11 items-center rounded-full',
            'transition-colors duration-300 focus-visible:outline-none',
            'focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2',
            'focus-visible:ring-offset-graphite-900',
            isPending && 'cursor-wait opacity-60',
            enabled
              ? 'bg-gradient-to-r from-gold-500 to-amber-400 shadow-[0_0_12px_rgba(201,168,76,0.4)]'
              : 'bg-graphite-700 border border-white/10'
          )}
        >
          <motion.span
            layout
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className={cn(
              'inline-block h-4 w-4 rounded-full shadow-sm',
              enabled ? 'bg-graphite-900 translate-x-6' : 'bg-white/40 translate-x-1'
            )}
          />
        </button>
      </div>

      {/* Status pill */}
      <div className="flex items-center gap-2">
        {isPending ? (
          <span className="flex items-center gap-1.5 text-xs text-white/30">
            <Loader2 className="h-3 w-3 animate-spin" />
            Saving…
          </span>
        ) : (
          <span
            className={cn(
              'text-2xs font-semibold uppercase tracking-widest px-2 py-0.5 rounded',
              enabled
                ? 'bg-emerald-500/12 text-emerald-400'
                : 'bg-white/5 text-white/20'
            )}
          >
            {enabled ? 'Enabled' : 'Disabled'}
          </span>
        )}

        {isCritical && (
          <span className="text-2xs text-amber-400/60 font-medium">Critical</span>
        )}
      </div>

      {/* Critical module warning */}
      <AnimatePresence>
        {showWarn && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-start gap-2 rounded-xl bg-amber-500/8 border border-amber-500/20 px-3 py-2.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" strokeWidth={2} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-amber-300/80 leading-snug mb-2">
                  Disabling <strong>{mod.label}</strong> will remove access for all admins. Continue?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => performToggle(false)}
                    className="text-2xs font-semibold px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors"
                  >
                    Disable anyway
                  </button>
                  <button
                    onClick={() => setShowWarn(false)}
                    className="text-2xs font-semibold px-2.5 py-1 rounded-lg bg-white/5 text-white/40 hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error state */}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-xs text-red-400/70"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
