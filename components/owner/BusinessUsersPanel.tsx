'use client'
// components/owner/BusinessUsersPanel.tsx
// Lists business users for a tenant and provides management actions.

import { useState, useCallback, useEffect } from 'react'
import {
  Users, Plus, RefreshCw, AlertCircle, CheckCircle2, XCircle,
  Clock, Shield, ChevronDown, Key, Trash2, RotateCcw,
} from 'lucide-react'
import { CreateBusinessUserModal } from './CreateBusinessUserModal'
import { ROLE_LABELS, STATUS_LABELS } from '@/lib/types/businessUsers'
import type { BusinessRole, BusinessUserStatus } from '@/lib/types/businessUsers'

interface Member {
  id:           string
  auth_user_id: string | null
  email:        string
  fullName:     string | null
  role:         BusinessRole
  status:       BusinessUserStatus
  approved:     boolean
  created_at:   string
}

interface Props {
  tenantId:   string
  tenantName: string
}

const ROLE_COLORS: Record<BusinessRole, string> = {
  owner:   'text-gold-400   bg-gold-400/10   border-gold-400/20',
  admin:   'text-blue-400   bg-blue-400/10   border-blue-400/20',
  manager: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  staff:   'text-white/50   bg-white/4       border-white/10',
}

const STATUS_COLORS: Record<string, string> = {
  active:    'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  invited:   'text-amber-400  bg-amber-400/10  border-amber-400/20',
  pending:   'text-amber-400  bg-amber-400/10  border-amber-400/20',
  suspended: 'text-red-400    bg-red-400/10    border-red-400/20',
  disabled:  'text-white/30   bg-white/4       border-white/8',
}

const STATUS_ICONS: Record<string, React.ElementType> = {
  active:    CheckCircle2,
  invited:   Clock,
  pending:   Clock,
  suspended: XCircle,
  disabled:  XCircle,
}

type ActionType = 'role' | 'status' | 'reset-password' | 'remove' | null

export function BusinessUsersPanel({ tenantId, tenantName }: Props) {
  const [members,      setMembers]      = useState<Member[]>([])
  const [loading,      setLoading]      = useState(true)
  const [showCreate,   setShowCreate]   = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [actionState,  setActionState]  = useState<{ memberId: string; type: ActionType } | null>(null)
  const [actionError,  setActionError]  = useState<{ id: string; msg: string } | null>(null)
  const [newPassword,  setNewPassword]  = useState('')
  const [newRole,      setNewRole]      = useState<BusinessRole>('staff')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(`/api/owner/business-users?tenantId=${tenantId}`)
      const data = await res.json()
      if (!data.ok) { setError(data.error ?? 'Failed to load users.'); return }
      setMembers(data.members ?? [])
    } catch {
      setError('Network error. Could not load business users.')
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => { load() }, [load])

  const doAction = useCallback(async (
    memberId: string,
    type: ActionType,
    payload: Record<string, unknown>
  ) => {
    setActionError(null)
    try {
      let url  = `/api/owner/business-users/${memberId}`
      let method = 'PATCH'

      if (type === 'reset-password') {
        url    = `/api/owner/business-users/${memberId}/reset-password`
        method = 'POST'
      } else if (type === 'remove') {
        method = 'DELETE'
      }

      const res  = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      const data = await res.json()

      if (!data.ok) {
        setActionError({ id: memberId, msg: data.error ?? 'Action failed.' })
        return
      }

      setActionState(null)
      setNewPassword('')
      await load()
    } catch {
      setActionError({ id: memberId, msg: 'Network error.' })
    }
  }, [load])

  const openAction = useCallback((memberId: string, type: ActionType, currentRole?: BusinessRole) => {
    setActionState({ memberId, type })
    setActionError(null)
    setNewPassword('')
    if (type === 'role' && currentRole) setNewRole(currentRole)
  }, [])

  const closeAction = useCallback(() => {
    setActionState(null)
    setActionError(null)
    setNewPassword('')
  }, [])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-blue-500/8 border border-blue-500/15 flex items-center justify-center">
            <Users className="h-4 w-4 text-blue-400" strokeWidth={1.75} />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Business Users</h2>
            <p className="text-xs text-white/35">
              {members.length} user{members.length !== 1 ? 's' : ''} with CRM access
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="h-8 w-8 rounded-xl border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/8 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-xl text-xs font-semibold bg-gold-gradient text-graphite-900 hover:shadow-glow-gold transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Create account
          </button>
        </div>
      </div>

      {/* Global error */}
      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-400/8 border border-red-400/20 p-3">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && members.length === 0 && (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-white/4 border border-white/6 animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && members.length === 0 && !error && (
        <div className="rounded-2xl border border-white/6 bg-white/2 py-10 flex flex-col items-center gap-3 text-center">
          <Users className="w-8 h-8 text-white/10" />
          <div>
            <p className="text-sm font-medium text-white/40">No business users yet</p>
            <p className="text-xs text-white/20 mt-1">Create an account for team members</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-2 inline-flex items-center gap-1.5 h-8 px-4 rounded-xl text-xs font-semibold bg-gold-gradient text-graphite-900"
          >
            <Plus className="w-3.5 h-3.5" />
            Create first account
          </button>
        </div>
      )}

      {/* Members list */}
      {members.length > 0 && (
        <div className="space-y-2">
          {members.map(member => {
            const StatusIcon = STATUS_ICONS[member.status] ?? CheckCircle2
            const isActing = actionState?.memberId === member.id

            return (
              <div
                key={member.id}
                className="rounded-xl border border-white/8 bg-white/2 p-4 space-y-3"
              >
                {/* Row */}
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div className="h-9 w-9 rounded-xl bg-gold-gradient flex items-center justify-center shrink-0">
                    <span className="text-graphite-900 font-bold text-xs">
                      {(member.fullName ?? member.email).slice(0, 2).toUpperCase()}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white truncate">
                        {member.fullName ?? member.email}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${ROLE_COLORS[member.role]}`}>
                        {ROLE_LABELS[member.role]}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-white/40 truncate">{member.email}</span>
                      <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border ${STATUS_COLORS[member.status] ?? STATUS_COLORS.active}`}>
                        <StatusIcon className="w-2.5 h-2.5" />
                        {STATUS_LABELS[member.status]}
                      </span>
                      {!member.approved && (
                        <span className="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded-full">
                          Pending approval
                        </span>
                      )}
                      {!member.auth_user_id && (
                        <span className="text-xs text-white/20 bg-white/4 border border-white/8 px-1.5 py-0.5 rounded-full">
                          No auth account
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions menu */}
                  {!isActing && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Change role */}
                      <button
                        onClick={() => openAction(member.id, 'role', member.role)}
                        title="Change role"
                        className="h-7 px-2 rounded-lg text-xs text-white/40 hover:text-white hover:bg-white/8 border border-transparent hover:border-white/10 transition-colors flex items-center gap-1"
                      >
                        <ChevronDown className="w-3 h-3" />
                        Role
                      </button>

                      {/* Suspend / Reactivate */}
                      {member.status === 'active' ? (
                        <button
                          onClick={() => doAction(member.id, 'status', { status: 'suspended' })}
                          title="Suspend user"
                          className="h-7 px-2 rounded-lg text-xs text-red-400/70 hover:text-red-400 hover:bg-red-400/8 border border-transparent hover:border-red-400/20 transition-colors"
                        >
                          Suspend
                        </button>
                      ) : member.status === 'suspended' || member.status === 'disabled' ? (
                        <button
                          onClick={() => doAction(member.id, 'status', { status: 'active', approved: true })}
                          title="Reactivate user"
                          className="h-7 px-2 rounded-lg text-xs text-emerald-400/70 hover:text-emerald-400 hover:bg-emerald-400/8 border border-transparent hover:border-emerald-400/20 transition-colors flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Reactivate
                        </button>
                      ) : null}

                      {/* Reset password */}
                      {member.auth_user_id && (
                        <button
                          onClick={() => openAction(member.id, 'reset-password')}
                          title="Reset password"
                          className="h-7 w-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white hover:bg-white/8 transition-colors"
                        >
                          <Key className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Remove */}
                      {member.role !== 'owner' && (
                        <button
                          onClick={() => openAction(member.id, 'remove')}
                          title="Remove user"
                          className="h-7 w-7 rounded-lg flex items-center justify-center text-white/20 hover:text-red-400 hover:bg-red-400/8 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Inline action panels */}
                {isActing && (
                  <div className="rounded-xl bg-white/4 border border-white/10 p-3 space-y-3">
                    {actionError?.id === member.id && (
                      <p className="text-xs text-red-400 flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5" /> {actionError.msg}
                      </p>
                    )}

                    {actionState.type === 'role' && (
                      <>
                        <p className="text-xs font-medium text-white/60">Change role</p>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(['admin', 'manager', 'staff'] as BusinessRole[]).map(r => (
                            <button
                              key={r}
                              type="button"
                              onClick={() => setNewRole(r)}
                              className={`h-8 rounded-lg text-xs font-medium border transition-all ${
                                newRole === r
                                  ? 'bg-gold-500/15 border-gold-500/40 text-gold-300'
                                  : 'bg-white/4 border-white/8 text-white/50 hover:text-white hover:bg-white/8'
                              }`}
                            >
                              {ROLE_LABELS[r]}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => doAction(member.id, 'role', { role: newRole })}
                            className="flex-1 h-8 rounded-lg text-xs font-semibold bg-gold-gradient text-graphite-900"
                          >
                            Save role
                          </button>
                          <button onClick={closeAction} className="flex-1 h-8 rounded-lg text-xs text-white/50 bg-white/4 border border-white/8">
                            Cancel
                          </button>
                        </div>
                      </>
                    )}

                    {actionState.type === 'reset-password' && (
                      <>
                        <p className="text-xs font-medium text-white/60">Set new password</p>
                        <input
                          type="text"
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          placeholder="Min. 8 characters"
                          minLength={8}
                          className="w-full h-9 px-3 rounded-lg bg-white/4 border border-white/10 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-gold-500/50"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              if (newPassword.length < 8) {
                                setActionError({ id: member.id, msg: 'Password must be at least 8 characters.' })
                                return
                              }
                              doAction(member.id, 'reset-password', { password: newPassword })
                            }}
                            className="flex-1 h-8 rounded-lg text-xs font-semibold bg-gold-gradient text-graphite-900"
                          >
                            <Shield className="w-3 h-3 inline mr-1" />
                            Reset password
                          </button>
                          <button onClick={closeAction} className="flex-1 h-8 rounded-lg text-xs text-white/50 bg-white/4 border border-white/8">
                            Cancel
                          </button>
                        </div>
                        <p className="text-xs text-amber-300/70">
                          The new password will be shown to you only once — save it before confirming.
                        </p>
                      </>
                    )}

                    {actionState.type === 'remove' && (
                      <>
                        <p className="text-xs text-white/60">
                          This will <strong className="text-red-400">disable</strong> the user&apos;s access. Their data will be preserved.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => doAction(member.id, 'remove', {})}
                            className="flex-1 h-8 rounded-lg text-xs font-semibold bg-red-500/15 border border-red-400/30 text-red-400 hover:bg-red-500/20"
                          >
                            Confirm remove
                          </button>
                          <button onClick={closeAction} className="flex-1 h-8 rounded-lg text-xs text-white/50 bg-white/4 border border-white/8">
                            Cancel
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateBusinessUserModal
          tenantId={tenantId}
          tenantName={tenantName}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            load()
          }}
        />
      )}
    </div>
  )
}
