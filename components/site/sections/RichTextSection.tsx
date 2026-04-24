// components/site/sections/RichTextSection.tsx
import type { RichTextContent } from '@/lib/website/types'

interface Props { content: RichTextContent }

export function RichTextSection({ content }: Props) {
  const { html } = content
  if (!html) return null

  return (
    <section style={{ padding: '4rem 1.5rem', background: 'var(--color-bg)' }}>
      <div
        style={{
          maxWidth:   800,
          margin:     '0 auto',
          color:      'var(--color-text)',
          fontSize:   '1rem',
          lineHeight: 1.75,
        }}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </section>
  )
}
