// components/owner/TenantModuleManager.tsx
'use client'

import { useState, useCallback, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CreditCard, CalendarDays, Star, Car, ScanLine,
  UserPlus, MessageSquare, BookUser, Globe, ShoppingBag,
  AlertTriangle, Loader2, CheckCircle2,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ModuleWithDefaults } from '@/lib/modules/getTenantModulesWithDefaults'

// Module icon map
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

const CRITICAL_KEYS = new Set(['contacts', 'leads'])

interface TenantModuleManagerProps {
  tenantId:       string
  tenantName:     string
  initialModules: ModuleWithDefaults[]
}

interface ModuleState {
  is_enabled:      boolean
  is_from_default: boolean
  isPending:       boolean
  error:           string | null
}

export function TenantModuleManager({
  tenantId,
  tenantName,
  initialModules,
}: TenantModuleManagerProps) {
  // Per-module state map
  const [states, setStates] = useState<Record<string, ModuleState>>(() =>
    Object.fromEntries(
      initialModules.map((m) => [
        m.key,
        { is_enabled: m.is_enabled, is_from_default: m.is_from_default, isPending: false, error: null },
      ])
    )
  )

  const [lastSaved, setLastSaved] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  // Warn state: which module key is awaiting confirmation before disabling
  const [warnKey, setWarnKey] = useState<string | null>(null)

  const toggle = useCallback(
    (moduleKey: string, next: boolean) => {
      const prev = states[moduleKey]?.is_enabled ?? false

      // Optimistic update
      setStates((s) => ({
        ...s,
        [moduleKey]: { ...s[moduleKey], is_enabled: next, isPending: true, error: null },
      }))

      startTransition(async () => {
        try {
          const res = await fetch(`/api/owner/tenants/${tenantId}/modules`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ module_key: moduleKey, is_enabled: next }),
          })

          if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            throw new Error(body.error ?? `HTTP ${res.status}`)
          }

          setStates((s) => ({
            ...s,
            [moduleKey]: { ...s[moduleKey], is_enabled: next, isPending: false, is_from_default: false },
          }))
          setLastSaved(moduleKey)
          setTimeout(() => setLastSaved((k) => (k === moduleKey ? null : k)), 2000)
        } catch (err) {
          // Revert on failure
          setStates((s) => ({
            ...s,
            [moduleKey]: {
              ...s[moduleKey],
              is_enabled: prev,
              isPending:  false,
              error:      (err as Error).message,
            },
          }))
        }
      })
    },
    [tenantId, states]
  )

  function requestToggle(moduleKey: string) {
    const current = states[moduleKey]?.is_enabled ?? false
    const next    = !current

    if (!next && CRITICAL_KEYS.has(moduleKey)) {
      setWarnKey(moduleKey)
      return
    }

    toggle(moduleKey, next)
  }

  const enabledCount = Object.values(states).filter((s) => s.is_enabled).length

  return (
    <div className="space-y-5">
      {/* Summary bar */}
      <div className="flex items-center gap-4 text-sm text-white/40">
        <span>
          <span className="font-semibold text-emerald-400">{enabledCount}</span>
          {' '}of{' '}
          <span className="text-white/40">{initialModules.length}</span>
          {' '}modules enabled for{' '}
          <span className="text-white/60">{tenantName}</span>
        </span>
      </div>

      {/* Critical-module warning modal */}
      <AnimatePresence>
        {warnKey && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            className="rounded-2xl border border-amber-500/25 bg-amber-500/6 px-5 py-4"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" strokeWidth={2} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-300 mb-1">
                  Disable critical module?
                </p>
                <p className="text-xs text-amber-300/70 leading-relaxed mb-3">
                  <strong className="text-amber-300">
                    {initialModules.find((m) => m.key === warnKey)?.label ?? warnKey}
                  </strong>{' '}
                  is a core module. Disabling it will immediately remove access for all admins.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setWarnKey(null); toggle(warnKey, false) }}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors"
                  >
                    Disable anyway
                  </button>
                  <button
                    onClick={() => setWarnKey(null)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/5 text-white/40 hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Module grid */}
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4"
        initial="hidden"
        animate="visible"
        variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.04 } } }}
      >
        {initialModules.map((mod) => {
          const state    = states[mod.key]
          const Icon     = MODULE_ICONS[mod.key] ?? CreditCard
          const enabled  = state?.is_enabled  ?? mod.is_enabled
          const pending  = state?.isPending    ?? false
          const err      = state?.error        ?? null
          const isDefault = state?.is_from_default ?? mod.is_from_default
          const saved    = lastSaved === mod.key

          return (
            <motion.div
              key={mod.key}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                'relative rounded-2xl border p-5 flex flex-col gap-3.5 transition-all duration-300',
                enabled
                  ? 'border-white/10 bg-graphite-900/70'
                  : 'border-white/5 bg-graphite-950/60 opacity-65 hover:opacity-100'
              )}
            >
              {/* Saved flash overlay */}
              <AnimatePresence>
                {saved && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 rounded-2xl flex items-center justify-center bg-emerald-500/6 border border-emerald-500/20 z-10 pointer-events-none"
                  >
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" strokeWidth={2} />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Header: icon + name + toggle */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'h-9 w-9 rounded-xl flex items-center justify-center shrink-0 transition-colors duration-300',
                    enabled ? mod.bgColor : 'bg-white/5'
                  )}>
                    <Icon
                      className={cn('h-4 w-4 transition-colors duration-300', enabled ? mod.color : 'text-white/20')}
                      strokeWidth={1.75}
                    />
                  </div>
                  <div>
                    <p className={cn('text-sm font-semibold transition-colors duration-200', enabled ? 'text-white' : 'text-white/30')}>
                      {mod.label}
                    </p>
                    <p className={cn('text-xs leading-snug mt-0.5 max-w-[180px] transition-colors duration-200', enabled ? 'text-white/40' : 'text-white/20')}>
                      {mod.description}
                    </p>
                  </div>
                </div>

                {/* Gold toggle */}
                <button
                  onClick={() => requestToggle(mod.key)}
                  disabled={pending}
                  aria-label={`${enabled ? 'Disable' : 'Enable'} ${mod.label}`}
                  className={cn(
                    'relative shrink-0 inline-flex h-6 w-11 items-center rounded-full',
                    'transition-all duration-300 focus-visible:outline-none',
                    'focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2',
                    'focus-visible:ring-offset-graphite-900',
                    pending && 'cursor-wait opacity-50',
                    enabled
                      ? 'bg-gradient-to-r from-gold-500 to-amber-400 shadow-[0_0_12px_rgba(201,168,76,0.35)]'
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

              {/* Footer: status + tags */}
              <div className="flex items-center gap-2 flex-wrap">
                {pending ? (
                  <span className="flex items-center gap-1.5 text-xs text-white/30">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Saving…
                  </span>
                ) : (
                  <span className={cn(
                    'text-2xs font-semibold uppercase tracking-widest px-2 py-0.5 rounded',
                    enabled ? 'bg-emerald-500/12 text-emerald-400' : 'bg-white/5 text-white/20'
                  )}>
                    {enabled ? 'Enabled' : 'Disabled'}
                  </span>
                )}

                {CRITICAL_KEYS.has(mod.key) && (
                  <span className="text-2xs text-amber-400/60 font-medium">Critical</span>
                )}

                {isDefault && (
                  <span className="text-2xs text-white/20 font-medium ml-auto">default</span>
                )}
              </div>

              {/* Error */}
              <AnimatePresence>
                {err && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-xs text-red-400/70"
                  >
                    {err}
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.div>
          )
        })}
      </motion.div>
    </div>
  )
}
