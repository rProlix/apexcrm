'use client'

import { useState, useEffect } from 'react'
import { X, Search, User } from 'lucide-react'

interface Customer {
  id:     string
  name:   string
  email?: string | null
  phone?: string | null
}

interface Props {
  tenantId: string
  selected: Customer | null
  onSelect: (c: Customer) => void
  onClose:  () => void
}

export function CustomerSelector({ tenantId, selected, onSelect, onClose }: Props) {
  const [search, setSearch]         = useState('')
  const [customers, setCustomers]   = useState<Customer[]>([])
  const [loading, setLoading]       = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName]       = useState('')
  const [newEmail, setNewEmail]     = useState('')
  const [newPhone, setNewPhone]     = useState('')
  const [creating, setCreating]     = useState(false)

  useEffect(() => {
    if (search.length < 2) { setCustomers([]); return }
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/customers?search=${encodeURIComponent(search)}&limit=20`)
        const data = await res.json()
        setCustomers(data.customers ?? [])
      } catch { setCustomers([]) } finally { setLoading(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), email: newEmail || null, phone: newPhone || null }),
      })
      const data = await res.json()
      if (data.customer) onSelect(data.customer)
    } catch { /* silent */ } finally { setCreating(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
      <div className="w-full sm:max-w-md bg-zinc-900 sm:rounded-2xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-100">Select Customer</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-zinc-400" /></button>
        </div>

        <div className="p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 w-4 h-4" />
            <input
              autoFocus
              type="text"
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500"
            />
          </div>

          {selected && (
            <div className="flex items-center justify-between p-3 bg-violet-600/10 border border-violet-500/30 rounded-lg">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-violet-400" />
                <span className="text-sm text-violet-300">{selected.name}</span>
              </div>
              <button onClick={() => onSelect({ id: '', name: '' })} className="text-xs text-zinc-500 hover:text-red-400">Remove</button>
            </div>
          )}

          {loading && <p className="text-sm text-zinc-500 text-center py-2">Searching…</p>}

          {customers.length > 0 && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {customers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onSelect(c)}
                  className="w-full flex items-start gap-3 px-3 py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-left transition-colors"
                >
                  <User className="w-4 h-4 text-zinc-500 mt-0.5 flex-none" />
                  <div>
                    <p className="text-sm font-medium text-zinc-200">{c.name}</p>
                    {(c.email || c.phone) && (
                      <p className="text-xs text-zinc-500">{c.email ?? c.phone}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {!showCreate ? (
            <button
              onClick={() => setShowCreate(true)}
              className="w-full py-2 border border-dashed border-zinc-700 rounded-lg text-sm text-zinc-500 hover:text-violet-400 hover:border-violet-600 transition-colors"
            >
              + Create new customer
            </button>
          ) : (
            <div className="space-y-2 p-3 bg-zinc-800 rounded-lg">
              <p className="text-sm font-medium text-zinc-300">New Customer</p>
              <input type="text" placeholder="Name *" value={newName} onChange={(e) => setNewName(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500" />
              <input type="email" placeholder="Email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500" />
              <input type="tel" placeholder="Phone" value={newPhone} onChange={(e) => setNewPhone(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500" />
              <div className="flex gap-2">
                <button onClick={() => setShowCreate(false)} className="flex-1 py-2 bg-zinc-700 rounded text-sm text-zinc-300 hover:bg-zinc-600">Cancel</button>
                <button onClick={handleCreate} disabled={creating || !newName.trim()}
                  className="flex-1 py-2 bg-violet-600 rounded text-sm text-white font-medium hover:bg-violet-700 disabled:opacity-50">
                  {creating ? 'Creating…' : 'Create'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
