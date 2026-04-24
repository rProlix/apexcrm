'use client'
// components/customers/CustomerList.tsx
import { Users } from 'lucide-react'
import { CustomerCard } from './CustomerCard'
import type { TenantCustomer } from '@/lib/customers/getTenantCustomers'

interface Props {
  customers:  TenantCustomer[]
  canManage?: boolean
  emptyMessage?: string
}

export function CustomerList({ customers, canManage, emptyMessage }: Props) {
  if (customers.length === 0) {
    return (
      <div className="premium-panel premium-border rounded-2xl py-16 flex flex-col items-center gap-4">
        <div className="h-14 w-14 rounded-2xl bg-white/4 flex items-center justify-center">
          <Users className="w-6 h-6 text-white/20" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-white/60">
            {emptyMessage ?? 'No customers found'}
          </p>
          <p className="text-xs text-white/30 mt-1">
            Customers will appear here when they place orders or are added manually
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {customers.map((customer, i) => (
        <CustomerCard
          key={customer.id}
          customer={customer}
          index={i}
          canManage={canManage}
        />
      ))}
    </div>
  )
}
