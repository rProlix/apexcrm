// components/site/SectionRenderer.tsx
// Dispatches each site section to its appropriate renderer.
// ProductGridSection is async (server component), the rest are sync.
// Wraps each render in a try/catch to prevent one bad section crashing the page.

import { HeroSection }              from './sections/HeroSection'
import { FeatureGridSection }       from './sections/FeatureGridSection'
import { TestimonialsSection }      from './sections/TestimonialsSection'
import { FaqSection }              from './sections/FaqSection'
import { CtaSection }              from './sections/CtaSection'
import { RichTextSection }         from './sections/RichTextSection'
import { BannerSection }           from './sections/BannerSection'
import { ContactSection }          from './sections/ContactSection'
import { AboutSection }            from './sections/AboutSection'
import { ProductGridSection }      from './sections/ProductGridSection'
import { Product360ViewerSection } from './sections/Product360ViewerSection'
import { ImageGallerySection }     from './sections/ImageGallerySection'
import { normalizeSectionType }    from '@/lib/website/normalizeWebsiteSection'
import type { SiteSection }        from '@/lib/website/types'

interface Props {
  section:  SiteSection
  tenantId: string
}

export async function SectionRenderer({ section, tenantId }: Props) {
  if (!section) return null
  if (!section.is_visible) return null

  // Safe content: section.content can be null in the DB
  const c = (section.content && typeof section.content === 'object'
    ? section.content
    : {}) as Record<string, unknown>

  // Use the normalizer to resolve type aliases (e.g. "About Section" → "about")
  const type = normalizeSectionType(section.section_type)

  try {
    switch (type) {
      case 'hero':
        return <HeroSection content={c as never} />

      case 'feature_grid':
        return <FeatureGridSection content={c as never} />

      case 'product_grid':
        return <ProductGridSection content={c as never} tenantId={tenantId} />

      case 'testimonials':
        return <TestimonialsSection content={c as never} />

      case 'faq':
        return <FaqSection content={c as never} />

      case 'cta':
        return <CtaSection content={c as never} />

      case 'contact':
        return <ContactSection content={c as never} />

      case 'rich_text':
        return <RichTextSection content={c as never} />

      case 'banner':
        return <BannerSection content={c as never} />

      case 'about':
        return <AboutSection content={c as never} />

      case 'product_360':
        return <Product360ViewerSection content={c as never} tenantId={tenantId} />

      case 'gallery':
        return <ImageGallerySection content={c as never} />

      default:
        return null
    }
  } catch (err) {
    console.error(
      `[SectionRenderer] Render error — type="${section.section_type}" canonical="${type}" id="${section.id}":`,
      err instanceof Error ? err.message : err,
    )
    return null
  }
}
