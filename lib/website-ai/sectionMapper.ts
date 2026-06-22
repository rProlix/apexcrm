// lib/website-ai/sectionMapper.ts
// Maps a GeminiSuggestion's proposedSection into the existing site_sections schema.

import type { GeminiSuggestion } from './types'
import { recommendScrollHero } from './recommendScrollHero'
import type {
  SectionType,
  HeroContent,
  AboutContent,
  TestimonialsContent,
  FaqContent,
  ContactContent,
  FeatureGridContent,
  ProductGridContent,
  BannerContent,
  RichTextContent,
} from '@/lib/website/types'

export interface MappedSection {
  section_type: SectionType
  content:      unknown
}

/**
 * Maps a Gemini proposedSection into a site_sections-compatible row.
 * Always returns a valid section; falls back to 'rich_text' for unknown types.
 */
export function mapSuggestionToSection(suggestion: GeminiSuggestion): MappedSection {
  const ps = suggestion.proposedSection

  switch (suggestion.type) {
    case 'hero':
      return {
        section_type: 'hero',
        content: mapHero(ps),
      }

    case 'about':
      return {
        section_type: 'about',
        content: mapAbout(ps),
      }

    case 'reviews':
    case 'testimonials':
      return {
        section_type: 'testimonials',
        content: mapTestimonials(ps),
      }

    case 'faq':
      return {
        section_type: 'faq',
        content: mapFaq(ps),
      }

    case 'contact':
    case 'hours':
      return {
        section_type: 'contact',
        content: mapContact(ps, suggestion.data),
      }

    case 'services':
      return {
        section_type: 'feature_grid',
        content: mapServices(ps, suggestion.data),
      }

    case 'products':
    case 'menu':
      return {
        section_type: 'product_grid',
        content: mapProductGrid(ps),
      }

    case 'promotion':
      return {
        section_type: 'banner',
        content: mapBanner(ps),
      }

    case 'premium_3d_scroll_hero':
      return {
        section_type: 'premium_3d_scroll_hero',
        content: mapScrollHero(ps, suggestion.data),
      }

    case 'seo':
    case 'policies':
    case 'social_links':
    case 'navigation':
    case 'gallery':
    case 'page':
    case 'section':
    case 'unknown':
    default:
      return {
        section_type: 'rich_text',
        content: mapRichText(ps),
      }
  }
}

// ── Individual mappers ─────────────────────────────────────────────────────────

function mapHero(ps: Record<string, unknown>): HeroContent {
  return {
    headline:       str(ps.headline, 'Welcome'),
    subheadline:    str(ps.subheadline, ''),
    ctaLabel:       str(ps.ctaLabel, 'Learn More'),
    ctaHref:        str(ps.ctaHref, '/'),
    overlay:        bool(ps.overlay, true),
    overlayOpacity: num(ps.overlayOpacity, 50),
    align:          align(ps.align),
  }
}

function mapAbout(ps: Record<string, unknown>): AboutContent {
  return {
    headline: str(ps.heading ?? ps.headline, 'About Us'),
    body:     str(ps.body ?? ps.subheading, ''),
  }
}

function mapTestimonials(ps: Record<string, unknown>): TestimonialsContent {
  const rawItems = Array.isArray(ps.items) ? ps.items : []
  return {
    headline: str(ps.heading ?? ps.headline, 'What Our Customers Say'),
    items: rawItems.map((item: unknown) => {
      const i = asObj(item)
      return {
        name:   str(i.name, 'Customer'),
        role:   str(i.role, '') || undefined,
        avatar: str(i.avatar, '') || undefined,
        text:   str(i.text ?? i.quote, ''),
        rating: num(i.rating, 5),
      }
    }),
  }
}

function mapFaq(ps: Record<string, unknown>): FaqContent {
  const rawItems = Array.isArray(ps.items) ? ps.items : []
  return {
    headline: str(ps.heading ?? ps.headline, 'Frequently Asked Questions'),
    items: rawItems.map((item: unknown) => {
      const i = asObj(item)
      return {
        question: str(i.question, ''),
        answer:   str(i.answer, ''),
      }
    }).filter((i) => i.question),
  }
}

function mapContact(ps: Record<string, unknown>, data: Record<string, unknown>): ContactContent {
  return {
    headline: str(ps.heading ?? ps.headline, 'Get In Touch'),
    body:     str(ps.body ?? ps.subheading, ''),
    email:    str(data.email ?? ps.email, '') || undefined,
    phone:    str(data.phone ?? ps.phone, '') || undefined,
    address:  str(data.address ?? ps.address, '') || undefined,
    showForm: false,
  }
}

function mapServices(ps: Record<string, unknown>, data: Record<string, unknown>): FeatureGridContent {
  const rawServices = Array.isArray(data.services) ? data.services : []
  const psItems     = Array.isArray(ps.items) ? ps.items : []

  const items = rawServices.length
    ? rawServices.map((s: unknown) => {
        const svc = asObj(s)
        const price = str(svc.price, '')
        const desc  = str(svc.description, '')
        return {
          title:       str(svc.name, 'Service'),
          description: price ? `${price}${desc ? ` — ${desc}` : ''}` : desc,
        }
      })
    : psItems.map((item: unknown) => {
        const i = asObj(item)
        return {
          title:       str(i.title, 'Service'),
          description: str(i.description, ''),
        }
      })

  return {
    headline: str(ps.heading ?? ps.headline, 'Our Services'),
    subtitle: str(ps.subheading ?? ps.subtitle, ''),
    columns:  3,
    items,
  }
}

function mapProductGrid(ps: Record<string, unknown>): ProductGridContent {
  return {
    headline:     str(ps.heading ?? ps.headline, 'Our Products'),
    subtitle:     str(ps.subheading ?? ps.subtitle, ''),
    limit:        8,
    showAll:      true,
    allHref:      '/shop',
    filterActive: false,
  }
}

function mapBanner(ps: Record<string, unknown>): BannerContent {
  return {
    text:        str(ps.text, 'Special offer — limited time only!'),
    ctaLabel:    str(ps.ctaLabel, '') || undefined,
    ctaHref:     str(ps.ctaHref, '') || undefined,
    variant:     'promo',
    dismissible: true,
  }
}

function mapScrollHero(ps: Record<string, unknown>, data: Record<string, unknown>): unknown {
  const businessType = str(data.businessType ?? ps.businessType ?? ps.industry, '')
  const rec = recommendScrollHero(businessType || null, {
    headline:    str(ps.heading ?? ps.headline, 'Experience It In Motion'),
    subheadline: str(ps.subheading ?? ps.subheadline, 'Scroll to explore every detail.'),
    eyebrow:     str(ps.eyebrow, 'Premium'),
    renderMode:  ps.renderMode === 'video_scrub' ? 'video_scrub' : undefined,
  })
  // recommendScrollHero never fabricates assets; it returns a safe placeholder.
  return rec.content
}

function mapRichText(ps: Record<string, unknown>): RichTextContent {
  const heading  = str(ps.heading ?? ps.headline, '')
  const bodyText = str(ps.body ?? ps.subheading ?? ps.text, '')
  const html     = heading
    ? `<h2>${heading}</h2>${bodyText ? `<p>${bodyText}</p>` : ''}`
    : bodyText
      ? `<p>${bodyText}</p>`
      : '<p></p>'

  return { html }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return isFinite(n) ? n : fallback
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function align(v: unknown): 'left' | 'center' | 'right' {
  if (v === 'left' || v === 'center' || v === 'right') return v
  return 'center'
}

function asObj(v: unknown): Record<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
  return {}
}

// ── Duplicate detection helpers ────────────────────────────────────────────────

export function normalizeForDedup(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function isDuplicateReview(
  existingItems: Array<{ name?: string; text?: string }>,
  newName:       string,
  newText:       string,
): boolean {
  const nn = normalizeForDedup(newName)
  const nt = normalizeForDedup(newText)
  return existingItems.some(
    (i) => normalizeForDedup(i.name ?? '') === nn && normalizeForDedup(i.text ?? '') === nt
  )
}

export function isDuplicateService(
  existingItems: Array<{ title?: string }>,
  newTitle:      string,
): boolean {
  const nt = normalizeForDedup(newTitle)
  return existingItems.some((i) => normalizeForDedup(i.title ?? '') === nt)
}

export function isDuplicateFaq(
  existingItems: Array<{ question?: string }>,
  newQuestion:   string,
): boolean {
  const nq = normalizeForDedup(newQuestion)
  return existingItems.some((i) => normalizeForDedup(i.question ?? '') === nq)
}
