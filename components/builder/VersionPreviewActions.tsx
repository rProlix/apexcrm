'use client'

// components/builder/VersionPreviewActions.tsx
// Client-side restore/publish buttons for the version preview page.

import { useState } from 'react'

interface Props {
  versionId:     string
  versionNumber: number
}

export function VersionPreviewActions({ versionId, versionNumber }: Props) {
  const [restoring,   setRestoring]   = useState(false)
  const [publishing,  setPublishing]  = useState(false)
  const [toast,       setToast]       = useState<string | null>(null)

  async function handleRestore() {
    if (!confirm(`Restore Version #${versionNumber}?\n\nA backup of the current state will be saved first.`)) return
    setRestoring(true)
    const res = await fetch(`/api/website/versions/${versionId}/restore`, { method: 'POST' })
    setRestoring(false)
    if (res.ok) {
      setToast(`Version #${versionNumber} restored! Redirecting…`)
      setTimeout(() => window.location.href = '/website', 1500)
    } else {
      const data = await res.json().catch(() => ({}))
      setToast(`Restore failed: ${(data as Record<string,string>).error ?? 'unknown error'}`)
    }
  }

  async function handlePublish() {
    if (!confirm(`Publish Version #${versionNumber} to the live website?`)) return
    setPublishing(true)
    const res = await fetch(`/api/website/versions/${versionId}/publish`, { method: 'POST' })
    setPublishing(false)
    if (res.ok) {
      setToast(`Version #${versionNumber} is now live!`)
    } else {
      const data = await res.json().catch(() => ({}))
      setToast(`Publish failed: ${(data as Record<string,string>).error ?? 'unknown error'}`)
    }
  }

  return (
    <>
      <button
        onClick={handleRestore}
        disabled={restoring || publishing}
        style={{
          padding:      '0.375rem 0.875rem',
          borderRadius: '0.5rem',
          border:       '1px solid #6b7280',
          background:   'transparent',
          color:        '#d1d5db',
          cursor:       restoring ? 'not-allowed' : 'pointer',
          fontSize:     '0.8125rem',
          fontWeight:   600,
          opacity:      restoring ? 0.6 : 1,
        }}
      >
        {restoring ? 'Restoring…' : '↩ Restore this version'}
      </button>
      <button
        onClick={handlePublish}
        disabled={restoring || publishing}
        style={{
          padding:      '0.375rem 0.875rem',
          borderRadius: '0.5rem',
          border:       'none',
          background:   publishing ? '#15803d' : '#16a34a',
          color:        '#fff',
          cursor:       publishing ? 'not-allowed' : 'pointer',
          fontSize:     '0.8125rem',
          fontWeight:   600,
          opacity:      publishing ? 0.7 : 1,
        }}
      >
        {publishing ? 'Publishing…' : '🚀 Publish this version'}
      </button>

      {toast && (
        <div style={{
          position:    'fixed',
          bottom:      24,
          left:        '50%',
          transform:   'translateX(-50%)',
          zIndex:      200000,
          padding:     '0.625rem 1.25rem',
          borderRadius: '0.625rem',
          background:  toast.includes('failed') ? '#dc2626' : '#16a34a',
          color:       '#fff',
          fontWeight:  700,
          fontSize:    '0.875rem',
          boxShadow:   '0 4px 24px rgba(0,0,0,0.4)',
          whiteSpace:  'nowrap',
        }}>
          {toast}
        </div>
      )}
    </>
  )
}
