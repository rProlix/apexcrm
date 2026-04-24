// components/owner/TenantList.tsx
'use client'

import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Search, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TenantCard } from '@/components/owner/TenantCard'
import type { TenantSummary } from '@/lib/owner/getTenants'

type StatusFilter = 'all' | 'active' | 'inactive'

interface TenantListProps {
  tenants: TenantSummary[]
}

export function TenantList({ tenants }: TenantListProps) {
  const [search, setSearch]       = useState('')
  const [status, setStatus]       = useState<StatusFilter>('all')

  const filtered = useMemo(() => {
    return tenants.filter((t) => {
      const matchesSearch =
        !search ||
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.slug.toLowerCase().includes(search.toLowerCase()) ||
        (t.subdomain ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (t.custom_domain ?? '').toLowerCase().includes(search.toLowerCase())

      const matchesStatus =
        status === 'all' ||
        (status === 'active'   && t.status === 'active') ||
        (status === 'inactive' && t.status !== 'active')

      return matchesSearch && matchesStatus
    })
  }, [tenants, search, status])

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20 pointer-events-none" />
          <input
            type="text"
            placeholder="Search businesses…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn(
              'w-full pl-10 pr-4 py-2.5 rounded-xl text-sm',
              'bg-graphite-900 border border-white/10 text-white',
              'placeholder:text-white/25',
              'focus:outline-none focus:border-gold-500/40 focus:bg-graphite-900',
              'transition-colors duration-150'
            )}
          />
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-graphite-900 border border-white/8">
          <SlidersHorizontal className="h-3.5 w-3.5 text-white/20 ml-1.5 mr-0.5 shrink-0" strokeWidth={1.75} />
          {(['all', 'active', 'inactive'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all duration-150',
                status === s
                  ? 'bg-gold-500/12 text-gold-400 border border-gold-500/20'
                  : 'text-white/35 hover:text-white/60'
              )}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Result count */}
        <p className="text-xs text-white/25 ml-auto">
          {filtered.length} of {tenants.length}
        </p>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-16 rounded-2xl border border-surface-border bg-graphite-900/40"
        >
          <p className="text-white/25 text-sm">No businesses match your filters.</p>
        </motion.div>
      ) : (
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4"
          initial="hidden"
          animate="visible"
          variants={{
            hidden:  {},
            visible: { transition: { staggerChildren: 0.05 } },
          }}
        >
          {filtered.map((tenant) => (
            <TenantCard key={tenant.id} tenant={tenant} />
          ))}
        </motion.div>
      )}
    </div>
  )
}
