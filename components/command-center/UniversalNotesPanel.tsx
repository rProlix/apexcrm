'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, FileText, Loader2, LockKeyhole, Paperclip, Pencil, Plus } from 'lucide-react'
import {
  archiveUniversalNote,
  createUniversalNote,
  editUniversalNote,
} from '@/lib/command-center/noteActions'
import type { NoteEntityType, UniversalNote } from '@/lib/command-center/types'
import { cn } from '@/lib/utils'

export function UniversalNotesPanel({
  entityType,
  entityId,
  initialNotes,
  canManageVisibility = false,
  loadError,
}: {
  entityType: NoteEntityType
  entityId: string
  initialNotes: UniversalNote[]
  canManageVisibility?: boolean
  loadError?: string | null
}) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [visibility, setVisibility] = useState<'internal' | 'staff_admin' | 'customer_visible'>(
    'internal'
  )
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const editing = useMemo(
    () => initialNotes.find((note) => note.id === editingId) ?? null,
    [editingId, initialNotes]
  )

  function submit() {
    setError(null)
    startTransition(async () => {
      try {
        if (editing) {
          await editUniversalNote({ noteId: editing.id, body, visibility })
        } else {
          await createUniversalNote({ entityType, entityId, body, visibility })
        }
        setBody('')
        setEditingId(null)
        setVisibility('internal')
        router.refresh()
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'The note could not be saved.')
      }
    })
  }

  function beginEdit(note: UniversalNote) {
    setEditingId(note.id)
    setBody(note.body)
    setVisibility(
      note.visibility === 'customer_visible'
        ? 'customer_visible'
        : note.visibility === 'staff_admin'
          ? 'staff_admin'
          : 'internal'
    )
  }

  function archive(noteId: string) {
    setError(null)
    startTransition(async () => {
      try {
        await archiveUniversalNote(noteId)
        router.refresh()
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'The note could not be archived.')
      }
    })
  }

  async function upload(noteId: string, file: File) {
    setError(null)
    const form = new FormData()
    form.set('noteId', noteId)
    form.set('file', file)
    try {
      const response = await fetch('/api/notes/attachments', { method: 'POST', body: form })
      const result = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Attachment upload failed.')
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Attachment upload failed.')
    }
  }

  return (
    <section
      className="rounded-2xl border border-white/10 bg-graphite-900/60 p-5"
      aria-labelledby="record-notes-title"
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 id="record-notes-title" className="text-sm font-semibold text-white">
            Notes and attachments
          </h2>
          <p className="mt-1 text-xs text-white/40">
            Internal by default. Files stay private and open through short-lived links.
          </p>
        </div>
        <LockKeyhole className="h-4 w-4 shrink-0 text-white/25" aria-hidden="true" />
      </div>

      {loadError && (
        <div
          role="alert"
          className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-200/75"
        >
          {loadError}
        </div>
      )}

      {!loadError && (
        <>
          <div className="space-y-3">
            <label htmlFor={`note-${entityType}-${entityId}`} className="sr-only">
              Note
            </label>
            <textarea
              id={`note-${entityType}-${entityId}`}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={3}
              maxLength={10_000}
              placeholder="Add an internal note…"
              className="w-full resize-y rounded-xl border border-white/10 bg-graphite-950 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/25 focus:border-gold-500/50"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              {canManageVisibility ? (
                <select
                  aria-label="Note visibility"
                  value={visibility}
                  onChange={(event) => setVisibility(event.target.value as typeof visibility)}
                  className="rounded-lg border border-white/10 bg-graphite-950 px-2.5 py-2 text-xs text-white/70"
                >
                  <option value="internal">Internal</option>
                  <option value="staff_admin">Staff and admins</option>
                  <option value="customer_visible">Customer-visible</option>
                </select>
              ) : (
                <span className="text-xs text-white/35">Internal</span>
              )}
              <div className="flex gap-2">
                {editing && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null)
                      setBody('')
                      setVisibility('internal')
                    }}
                    className="rounded-lg px-3 py-2 text-xs text-white/45 hover:text-white"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="button"
                  onClick={submit}
                  disabled={isPending || !body.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-gold-500 px-3 py-2 text-xs font-semibold text-graphite-950 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : editing ? (
                    <Pencil className="h-3.5 w-3.5" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  {editing ? 'Save note' : 'Add note'}
                </button>
              </div>
            </div>
            {error && (
              <p role="alert" className="text-xs text-red-400">
                {error}
              </p>
            )}
          </div>

          <div className="mt-5 space-y-3">
            {initialNotes.length === 0 && (
              <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-white/35">
                No notes have been added to this record.
              </div>
            )}
            {initialNotes.map((note) => (
              <article
                key={note.id}
                className="rounded-xl border border-white/8 bg-white/[0.025] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-white/80">{note.authorDisplay}</p>
                    <p className="mt-0.5 text-2xs text-white/30">
                      {new Intl.DateTimeFormat('en-US', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(note.createdAt))}
                      {note.editedAt ? ' · edited' : ''}
                    </p>
                  </div>
                  <span className="rounded-full bg-white/5 px-2 py-1 text-2xs capitalize text-white/35">
                    {note.visibility.replace('_', ' ')}
                  </span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-white/65">
                  {note.body}
                </p>

                {note.attachments.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {note.attachments.map((attachment) => (
                      <a
                        key={attachment.id}
                        href={attachment.downloadHref}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/55 hover:text-white"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        {attachment.fileName}
                      </a>
                    ))}
                  </div>
                )}

                {note.canEdit && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
                    <button
                      type="button"
                      onClick={() => beginEdit(note)}
                      className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white"
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                    <label
                      className={cn(
                        'inline-flex cursor-pointer items-center gap-1.5 text-xs text-white/40 hover:text-white',
                        isPending && 'pointer-events-none opacity-50'
                      )}
                    >
                      <Paperclip className="h-3 w-3" /> Attach
                      <input
                        type="file"
                        className="sr-only"
                        accept="image/jpeg,image/png,image/webp,application/pdf,text/plain,application/json"
                        onChange={(event) => {
                          const file = event.target.files?.[0]
                          if (file) void upload(note.id, file)
                          event.target.value = ''
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => archive(note.id)}
                      className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-red-400"
                    >
                      <Archive className="h-3 w-3" /> Archive
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
