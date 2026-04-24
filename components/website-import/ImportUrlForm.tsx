'use client'
// components/website-import/ImportUrlForm.tsx
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, Globe, Star, Building2, Loader2, AlertCircle, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fadeUp } from '@/lib/motion'

interface UrlEntry {
  id:          string
  url:         string
  source_type: 'website' | 'yelp' | 'business_profile'
  error?:      string
}

interface Props {
  tenantId:    string
  onJobCreated: (job: { id: string }) => void
  disabled?:   boolean
}

function detectSourceType(url: string): UrlEntry['source_type'] {
  const lower = url.toLowerCase()
  if (lower.includes('yelp.com'))    return 'yelp'
  if (lower.includes('google.com/maps') || lower.includes('facebook.com') || lower.includes('tripadvisor.com')) {
    return 'business_profile'
  }
  return 'website'
}

const SOURCE_TYPE_ICONS = {
  website:          Globe,
  yelp:             Star,
  business_profile: Building2,
}

const SOURCE_TYPE_LABELS = {
  website:          'Business Website',
  yelp:             'Yelp Page',
  business_profile: 'Business Profile',
}

let idCounter = 0
function makeId() { return `url-${++idCounter}` }

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch { return false }
}

export function ImportUrlForm({ tenantId, onJobCreated, disabled }: Props) {
  const [entries, setEntries] = useState<UrlEntry[]>([
    { id: makeId(), url: '', source_type: 'website' },
  ])
  const [notes,    setNotes]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  function addEntry() {
    if (entries.length >= 8) return
    setEntries((prev) => [...prev, { id: makeId(), url: '', source_type: 'website' }])
  }

  function removeEntry(id: string) {
    if (entries.length <= 1) return
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }

  function updateUrl(id: string, url: string) {
    setEntries((prev) =>
      prev.map((e) =>
        e.id === id
          ? { ...e, url, source_type: detectSourceType(url), error: undefined }
          : e,
      ),
    )
  }

  function updateType(id: string, source_type: UrlEntry['source_type']) {
    setEntries((prev) => prev.map((e) => e.id === id ? { ...e, source_type } : e))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const validEntries = entries.filter((e) => e.url.trim())
    if (validEntries.length === 0) {
      setError('Add at least one URL to import.')
      return
    }

    const invalidEntries = validEntries.filter((e) => !isValidUrl(e.url.trim()))
    if (invalidEntries.length > 0) {
      setEntries((prev) =>
        prev.map((e) => {
          const isInvalid = invalidEntries.find((i) => i.id === e.id)
          return isInvalid ? { ...e, error: 'Invalid URL format' } : e
        }),
      )
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/website-import/jobs', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          tenant_id:   tenantId,
          source_urls: validEntries.map((e) => e.url.trim()),
          notes:       notes.trim() || undefined,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to create job')

      onJobCreated(json.job)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* URL entries */}
      <div className="space-y-3">
        <AnimatePresence initial={false}>
          {entries.map((entry, i) => {
            const Icon = SOURCE_TYPE_ICONS[entry.source_type]
            return (
              <motion.div
                key={entry.id}
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-1.5"
              >
                <div className={cn(
                  'flex items-center gap-2 rounded-xl border bg-white/[0.04] transition-colors',
                  entry.error ? 'border-red-400/40' : 'border-white/10 focus-within:border-amber-400/40',
                )}>
                  {/* Source type icon + selector */}
                  <div className="flex-shrink-0 pl-3">
                    <Icon size={15} className="text-white/30" />
                  </div>

                  {/* URL input */}
                  <input
                    type="url"
                    value={entry.url}
                    onChange={(e) => updateUrl(entry.id, e.target.value)}
                    placeholder={
                      i === 0
                        ? 'https://yourbusiness.com'
                        : 'https://yelp.com/biz/... or another URL'
                    }
                    className="flex-1 bg-transparent py-3 text-sm text-white placeholder:text-white/25 outline-none min-w-0"
                    disabled={loading || disabled}
                  />

                  {/* Source type selector */}
                  <select
                    value={entry.source_type}
                    onChange={(e) => updateType(entry.id, e.target.value as UrlEntry['source_type'])}
                    className="bg-transparent text-xs text-white/40 border-l border-white/10 pl-2 pr-3 py-3 outline-none cursor-pointer hover:text-white/60 transition-colors flex-shrink-0"
                    disabled={loading || disabled}
                  >
                    {Object.entries(SOURCE_TYPE_LABELS).map(([val, label]) => (
                      <option key={val} value={val} className="bg-zinc-900 text-white">
                        {label}
                      </option>
                    ))}
                  </select>

                  {/* Remove button */}
                  {entries.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeEntry(entry.id)}
                      className="flex-shrink-0 p-3 text-white/20 hover:text-red-400/70 transition-colors"
                      disabled={loading || disabled}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>

                {entry.error && (
                  <p className="flex items-center gap-1 text-xs text-red-400/80 pl-2">
                    <AlertCircle size={11} />
                    {entry.error}
                  </p>
                )}
              </motion.div>
            )
          })}
        </AnimatePresence>

        {entries.length < 8 && (
          <button
            type="button"
            onClick={addEntry}
            className="flex items-center gap-1.5 text-xs text-white/30 hover:text-amber-300/70 transition-colors py-1"
            disabled={loading || disabled}
          >
            <Plus size={13} />
            Add another URL
          </button>
        )}
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-white/40 uppercase tracking-wider">
          Notes (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any context about this business that might help the import…"
          rows={2}
          maxLength={1000}
          className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-amber-400/40 transition-colors resize-none"
          disabled={loading || disabled}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-400/20 bg-red-400/5 px-3.5 py-3 text-sm text-red-300">
          <AlertCircle size={14} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading || disabled}
        className={cn(
          'w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all duration-200',
          'bg-gradient-to-r from-amber-500 to-amber-400 text-black',
          'hover:from-amber-400 hover:to-amber-300 hover:shadow-lg hover:shadow-amber-400/20',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none',
        )}
      >
        {loading ? (
          <>
            <Loader2 size={15} className="animate-spin" />
            Creating import job…
          </>
        ) : (
          <>
            Start Import
            <ArrowRight size={15} />
          </>
        )}
      </button>
    </form>
  )
}
