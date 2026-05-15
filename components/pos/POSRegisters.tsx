'use client'

import { useState } from 'react'
import { Monitor, Plus, Play, Square, DollarSign, Clock } from 'lucide-react'

interface Register {
  id:                     string
  name:                   string
  location_name?:         string | null
  status:                 string
  cash_tracking_enabled:  boolean
  current_cash_cents:     number
}

interface Shift {
  id:          string
  status:      string
  opened_at:   string
  closed_at?:  string | null
  opened_by:   string
  starting_cash_cents:   number
  expected_cash_cents:   number
  counted_cash_cents?:   number | null
  cash_difference_cents?: number | null
  notes?:      string | null
  pos_registers?: { name?: string } | null
}

interface Props {
  tenantId:         string
  userRole:         string
  userId:           string
  initialRegisters: Register[]
  initialShifts:    Shift[]
}

function formatCents(c: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(c / 100)
}

export function POSRegisters({ tenantId, userRole, userId, initialRegisters, initialShifts }: Props) {
  const [registers, setRegisters] = useState<Register[]>(initialRegisters)
  const [shifts, setShifts]       = useState<Shift[]>(initialShifts)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName]     = useState('')
  const [newLocation, setNewLocation] = useState('')
  const [loading, setLoading]     = useState<string | null>(null)
  const [error, setError]         = useState<string | null>(null)

  const canManage = ['admin','owner','manager'].includes(userRole)

  const openShift = async (registerId: string, startingCash?: number) => {
    setLoading(`open-${registerId}`); setError(null)
    try {
      const res = await fetch('/api/pos/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ register_id: registerId, starting_cash_cents: (startingCash ?? 0) * 100 }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to open shift'); return }
      setShifts((p) => [data.shift, ...p])
    } catch { setError('Network error') } finally { setLoading(null) }
  }

  const closeShift = async (shiftId: string) => {
    const countedStr = prompt('Counted cash amount (e.g. 150.00):')
    if (countedStr === null) return
    const counted = parseFloat(countedStr) * 100

    setLoading(`close-${shiftId}`); setError(null)
    try {
      const res = await fetch(`/api/pos/shifts/${shiftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counted_cash_cents: isNaN(counted) ? null : Math.round(counted) }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to close shift'); return }
      setShifts((p) => p.map((s) => s.id === shiftId ? data.shift : s))
    } catch { setError('Network error') } finally { setLoading(null) }
  }

  const createRegister = async () => {
    if (!newName.trim()) return
    setLoading('create'); setError(null)
    try {
      const res = await fetch('/api/pos/registers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), location_name: newLocation || null }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to create register'); return }
      setRegisters((p) => [...p, data.register])
      setShowCreate(false); setNewName(''); setNewLocation('')
    } catch { setError('Network error') } finally { setLoading(null) }
  }

  const openShifts = shifts.filter((s) => s.status === 'open')

  return (
    <div className="min-h-screen bg-zinc-950 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">Registers & Shifts</h1>
            <p className="text-sm text-zinc-400 mt-1">{openShifts.length} open shift{openShifts.length !== 1 ? 's' : ''}</p>
          </div>
          {canManage && (
            <button onClick={() => setShowCreate(!showCreate)}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-medium transition-colors">
              <Plus className="w-4 h-4" /> New Register
            </button>
          )}
        </div>

        {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{error}</div>}

        {showCreate && (
          <div className="mb-6 p-4 bg-zinc-900 border border-zinc-800 rounded-xl space-y-3">
            <h3 className="text-sm font-semibold text-zinc-200">New Register</h3>
            <input type="text" placeholder="Register name (e.g. Main Register)" value={newName} onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500" />
            <input type="text" placeholder="Location (optional)" value={newLocation} onChange={(e) => setNewLocation(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500" />
            <div className="flex gap-2">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 bg-zinc-800 text-zinc-400 rounded-lg text-sm hover:bg-zinc-700">Cancel</button>
              <button onClick={createRegister} disabled={loading === 'create' || !newName.trim()}
                className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50">
                {loading === 'create' ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        )}

        {/* Registers */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {registers.map((reg) => {
            const activeShift = openShifts.find((s) => (s as unknown as { register_id?: string }).register_id === reg.id) ?? null

            return (
              <div key={reg.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Monitor className="w-4 h-4 text-zinc-500" />
                      <p className="text-sm font-semibold text-zinc-100">{reg.name}</p>
                    </div>
                    {reg.location_name && <p className="text-xs text-zinc-500 mt-0.5 ml-6">{reg.location_name}</p>}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${activeShift ? 'bg-green-500/10 text-green-400' : 'bg-zinc-800 text-zinc-500'}`}>
                    {activeShift ? 'Open' : 'Closed'}
                  </span>
                </div>

                {reg.cash_tracking_enabled && (
                  <div className="flex items-center gap-2 text-sm text-zinc-400 mb-3">
                    <DollarSign className="w-3 h-3" />
                    <span>Cash: {formatCents(reg.current_cash_cents)}</span>
                  </div>
                )}

                {activeShift ? (
                  <div>
                    <div className="flex items-center gap-2 text-xs text-zinc-500 mb-3">
                      <Clock className="w-3 h-3" />
                      Opened {new Date(activeShift.opened_at).toLocaleTimeString()}
                    </div>
                    <button
                      onClick={() => closeShift(activeShift.id)}
                      disabled={loading === `close-${activeShift.id}`}
                      className="w-full flex items-center justify-center gap-2 py-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/20 transition-colors disabled:opacity-50"
                    >
                      <Square className="w-3 h-3" />
                      {loading === `close-${activeShift.id}` ? 'Closing…' : 'Close Shift'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => openShift(reg.id)}
                    disabled={!!loading}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-green-500/10 border border-green-500/20 text-green-400 rounded-lg text-sm hover:bg-green-500/20 transition-colors disabled:opacity-50"
                  >
                    <Play className="w-3 h-3" />
                    Open Shift
                  </button>
                )}
              </div>
            )
          })}
          {registers.length === 0 && (
            <div className="col-span-3 text-center py-10 text-zinc-600">No registers yet. Create one above.</div>
          )}
        </div>

        {/* Shift history */}
        <div>
          <h2 className="text-lg font-semibold text-zinc-200 mb-3">Recent Shifts</h2>
          <div className="space-y-2">
            {shifts.slice(0, 10).map((shift) => (
              <div key={shift.id} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${shift.status === 'open' ? 'bg-green-400' : 'bg-zinc-600'}`} />
                    <p className="text-sm font-medium text-zinc-200">{(shift as unknown as { pos_registers?: { name?: string } | null }).pos_registers?.name ?? 'No register'}</p>
                    <span className="text-xs text-zinc-500 capitalize">{shift.status}</span>
                  </div>
                  <p className="text-xs text-zinc-500 ml-4 mt-0.5">
                    {new Date(shift.opened_at).toLocaleString()}
                    {shift.closed_at && ` → ${new Date(shift.closed_at).toLocaleString()}`}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p className="text-zinc-300">{formatCents(shift.starting_cash_cents)} start</p>
                  {shift.cash_difference_cents !== null && shift.cash_difference_cents !== undefined && (
                    <p className={`text-xs ${shift.cash_difference_cents >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {shift.cash_difference_cents >= 0 ? '+' : ''}{formatCents(shift.cash_difference_cents)} diff
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
