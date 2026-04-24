// lib/website-import/parseStructuredData.ts
// Extracts schema.org JSON-LD and common structured data from raw HTML.

import type {
  ParsedStructuredData,
  StructuredAddress,
  StructuredReview,
} from './types'

/**
 * Extract all JSON-LD script blocks from the HTML and return parsed objects.
 */
function extractJsonLdBlocks(html: string): unknown[] {
  const results: unknown[] = []
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null

  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1])
      if (Array.isArray(parsed)) {
        results.push(...parsed)
      } else {
        results.push(parsed)
      }
    } catch {
      // Skip malformed JSON-LD
    }
  }

  // Handle @graph
  const flat: unknown[] = []
  for (const item of results) {
    if (
      item &&
      typeof item === 'object' &&
      '@graph' in item &&
      Array.isArray((item as Record<string, unknown>)['@graph'])
    ) {
      flat.push(...((item as Record<string, unknown>)['@graph'] as unknown[]))
    } else {
      flat.push(item)
    }
  }

  return flat
}

/**
 * Find the best LocalBusiness / Organization block from all JSON-LD nodes.
 */
function findPrimaryBlock(blocks: unknown[]): Record<string, unknown> | null {
  const priority = [
    'LocalBusiness',
    'Restaurant',
    'Store',
    'HealthAndBeautyBusiness',
    'Organization',
    'Corporation',
    'WebSite',
  ]

  for (const typeName of priority) {
    const found = blocks.find((b) => {
      if (!b || typeof b !== 'object') return false
      const t = (b as Record<string, unknown>)['@type']
      return (
        t === typeName ||
        (Array.isArray(t) && t.includes(typeName)) ||
        (typeof t === 'string' && t.includes(typeName))
      )
    })
    if (found) return found as Record<string, unknown>
  }

  // Fall back to first block with a name field
  return (
    (blocks.find(
      (b) =>
        b &&
        typeof b === 'object' &&
        typeof (b as Record<string, unknown>).name === 'string',
    ) as Record<string, unknown>) ?? null
  )
}

function str(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() || null
  return null
}

function parseAddress(raw: unknown): StructuredAddress | null {
  if (!raw || typeof raw !== 'object') return null
  const a = raw as Record<string, unknown>
  return {
    streetAddress:   str(a.streetAddress),
    addressLocality: str(a.addressLocality),
    addressRegion:   str(a.addressRegion),
    postalCode:      str(a.postalCode),
    addressCountry:  str(a.addressCountry),
  }
}

function parseOpeningHours(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean)
  if (typeof raw === 'string') return [raw]
  return []
}

function parseSameAs(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean)
  if (typeof raw === 'string') return [raw]
  return []
}

function parseReviews(raw: unknown): StructuredReview[] {
  if (!Array.isArray(raw)) return []
  const out: StructuredReview[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const rv = r as Record<string, unknown>
    const rating = rv.reviewRating
    let ratingValue = 5
    if (rating && typeof rating === 'object') {
      ratingValue = Number((rating as Record<string, unknown>).ratingValue ?? 5)
    }
    const author = rv.author
    const authorName =
      author && typeof author === 'object'
        ? str((author as Record<string, unknown>).name) ?? 'Anonymous'
        : str(author) ?? 'Anonymous'

    out.push({
      author:      authorName,
      text:        str(rv.reviewBody) ?? str(rv.description) ?? '',
      ratingValue: isNaN(ratingValue) ? 5 : ratingValue,
    })
  }
  return out
}

function parseAggregateRating(
  raw: unknown,
): { ratingValue: number; reviewCount: number } | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  return {
    ratingValue:  Number(r.ratingValue ?? 0),
    reviewCount:  Number(r.reviewCount ?? r.ratingCount ?? 0),
  }
}

function parseFaq(blocks: unknown[]): Array<{ question: string; answer: string }> {
  const faqBlock = blocks.find((b) => {
    if (!b || typeof b !== 'object') return false
    const t = (b as Record<string, unknown>)['@type']
    return t === 'FAQPage' || (Array.isArray(t) && t.includes('FAQPage'))
  }) as Record<string, unknown> | undefined

  if (!faqBlock) return []

  const mainEntity = faqBlock.mainEntity
  if (!Array.isArray(mainEntity)) return []

  const out: Array<{ question: string; answer: string }> = []
  for (const item of mainEntity) {
    if (!item || typeof item !== 'object') continue
    const i = item as Record<string, unknown>
    const q = str(i.name)
    const ans = i.acceptedAnswer
    const a =
      ans && typeof ans === 'object'
        ? str((ans as Record<string, unknown>).text)
        : null
    if (q && a) out.push({ question: q, answer: a })
  }
  return out
}

function parseServices(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((s) => {
        if (typeof s === 'string') return s
        if (s && typeof s === 'object') {
          const obj = s as Record<string, unknown>
          return str(obj.name) ?? str(obj.description) ?? ''
        }
        return ''
      })
      .filter(Boolean)
  }
  return []
}

function parseGeo(
  raw: unknown,
): { latitude: number; longitude: number } | null {
  if (!raw || typeof raw !== 'object') return null
  const g = raw as Record<string, unknown>
  const lat = parseFloat(String(g.latitude ?? ''))
  const lng = parseFloat(String(g.longitude ?? ''))
  if (isNaN(lat) || isNaN(lng)) return null
  return { latitude: lat, longitude: lng }
}

function resolveImageUrl(raw: unknown): string | null {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw) && raw.length > 0) return resolveImageUrl(raw[0])
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    return str(obj.url) ?? str(obj['@id']) ?? null
  }
  return null
}

/**
 * Parse all schema.org / JSON-LD structured data from HTML.
 */
export function parseStructuredData(html: string): ParsedStructuredData {
  const blocks = extractJsonLdBlocks(html)
  const primary = findPrimaryBlock(blocks)

  if (!primary) {
    return {
      type:            'Unknown',
      name:            null,
      description:     null,
      url:             null,
      logo:            null,
      image:           null,
      telephone:       null,
      email:           null,
      address:         null,
      openingHours:    [],
      priceRange:      null,
      servesCuisine:   null,
      menu:            null,
      sameAs:          [],
      aggregateRating: null,
      review:          [],
      hasMap:          null,
      geo:             null,
      faqItems:        [],
      services:        [],
      raw:             blocks,
    }
  }

  const logoRaw =
    primary.logo ??
    (primary.image as Record<string, unknown>)?.logo ??
    null

  return {
    type:            String(primary['@type'] ?? 'Unknown'),
    name:            str(primary.name),
    description:     str(primary.description),
    url:             str(primary.url),
    logo:            resolveImageUrl(logoRaw),
    image:           resolveImageUrl(primary.image),
    telephone:       str(primary.telephone),
    email:           str(primary.email),
    address:         parseAddress(primary.address),
    openingHours:    parseOpeningHours(primary.openingHours),
    priceRange:      str(primary.priceRange),
    servesCuisine:   str(primary.servesCuisine),
    menu:            str(primary.hasMenu) ?? str(primary.menu),
    sameAs:          parseSameAs(primary.sameAs),
    aggregateRating: parseAggregateRating(primary.aggregateRating),
    review:          parseReviews(primary.review),
    hasMap:          str(primary.hasMap),
    geo:             parseGeo(primary.geo),
    faqItems:        parseFaq(blocks),
    services:        parseServices(primary.hasOfferCatalog ?? primary.makesOffer),
    raw:             primary,
  }
}
