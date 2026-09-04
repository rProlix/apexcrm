'use client'

import { useState, useTransition } from 'react'
import { Plus, Trash2 } from 'lucide-react'

export interface RewardManagerField {
  key: string
  label: string
  type?: 'text' | 'number' | 'datetime-local' | 'checkbox' | 'select' | 'textarea'
  options?: Array<{ label: string; value: string }>
  required?: boolean
  defaultValue?: string | number | boolean
}

export function RewardsEntityManager({
  resource,
  title,
  description,
  records,
  fields,
}: {
  resource: string
  title: string
  description: string
  records: Array<Record<string, unknown>>
  fields: RewardManagerField[]
}) {
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const payload: Record<string, unknown> = {}
    for (const field of fields) {
      const value = form.get(field.key)
      payload[field.key] =
        field.type === 'checkbox'
          ? value === 'on'
          : field.type === 'number'
            ? value === ''
              ? null
              : Number(value)
            : value === ''
              ? null
              : value
    }
    startTransition(async () => {
      const response = await fetch(`/api/rewards/manage/${resource}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await response.json()
      if (!response.ok) {
        setError(result.error || 'Save failed')
        return
      }
      window.location.reload()
    })
  }

  function remove(id: string) {
    if (!window.confirm('Delete this rewards configuration?')) return
    startTransition(async () => {
      const response = await fetch(`/api/rewards/manage/${resource}?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        setError('Delete failed')
        return
      }
      window.location.reload()
    })
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-white/40">{description}</p>
        </div>
        <button
          onClick={() => setShowForm((value) => !value)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gold-400 px-4 py-2.5 text-sm font-semibold text-graphite-950 transition hover:bg-gold-300 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          Add {title.replace(/s$/, '')}
        </button>
      </header>

      {showForm && (
        <form
          onSubmit={submit}
          className="grid gap-4 rounded-2xl border border-gold-400/20 bg-white/[0.035] p-5 sm:grid-cols-2"
        >
          {fields.map((field) => (
            <label
              key={field.key}
              className={`grid gap-2 ${field.type === 'textarea' ? 'sm:col-span-2' : ''}`}
            >
              <span className="text-xs font-medium text-white/55">{field.label}</span>
              {field.type === 'select' ? (
                <select
                  name={field.key}
                  required={field.required}
                  defaultValue={String(field.defaultValue ?? '')}
                  className="store-input rounded-xl px-3 py-2.5 text-sm"
                >
                  {field.options?.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : field.type === 'textarea' ? (
                <textarea
                  name={field.key}
                  required={field.required}
                  defaultValue={String(field.defaultValue ?? '')}
                  rows={3}
                  className="store-input resize-none rounded-xl px-3 py-2.5 text-sm"
                />
              ) : field.type === 'checkbox' ? (
                <input
                  name={field.key}
                  type="checkbox"
                  defaultChecked={Boolean(field.defaultValue)}
                  className="h-5 w-5 accent-gold-400"
                />
              ) : (
                <input
                  name={field.key}
                  type={field.type ?? 'text'}
                  required={field.required}
                  defaultValue={String(field.defaultValue ?? '')}
                  className="store-input rounded-xl px-3 py-2.5 text-sm"
                />
              )}
            </label>
          ))}
          {error && <p className="text-sm text-red-400 sm:col-span-2">{error}</p>}
          <div className="flex gap-3 sm:col-span-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-xl bg-gold-400 px-5 py-2.5 text-sm font-semibold text-graphite-950 disabled:opacity-50"
            >
              {pending ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm text-white/50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {records.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center">
          <p className="text-sm font-medium text-white">No {title.toLowerCase()} configured</p>
          <p className="mt-1 text-xs text-white/35">
            Use the button above to create the first one.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {records.map((record) => (
            <article
              key={String(record.id)}
              className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-medium text-white">
                    {String(record.name ?? record.qualification_type ?? title)}
                  </h2>
                  <p className="mt-2 text-xs leading-5 text-white/40">{summary(record)}</p>
                </div>
                <button
                  onClick={() => remove(String(record.id))}
                  aria-label={`Delete ${String(record.name ?? title)}`}
                  className="rounded-lg border border-red-400/15 bg-red-400/5 p-2 text-red-300 transition hover:bg-red-400/10"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

function summary(record: Record<string, unknown>) {
  const pairs = Object.entries(record)
    .filter(
      ([key, value]) =>
        ![
          'id',
          'tenant_id',
          'program_id',
          'created_at',
          'updated_at',
          'metadata',
          'benefits',
        ].includes(key) &&
        value != null &&
        typeof value !== 'object'
    )
    .slice(0, 5)
  return pairs.map(([key, value]) => `${key.replaceAll('_', ' ')}: ${String(value)}`).join(' | ')
}
