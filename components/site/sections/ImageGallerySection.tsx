// components/site/sections/ImageGallerySection.tsx
import Image from 'next/image'
import type { ImageGalleryContent } from '@/lib/website/types'

interface Props { content: ImageGalleryContent }

export function ImageGallerySection({ content }: Props) {
  const { headline, images = [], layout = 'grid' } = content

  if (images.length === 0) return null

  const gridCols = layout === 'masonry'
    ? 'repeat(auto-fill, minmax(280px, 1fr))'
    : layout === 'carousel'
    ? 'repeat(auto-fill, minmax(320px, 1fr))'
    : 'repeat(auto-fill, minmax(280px, 1fr))'

  return (
    <section style={{ padding: '5rem 1.5rem', background: 'var(--color-bg)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {headline && (
          <h2 style={{
            textAlign:  'center',
            fontSize:   'clamp(1.5rem, 3vw, 2.25rem)',
            fontWeight: 700,
            fontFamily: 'var(--font-heading)',
            color:      'var(--color-text)',
            margin:     '0 0 3rem',
          }}>{headline}</h2>
        )}

        <div style={{
          display:             'grid',
          gridTemplateColumns: gridCols,
          gap:                 '1rem',
        }}>
          {images.map((img, i) => (
            <div key={i} style={{
              position:     'relative',
              borderRadius: '0.875rem',
              overflow:     'hidden',
              aspectRatio:  '4/3',
              background:   'var(--color-surface)',
            }}>
              <Image
                src={img.url}
                alt={img.alt || `Gallery image ${i + 1}`}
                fill
                unoptimized
                style={{ objectFit: 'cover' }}
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              />
              {img.caption && (
                <div style={{
                  position:   'absolute',
                  bottom:     0,
                  left:       0,
                  right:      0,
                  padding:    '0.75rem 1rem',
                  background: 'linear-gradient(transparent, rgba(0,0,0,0.6))',
                }}>
                  <p style={{
                    margin:     0,
                    fontSize:   '0.8125rem',
                    color:      '#fff',
                    lineHeight: 1.4,
                  }}>{img.caption}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
