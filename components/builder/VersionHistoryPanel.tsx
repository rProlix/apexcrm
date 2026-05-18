'use client'

// components/builder/VersionHistoryPanel.tsx
// Slide-in drawer showing version history with restore/publish/preview actions.

import { useState, useEffect, useCallback } from 'react'
import type { WebsiteVersionSummary } from '@/lib/website/versionTypes'
import {
  fetchVersions,
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
  open:    boolean
  onClose: () => void
  onRestored?: () => void
}

export function VersionHistoryPanel({ open, onClose, onRestored }: Props) {
  const [versions,    setVersions]    = useState<WebsiteVersionSummary[]>([])
  const [loading,     setLoading]     = useState(false)
  const [actionId,    setActionId]    = useState<string | null>(null)
  const [confirmId,   setConfirmId]   = useState<string | null>(null)
  const [confirmType, setConfirmType] = useState<'restore' | 'publish' | null>(null)
  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [editLabel,   setEditLabel]   = useState('')
  const [toast,       setToast]       = useState<{ msg: string; ok: boolean } | null>(null)

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const data = await fetchVersions()
    setVersions(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  async function handleCreateCheckpoint() {
    const label = prompt('Version label (optional):') ?? 'Manual checkpoint'
    const v = await createVersionCheckpoint(label || 'Manual checkpoint')
    if (v) {
      showToast(`Version #${v.version_number} saved`)
      load()
    } else {
      showToast('Failed to create checkpoint', false)
    }
  }

  async function handleRestore(v: WebsiteVersionSummary) {
    setConfirmId(v.id)
    setConfirmType('restore')
  }

  async function handlePublish(v: WebsiteVersionSummary) {
    setConfirmId(v.id)
    setConfirmType('publish')
  }

  async function executeConfirm() {
    if (!confirmId || !confirmType) return
    setActionId(confirmId)
    setConfirmId(null)
    setConfirmType(null)

    let ok = false
    if (confirmType === 'restore') {
      ok = await restoreVersion(confirmId)
      if (ok) {
        showToast('Version restored successfully. Page will refresh…')
        setTimeout(() => {
          onRestored?.()
          window.location.reload()
        }, 1200)
      } else {
        showToast('Restore failed', false)
      }
    } else {
      ok = await publishVersion(confirmId)
      if (ok) {
        showToast('Version published to live site!')
        load()
      } else {
        showToast('Publish failed', false)
      }
    }
    setActionId(null)
  }

  async function handleRename(id: string) {
    if (!editLabel.trim()) return
    const ok = await renameVersion(id, editLabel.trim())
    if (ok) {
      showToast('Renamed')
      setVersions((prev) => prev.map((v) => v.id === id ? { ...v, label: editLabel.trim() } : v))
    } else {
      showToast('Rename failed', false)
    }
    setEditingId(null)
    setEditLabel('')
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 100000,
          background: 'rgba(0,0,0,0.5)',
        }}
      />

      {/* Drawer */}
      <div style={{
        position:    'fixed',
        top:         0,
        right:       0,
        bottom:      0,
        zIndex:      100001,
        width:       420,
        maxWidth:    '95vw',
        background:  '#16161a',
        borderLeft:  '1px solid #2e2e38',
        display:     'flex',
        flexDirection: 'column',
        fontFamily:  'Inter, system-ui, sans-serif',
        overflow:    'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding:      '1rem 1.25rem',
          borderBottom: '1px solid #2e2e38',
          display:      'flex',
          alignItems:   'center',
          gap:          '0.75rem',
          flexShrink:   0,
        }}>
          <span style={{ fontSize: '1.125rem' }}>🕐</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: '#f3f4f6', fontSize: '0.9375rem' }}>Version History</div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
              {versions.length} version{versions.length !== 1 ? 's' : ''}
            </div>
          </div>
          <button
            onClick={handleCreateCheckpoint}
            style={{
              padding:     '0.375rem 0.75rem',
              borderRadius: '0.5rem',
              border:      '1px solid #c9a84c55',
              background:  'transparent',
              color:       '#c9a84c',
              fontSize:    '0.75rem',
              fontWeight:  600,
              cursor:      'pointer',
            }}
          >
            + Checkpoint
          </button>
          <button
            onClick={onClose}
            style={{
              width:       28, height: 28,
              borderRadius: '50%',
              border:      '1px solid #3f3f46',
              background:  'transparent',
              color:       '#9ca3af',
              cursor:      'pointer',
              fontSize:    '1rem',
              display:     'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        {/* Version list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280', fontSize: '0.875rem' }}>
              Loading versions…
            </div>
          ) : versions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280', fontSize: '0.875rem' }}>
              No versions yet. Click "+ Checkpoint" to save one.
            </div>
          ) : (
            versions.map((v) => (
              <VersionRow
                key={v.id}
                version={v}
                isActing={actionId === v.id}
                isEditing={editingId === v.id}
                editLabel={editLabel}
                onSetEditLabel={setEditLabel}
                onStartEdit={() => { setEditingId(v.id); setEditLabel(v.label ?? '') }}
                onSaveEdit={() => handleRename(v.id)}
                onCancelEdit={() => { setEditingId(null); setEditLabel('') }}
                onRestore={() => handleRestore(v)}
                onPublish={() => handlePublish(v)}
              />
            ))
          )}
        </div>
      </div>

      {/* Confirm dialog */}
      {confirmId && confirmType && (
        <ConfirmDialog
          type={confirmType}
          version={versions.find((v) => v.id === confirmId)!}
          onConfirm={executeConfirm}
          onCancel={() => { setConfirmId(null); setConfirmType(null) }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position:    'fixed',
          bottom:      24,
          left:        '50%',
          transform:   'translateX(-50%)',
          zIndex:      200000,
          padding:     '0.625rem 1.25rem',
          borderRadius: '0.625rem',
          background:  toast.ok ? '#16a34a' : '#dc2626',
          color:       '#fff',
          fontWeight:  600,
          fontSize:    '0.875rem',
          boxShadow:   '0 4px 24px rgba(0,0,0,0.3)',
          whiteSpace:  'nowrap',
        }}>
          {toast.msg}
        </div>
      )}
    </>
  )
}

function VersionRow({
  version, isActing, isEditing, editLabel,
  onSetEditLabel, onStartEdit, onSaveEdit, onCancelEdit,
  onRestore, onPublish,
}: {
  version:       WebsiteVersionSummary
  isActing:      boolean
  isEditing:     boolean
  editLabel:     string
  onSetEditLabel:(v: string) => void
  onStartEdit:   () => void
  onSaveEdit:    () => void
  onCancelEdit:  () => void
  onRestore:     () => void
  onPublish:     () => void
}) {
  const [actionsOpen, setActionsOpen] = useState(false)
  const displayName = version.label ?? `Version #${version.version_number}`
  const statusColor = STATUS_COLORS[version.status] ?? '#6b7280'

  return (
    <div style={{
      borderRadius: '0.625rem',
      border:       `1px solid ${version.status === 'published' ? '#22c55e33' : '#2e2e38'}`,
      background:   version.status === 'published' ? '#16a34a0a' : '#1a1a1f',
      marginBottom: '0.5rem',
      overflow:     'hidden',
    }}>
      <div
        style={{ padding: '0.75rem 1rem', cursor: 'pointer' }}
        onClick={() => setActionsOpen((o) => !o)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
          <span style={{
            fontSize:    '0.625rem',
            fontWeight:  700,
            color:       '#6b7280',
            background:  '#2e2e38',
            padding:     '0.1rem 0.375rem',
            borderRadius: '0.25rem',
          }}>
            v{version.version_number}
          </span>

          {isEditing ? (
            <input
              value={editLabel}
              onChange={(e) => onSetEditLabel(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => { if (e.key === 'Enter') onSaveEdit(); if (e.key === 'Escape') onCancelEdit() }}
              autoFocus
              style={{
                flex:        1,
                background:  '#2e2e38',
                border:      '1px solid #c9a84c',
                borderRadius: '0.25rem',
                color:       '#f3f4f6',
                fontSize:    '0.8125rem',
                padding:     '0.125rem 0.375rem',
                outline:     'none',
              }}
            />
          ) : (
            <span style={{ flex: 1, fontWeight: 600, color: '#f3f4f6', fontSize: '0.8125rem' }}>
              {displayName}
            </span>
          )}

          <span style={{
            fontSize:    '0.625rem',
            fontWeight:  700,
            color:       statusColor,
            background:  `${statusColor}22`,
            padding:     '0.1rem 0.375rem',
            borderRadius: '0.25rem',
            textTransform: 'uppercase',
          }}>
            {version.status}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.6875rem', color: '#6b7280', flexWrap: 'wrap' }}>
          <span>{new Date(version.created_at).toLocaleString()}</span>
          {version.source !== 'manual' && (
            <span style={{
              background:  '#2e2e38',
              padding:     '0 0.3rem',
              borderRadius: '0.2rem',
            }}>
              {SOURCE_LABELS[version.source] ?? version.source}
            </span>
          )}
          <span>{version.page_count}p / {version.section_count}s</span>
        </div>
      </div>

      {actionsOpen && (
        <div style={{
          padding:     '0.5rem 1rem 0.75rem',
          borderTop:   '1px solid #2e2e38',
          display:     'flex',
          gap:         '0.5rem',
          flexWrap:    'wrap',
        }}>
          {isEditing ? (
            <>
              <ActionBtn onClick={onSaveEdit} color="#22c55e">Save</ActionBtn>
              <ActionBtn onClick={onCancelEdit} color="#6b7280">Cancel</ActionBtn>
            </>
          ) : (
            <ActionBtn onClick={(e) => { e.stopPropagation(); onStartEdit() }} color="#6b7280">
              ✏️ Rename
            </ActionBtn>
          )}

          <a
            href={`/website/versions/${version.id}/preview`}
            target="_blank"
            rel="noreferrer"
            style={{
              padding:     '0.3rem 0.625rem',
              borderRadius: '0.375rem',
              border:      '1px solid #3f3f46',
              background:  'transparent',
              color:       '#9ca3af',
              fontSize:    '0.75rem',
              fontWeight:  600,
              cursor:      'pointer',
              textDecoration: 'none',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            👁 Preview
          </a>

          <ActionBtn
            onClick={(e) => { e.stopPropagation(); onRestore() }}
            color="#3b82f6"
            disabled={isActing}
          >
            {isActing ? '…' : '↩ Restore'}
          </ActionBtn>

          {version.status !== 'published' && (
            <ActionBtn
              onClick={(e) => { e.stopPropagation(); onPublish() }}
              color="#22c55e"
              disabled={isActing}
            >
              {isActing ? '…' : '🚀 Publish'}
            </ActionBtn>
          )}
        </div>
      )}
    </div>
  )
}

function ActionBtn({
  children, onClick, color, disabled,
}: {
  children: React.ReactNode
  onClick:  (e: React.MouseEvent) => void
  color:    string
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding:     '0.3rem 0.625rem',
        borderRadius: '0.375rem',
        border:      `1px solid ${color}55`,
        background:  `${color}11`,
        color,
        fontSize:    '0.75rem',
        fontWeight:  600,
        cursor:      disabled ? 'not-allowed' : 'pointer',
        opacity:     disabled ? 0.5 : 1,
        whiteSpace:  'nowrap',
      }}
    >
      {children}
    </button>
  )
}

function ConfirmDialog({
  type, version, onConfirm, onCancel,
}: {
  type:      'restore' | 'publish'
  version:   WebsiteVersionSummary
  onConfirm: () => void
  onCancel:  () => void
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      zIndex: 200000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.7)',
    }}>
      <div style={{
        background:   '#1e1e24',
        border:       '1px solid #3f3f46',
        borderRadius: '1rem',
        padding:      '1.5rem',
        maxWidth:     400,
        width:        '90%',
        fontFamily:   'Inter, system-ui, sans-serif',
      }}>
        <div style={{ fontWeight: 700, color: '#f3f4f6', marginBottom: '0.75rem', fontSize: '1rem' }}>
          {type === 'restore' ? '↩ Restore this version?' : '🚀 Publish this version?'}
        </div>
        <div style={{ color: '#9ca3af', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '1.25rem' }}>
          {type === 'restore'
            ? `Restoring Version #${version.version_number} will replace your current draft. A backup will be saved automatically first.`
            : `Publishing Version #${version.version_number} will update your live business website immediately.`
          }
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '0.5rem 1rem', borderRadius: '0.5rem',
              border: '1px solid #3f3f46', background: 'transparent',
              color: '#9ca3af', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '0.5rem 1rem', borderRadius: '0.5rem',
              border: 'none',
              background: type === 'restore' ? '#3b82f6' : '#16a34a',
              color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.875rem',
            }}
          >
            {type === 'restore' ? 'Yes, Restore' : 'Yes, Publish'}
          </button>
        </div>
      </div>
    </div>
  )
}
