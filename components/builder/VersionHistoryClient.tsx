'use client'

// components/builder/VersionHistoryClient.tsx
// Dashboard page for browsing, restoring, and publishing website versions.

import { useState, useTransition } from 'react'
import type { WebsiteVersionSummary } from '@/lib/website/versionTypes'
import {
  createVersionCheckpoint,
  restoreVersion,
  publishVersion,
  renameVersion,
} from '@/lib/builder/versionsApi'

const STATUS_COLORS: Record<string, string> = {
  published: '#22c55e',
  draft:     '#6b7280',
  autosave:  '#f59e0b',
  restored:  '#3b82f6',
  archived:  '#4b5563',
}

const SOURCE_LABELS: Record<string, string> = {
  manual:       'Manual',
  autosave:     'Autosave',
  ai_autofill:  'AI Autofill',
  ai_images:    'AI Images',
  restore:      'Restore',
  publish:      'Publish',
  drag_drop:    'Drag & Drop',
  section_edit: 'Section Edit',
}

interface Props {
  versions: WebsiteVersionSummary[]
}

export function VersionHistoryClient({ versions: initial }: Props) {
  const [versions,    setVersions]    = useState(initial)
  const [actionId,    setActionId]    = useState<string | null>(null)
  const [toast,       setToast]       = useState<{ msg: string; ok: boolean } | null>(null)
  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [editLabel,   setEditLabel]   = useState('')
  const [isPending, startTransition] = useTransition()

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  async function handleCheckpoint() {
    const label = prompt('Version label (optional):')
    if (label === null) return
    const v = await createVersionCheckpoint(label || 'Manual checkpoint')
    if (v) {
      showToast(`Version #${v.version_number} saved`)
      setVersions((prev) => [v, ...prev])
    } else {
      showToast('Failed to create checkpoint', false)
    }
  }

  async function handleRestore(v: WebsiteVersionSummary) {
    if (!confirm(`Restore Version #${v.version_number}?\n\nA backup of your current state will be saved first.`)) return
    setActionId(v.id)
    const ok = await restoreVersion(v.id)
    setActionId(null)
    if (ok) {
      showToast(`Version #${v.version_number} restored! Refreshing…`)
      setTimeout(() => window.location.reload(), 1500)
    } else {
      showToast('Restore failed', false)
    }
  }

  async function handlePublish(v: WebsiteVersionSummary) {
    if (!confirm(`Publish Version #${v.version_number} to your live website?`)) return
    setActionId(v.id)
    const ok = await publishVersion(v.id)
    setActionId(null)
    if (ok) {
      showToast(`Version #${v.version_number} is now live!`)
      startTransition(() => {
        setVersions((prev) => prev.map((ver) =>
          ver.id === v.id
            ? { ...ver, status: 'published' as const }
            : ver.status === 'published'
            ? { ...ver, status: 'archived' as const }
            : ver,
        ))
      })
    } else {
      showToast('Publish failed', false)
    }
  }

  async function handleRename(id: string) {
    if (!editLabel.trim()) return
    const ok = await renameVersion(id, editLabel.trim())
    if (ok) {
      setVersions((prev) => prev.map((v) => v.id === id ? { ...v, label: editLabel.trim() } : v))
      showToast('Renamed')
    } else {
      showToast('Rename failed', false)
    }
    setEditingId(null)
    setEditLabel('')
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1.5rem', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text, #f3f4f6)', margin: 0 }}>
            Version History
          </h1>
          <p style={{ color: 'var(--color-muted, #6b7280)', fontSize: '0.875rem', margin: '0.25rem 0 0' }}>
            View, restore, or publish previous versions of your website.
          </p>
        </div>
        <div style={{ flex: 1 }} />
        <a
          href="/website"
          style={{
            padding: '0.5rem 1rem', borderRadius: '0.5rem',
            border: '1px solid var(--color-border, #3f3f46)',
            color: 'var(--color-muted, #9ca3af)',
            textDecoration: 'none', fontSize: '0.875rem', fontWeight: 600,
          }}
        >
          ← Builder
        </a>
        <button
          onClick={handleCheckpoint}
          style={{
            padding: '0.5rem 1rem', borderRadius: '0.5rem',
            border: 'none', background: '#c9a84c',
            color: '#000', fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer',
          }}
        >
          + Save Checkpoint
        </button>
      </div>

      {versions.length === 0 ? (
        <div style={{
          padding: '3rem', textAlign: 'center',
          border: '2px dashed var(--color-border, #2e2e38)',
          borderRadius: '1rem', color: 'var(--color-muted, #6b7280)',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🕐</div>
          <p>No versions yet. Start editing to create your first version.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {versions.map((v) => {
            const statusColor = STATUS_COLORS[v.status] ?? '#6b7280'
            const displayName = v.label ?? `Version #${v.version_number}`
            const isActing = actionId === v.id || isPending

            return (
              <div
                key={v.id}
                style={{
                  borderRadius: '0.75rem',
                  border:       `1px solid ${v.status === 'published' ? '#22c55e33' : 'var(--color-border, #2e2e38)'}`,
                  background:   v.status === 'published' ? '#16a34a0a' : 'var(--color-surface, #1a1a1f)',
                  padding:      '1rem 1.25rem',
                  display:      'flex',
                  alignItems:   'center',
                  gap:          '1rem',
                  flexWrap:     'wrap',
                }}
              >
                {/* Version number */}
                <span style={{
                  fontSize: '0.75rem', fontWeight: 700, color: '#6b7280',
                  background: 'var(--color-hover, #2e2e38)',
                  padding: '0.2rem 0.5rem', borderRadius: '0.25rem',
                  flexShrink: 0,
                }}>
                  v{v.version_number}
                </span>

                {/* Label */}
                <div style={{ flex: 1, minWidth: 160 }}>
                  {editingId === v.id ? (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleRename(v.id); if (e.key === 'Escape') { setEditingId(null); setEditLabel('') } }}
                        autoFocus
                        style={{
                          flex: 1, background: 'var(--color-hover, #2e2e38)',
                          border: '1px solid #c9a84c', borderRadius: '0.375rem',
                          color: 'var(--color-text, #f3f4f6)', fontSize: '0.875rem',
                          padding: '0.25rem 0.5rem', outline: 'none',
                        }}
                      />
                      <button onClick={() => handleRename(v.id)} style={{ color: '#22c55e', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }}>✓</button>
                      <button onClick={() => { setEditingId(null); setEditLabel('') }} style={{ color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
                    </div>
                  ) : (
                    <div style={{ fontWeight: 600, color: 'var(--color-text, #f3f4f6)', fontSize: '0.9375rem' }}>
                      {displayName}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      {new Date(v.created_at).toLocaleString()}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      {v.page_count} page{v.page_count !== 1 ? 's' : ''}, {v.section_count} section{v.section_count !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {/* Badges */}
                <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: '0.6875rem', fontWeight: 700,
                    color: statusColor, background: `${statusColor}22`,
                    padding: '0.15rem 0.5rem', borderRadius: '0.25rem',
                    textTransform: 'uppercase',
                  }}>
                    {v.status}
                  </span>
                  <span style={{
                    fontSize: '0.6875rem', color: '#9ca3af',
                    background: 'var(--color-hover, #2e2e38)',
                    padding: '0.15rem 0.5rem', borderRadius: '0.25rem',
                  }}>
                    {SOURCE_LABELS[v.source] ?? v.source}
                  </span>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                  <button
                    onClick={() => { setEditingId(v.id); setEditLabel(v.label ?? '') }}
                    disabled={isActing}
                    title="Rename"
                    style={btnStyle('#6b7280', isActing)}
                  >
                    ✏️
                  </button>
                  <a
                    href={`/website/versions/${v.id}/preview`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      ...btnStyle('#9ca3af', false),
                      textDecoration: 'none',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}
                    title="Preview"
                  >
                    👁
                  </a>
                  <button
                    onClick={() => handleRestore(v)}
                    disabled={isActing}
                    title="Restore"
                    style={btnStyle('#3b82f6', isActing)}
                  >
                    {isActing && actionId === v.id ? '…' : '↩'}
                  </button>
                  {v.status !== 'published' && (
                    <button
                      onClick={() => handlePublish(v)}
                      disabled={isActing}
                      title="Publish this version"
                      style={btnStyle('#22c55e', isActing)}
                    >
                      🚀
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, padding: '0.75rem 1.5rem', borderRadius: '0.625rem',
          background: toast.ok ? '#16a34a' : '#dc2626',
          color: '#fff', fontWeight: 700, fontSize: '0.875rem',
          boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

function btnStyle(color: string, disabled: boolean): React.CSSProperties {
  return {
    padding: '0.375rem 0.625rem', borderRadius: '0.375rem',
    border: `1px solid ${color}44`, background: `${color}11`,
    color, cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '0.875rem', fontWeight: 600,
    opacity: disabled ? 0.5 : 1,
  }
}
