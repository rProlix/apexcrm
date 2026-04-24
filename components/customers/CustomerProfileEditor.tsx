'use client'
// components/customers/CustomerProfileEditor.tsx
import { useState, useTransition } from 'react'
import { motion } from 'framer-motion'
import { MessageSquarePlus, Save, Loader2, Bell, BellOff, StickyNote } from 'lucide-react'
import type { TenantCustomerDetail } from '@/lib/customers/getTenantCustomerById'
import type { CustomerProfile, CustomerNote } from '@/lib/customers/getCustomerProfile'

interface Props {
  customer:  TenantCustomerDetail
  profile:   CustomerProfile
  tenantId:  string
  userEmail: string
  isAdmin?:  boolean
}

export function CustomerProfileEditor({ customer, profile: initialProfile, tenantId, userEmail, isAdmin }: Props) {
  const [profile, setProfile]       = useState<CustomerProfile>(initialProfile)
  const [noteText, setNoteText]     = useState('')
  const [marketingOpt, setMarketing] = useState(profile.marketing_opt_in)
  const [isPending, startTransition] = useTransition()
  const [saveMsg, setSaveMsg]        = useState<string | null>(null)
  const [error, setError]            = useState<string | null>(null)

  const handleSavePreferences = () => {
    startTransition(async () => {
      setError(null)
      setSaveMsg(null)
      try {
        const res = await fetch(`/api/customers/${customer.id}/profile`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ marketing_opt_in: marketingOpt }),
        })
        if (!res.ok) throw new Error((await res.json()).error ?? 'Save failed')
        const { profile: updated } = await res.json()
        setProfile(updated)
        setSaveMsg('Preferences saved')
        setTimeout(() => setSaveMsg(null), 3000)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error')
      }
    })
  }

  const handleAddNote = () => {
    if (!noteText.trim()) return
    startTransition(async () => {
      setError(null)
      try {
        const res = await fetch(`/api/customers/${customer.id}/profile`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note_text: noteText }),
        })
        if (!res.ok) throw new Error((await res.json()).error ?? 'Save failed')
        const { profile: updated } = await res.json()
        setProfile(updated)
        setNoteText('')
        setSaveMsg('Note added')
        setTimeout(() => setSaveMsg(null), 3000)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error')
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Preferences */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="premium-panel premium-border rounded-2xl p-6"
      >
        <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
          <Bell className="w-4 h-4 text-gold-400" />
          Preferences
        </h2>
        <div className="flex items-center justify-between py-3 border-b border-white/6">
          <div>
            <p className="text-sm text-white/80">Marketing communications</p>
            <p className="text-xs text-white/30 mt-0.5">Customer opted in to receive marketing emails</p>
          </div>
          <button
            type="button"
            onClick={() => setMarketing(v => !v)}
            className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${marketingOpt ? 'bg-gold-500' : 'bg-white/10'}`}
            aria-label="Toggle marketing opt-in"
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${marketingOpt ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>

        {error && <p className="text-xs text-red-400 mt-3">{error}</p>}
        {saveMsg && <p className="text-xs text-emerald-400 mt-3">{saveMsg}</p>}

        <button
          type="button"
          onClick={handleSavePreferences}
          disabled={isPending}
          className="mt-4 inline-flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-semibold bg-gold-gradient text-graphite-900 hover:shadow-glow-gold disabled:opacity-50 transition-all"
        >
          {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save preferences
        </button>
      </motion.div>

      {/* Notes (admin only) */}
      {isAdmin && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="premium-panel premium-border rounded-2xl p-6"
        >
          <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
            <StickyNote className="w-4 h-4 text-gold-400" />
            Internal Notes
          </h2>

          {/* Add note form */}
          <div className="space-y-2 mb-6">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Add a private note about this customer…"
              rows={3}
              className="w-full rounded-xl bg-graphite-900 border border-white/8 text-white placeholder:text-white/25 text-sm px-4 py-3 focus:outline-none focus:border-gold-500/40 focus:ring-1 focus:ring-gold-500/20 transition-colors resize-none"
            />
            <button
              type="button"
              onClick={handleAddNote}
              disabled={isPending || !noteText.trim()}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-semibold bg-gold-gradient text-graphite-900 hover:shadow-glow-gold disabled:opacity-40 transition-all"
            >
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquarePlus className="w-3.5 h-3.5" />}
              Add note
            </button>
          </div>

          {/* Existing notes */}
          {profile.notes.length === 0 ? (
            <p className="text-xs text-white/30 text-center py-4">No notes yet</p>
          ) : (
            <div className="space-y-3">
              {[...profile.notes].reverse().map(note => (
                <NoteItem key={note.id} note={note} />
              ))}
            </div>
          )}
        </motion.div>
      )}
    </div>
  )
}

function NoteItem({ note }: { note: CustomerNote }) {
  return (
    <div className="border-l-2 border-gold-500/30 pl-3 py-1">
      <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">{note.text}</p>
      <p className="text-xs text-white/30 mt-1">
        {note.author} · {new Date(note.created_at).toLocaleString()}
      </p>
    </div>
  )
}
