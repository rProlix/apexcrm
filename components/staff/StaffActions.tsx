'use client'
// components/staff/StaffActions.tsx
// Delete button for a single staff member.
// Enforces all client-side RBAC guards before calling the API:
//   - Owner accounts are never actionable (their rows shouldn't appear here, but
//     we guard anyway as a last line of defense).
//   - Admin can only remove staff they personally invited (invitedBy === self).
//   - Owner role can remove any non-owner in their tenant.
//   - A user cannot remove themselves.

import { useState } from 'react'
import { Trash2, RefreshCw, AlertCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  memberId:        string
  memberRole:      string
  invitedBy:       string | null
  currentUserId:   string
  currentUserRole: string
  onRemoved:       () => void
}

export function StaffActions({
  memberId,
  memberRole,
  invitedBy,
  currentUserId,
  currentUserRole,
  onRemoved,
}: Props) {
  const [removing,   setRemoving]   = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  // ── Client-side permission gates ──────────────────────────────────────────

  // Hard blocks: never show action for owner rows or self
  if (memberRole === 'owner')      return null
  if (memberId === currentUserId)  return null

  // Admin: can only remove staff they personally invited
  // (invitedBy null/undefined = legacy record, allow deletion)
  const adminCanDelete =
    currentUserRole === 'owner' ||
    currentUserRole === 'admin' && (!invitedBy || invitedBy === currentUserId)

  if (!adminCanDelete) {
    return (
      <span
        className="text-xs text-white/20 cursor-not-allowed"
        title="You can only remove staff members you invited"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </span>
    )
  }

  // ── Delete flow ───────────────────────────────────────────────────────────

  async function handleRemove() {
    setRemoving(true); setError(null)
    try {
      const res  = await fetch(`/api/staff/${memberId}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to remove member')
      onRemoved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Remove failed')
      setConfirming(false)
    } finally {
      setRemoving(false)
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-xs text-white/40">Remove?</span>
        <button
          onClick={handleRemove}
          disabled={removing}
          className="text-xs text-red-400 hover:text-red-300 font-semibold transition-colors disabled:opacity-50"
        >
          {removing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : 'Yes'}
        </button>
        <button
          onClick={() => { setConfirming(false); setError(null) }}
          className="text-white/30 hover:text-white/60 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        {error && (
          <span className="text-xs text-red-400 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> {error}
          </span>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      disabled={removing}
      title="Remove staff member"
      className={cn(
        'text-white/20 hover:text-red-400 transition-colors disabled:opacity-50 shrink-0',
        removing && 'animate-pulse',
      )}
    >
      {removing
        ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        : <Trash2 className="h-3.5 w-3.5" />
      }
    </button>
  )
}
