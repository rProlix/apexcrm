// components/appointments/CustomerSelector.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, User, ChevronDown, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface Customer {
  id:    string
  name:  string
  email: string | null
}

interface Props {
  value?:    string | null
  onChange:  (customerId: string | null, customer: Customer | null) => void
  disabled?: boolean
}

export function CustomerSelector({ value, onChange, disabled }: Props) {
  const [open,      setOpen]      = useState(false)
  const [query,     setQuery]     = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading,   setLoading]   = useState(false)
  const [selected,  setSelected]  = useState<Customer | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Load customers on mount or when searching
  useEffect(() => {
    if (!open) return
    setLoading(true)
    const url = `/api/customers?limit=50${query ? `&q=${encodeURIComponent(query)}` : ''}`
    fetch(url)
      .then((r) => r.json())
      .then(({ customers: data }) => setCustomers(data ?? []))
      .catch(() => setCustomers([]))
      .finally(() => setLoading(false))
  }, [open, query])

  // Resolve initial value label
  useEffect(() => {
    if (!value || selected?.id === value) return
    fetch(`/api/customers/${value}`)
      .then((r) => r.json())
      .then(({ customer }) => setSelected(customer ?? null))
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function select(c: Customer) {
    setSelected(c)
    onChange(c.id, c)
    setOpen(false)
    setQuery('')
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation()
    setSelected(null)
    onChange(null, null)
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`
          w-full flex items-center gap-2 px-3 h-10 rounded-xl border text-sm transition-colors text-left
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          ${open
            ? 'border-gold-500/50 bg-graphite-700'
            : 'border-surface-border bg-graphite-700 hover:border-white/20'
          }
        `}
      >
        <User className="w-4 h-4 text-white/30 shrink-0" />
        <span className={`flex-1 truncate ${selected ? 'text-white' : 'text-white/30'}`}>
          {selected ? selected.name : 'Select customer…'}
        </span>
        {selected ? (
          <X className="w-3.5 h-3.5 text-white/30 hover:text-white/60 shrink-0" onClick={clear} />
        ) : (
          <ChevronDown className={`w-4 h-4 text-white/30 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0,  scale: 1    }}
            exit={{    opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 top-full mt-1.5 w-full rounded-xl border border-surface-border bg-graphite-800 shadow-panel-lg overflow-hidden"
          >
            {/* Search input */}
            <div className="p-2 border-b border-surface-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Search customers…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full pl-7 pr-3 h-8 bg-graphite-700 rounded-lg text-xs text-white placeholder-white/30 focus:outline-none"
                />
              </div>
            </div>

            {/* List */}
            <div className="max-h-52 overflow-y-auto">
              {loading ? (
                <div className="px-4 py-6 text-center text-xs text-white/30">Loading…</div>
              ) : customers.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-white/30">No customers found</div>
              ) : (
                customers.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => select(c)}
                    className={`w-full flex items-start gap-3 px-4 py-2.5 hover:bg-gold-500/8 transition-colors text-left ${
                      selected?.id === c.id ? 'bg-gold-500/10' : ''
                    }`}
                  >
                    <div className="h-7 w-7 rounded-full bg-graphite-600 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-2xs font-semibold text-gold-400">
                        {c.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white leading-tight truncate">{c.name}</p>
                      {c.email && (
                        <p className="text-xs text-white/35 truncate">{c.email}</p>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
