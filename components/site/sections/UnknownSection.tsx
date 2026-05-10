// components/site/sections/UnknownSection.tsx
// Fallback for section types that have no registered renderer.
// In public mode: renders nothing (not a crash, not visible to visitors).
// In editor/preview mode: shows a diagnostic card so the developer can fix it.

import type { NormalizedSection } from '@/lib/website/normalizeWebsiteSection'

interface Props {
  section: NormalizedSection
  mode?:   'public' | 'preview' | 'editor'
}

export function UnknownSection({ section, mode = 'public' }: Props) {
  if (mode === 'public') return null

  // Editor / preview mode: show a non-crashing diagnostic card
  return (
    <div style={{
      margin:       '0.5rem 1.5rem',
      padding:      '1.5rem',
      background:   '#1e1e2e',
      border:       '2px dashed #3f3f46',
      borderRadius: '0.75rem',
      fontFamily:   'Inter, system-ui, sans-serif',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '1.25rem' }}>⚠️</span>
        <strong style={{ color: '#f59e0b', fontSize: '0.875rem' }}>
          Unknown Section Type
        </strong>
      </div>
      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.25rem 0.75rem' }}>
        <dt style={{ color: '#71717a', fontSize: '0.75rem' }}>Raw type:</dt>
        <dd style={{ color: '#a1a1aa', fontSize: '0.75rem', margin: 0, fontFamily: 'monospace' }}>
          {section.rawType || '(empty)'}
        </dd>
        <dt style={{ color: '#71717a', fontSize: '0.75rem' }}>Normalized:</dt>
        <dd style={{ color: '#a1a1aa', fontSize: '0.75rem', margin: 0, fontFamily: 'monospace' }}>
          {section.type}
        </dd>
        <dt style={{ color: '#71717a', fontSize: '0.75rem' }}>Section ID:</dt>
        <dd style={{ color: '#a1a1aa', fontSize: '0.75rem', margin: 0, fontFamily: 'monospace' }}>
          {section.id}
        </dd>
      </dl>
      <p style={{ margin: '0.75rem 0 0', fontSize: '0.75rem', color: '#52525b' }}>
        Add <code style={{ background: '#27272a', padding: '0.1em 0.3em', borderRadius: '0.2em' }}>
          {section.rawType}
        </code> to{' '}
        <code style={{ background: '#27272a', padding: '0.1em 0.3em', borderRadius: '0.2em' }}>
          lib/website/normalizeWebsiteSection.ts
        </code> TYPE_ALIASES and create a renderer component.
      </p>
    </div>
  )
}
