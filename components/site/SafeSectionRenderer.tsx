// components/site/SafeSectionRenderer.tsx
//
// Per-section error-isolated renderer for the public storefront.
//
// Architecture:
//  - Accepts either a raw DB row OR an already-normalized NormalizedSection
//  - Normalizes the section (safe, never throws)
//  - Wraps each rendered section with AnimatedSection (client component)
//    which uses framer-motion with viewport detection
//  - If animation config is missing/invalid, section renders without animation
//  - Catches any render error and returns a minimal fallback
//  - One broken section never crashes the whole page
//
// Mode:
//  'public'  — hide broken/unknown sections (zero visible trace)
//  'preview' — show collapsed diagnostic card for broken/unknown sections
//  'editor'  — same as preview; also shows edit overlays (applied by parent)

import {
  normalizeSection,
  isPublicVisible,
  type NormalizedSection,
  type CanonicalSectionType,
} from '@/lib/website/normalizeWebsiteSection'
import { UnknownSection } from './sections/UnknownSection'
import { AnimatedSection } from '@/components/website/animations/AnimatedSection'
import { parseSectionAnimationConfig } from '@/lib/website/animations/validateAnimationConfig'

// Section components (all must be defensive — see each file)
import { HeroSection }         from './sections/HeroSection'
import { AboutSection }        from './sections/AboutSection'
import { FeatureGridSection }  from './sections/FeatureGridSection'
import { TestimonialsSection } from './sections/TestimonialsSection'
import { FaqSection }          from './sections/FaqSection'
import { ContactSection }      from './sections/ContactSection'
import { ProductGridSection }  from './sections/ProductGridSection'
import { RichTextSection }     from './sections/RichTextSection'
import { BannerSection }       from './sections/BannerSection'
import { CtaSection }          from './sections/CtaSection'
import { ImageGallerySection } from './sections/ImageGallerySection'

interface Props {
  /** Raw DB row or already-normalized section */
  section:   unknown
  tenantId:  string
  index?:    number
  mode?:     'public' | 'preview' | 'editor'
}

/**
 * Server-safe dispatcher. Returns null on any error so one bad section
 * never takes down the page.
 */
export async function SafeSectionRenderer({
  section: rawSection,
  tenantId,
  index = 0,
  mode = 'public',
}: Props) {
  let normalized: NormalizedSection

  try {
    normalized = normalizeSection(rawSection)
  } catch (err) {
    console.error('[SafeSectionRenderer] normalize error at index', index, err instanceof Error ? err.stack : err)
    return mode === 'public' ? null : <BrokenSectionCard raw={rawSection} index={index} message="Failed to normalize section" />
  }

  // Public visibility check
  if (mode === 'public' && !isPublicVisible(normalized)) {
    return null
  }

  // Parse animation config (fail-safe: never crashes)
  let animationConfig = null
  try {
    const raw = (rawSection as Record<string, unknown>)?.animation_config
    if (raw && typeof raw === 'object') {
      animationConfig = parseSectionAnimationConfig(raw)
    }
  } catch {
    // silently skip — animation is optional
  }

  try {
    const content = await renderSection(normalized, tenantId, mode)

    // Wrap in AnimatedSection (client component, fail-safe)
    // Only animate in public mode; editor mode renders without animation wrapper
    if (mode === 'public' && animationConfig?.enabled) {
      return (
        <AnimatedSection
          animationConfig={animationConfig}
          key={normalized.id}
        >
          {content}
        </AnimatedSection>
      )
    }

    return content
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined

    console.error(
      `[SafeSectionRenderer] render error — type="${normalized.rawType}" canonical="${normalized.type}" id="${normalized.id}" index=${index}:`,
      msg,
      stack,
    )

    if (mode === 'public') return null

    return (
      <BrokenSectionCard
        raw={rawSection}
        index={index}
        message={`Render error (${normalized.type}): ${msg}`}
        sectionId={normalized.id}
      />
    )
  }
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

async function renderSection(
  section:  NormalizedSection,
  tenantId: string,
  mode:     'public' | 'preview' | 'editor',
): Promise<React.ReactNode> {
  const c = section.content

  switch (section.type as CanonicalSectionType) {
    case 'hero':
      return <HeroSection content={c as never} />

    case 'about':
      return <AboutSection content={c as never} />

    case 'feature_grid':
      return <FeatureGridSection content={c as never} />

    case 'testimonials':
      return <TestimonialsSection content={c as never} />

    case 'faq':
      return <FaqSection content={c as never} />

    case 'contact':
      return <ContactSection content={c as never} />

    case 'product_grid':
      return <ProductGridSection content={c as never} tenantId={tenantId} />

    case 'rich_text':
      return <RichTextSection content={c as never} />

    case 'banner':
      return <BannerSection content={c as never} />

    case 'cta':
      return <CtaSection content={c as never} />

    case 'gallery':
      return <ImageGallerySection content={c as never} />

    case 'product_360': {
      // Lazy-import to avoid bundling Three.js on the server
      const { Product360ViewerSection } = await import('./sections/Product360ViewerSection')
      return <Product360ViewerSection content={c as never} tenantId={tenantId} />
    }

    case 'unknown':
    default:
      return <UnknownSection section={section} mode={mode} />
  }
}

// ── Editor-mode broken section card ──────────────────────────────────────────

function BrokenSectionCard({
  raw, index, message, sectionId,
}: {
  raw:        unknown
  index:      number
  message:    string
  sectionId?: string
}) {
  const rawStr = (() => {
    try { return JSON.stringify(raw, null, 2) } catch { return String(raw) }
  })()

  return (
    <div style={{
      margin:       '0.5rem 1.5rem',
      padding:      '1.25rem',
      background:   '#1e0000',
      border:       '2px solid #7f1d1d',
      borderRadius: '0.75rem',
      fontFamily:   'Inter, system-ui, sans-serif',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '1.1rem' }}>💥</span>
        <strong style={{ color: '#fca5a5', fontSize: '0.875rem' }}>
          Section render error (index {index}{sectionId ? `, id: ${sectionId}` : ''})
        </strong>
      </div>
      <p style={{ color: '#f87171', fontSize: '0.8125rem', margin: '0 0 0.5rem', fontFamily: 'monospace' }}>
        {message}
      </p>
      <details>
        <summary style={{ color: '#71717a', fontSize: '0.75rem', cursor: 'pointer' }}>Raw section data</summary>
        <pre style={{
          margin:    '0.5rem 0 0',
          padding:   '0.5rem',
          background: '#0a0000',
          borderRadius: '0.375rem',
          color:     '#fca5a5',
          fontSize:  '0.6875rem',
          overflow:  'auto',
          maxHeight: 200,
        }}>{rawStr}</pre>
      </details>
    </div>
  )
}
