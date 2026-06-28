// lib/website/canva/convert.ts
// Best-effort, DATA-ONLY conversion of exported Canva HTML into NexoraNow
// editable sections. Pure + dependency-free. NEVER injects <script> tags or
// executes anything — it only extracts text/images/colors/links/animations.
//
// Honest about limits: when exact animations can't be reused we map them to
// NexoraNow presets and add warnings.

import { detectAnimationsFromHtml, type NexoraAnimationPreset } from './animation-mapper'

export interface ConvertedSection {
  section_type: 'hero' | 'rich_text' | 'image_gallery' | 'cta' | 'about'
  section_key:  string
  content:      Record<string, unknown>
}

export interface ConvertResult {
  title:        string | null
  colors:       string[]
  images:       string[]
  links:        string[]
  sections:     ConvertedSection[]
  animations:   Array<{ source: string; preset: NexoraAnimationPreset }>
  warnings:     string[]
  preservation: 'approximate' | 'partial'
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
}

function uniq(arr: string[]): string[] { return Array.from(new Set(arr)) }

function extractMeta(html: string, prop: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, 'i')
  const m = html.match(re)
  return m ? decodeEntities(m[1]) : null
}

/** Parse exported Canva HTML (or any HTML) into NexoraNow sections — data only. */
export function convertCanvaHtml(html: string, opts?: { sourceUrl?: string | null }): ConvertResult {
  const warnings: string[] = []
  const safeHtml = html ?? ''

  // Title
  const titleTag = safeHtml.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]
  const title = decodeEntities(extractMeta(safeHtml, 'og:title') ?? titleTag ?? '').trim() || null

  // Images (img src, og:image, background-image)
  const images: string[] = []
  for (const m of safeHtml.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) images.push(m[1])
  const og = extractMeta(safeHtml, 'og:image'); if (og) images.push(og)
  for (const m of safeHtml.matchAll(/background-image\s*:\s*url\(["']?([^"')]+)["']?\)/gi)) images.push(m[1])
  const absImages = uniq(images.map(decodeEntities).filter((u) => /^https?:\/\//i.test(u)))

  // Colors (hex)
  const colors = uniq(
    (safeHtml.match(/#[0-9a-fA-F]{6}\b/g) ?? []).map((c) => c.toLowerCase()),
  ).slice(0, 8)

  // Links
  const links = uniq(
    [...safeHtml.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)]
      .map((m) => decodeEntities(m[1]))
      .filter((h) => /^https?:\/\//i.test(h)),
  ).slice(0, 25)

  // Headings + paragraphs
  const headings = [...safeHtml.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
    .map((m) => stripTags(decodeEntities(m[1]))).filter(Boolean)
  const paragraphs = [...safeHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => stripTags(decodeEntities(m[1]))).filter((t) => t.length > 1)

  // Animations
  const animations = detectAnimationsFromHtml(safeHtml)
  const heroAnim = animations[0]?.preset ?? 'fadeUp'

  // ── Build sections ──────────────────────────────────────────────────────────
  const sections: ConvertedSection[] = []

  sections.push({
    section_type: 'hero',
    section_key: 'canva-hero',
    content: {
      headline:       title || headings[0] || 'Our Event',
      subheadline:    paragraphs[0] || headings[1] || '',
      ctaLabel:       'View Details',
      ctaHref:        '#details',
      backgroundImage: absImages[0] ?? '',
      overlay:        true,
      overlayOpacity: 45,
      align:          'center',
      animation:      heroAnim,
    },
  })

  const bodyParas = paragraphs.slice(1, 6)
  if (headings.length > 1 || bodyParas.length) {
    const html =
      (headings.slice(1, 3).map((h) => `<h2>${escapeHtml(h)}</h2>`).join('')) +
      (bodyParas.map((p) => `<p>${escapeHtml(p)}</p>`).join(''))
    sections.push({
      section_type: 'about',
      section_key: 'canva-details',
      content: {
        headline: headings[1] || 'Event Details',
        body:     bodyParas.join('\n\n') || 'Details coming soon.',
        image:    absImages[1] ?? '',
        animation: animations[1]?.preset ?? 'fadeIn',
        _html:    html,
      },
    })
  }

  if (absImages.length > 1) {
    sections.push({
      section_type: 'image_gallery',
      section_key: 'canva-gallery',
      content: {
        headline: 'Gallery',
        images:   absImages.slice(0, 12).map((url) => ({ url, alt: 'Imported from Canva' })),
        layout:   'grid',
        animation: animations[2]?.preset ?? 'fadeUp',
      },
    })
  }

  // ── Honesty / warnings ────────────────────────────────────────────────────
  if (!safeHtml.trim()) {
    warnings.push('No HTML content was provided to convert. Add a Canva export (HTML) or use Preserve Canva Mode.')
  }
  if (!absImages.length) warnings.push('No images could be extracted from the Canva source.')
  if (animations.length) {
    warnings.push(`${animations.length} animation(s) were approximated using NexoraNow presets. Use Preserve Canva Mode for exact fidelity.`)
  } else {
    warnings.push('No animations were detected; sections use NexoraNow default entrance animations.')
  }
  if (opts?.sourceUrl) warnings.push('Live Canva URLs render fully only inside Canva. Converted Editable Mode rebuilds content for editing and may differ visually.')

  return {
    title,
    colors,
    images: absImages,
    links,
    sections,
    animations,
    warnings,
    preservation: animations.length ? 'partial' : 'approximate',
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
