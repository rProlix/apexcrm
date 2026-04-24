'use client'
// components/customers/CustomersDashboard.tsx
import { useState, useCallback } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Users, UserCheck, ShoppingBag, TrendingUp, Plus } from 'lucide-react'
import { CustomerList } from './CustomerList'
import { CustomerSearchBar } from './CustomerSearchBar'
import type { TenantCustomer } from '@/lib/customers/getTenantCustomers'

interface Props {
  initialCustomers: TenantCustomer[]
  totalCount:       number
  activeCount:      number
  tenantId:         string
  userRole:         string
}

const FADE_UP = {
  hidden:  { opacity: 0, y: 16 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.4 } }),
}

export function CustomersDashboard({
  initialCustomers,
  totalCount,
  activeCount,
  tenantId,
  userRole,
}: Props) {
  const [customers, setCustomers] = useState<TenantCustomer[]>(initialCustomers)
  const [isSearching, setIsSearching] = useState(false)

  const handleSearchResults = useCallback((results: TenantCustomer[]) => {
    setCustomers(results)
    setIsSearching(true)
  }, [])

  const handleSearchClear = useCallback(() => {
    setCustomers(initialCustomers)
    setIsSearching(false)
  }, [initialCustomers])

  const canManage = userRole === 'owner' || userRole === 'admin'

  const stats = [
    { icon: Users,       label: 'Total Customers', value: totalCount,  color: 'text-cyan-400',    bg: 'bg-cyan-400/10'    },
    { icon: UserCheck,   label: 'Active',           value: activeCount, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
    { icon: ShoppingBag, label: 'With Orders',      value: initialCustomers.filter(c => c.has_account).length, color: 'text-amber-400', bg: 'bg-amber-400/10' },
    { icon: TrendingUp,  label: 'This Month',       value: initialCustomers.filter(c => {
      const d = new Date(c.created_at)
      const now = new Date()
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    }).length, color: 'text-gold-400', bg: 'bg-gold-400/10' },
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-start justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Customers</h1>
          <p className="text-sm text-white/40 mt-1">
            Manage your tenant&apos;s customer relationships
          </p>
        </div>
        {canManage && (
          <Link
            href="/customers/new"
            className="inline-flex items-center gap-2 h-10 px-5 rounded-xl font-semibold text-sm bg-gold-gradient text-graphite-900 hover:shadow-glow-gold transition-all duration-200"
          >
            <Plus className="w-4 h-4" />
            Add Customer
          </Link>
        )}
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            custom={i}
            initial="hidden"
            animate="visible"
            variants={FADE_UP}
            className="premium-panel premium-border rounded-2xl p-5"
          >
            <div className={`inline-flex h-9 w-9 rounded-xl ${stat.bg} items-center justify-center mb-3`}>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </div>
            <p className="text-2xl font-bold text-white">{stat.value.toLocaleString()}</p>
            <p className="text-xs text-white/40 mt-0.5">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Search */}
      <CustomerSearchBar
        tenantId={tenantId}
        onResults={handleSearchResults}
        onClear={handleSearchClear}
      />

      {/* Customer List */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.4 }}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-white/40">
            {isSearching
              ? `${customers.length} result${customers.length !== 1 ? 's' : ''}`
              : `${totalCount.toLocaleString()} customer${totalCount !== 1 ? 's' : ''}`}
          </p>
        </div>
        <CustomerList customers={customers} canManage={canManage} />
      </motion.div>
    </div>
  )
}
