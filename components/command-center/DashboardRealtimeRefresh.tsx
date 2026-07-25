'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { useOperationsRefresh } from '@/components/command-center/OperationsRealtimeProvider'

const DASHBOARD_TABLES = [
  'vehicles',
  'van_damage_attention_alerts',
  'van_damage_inspections',
  'fleet_maintenance_items',
  'fleet_maintenance_history',
  'appointments',
  'orders',
  'payments',
  'customers',
]

export function DashboardRealtimeRefresh() {
  const router = useRouter()
  const [, startTransition] = useTransition()

  useOperationsRefresh(DASHBOARD_TABLES, () => {
    startTransition(() => router.refresh())
  })

  return null
}
