// lib/website-import/extractBusinessFields.ts
// Combines parsed metadata, structured data, and visible content from a single
// source URL into a unified ExtractedBusinessFields object.

import type {
  ParsedMetadata,
  ParsedStructuredData,
  ParsedVisibleContent,
  ExtractedBusinessFields,
  ScoredValue,
  StructuredReview,
  StructuredAddress,
  SourceType,
} from './types'
import { scoreField } from './scoreConfidence'

type SourceInput = {
  metadata:       ParsedMetadata
  structured:     ParsedStructuredData
  visible:        ParsedVisibleContent
  sourceUrl:      string
  sourceType:     SourceType
}

function scored<T>(
  value: T,
  confidence: number,
  sourceUrl: string,
  sourceType: SourceType,
): ScoredValue<T> {
  return { value, confidence, sourceUrl, sourceType }
}

// ── Social link detection ─────────────────────────────────────────────────────

const SOCIAL_PATTERNS: Record<string, RegExp> = {
  facebook:  /facebook\.com\//i,
  instagram: /instagram\.com\//i,
  twitter:   /twitter\.com\/|x\.com\//i,
  linkedin:  /linkedin\.com\//i,
  youtube:   /youtube\.com\/|youtu\.be\//i,
  yelp:      /yelp\.com\//i,
  tiktok:    /tiktok\.com\//i,
}

function extractSocialLinks(
  sameAs: string[],
  links: Array<{ href: string; text: string }>,
): Record<string, string> {
  const result: Record<string, string> = {}
  const allUrls = [
    ...sameAs,
    ...links.filter((l) => l.href.startsWith('http')).map((l) => l.href),
  ]

  for (const [platform, pattern] of Object.entries(SOCIAL_PATTERNS)) {
    const found = allUrls.find((u) => pattern.test(u))
    if (found) result[platform] = found
  }

  return result
}

// ── Brand color extraction ────────────────────────────────────────────────────

function extractBrandColor(
  themeColor: string | null,
): { primary: string; accent?: string } | null {
  if (!themeColor) return null
  const hex = themeColor.trim()
  if (/^#[0-9a-fA-F]{3,8}$/.test(hex)) return { primary: hex }
  if (/^rgb/.test(hex)) return { primary: hex }
  return null
}

// ── Testimonial extraction ────────────────────────────────────────────────────

function extractTestimonials(
  structured: ParsedStructuredData,
  visible: ParsedVisibleContent,
): StructuredReview[] {
  if (structured.review.length > 0) return structured.review

  // Heuristic: look for blockquote / review patterns in paragraphs
  const reviewParagraphs = visible.paragraphs.filter((p) => {
    const lower = p.toLowerCase()
    return (
      (lower.includes('★') || lower.includes('star') || lower.includes('review')) &&
      p.length > 30
    )
  })

  return reviewParagraphs.slice(0, 5).map((text) => ({
    author:      'Customer',
    text,
    ratingValue: 5,
  }))
}

// ── Services extraction ───────────────────────────────────────────────────────

function extractServices(
  structured: ParsedStructuredData,
  visible: ParsedVisibleContent,
): string[] {
  if (structured.services.length > 0) return structured.services

  // Heuristic: lists near "services" headings
  const serviceHeadingIdx = visible.headings.findIndex((h) =>
    /service|offering|what we do|we offer/i.test(h),
  )
  if (serviceHeadingIdx >= 0 && visible.lists.length > 0) {
    return visible.lists[0].slice(0, 12)
  }

  return []
}

// ── FAQ extraction ───────────────────────────────────────────────────────────

function extractFaq(
  structured: ParsedStructuredData,
  visible: ParsedVisibleContent,
): Array<{ question: string; answer: string }> {
  if (structured.faqItems.length > 0) return structured.faqItems

  // Heuristic: headings that look like questions
  const questions = visible.headings.filter((h) => h.endsWith('?'))
  if (questions.length === 0) return []

  return questions.slice(0, 8).map((q) => ({
    question: q,
    answer:   '',
  }))
}

// ── Business name ─────────────────────────────────────────────────────────────

function extractBusinessName(
  structured: ParsedStructuredData,
  metadata: ParsedMetadata,
): string | null {
  if (structured.name) return structured.name
  if (metadata.ogSiteName) return metadata.ogSiteName

  // Strip suffixes like "| Home" from page title
  if (metadata.title) {
    const parts = metadata.title.split(/\s*[|\-–—:]\s*/)
    if (parts.length > 1) {
      const shortPart = parts.reduce((a, b) => (a.length <= b.length ? a : b))
      if (shortPart.length >= 2) return shortPart
    }
    return metadata.title.slice(0, 80)
  }

  return null
}

// ── Description ──────────────────────────────────────────────────────────────

function extractDescription(
  structured: ParsedStructuredData,
  metadata: ParsedMetadata,
  visible: ParsedVisibleContent,
): string | null {
  if (structured.description && structured.description.length > 30) {
    return structured.description
  }
  if (metadata.ogDescription && metadata.ogDescription.length > 20) {
    return metadata.ogDescription
  }
  if (metadata.description && metadata.description.length > 20) {
    return metadata.description
  }
  // Fallback: first meaningful paragraph
  const para = visible.paragraphs.find((p) => p.length > 60 && p.length < 600)
  return para ?? null
}

// ── Address ───────────────────────────────────────────────────────────────────

function extractAddress(
  structured: ParsedStructuredData,
  visible: ParsedVisibleContent,
): StructuredAddress | string | null {
  if (structured.address) return structured.address
  if (visible.addresses.length > 0) return visible.addresses[0]
  return null
}

// ── Hours ─────────────────────────────────────────────────────────────────────

function extractHours(
  structured: ParsedStructuredData,
  visible: ParsedVisibleContent,
): string[] {
  if (structured.openingHours.length > 0) return structured.openingHours
  return visible.hours
}

// ── Images ───────────────────────────────────────────────────────────────────

function extractImages(
  metadata: ParsedMetadata,
  visible: ParsedVisibleContent,
  structured: ParsedStructuredData,
): Array<{ src: string; alt: string }> {
  const all: Array<{ src: string; alt: string }> = []

  // OG image first
  if (metadata.ogImage) all.push({ src: metadata.ogImage, alt: 'Hero image' })
  if (structured.image) all.push({ src: structured.image, alt: 'Business image' })

  // DOM images
  for (const img of visible.images) {
    if (!all.find((a) => a.src === img.src)) all.push(img)
  }

  return all.slice(0, 20)
}

// ── Main extraction ───────────────────────────────────────────────────────────

export function extractBusinessFields(
  input: SourceInput,
): ExtractedBusinessFields {
  const { metadata, structured, visible, sourceUrl, sourceType } = input

  const conf = (key: string, value: unknown, fromStructured = false, fromMeta = false) =>
    scoreField({
      value,
      sourceType,
      fieldKey: key,
      fromStructuredData: fromStructured,
      fromMetadata:       fromMeta,
    })

  const businessName = extractBusinessName(structured, metadata)
  const description  = extractDescription(structured, metadata, visible)
  const address      = extractAddress(structured, visible)
  const hours        = extractHours(structured, visible)
  const socialLinks  = extractSocialLinks(structured.sameAs, visible.links)
  const services     = extractServices(structured, visible)
  const testimonials = extractTestimonials(structured, visible)
  const faqItems     = extractFaq(structured, visible)
  const images       = extractImages(metadata, visible, structured)
  const brandColors  = extractBrandColor(metadata.themeColor)

  const phone = structured.telephone ?? visible.phoneNumbers[0] ?? null
  const email = structured.email    ?? visible.emails[0]       ?? null

  const logoUrl = structured.logo ?? metadata.ogImage ?? null
  const faviconUrl = metadata.favicon

  return {
    businessName: businessName
      ? scored(businessName, conf('businessName', businessName, !!structured.name, !structured.name && !!metadata.ogSiteName), sourceUrl, sourceType)
      : null,

    tagline: null,

    description: description
      ? scored(description, conf('description', description, !!structured.description, !structured.description), sourceUrl, sourceType)
      : null,

    logoUrl: logoUrl
      ? scored(logoUrl, conf('logoUrl', logoUrl, !!structured.logo), sourceUrl, sourceType)
      : null,

    faviconUrl: faviconUrl
      ? scored(faviconUrl, conf('faviconUrl', faviconUrl), sourceUrl, sourceType)
      : null,

    phone: phone
      ? scored(phone, conf('phone', phone, !!structured.telephone), sourceUrl, sourceType)
      : null,

    email: email
      ? scored(email, conf('email', email, !!structured.email), sourceUrl, sourceType)
      : null,

    address: address
      ? scored(address, conf('address', address, !!structured.address), sourceUrl, sourceType)
      : null,

    hours: hours.length > 0
      ? scored(hours, conf('hours', hours, !!structured.openingHours.length), sourceUrl, sourceType)
      : null,

    socialLinks: Object.keys(socialLinks).length > 0
      ? scored(socialLinks, 0.70, sourceUrl, sourceType)
      : null,

    services: services.length > 0
      ? scored(services, conf('services', services, !!structured.services.length), sourceUrl, sourceType)
      : null,

    products: null,

    testimonials: testimonials.length > 0
      ? scored(testimonials, conf('testimonials', testimonials), sourceUrl, sourceType)
      : null,

    faqItems: faqItems.length > 0
      ? scored(faqItems, conf('faqItems', faqItems, !!structured.faqItems.length), sourceUrl, sourceType)
      : null,

    images: images.length > 0
      ? scored(images, 0.65, sourceUrl, sourceType)
      : null,

    brandColors: brandColors
      ? scored(brandColors, 0.60, sourceUrl, sourceType)
      : null,

    seoTitle: (metadata.ogTitle ?? metadata.title)
      ? scored(metadata.ogTitle ?? metadata.title!, conf('seoTitle', metadata.title, false, true), sourceUrl, sourceType)
      : null,

    seoDescription: (metadata.ogDescription ?? metadata.description)
      ? scored(metadata.ogDescription ?? metadata.description!, conf('seoDescription', metadata.description, false, true), sourceUrl, sourceType)
      : null,

    mapUrl: structured.hasMap
      ? scored(structured.hasMap, 0.90, sourceUrl, sourceType)
      : null,

    latitude: structured.geo?.latitude != null
      ? scored(structured.geo.latitude, 0.90, sourceUrl, sourceType)
      : null,

    longitude: structured.geo?.longitude != null
      ? scored(structured.geo.longitude, 0.90, sourceUrl, sourceType)
      : null,

    priceRange: structured.priceRange
      ? scored(structured.priceRange, 0.80, sourceUrl, sourceType)
      : null,
  }
}
