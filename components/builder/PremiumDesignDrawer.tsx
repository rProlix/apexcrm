'use client'
// components/builder/PremiumDesignDrawer.tsx
// Fixed right-side floating drawer that opens from the "✦ Premium Design" button
// in the EditBar. Accessible at any time in the live editor — no section selection
// required. Wraps the PremiumDesignPanel with scroll and close chrome.

import { useEffect, useRef } from 'react'
import { useBuilderStore } from '@/lib/builder/store'
import { PremiumDesignPanel } from '@/components/website/premium/PremiumDesignPanel'

const DRAWER_WIDTH = 420

export function PremiumDesignDrawer() {
  const { showPremiumDrawer, setPremiumDrawer, tenantId, pageId, selectedSectionId } = useBuilderStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  // Close on Escape key
  useEffect(() => {
    if (!showPremiumDrawer) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPremiumDrawer(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showPremiumDrawer, setPremiumDrawer])

  if (!showPremiumDrawer || !tenantId) return null

  return (
    <>
      {/* Semi-transparent backdrop — click to close */}
      <div
        onClick={() => setPremiumDrawer(false)}
        style={{
          position:   'fixed',
          inset:      0,
          zIndex:     99997,
          background: 'rgba(0,0,0,0.35)',
          backdropFilter: 'blur(2px)',
        }}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        style={{
          position:   'fixed',
          top:        0,
          right:      0,
          bottom:     0,
          width:      DRAWER_WIDTH,
          zIndex:     99998,
          background: '#0e0e12',
          borderLeft: '1px solid #2e2e38',
          display:    'flex',
          flexDirection: 'column',
          fontFamily: 'Inter, system-ui, sans-serif',
          boxShadow:  '-8px 0 32px rgba(0,0,0,0.5)',
        }}
        role="dialog"
        aria-label="AI Premium Design"
        aria-modal="true"
      >
        {/* ── Drawer header ─────────────────────────────────────────────── */}
        <div style={{
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'space-between',
          padding:      '0.875rem 1.25rem',
          borderBottom: '1px solid #27272a',
          flexShrink:   0,
          background:   '#111114',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            {/* Wand icon */}
            <div style={{
              width: 32, height: 32,
              borderRadius: 10,
              background: 'rgba(201,168,76,0.12)',
              border:     '1px solid rgba(201,168,76,0.2)',
              display:    'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/>
                <path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/>
                <path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#f4f4f5', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                AI Premium Design
              </div>
              <div style={{ fontSize: '0.6875rem', color: '#52525b', marginTop: 1 }}>
                Luxury UI · Animations · Style presets
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {/* Open in full page link */}
            <a
              href="/website/ai-premium-design"
              target="_blank"
              rel="noopener"
              title="Open full page"
              style={{
                fontSize: '0.6875rem', color: '#71717a', textDecoration: 'none',
                padding: '0.25rem 0.5rem', borderRadius: 6,
                border: '1px solid #3f3f46', lineHeight: 1.4,
                transition: 'color 0.15s',
              }}
            >
              Full page ↗
            </a>
            {/* Close button */}
            <button
              onClick={() => setPremiumDrawer(false)}
              title="Close (Esc)"
              style={{
                width: 30, height: 30, borderRadius: 8,
                border: '1px solid #3f3f46', background: 'transparent',
                color: '#71717a', cursor: 'pointer', fontSize: '1rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                lineHeight: 1, transition: 'all 0.15s',
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* ── Scrollable content ────────────────────────────────────────── */}
        <div
          ref={scrollRef}
          style={{
            flex:       1,
            overflowY:  'auto',
            padding:    '1.25rem',
            scrollbarWidth: 'thin',
            scrollbarColor: '#3f3f46 transparent',
          }}
        >
          <PremiumDesignPanel
            tenantId={tenantId}
            initialPageId={pageId ?? undefined}
            initialSectionId={selectedSectionId ?? undefined}
            compact={false}
          />
        </div>
      </div>
    </>
  )
}
