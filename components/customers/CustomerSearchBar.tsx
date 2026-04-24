'use client'
// components/customers/CustomerSearchBar.tsx
import { useState, useCallback, useRef } from 'react'
import { Search, X, Loader2 } from 'lucide-react'
import type { TenantCustomer } from '@/lib/customers/getTenantCustomers'

interface Props {
  tenantId:  string
  onResults: (customers: TenantCustomer[]) => void
  onClear:   () => void
  placeholder?: string
}

export function CustomerSearchBar({ tenantId, onResults, onClear, placeholder }: Props) {
  const [query, setQuery]       = useState('')
  const [loading, setLoading]   = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { onClear(); return }
    setLoading(true)
    try {
      const res = await fetch(
        `/api/customers/search?q=${encodeURIComponent(q)}&tenant_id=${tenantId}`
      )
      if (res.ok) {
        const { customers } = await res.json()
        onResults(customers ?? [])
      }
    } catch (err) {
      console.error('[CustomerSearchBar] search error', err)
    } finally {
      setLoading(false)
    }
  }, [tenantId, onResults, onClear])

  const handleChange = (value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(value), 320)
  }

  const handleClear = () => {
    setQuery('')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    onClear()
  }

  return (
    <div className="relative">
      <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
        {loading
          ? <Loader2 className="w-4 h-4 text-white/30 animate-spin" />
          : <Search className="w-4 h-4 text-white/30" />
        }
      </div>
      <input
        type="text"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder ?? 'Search by name, email, or phone…'}
        className="w-full h-11 pl-11 pr-10 rounded-xl bg-graphite-900 border border-white/8 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-gold-500/40 focus:ring-1 focus:ring-gold-500/20 transition-colors"
      />
      {query && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute inset-y-0 right-3 flex items-center px-1 text-white/30 hover:text-white/60 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
