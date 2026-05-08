// components/appointments/ProfessionalSelector.tsx
'use client'

import { useEffect, useState } from 'react'
import { User, ChevronDown, Check, Loader2 } from 'lucide-react'
import type { Professional } from '@/lib/appointments/types'

interface Props {
  value:     string | null
  onChange:  (id: string | null) => void
  required?: boolean
  placeholder?: string
  className?: string
}

export function ProfessionalSelector({
  value,
  onChange,
  required,
  placeholder = 'Any professional',
  className   = '',
}: Props) {
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [loading,       setLoading]       = useState(true)
  const [open,          setOpen]          = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch('/api/professionals?active=true')
      .then((r) => r.json())
      .then(({ data }) => {
        if (!cancelled) setProfessionals(data?.professionals ?? [])
      })
      .catch(() => {
        if (!cancelled) setProfessionals([])
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const selected = professionals.find((p) => p.id === value) ?? null

  if (loading) {
    return (
      <div className={`flex items-center gap-2 h-10 px-3 bg-graphite-700 border border-surface-border rounded-xl ${className}`}>
        <Loader2 className="w-3.5 h-3.5 text-white/30 animate-spin" />
        <span className="text-sm text-white/30">Loading professionals…</span>
      </div>
    )
  }

  if (professionals.length === 0) {
    return (
      <div className={`flex items-center gap-2 h-10 px-3 bg-graphite-700/50 border border-surface-border/50 rounded-xl ${className}`}>
        <User className="w-3.5 h-3.5 text-white/20" />
        <span className="text-sm text-white/25 italic">No professionals added yet</span>
      </div>
    )
  }

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 h-10 px-3 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white hover:border-gold-500/40 transition-colors focus:outline-none focus:border-gold-500/50"
      >
        <User className="w-3.5 h-3.5 text-white/40 shrink-0" />
        <span className={`flex-1 text-left truncate ${!selected ? 'text-white/40' : ''}`}>
          {selected ? selected.name : placeholder}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-white/30 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl bg-graphite-800 border border-surface-border shadow-panel-lg overflow-hidden">
          {!required && (
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-white/50 hover:bg-graphite-700 hover:text-white transition-colors"
            >
              <span className="flex-1 text-left">{placeholder}</span>
              {!value && <Check className="w-3.5 h-3.5 text-gold-400" />}
            </button>
          )}

          <div className="divide-y divide-surface-border/30">
            {professionals.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => { onChange(p.id); setOpen(false) }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-graphite-700 transition-colors group"
              >
                {p.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.avatar_url}
                    alt={p.name}
                    className="w-7 h-7 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-gold-400/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-gold-400">
                      {p.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-white font-medium truncate">{p.name}</p>
                  {p.role && (
                    <p className="text-2xs text-white/35 truncate capitalize">{p.role}</p>
                  )}
                </div>
                {value === p.id && <Check className="w-3.5 h-3.5 text-gold-400 shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Click-outside overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setOpen(false)}
        />
      )}
    </div>
  )
}
