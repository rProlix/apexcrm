// app/api/website-import/scrape/route.ts
// Quick one-shot scrape endpoint for real-time URL preview.
// Does NOT save to the database — used for the "preview URL" feature in the UI.

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { fetchSource, validateImportUrl } from '@/lib/website-import/fetchSource'
import { parseMetadata } from '@/lib/website-import/parseMetadata'
import { parseStructuredData } from '@/lib/website-import/parseStructuredData'
import { parseVisibleContent } from '@/lib/website-import/parseVisibleContent'
import { extractBusinessFields } from '@/lib/website-import/extractBusinessFields'
import { normalizeImportedContent } from '@/lib/website-import/normalizeImportedContent'
import { z } from 'zod'

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

const scrapeSchema = z.object({
  url:         z.string().url(),
  source_type: z.enum(['website', 'yelp', 'business_profile', 'manual']).default('website'),
})

// ── POST /api/website-import/scrape ──────────────────────────────────────────
// Preview what would be extracted from a single URL.
// Returns sanitized extracted fields — never raw HTML.

export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || ctx.role !== 'owner') return forbidden()

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const parsed = scrapeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
  }

  const { url, source_type } = parsed.data

  const urlError = validateImportUrl(url)
  if (urlError) {
    return NextResponse.json({ error: urlError }, { status: 422 })
  }

  try {
    const fetched    = await fetchSource(url)
    const metadata   = parseMetadata(fetched.html, fetched.finalUrl)
    const structured = parseStructuredData(fetched.html)
    const visible    = parseVisibleContent(fetched.html, fetched.finalUrl)

    const extracted = extractBusinessFields({
      metadata,
      structured,
      visible,
      sourceUrl:  url,
      sourceType: source_type,
    })

    const normalized = normalizeImportedContent(extracted)

    return NextResponse.json({
      success: true,
      url:     fetched.finalUrl,
      title:   metadata.title ?? metadata.ogTitle,
      preview: {
        businessName:   normalized.businessName,
        description:    normalized.description,
        phone:          normalized.phone,
        email:          normalized.email,
        logoUrl:        normalized.logoUrl,
        faviconUrl:     normalized.faviconUrl,
        address:        normalized.address,
        hours:          normalized.hours,
        socialLinks:    normalized.socialLinks,
        services:       normalized.services.slice(0, 5),
        testimonials:   normalized.testimonials.slice(0, 3),
        faqItems:       normalized.faqItems.slice(0, 3),
        images:         normalized.images.slice(0, 6),
        brandColors:    normalized.brandColors,
        seoTitle:       normalized.seoTitle,
        seoDescription: normalized.seoDescription,
        confidenceMap:  normalized.confidenceMap,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to scrape URL'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
