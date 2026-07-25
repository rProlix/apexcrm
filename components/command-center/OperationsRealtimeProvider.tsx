'use client'

import Link from 'next/link'
import { Radio, RefreshCw } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/browser'
import { cn } from '@/lib/utils'

export interface SafeOperationEvent {
  table: string
  moduleKey: string
  label: string
  href: string
  receivedAt: string
}

interface OperationsRealtimeValue {
  status: 'connecting' | 'connected' | 'unavailable'
  lastUpdatedAt: string | null
  latestEvent: SafeOperationEvent | null
  subscribe: (listener: (events: SafeOperationEvent[]) => void) => () => void
}

const OperationsRealtimeContext = createContext<OperationsRealtimeValue | null>(null)

const MODULE_TABLES: Record<string, Array<{ table: string; label: string; href: string }>> = {
  vehicles: [
    { table: 'vehicles', label: 'Vehicle updated', href: '/dashboard/vehicles' },
    {
      table: 'van_damage_attention_alerts',
      label: 'Fleet attention updated',
      href: '/dashboard/vehicles',
    },
  ],
  damage_ai: [
    {
      table: 'van_damage_inspections',
      label: 'Inspection received or updated',
      href: '/dashboard/damage-ai',
    },
  ],
  maintenance: [
    {
      table: 'fleet_maintenance_items',
      label: 'Maintenance item updated',
      href: '/dashboard/vehicles/maintenance',
    },
    {
      table: 'fleet_maintenance_history',
      label: 'Maintenance history updated',
      href: '/dashboard/vehicles/maintenance',
    },
  ],
  appointments: [{ table: 'appointments', label: 'Appointment changed', href: '/appointments' }],
  store: [{ table: 'orders', label: 'Order received or updated', href: '/store/orders' }],
  payments: [
    { table: 'payments', label: 'Payment status changed', href: '/payments/transactions' },
  ],
  customers: [{ table: 'customers', label: 'Customer updated', href: '/customers' }],
}

export function OperationsRealtimeProvider({
  tenantId,
  activeModuleKeys,
  children,
}: {
  tenantId: string
  activeModuleKeys: string[]
  children: React.ReactNode
}) {
  const [status, setStatus] = useState<OperationsRealtimeValue['status']>('connecting')
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null)
  const [latestEvent, setLatestEvent] = useState<SafeOperationEvent | null>(null)
  const listenersRef = useRef(new Set<(events: SafeOperationEvent[]) => void>())
  const pendingRef = useRef<SafeOperationEvent[]>([])
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const tableDefinitions = useMemo(() => {
    const unique = new Map<
      string,
      { table: string; label: string; href: string; moduleKey: string }
    >()
    for (const moduleKey of activeModuleKeys) {
      for (const definition of MODULE_TABLES[moduleKey] ?? []) {
        if (!unique.has(definition.table))
          unique.set(definition.table, { ...definition, moduleKey })
      }
    }
    return [...unique.values()]
  }, [activeModuleKeys])

  const subscribe = useCallback((listener: (events: SafeOperationEvent[]) => void) => {
    listenersRef.current.add(listener)
    return () => listenersRef.current.delete(listener)
  }, [])

  useEffect(() => {
    setLastUpdatedAt(new Date().toISOString())
    if (tableDefinitions.length === 0) {
      setStatus('unavailable')
      return
    }
    const supabase = createClient()
    let channel = supabase.channel(`operations:${tenantId}`)
    const queue = (definition: (typeof tableDefinitions)[number]) => {
      const event: SafeOperationEvent = {
        table: definition.table,
        moduleKey: definition.moduleKey,
        label: definition.label,
        href: definition.href,
        receivedAt: new Date().toISOString(),
      }
      pendingRef.current.push(event)
      if (batchTimerRef.current) return
      batchTimerRef.current = setTimeout(() => {
        const events = pendingRef.current.splice(0)
        batchTimerRef.current = null
        const latest = events[events.length - 1]
        if (latest) {
          setLatestEvent(latest)
          setLastUpdatedAt(latest.receivedAt)
          for (const listener of listenersRef.current) listener(events)
        }
      }, 500)
    }

    for (const definition of tableDefinitions) {
      channel = channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: definition.table,
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => queue(definition)
      )
    }
    channel.subscribe((nextStatus) => {
      if (nextStatus === 'SUBSCRIBED') setStatus('connected')
      if (nextStatus === 'CHANNEL_ERROR' || nextStatus === 'TIMED_OUT') setStatus('unavailable')
    })
    return () => {
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current)
      batchTimerRef.current = null
      pendingRef.current = []
      void supabase.removeChannel(channel)
    }
  }, [tableDefinitions, tenantId])

  const value = useMemo(
    () => ({ status, lastUpdatedAt, latestEvent, subscribe }),
    [lastUpdatedAt, latestEvent, status, subscribe]
  )
  return (
    <OperationsRealtimeContext.Provider value={value}>
      {children}
    </OperationsRealtimeContext.Provider>
  )
}

export function useOperationsRefresh(
  tables: string[],
  onUpdate: (events: SafeOperationEvent[]) => void
) {
  const realtime = useContext(OperationsRealtimeContext)
  const tableKey = tables.join('|')
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate
  useEffect(() => {
    if (!realtime) return
    const allowed = new Set(tableKey.split('|').filter(Boolean))
    return realtime.subscribe((events) => {
      const matching = events.filter((event) => allowed.has(event.table))
      if (matching.length) onUpdateRef.current(matching)
    })
  }, [realtime, tableKey])
}

export function LiveOperationsPulse({ className }: { className?: string }) {
  const realtime = useContext(OperationsRealtimeContext)
  const [changeKey, setChangeKey] = useState('')
  useEffect(() => {
    if (realtime?.latestEvent) setChangeKey(realtime.latestEvent.receivedAt)
  }, [realtime?.latestEvent])

  if (!realtime) return null
  const time = realtime.lastUpdatedAt
    ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(
        new Date(realtime.lastUpdatedAt)
      )
    : null
  const content = (
    <>
      {realtime.status === 'connected' ? (
        <Radio className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
      ) : (
        <RefreshCw className="h-3.5 w-3.5 text-white/35" aria-hidden="true" />
      )}
      <span className="truncate">
        {realtime.latestEvent?.label ??
          (time ? `Data current as of ${time}` : 'Checking data freshness')}
      </span>
    </>
  )
  const classes = cn(
    'flex min-h-9 max-w-64 items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.025] px-2.5 text-xs text-white/45',
    changeKey && 'ui-live-change',
    className
  )
  return realtime.latestEvent ? (
    <Link key={changeKey} href={realtime.latestEvent.href} className={classes} aria-live="polite">
      {content}
    </Link>
  ) : (
    <div className={classes} aria-live="polite">
      {content}
    </div>
  )
}
