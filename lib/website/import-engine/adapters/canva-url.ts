// lib/website/import-engine/adapters/canva-url.ts
// Canva URL adapter — fetches published Canva pages and extracts design data.

import 'server-only'
import { convertCanvaHtml } from '@/lib/website/canva/convert'
import { detectSourceFromUrl, isCanvaHostedDomain } from '@/lib/website/import-engine/detect-source'
import type { DesignImportExtraction, DesignImportSourceType } from '@/lib/website/import-engine/types'

export interface CanvaUrlAdapterParams {
  url: string
}

export interface CanvaUrlAdapterResult {
  ok: boolean
  error?: string
  extraction?: DesignImportExtraction
  html?: string
  warnings: string[]
}

async function fetchPage(url: string): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'NexoraNow-DesignImport/1.0',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) return null
    const html = await res.text()
    return { html, finalUrl: res.url }
  } catch {
    return null
  }
}

function extractNavLinks(html: string): Array<{ label: string; href: string }> {
  const links: Array<{ label: string; href: string }> = []
  for (const m of html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1]?.trim()
    const label = m[2]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (href && label && /^https?:\/\//i.test(href)) links.push({ label, href })
  }
  return links.slice(0, 40)
}

export async function extractFromCanvaUrl(params: CanvaUrlAdapterParams): Promise<CanvaUrlAdapterResult> {
  const warnings: string[] = []
  const url = params.url.trim()
  if (!url) return { ok: false, error: 'URL is required.', warnings }

  let sourceType: DesignImportSourceType = detectSourceFromUrl(url)
  try {
    const host = new URL(url).hostname
    if (sourceType === 'unknown' && isCanvaHostedDomain(host)) sourceType = 'canva_custom_domain'
  } catch { /* ignore */ }

  const fetched = await fetchPage(url)
  if (!fetched) {
    return { ok: false, error: 'Could not fetch the Canva URL. Check that it is published and public.', warnings }
  }

  const converted = convertCanvaHtml(fetched.html, { sourceUrl: fetched.finalUrl })
  warnings.push(...converted.warnings)
  warnings.push('Canva URL import rebuilds natively — animations are inferred, not extracted.')

  const navLinks = extractNavLinks(fetched.html)
  const allLinks = [...new Set([...converted.links, ...navLinks.map((l) => l.href)])]

  const assets = converted.images.map((img, i) => ({
    id: `canva-img-${i + 1}`,
    kind: (i === 0 ? 'background' : 'illustration') as 'background' | 'illustration',
    publicUrl: img,
    storagePath: img,
    pageNumber: 1,
  }))

  const textParts = [
    converted.title ?? '',
    ...converted.sections.flatMap((s) => {
      const c = s.content
      return [c.headline, c.subheadline, c.body, c.ctaLabel].filter((v) => typeof v === 'string') as string[]
    }),
  ]

  const extraction: DesignImportExtraction = {
    sourceType,
    pageCount: 1,
    renderedPages: assets[0]
      ? [{
          pageNumber: 1,
          publicUrl: assets[0].publicUrl,
          storagePath: assets[0].storagePath,
          aspectRatio: 16 / 9,
          width: 1920,
          height: 1080,
        }]
      : [],
    text: textParts.join('\n'),
    links: allLinks.map((href, i) => ({
      label: navLinks[i]?.label ?? `Link ${i + 1}`,
      href,
      pageNumber: 1,
    })),
    assets,
    fonts: [],
    colors: converted.colors,
    warnings: converted.warnings,
  }

  return { ok: true, extraction, html: fetched.html, warnings }
}
