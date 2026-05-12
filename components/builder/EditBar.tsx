'use client'

// components/builder/EditBar.tsx
// Floating fixed top bar shown only to owners/admins while browsing the live site.
// Provides: edit mode toggle, publish/unpublish, undo/redo, save status, and a
// link back to the full dashboard builder.

import { useCallback, useEffect, useState } from 'react'
import { useBuilderStore } from '@/lib/builder/store'
import { publishSite } from '@/lib/builder/api'

// ── Premium Design wand icon (inline SVG so no import needed) ─────────────
function WandIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/>
      <path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/>
      <path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/>
    </svg>
  )
}

const BAR_HEIGHT = 48

export function EditBar() {
  const {
    editMode, setEditMode,
    saveStatus,
    tenantId, pageName, isPublished, setPublished,
    undo, redo, history, future,
    showPremiumDrawer, setPremiumDrawer,
  } = useBuilderStore()

  const [publishing, setPublishing] = useState(false)

  // Push padding onto document body so the site header isn't hidden behind the bar
  useEffect(() => {
    const prev = document.body.style.paddingTop
    document.body.style.paddingTop = `${BAR_HEIGHT}px`
    document.documentElement.style.setProperty('--editor-bar-height', `${BAR_HEIGHT}px`)
    return () => {
      document.body.style.paddingTop = prev
      document.documentElement.style.removeProperty('--editor-bar-height')
    }
  }, [])

  // Auto-save: any time sections change while saveStatus is 'saving' → we've
  // already scheduled the save; just wait for it.
  // The actual debounced save logic lives in EditorShell.

  const handlePublish = useCallback(async () => {
    if (publishing) return
    setPublishing(true)
    const ok = await publishSite(tenantId, !isPublished)
    if (ok) setPublished(!isPublished)
    setPublishing(false)
  }, [publishing, tenantId, isPublished, setPublished])

  return (
    <div style={{
      position:       'fixed',
      top:            0,
      left:           0,
      right:          0,
      height:         BAR_HEIGHT,
      zIndex:         99999,
      background:     '#1a1a1f',
      borderBottom:   '1px solid #2e2e38',
      display:        'flex',
      alignItems:     'center',
      padding:        '0 1rem',
      gap:            '0.5rem',
      fontFamily:     'Inter, system-ui, sans-serif',
      fontSize:       '0.8125rem',
    }}>
      {/* Brand / page context */}
      <a
        href="/website"
        title="Open full builder"
        style={{
          display:        'flex',
          alignItems:     'center',
          gap:            '0.375rem',
          color:          '#c9a84c',
          fontWeight:     700,
          textDecoration: 'none',
          flexShrink:     0,
          fontSize:       '0.875rem',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22" fill="none" stroke="currentColor" strokeWidth="2"/>
        </svg>
        <span style={{ display: 'none', ['@media(min-width:480px)' as never]: { display: 'block' } }}>
          {pageName || 'Builder'}
        </span>
      </a>

      <div style={{ flex: 1 }} />

      {/* Save status */}
      {editMode && (
        <span style={{
          fontSize:  '0.75rem',
          color:     saveStatus === 'saved'  ? '#22c55e'
                   : saveStatus === 'saving' ? '#f59e0b'
                   : saveStatus === 'error'  ? '#ef4444'
                   : '#6b7280',
          minWidth:  48,
          textAlign: 'right',
        }}>
          {saveStatus === 'saving' ? 'Saving…'
          : saveStatus === 'saved'  ? 'Saved ✓'
          : saveStatus === 'error'  ? 'Save error'
          : ''}
        </span>
      )}

      {/* Undo / Redo — only in edit mode */}
      {editMode && (
        <>
          <IconButton
            onClick={undo}
            disabled={history.length === 0}
            title="Undo (Ctrl+Z)"
          >
            ↩
          </IconButton>
          <IconButton
            onClick={redo}
            disabled={future.length === 0}
            title="Redo (Ctrl+Shift+Z)"
          >
            ↪
          </IconButton>
        </>
      )}

      {/* ✦ Premium Design button — always visible */}
      <button
        onClick={() => setPremiumDrawer(!showPremiumDrawer)}
        title="AI Premium Design &amp; Animations"
        style={{
          padding:      '0.375rem 0.75rem',
          borderRadius: '0.5rem',
          border:       `1px solid ${showPremiumDrawer ? '#c9a84c' : '#c9a84c55'}`,
          background:   showPremiumDrawer ? '#c9a84c22' : 'transparent',
          color:        showPremiumDrawer ? '#c9a84c' : '#c9a84c99',
          fontWeight:   700,
          cursor:       'pointer',
          fontSize:     '0.8125rem',
          display:      'flex',
          alignItems:   'center',
          gap:          '0.375rem',
          whiteSpace:   'nowrap',
          transition:   'all 0.15s',
        }}
      >
        <WandIcon />
        ✦ Premium Design
      </button>

      {/* Publish toggle */}
      <button
        onClick={handlePublish}
        disabled={publishing}
        style={{
          padding:      '0.375rem 0.875rem',
          borderRadius: '0.5rem',
          border:       `1px solid ${isPublished ? '#22c55e44' : '#ffffff22'}`,
          background:   isPublished ? '#16a34a22' : 'transparent',
          color:        isPublished ? '#22c55e' : '#9ca3af',
          fontWeight:   600,
          cursor:       publishing ? 'not-allowed' : 'pointer',
          fontSize:     '0.8125rem',
          opacity:      publishing ? 0.6 : 1,
          transition:   'all 0.15s',
          whiteSpace:   'nowrap',
        }}
      >
        {publishing ? '…' : isPublished ? '● Live' : 'Publish'}
      </button>

      {/* Edit mode toggle — primary action */}
      <button
        onClick={() => setEditMode(!editMode)}
        style={{
          padding:      '0.375rem 1rem',
          borderRadius: '0.5rem',
          border:       'none',
          background:   editMode ? '#c9a84c' : '#3f3f46',
          color:        editMode ? '#000' : '#fff',
          fontWeight:   700,
          cursor:       'pointer',
          fontSize:     '0.8125rem',
          transition:   'all 0.15s',
          display:      'flex',
          alignItems:   'center',
          gap:          '0.375rem',
          whiteSpace:   'nowrap',
        }}
      >
        {editMode ? (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Editing
          </>
        ) : (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit Website
          </>
        )}
      </button>
    </div>
  )
}

function IconButton({
  children, onClick, disabled, title,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width:        28,
        height:       28,
        borderRadius: '0.375rem',
        border:       '1px solid #3f3f46',
        background:   'transparent',
        color:        disabled ? '#3f3f46' : '#a1a1aa',
        cursor:       disabled ? 'not-allowed' : 'pointer',
        fontSize:     '0.9375rem',
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'center',
        padding:      0,
      }}
    >
      {children}
    </button>
  )
}
