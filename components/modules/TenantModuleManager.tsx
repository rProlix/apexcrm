// components/modules/TenantModuleManager.tsx
'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Building2, ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ModuleList } from '@/components/modules/ModuleList'
import type { TenantModuleState } from '@/lib/modules/getTenantModules'

interface Tenant {
  id:         string
  name:       string
  slug:       string
  status:     string
  created_at: string
}

interface TenantModuleManagerProps {
  tenants:         Tenant[]
  modulesByTenant: Record<string, TenantModuleState[]>
}

export function TenantModuleManager({ tenants, modulesByTenant }: TenantModuleManagerProps) {
  const [selectedId, setSelectedId] = useState<string>(tenants[0]?.id ?? '')
  const [search, setSearch]         = useState('')
  const [dropdownOpen, setDropdown] = useState(false)

  const filtered = tenants.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.slug.toLowerCase().includes(search.toLowerCase())
  )

  const selectedTenant  = tenants.find((t) => t.id === selectedId)
  const selectedModules = selectedId ? modulesByTenant[selectedId] ?? [] : []

  return (
    <div className="space-y-6">
      {/* Tenant selector */}
      <div className="flex items-start gap-4">
        <div className="flex-1 max-w-sm">
          <label className="block text-xs font-semibold text-white/30 uppercase tracking-widest mb-2">
            Select Business
          </label>

          <div className="relative">
            <button
              onClick={() => setDropdown((o) => !o)}
              className={cn(
                'w-full flex items-center justify-between gap-3',
                'px-4 py-3 rounded-xl border text-sm',
                'bg-graphite-900/80 text-white',
                'transition-colors duration-150',
                dropdownOpen
                  ? 'border-gold-500/50 bg-graphite-900'
                  : 'border-white/10 hover:border-white/20'
              )}
            >
              <span className="flex items-center gap-2 truncate">
                <Building2 className="h-4 w-4 text-gold-400 shrink-0" strokeWidth={1.75} />
                <span className="truncate">
                  {selectedTenant?.name ?? 'Choose a business…'}
                </span>
              </span>
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-white/30 shrink-0 transition-transform duration-200',
                  dropdownOpen && 'rotate-180'
                )}
                strokeWidth={1.75}
              />
            </button>

            <AnimatePresence>
              {dropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.12 }}
                  className={cn(
                    'absolute z-50 left-0 right-0 mt-2',
                    'rounded-xl border border-white/10 bg-graphite-900',
                    'shadow-2xl shadow-black/40 overflow-hidden'
                  )}
                >
                  {/* Search box */}
                  <div className="px-3 pt-3 pb-2 border-b border-white/6">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/25" />
                      <input
                        type="text"
                        placeholder="Search businesses…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className={cn(
                          'w-full pl-8 pr-3 py-2 rounded-lg text-xs',
                          'bg-graphite-800 border border-white/8 text-white',
                          'placeholder:text-white/25 focus:outline-none',
                          'focus:border-gold-500/40 focus:bg-graphite-800',
                        )}
                      />
                    </div>
                  </div>

                  {/* Tenant list */}
                  <div className="max-h-56 overflow-y-auto py-1">
                    {filtered.length === 0 ? (
                      <p className="px-4 py-3 text-xs text-white/25 text-center">No matches</p>
                    ) : (
                      filtered.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => {
                            setSelectedId(t.id)
                            setDropdown(false)
                            setSearch('')
                          }}
                          className={cn(
                            'w-full flex items-center justify-between gap-3',
                            'px-4 py-2.5 text-sm text-left',
                            'transition-colors duration-100',
                            t.id === selectedId
                              ? 'bg-gold-500/8 text-gold-400'
                              : 'text-white/60 hover:bg-white/4 hover:text-white'
                          )}
                        >
                          <span className="truncate">{t.name}</span>
                          <span className="text-2xs text-white/20 font-mono shrink-0">
                            {t.slug}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Selected tenant meta */}
        {selectedTenant && (
          <div className="flex items-center gap-2 mt-7">
            <span
              className={cn(
                'text-xs px-2 py-0.5 rounded-lg border font-medium',
                selectedTenant.status === 'active'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-white/5 border-white/10 text-white/30'
              )}
            >
              {selectedTenant.status}
            </span>
            <span className="text-xs text-white/25 font-mono">{selectedTenant.slug}</span>
          </div>
        )}
      </div>

      {/* Module list for selected tenant */}
      <AnimatePresence mode="wait">
        {selectedId && (
          <motion.div
            key={selectedId}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
          >
            <div className="mb-4">
              <p className="text-xs font-semibold text-white/20 uppercase tracking-widest">
                Modules for{' '}
                <span className="text-white/40">{selectedTenant?.name}</span>
              </p>
            </div>

            <ModuleList
              tenantId={selectedId}
              modules={selectedModules}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
