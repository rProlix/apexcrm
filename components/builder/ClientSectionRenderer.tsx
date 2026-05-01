'use client'

// components/builder/ClientSectionRenderer.tsx
// Client-side equivalent of SectionRenderer — renders section content from
// the Zustand store without SSR. Used for:
//   1. Read-only view mode in EditorShell (when edit mode is OFF)
//   2. Live preview inside each EditableSectionWrapper

import { HeroSection }         from '@/components/site/sections/HeroSection'
import { FeatureGridSection }  from '@/components/site/sections/FeatureGridSection'
import { TestimonialsSection } from '@/components/site/sections/TestimonialsSection'
import { FaqSection }          from '@/components/site/sections/FaqSection'
import { CtaSection }          from '@/components/site/sections/CtaSection'
import { RichTextSection }     from '@/components/site/sections/RichTextSection'
import { BannerSection }       from '@/components/site/sections/BannerSection'
import { ContactSection }      from '@/components/site/sections/ContactSection'
import { AboutSection }        from '@/components/site/sections/AboutSection'
import type { BuilderSection } from '@/lib/builder/types'

interface Props {
  section: BuilderSection
}

export function ClientSectionRenderer({ section }: Props) {
  const c = section.content as Record<string, unknown>

  switch (section.section_type) {
    case 'hero':
      return <HeroSection content={c as never} />

    case 'feature_grid':
      return <FeatureGridSection content={c as never} />

    case 'testimonials':
      return <TestimonialsSection content={c as never} />

    case 'faq':
      return <FaqSection content={c as never} />

    case 'cta':
      return <CtaSection content={c as never} />

    case 'rich_text':
      return <RichTextSection content={c as never} />

    case 'banner':
      return <BannerSection content={c as never} />

    case 'contact':
      return <ContactSection content={c as never} />

    case 'about':
      return <AboutSection content={c as never} />

    case 'product_grid':
      // Product grid needs server-side data fetching — show a placeholder in edit mode
      return (
        <div style={{
          padding:    '4rem 1.5rem',
          textAlign:  'center',
          background: 'var(--color-surface)',
          border:     '2px dashed var(--color-border)',
          borderRadius: '0.5rem',
          margin:     '1rem 1.5rem',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🛍️</div>
          <p style={{ color: 'var(--color-text)', fontWeight: 600, margin: '0 0 0.25rem' }}>
            {(c.headline as string) || 'Product Grid'}
          </p>
          <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem', margin: 0 }}>
            Live products will appear here. Configure in the sidebar →
          </p>
        </div>
      )

    case 'image_gallery':
      return (
        <div style={{
          padding:    '4rem 1.5rem',
          textAlign:  'center',
          background: 'var(--color-surface)',
          border:     '2px dashed var(--color-border)',
          borderRadius: '0.5rem',
          margin:     '1rem 1.5rem',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🖼️</div>
          <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem', margin: 0 }}>
            Image Gallery — upload images in the sidebar →
          </p>
        </div>
      )

    case 'product_360_viewer':
      return (
        <div style={{
          padding:      '3rem 1.5rem',
          textAlign:    'center',
          background:   'linear-gradient(135deg, #0f0a1e 0%, #1a0a2e 100%)',
          border:       '2px dashed #4c1d95',
          borderRadius: '0.5rem',
          margin:       '1rem 1.5rem',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🔄</div>
          <p style={{ color: '#c4b5fd', fontWeight: 600, margin: '0 0 0.25rem', fontSize: '0.9375rem' }}>
            360° Product Viewer
          </p>
          <p style={{ color: '#7c3aed', fontSize: '0.8125rem', margin: 0 }}>
            {(c.productId as string)
              ? `Product ID: ${(c.productId as string).slice(0, 8)}… · Configure in sidebar →`
              : 'Select a product in the sidebar to attach a 360° spin'}
          </p>
          <p style={{ color: '#6d28d9', fontSize: '0.75rem', marginTop: '0.75rem' }}>
            Interactive drag-to-rotate viewer will render on the live site
          </p>
        </div>
      )

    default:
      return null
  }
}
