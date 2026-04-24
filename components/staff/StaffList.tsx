'use client'
// components/staff/StaffList.tsx
// Renders the full staff management UI: member list + invite form.
// Owner accounts are filtered out client-side as a secondary safety measure,
// even though the server already guarantees they are never in `initialStaff`.

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users, Plus, Mail, Search, AlertCircle,
  RefreshCw, UserX,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { StaffActions } from './StaffActions'
import type { StaffMember } from '@/lib/staff/getTenantStaff'

interface Props {
  initialStaff:    StaffMember[]
  currentUserId:   string
  currentUserRole: string
}

const ROLE_BADGE: Record<string, string> = {
  admin:   'bg-blue-500/15 text-blue-400 border-blue-500/25',
  staff:   'bg-white/8 text-white/50 border-white/10',
  invited: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
}

export function StaffList({ initialStaff, currentUserId, currentUserRole }: Props) {
  // Belt-and-suspenders: filter owners even if somehow they appear in props
  // (StaffMember type never includes 'owner', but defensive cast handles future changes)
  const sanitised = initialStaff.filter((m) => (m.role as string) !== 'owner')

  const [staff,       setStaff]       = useState<StaffMember[]>(sanitised)
  const [search,      setSearch]      = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole,  setInviteRole]  = useState<'admin' | 'staff'>('staff')
  const [inviting,    setInviting]    = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteOk,    setInviteOk]    = useState(false)

  const canManage = ['owner', 'admin'].includes(currentUserRole)

  const filtered = staff.filter((m) =>
    m.email.toLowerCase().includes(search.toLowerCase()) ||
    m.role.toLowerCase().includes(search.toLowerCase())
  )

  async function handleInvite() {
    if (!inviteEmail.trim()) return
    setInviting(true); setInviteError(null); setInviteOk(false)
    try {
      const res  = await fetch('/api/staff', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Invite failed')

      // Only add non-owner members to the list (hard invariant)
      if (json.staff?.role !== 'owner') {
        setStaff((prev) => [...prev, json.staff as StaffMember])
      }
      setInviteEmail('')
      setInviteOk(true)
      setTimeout(() => setInviteOk(false), 3000)
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : 'Invite failed')
    } finally {
      setInviting(false)
    }
  }

  function handleRemoved(id: string) {
    setStaff((prev) => prev.filter((m) => m.id !== id))
  }

  function handleRoleChanged(id: string, role: string) {
    // Reject any attempt to change a member to 'owner' client-side
    if (role === 'owner') return
    setStaff((prev) => prev.map((m) => m.id === id ? { ...m, role: role as StaffMember['role'] } : m))
  }

  return (
    <div className="space-y-6">
      {/* Member list */}
      <div className="rounded-2xl border border-surface-border bg-graphite-800/50 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-3">
            <Users className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
            <div>
              <h2 className="text-sm font-semibold text-white">Team Members</h2>
              <p className="text-xs text-white/35 mt-0.5">
                {staff.length} member{staff.length !== 1 ? 's' : ''} · owner accounts are hidden
              </p>
            </div>
          </div>

          {/* Search */}
          {staff.length > 4 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" />
              <input
                className="pl-8 pr-3 py-2 text-xs bg-graphite-700 border border-surface-border rounded-xl text-white placeholder:text-white/25 focus:outline-none focus:border-gold-500/50 w-48"
                placeholder="Search staff…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {filtered.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-12 text-center"
              >
                <UserX className="h-8 w-8 text-white/15 mb-3" />
                <p className="text-sm text-white/30">
                  {search ? 'No staff match your search' : 'No staff members yet'}
                </p>
              </motion.div>
            ) : (
              filtered.map((member) => (
                <motion.div
                  key={member.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center gap-3 bg-graphite-700/40 rounded-xl px-4 py-3 border border-surface-border"
                >
                  {/* Avatar */}
                  <div className="h-8 w-8 rounded-full bg-gold-500/15 border border-gold-500/25 flex items-center justify-center shrink-0">
                    <span className="text-xs font-semibold text-gold-400">
                      {member.email[0].toUpperCase()}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{member.email}</p>
                    <p className="text-xs text-white/35">
                      {member.status === 'invited'
                        ? 'Invitation pending'
                        : `Joined ${formatDate(member.created_at)}`}
                    </p>
                  </div>

                  {/* Status badge */}
                  {member.status === 'invited' && (
                    <span className="text-xs text-amber-400 bg-amber-500/15 border border-amber-500/25 rounded-full px-2 py-0.5 shrink-0">
                      Invited
                    </span>
                  )}

                  {/* Role badge / selector */}
                  {canManage && member.id !== currentUserId ? (
                    <select
                      value={member.role}
                      onChange={(e) => {
                        // Block owner escalation in the UI
                        if (e.target.value === 'owner') return
                        handleRoleChanged(member.id, e.target.value)
                        fetch(`/api/staff/${member.id}`, {
                          method:  'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body:    JSON.stringify({ role: e.target.value }),
                        })
                      }}
                      className="text-xs bg-graphite-700 border border-surface-border rounded-lg px-2 py-1 text-white/70 focus:outline-none focus:border-gold-500/50 shrink-0"
                    >
                      <option value="admin">Admin</option>
                      <option value="staff">Staff</option>
                      {/* owner option intentionally omitted */}
                    </select>
                  ) : (
                    <span className={cn(
                      'text-xs border rounded-full px-2 py-0.5 capitalize shrink-0',
                      ROLE_BADGE[member.role] ?? ROLE_BADGE.staff,
                    )}>
                      {member.id === currentUserId ? `${member.role} (you)` : member.role}
                    </span>
                  )}

                  {/* Actions */}
                  {canManage && member.id !== currentUserId && (
                    <StaffActions
                      memberId={member.id}
                      memberRole={member.role}
                      invitedBy={(member.metadata?.invited_by as string | undefined) ?? null}
                      currentUserId={currentUserId}
                      currentUserRole={currentUserRole}
                      onRemoved={() => handleRemoved(member.id)}
                    />
                  )}
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Invite form */}
      {canManage && (
        <div className="rounded-2xl border border-surface-border bg-graphite-800/50 p-6 space-y-4">
          <div className="flex items-start gap-3">
            <Plus className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
            <div>
              <h2 className="text-sm font-semibold text-white">Invite Team Member</h2>
              <p className="text-xs text-white/35 mt-0.5">
                New members will receive an email with login instructions
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">
                Email Address
              </label>
              <input
                className="w-full bg-graphite-700 border border-surface-border rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-gold-500/50 focus:ring-1 focus:ring-gold-500/20 transition-colors"
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">
                Role
              </label>
              <select
                className="w-full appearance-none bg-graphite-700 border border-surface-border rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-gold-500/50 transition-colors"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'admin' | 'staff')}
              >
                {/* owner option intentionally omitted — cannot invite to owner role */}
                <option value="staff">Staff — view and manage records</option>
                <option value="admin">Admin — full settings access</option>
              </select>
            </div>
          </div>

          {inviteError && (
            <p className="text-xs text-red-400 flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" /> {inviteError}
            </p>
          )}

          {inviteOk && (
            <p className="text-xs text-emerald-400 flex items-center gap-1.5">
              ✓ Invite sent successfully
            </p>
          )}

          <div className="flex justify-end">
            <Button variant="primary" onClick={handleInvite} loading={inviting}>
              <Mail className="h-4 w-4" /> Send Invite
            </Button>
          </div>
        </div>
      )}

      {/* Loading indicator */}
      {inviting && (
        <div className="fixed bottom-4 right-4 flex items-center gap-2 bg-graphite-800 border border-surface-border rounded-xl px-4 py-2.5 shadow-lg">
          <RefreshCw className="h-4 w-4 text-gold-400 animate-spin" />
          <span className="text-sm text-white/60">Sending invite…</span>
        </div>
      )}
    </div>
  )
}
