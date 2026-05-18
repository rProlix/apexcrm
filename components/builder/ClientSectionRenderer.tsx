'use client'

// components/builder/ClientSectionRenderer.tsx
// Client-side equivalent of SectionRenderer — renders section content from
// the Zustand store without SSR. Used for:
//   1. Read-only view mode in EditorShell (when edit mode is OFF)
//   2. Live preview inside each EditableSectionWrapper
//
// Wraps every section in PremiumSectionFrame so builder preview
// matches the public site design output.

import { HeroSection }         from '@/components/site/sections/HeroSection'
import { FeatureGridSection }  from '@/components/site/sections/FeatureGridSection'
import { TestimonialsSection } from '@/components/site/sections/TestimonialsSection'
import { FaqSection }          from '@/components/site/sections/FaqSection'
import { CtaSection }          from '@/components/site/sections/CtaSection'
import { RichTextSection }     from '@/components/site/sections/RichTextSection'
import { BannerSection }       from '@/components/site/sections/BannerSection'
import { ContactSection }      from '@/components/site/sections/ContactSection'
import { AboutSection }        from '@/components/site/sections/AboutSection'
import { PremiumSectionFrame } from '@/components/site/PremiumSectionFrame'
import { normalizeSectionDesign } from '@/lib/website/design/normalizeDesignSystem'
import type { BuilderSection } from '@/lib/builder/types'
import type { SectionDesign }  from '@/lib/website/design/types'

interface Props {
  section: BuilderSection
}

/** Extract and normalize the design from a section's style_config */
function extractDesign(section: BuilderSection): Partial<SectionDesign> | null {
  try {
    const sc = section.style_config
    if (sc && typeof sc === 'object' && 'design' in sc && sc.design && typeof sc.design === 'object') {
      return normalizeSectionDesign(sc.design, {} as never)
    }
  } catch { /* non-critical */ }
  return null
}

export function ClientSectionRenderer({ section }: Props) {
  const c = section.content as Record<string, unknown>
  const sectionDesign = extractDesign(section)

  // Render the section content and wrap it in PremiumSectionFrame
  // so builder preview matches the public site design output.
  let inner: React.ReactNode

  switch (section.section_type) {
    case 'hero':
      inner = <HeroSection content={c as never} />
      break

    case 'feature_grid':
      inner = <FeatureGridSection content={c as never} />
      break

    case 'testimonials':
      inner = <TestimonialsSection content={c as never} />
      break

    case 'faq':
      inner = <FaqSection content={c as never} />
      break

    case 'cta':
      inner = <CtaSection content={c as never} />
      break

    case 'rich_text':
      inner = <RichTextSection content={c as never} />
      break

    case 'banner':
      inner = <BannerSection content={c as never} />
      break

    case 'contact':
      inner = <ContactSection content={c as never} />
      break

    case 'about':
      inner = <AboutSection content={c as never} />
      break

    case 'product_grid':
      inner = (
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
      break

    case 'image_gallery':
      inner = (
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
      break

    case 'product_360_viewer':
      inner = (
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
        </div>
      )
      break

    default:
      return null
  }

  // If there's no design data, skip the frame wrapper to avoid layout changes
  if (!sectionDesign) return <>{inner}</>

  return (
    <PremiumSectionFrame
      sectionDesign={sectionDesign}
      sectionType={section.section_type}
    >
      {inner}
    </PremiumSectionFrame>
  )
}
