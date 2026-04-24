// lib/website-import/normalizeImportedContent.ts
// Converts raw ExtractedBusinessFields into a clean, validated NormalizedImportContent.
// All values are sanitized. Never trust raw scraped input.

import type {
  ExtractedBusinessFields,
  NormalizedImportContent,
  StructuredAddress,
} from './types'
import { buildConfidenceMap } from './scoreConfidence'

// ── Sanitizers ────────────────────────────────────────────────────────────────

/** Strip all HTML tags and normalize whitespace */
function sanitizeText(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 5000)
}

function sanitizeShortText(raw: string, maxLen = 300): string {
  return sanitizeText(raw).slice(0, maxLen)
}

/** Normalize a US/international phone number to a clean string */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  return raw.trim().slice(0, 30)
}

/** Basic email validation + lowercase */
function normalizeEmail(raw: string): string | null {
  const lower = raw.toLowerCase().trim()
  if (!/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/.test(lower)) return null
  return lower
}

/** Validate a URL is safe-ish for storage */
function normalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.href.slice(0, 2048)
  } catch {
    return null
  }
}

function normalizeHexColor(raw: string): string | null {
  if (/^#[0-9a-fA-F]{3,8}$/.test(raw)) return raw
  if (/^rgb/.test(raw)) return raw
  return null
}

function normalizeAddress(
  raw: StructuredAddress | string | null,
): NormalizedImportContent['address'] {
  if (!raw) return null

  if (typeof raw === 'string') {
    return {
      street:  null,
      city:    null,
      state:   null,
      zip:     null,
      country: null,
      full:    sanitizeShortText(raw, 200),
    }
  }

  const full = [
    raw.streetAddress,
    raw.addressLocality,
    raw.addressRegion,
    raw.postalCode,
    raw.addressCountry,
  ]
    .filter(Boolean)
    .join(', ')

  return {
    street:  raw.streetAddress ? sanitizeShortText(raw.streetAddress, 100) : null,
    city:    raw.addressLocality ? sanitizeShortText(raw.addressLocality, 60) : null,
    state:   raw.addressRegion ? sanitizeShortText(raw.addressRegion, 60) : null,
    zip:     raw.postalCode ? raw.postalCode.trim().slice(0, 10) : null,
    country: raw.addressCountry ? raw.addressCountry.trim().slice(0, 4) : null,
    full:    full.slice(0, 300) || null,
  }
}

function normalizeHours(raw: string[]): string[] {
  return raw
    .map((h) => sanitizeShortText(h, 100))
    .filter(Boolean)
    .slice(0, 14)
}

function normalizeSocialLinks(
  raw: Record<string, string>,
): NormalizedImportContent['socialLinks'] {
  const allowed = ['facebook', 'instagram', 'twitter', 'linkedin', 'yelp', 'youtube']
  const result: NormalizedImportContent['socialLinks'] = {}
  for (const key of allowed) {
    if (raw[key]) {
      const url = normalizeUrl(raw[key])
      if (url) (result as Record<string, string>)[key] = url
    }
  }
  return result
}

function normalizeServices(
  raw: string[],
): Array<{ title: string; description: string }> {
  return raw
    .map((s) => ({
      title:       sanitizeShortText(s, 100),
      description: '',
    }))
    .filter((s) => s.title.length > 0)
    .slice(0, 20)
}

function normalizeTestimonials(
  raw: Array<{ author: string; text: string; ratingValue: number }>,
): Array<{ name: string; text: string; rating: number }> {
  return raw
    .map((r) => ({
      name:   sanitizeShortText(r.author, 80),
      text:   sanitizeShortText(r.text, 600),
      rating: Math.min(5, Math.max(1, Math.round(r.ratingValue))),
    }))
    .filter((r) => r.text.length > 5)
    .slice(0, 20)
}

function normalizeFaq(
  raw: Array<{ question: string; answer: string }>,
): Array<{ question: string; answer: string }> {
  return raw
    .map((f) => ({
      question: sanitizeShortText(f.question, 300),
      answer:   sanitizeShortText(f.answer, 1000),
    }))
    .filter((f) => f.question.length > 3)
    .slice(0, 20)
}

function normalizeImages(
  raw: Array<{ src: string; alt: string }>,
): Array<{ url: string; alt: string }> {
  return raw
    .map((img) => ({
      url: normalizeUrl(img.src) ?? '',
      alt: sanitizeShortText(img.alt, 200),
    }))
    .filter((img) => img.url.length > 0)
    .slice(0, 20)
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function normalizeImportedContent(
  fields: ExtractedBusinessFields,
): NormalizedImportContent {
  const businessName = fields.businessName
    ? sanitizeShortText(fields.businessName.value, 100)
    : null

  const description = fields.description
    ? sanitizeText(fields.description.value)
    : null

  const phone = fields.phone
    ? normalizePhone(fields.phone.value)
    : null

  const email = fields.email
    ? normalizeEmail(fields.email.value)
    : null

  const logoUrl = fields.logoUrl
    ? normalizeUrl(fields.logoUrl.value)
    : null

  const faviconUrl = fields.faviconUrl
    ? normalizeUrl(fields.faviconUrl.value)
    : null

  const brandColors = fields.brandColors
    ? {
        primary: normalizeHexColor(fields.brandColors.value.primary) ?? '#000000',
        accent:  normalizeHexColor(fields.brandColors.value.accent ?? '') ?? '#666666',
      }
    : null

  const socialLinks = fields.socialLinks
    ? normalizeSocialLinks(fields.socialLinks.value)
    : {}

  const services = fields.services
    ? normalizeServices(fields.services.value as string[])
    : []

  const testimonials = fields.testimonials
    ? normalizeTestimonials(
        fields.testimonials.value.map((r) => ({
          author:      r.author,
          text:        r.text,
          ratingValue: r.ratingValue,
        })),
      )
    : []

  const faqItems = fields.faqItems
    ? normalizeFaq(fields.faqItems.value)
    : []

  const images = fields.images
    ? normalizeImages(
        fields.images.value.map((img) => ({ src: img.src, alt: img.alt })),
      )
    : []

  const normalized: Omit<NormalizedImportContent, 'confidenceMap'> = {
    businessName,
    tagline:        fields.tagline?.value ? sanitizeShortText(fields.tagline.value, 200) : null,
    description,
    logoUrl,
    faviconUrl,
    phone,
    email,
    address:        normalizeAddress(fields.address?.value as StructuredAddress | string | null),
    hours:          normalizeHours(fields.hours?.value ?? []),
    socialLinks,
    services,
    testimonials,
    faqItems,
    images,
    brandColors,
    seoTitle:       fields.seoTitle?.value ? sanitizeShortText(fields.seoTitle.value, 120) : null,
    seoDescription: fields.seoDescription?.value ? sanitizeShortText(fields.seoDescription.value, 300) : null,
    mapUrl:         fields.mapUrl?.value ? normalizeUrl(fields.mapUrl.value) : null,
    latitude:       fields.latitude?.value ?? null,
    longitude:      fields.longitude?.value ?? null,
    priceRange:     fields.priceRange?.value ? sanitizeShortText(fields.priceRange.value, 20) : null,
  }

  const confidenceMap = buildConfidenceMap(
    normalized as unknown as Record<string, unknown>,
    'website',
  )

  return { ...normalized, confidenceMap }
}
