// lib/website-import/parseMetadata.ts
// Extracts <head> metadata from raw HTML using regex patterns.
// No external HTML parser required.

import type { ParsedMetadata } from './types'

/**
 * Extract a single meta tag value by name or property.
 * Handles both name="..." and property="..." attributes.
 */
function getMeta(html: string, key: string): string | null {
  // Match <meta name|property="key" content="value"> in any attribute order
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:name|property)=["']${escapeRe(key)}["'][^>]+content=["']([^"']+)["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escapeRe(key)}["']`,
      'i',
    ),
  ]

  for (const re of patterns) {
    const m = re.exec(html)
    if (m?.[1]) return decodeHtmlEntities(m[1].trim())
  }
  return null
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getTag(html: string, tag: string, attr: string): string | null {
  const re = new RegExp(
    `<${tag}[^>]+${escapeRe(attr)}=["']([^"']+)["']`,
    'i',
  )
  return re.exec(html)?.[1]?.trim() ?? null
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function getTitle(html: string): string | null {
  const m = /<title[^>]*>([^<]+)<\/title>/i.exec(html)
  return m?.[1] ? decodeHtmlEntities(m[1].trim()) : null
}

function getFavicon(html: string, baseUrl: string): string | null {
  // Look for <link rel="icon" ...> or shortcut icon
  const patterns = [
    /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']/i,
    /<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']/i,
  ]

  for (const re of patterns) {
    const m = re.exec(html)
    if (m?.[1]) {
      const href = m[1].trim()
      try {
        return new URL(href, baseUrl).href
      } catch {
        return href
      }
    }
  }

  // Default fallback
  try {
    return new URL('/favicon.ico', baseUrl).href
  } catch {
    return null
  }
}

function getKeywords(html: string): string[] {
  const raw = getMeta(html, 'keywords')
  if (!raw) return []
  return raw.split(',').map((k) => k.trim()).filter(Boolean)
}

/**
 * Main entry point — parse all standard <head> metadata from raw HTML.
 */
export function parseMetadata(html: string, baseUrl: string): ParsedMetadata {
  return {
    title:          getTitle(html),
    description:    getMeta(html, 'description'),
    keywords:       getKeywords(html),
    canonical:      getTag(html, 'link', 'canonical') ?? getMeta(html, 'canonical'),
    ogTitle:        getMeta(html, 'og:title'),
    ogDescription:  getMeta(html, 'og:description'),
    ogImage:        resolveUrl(getMeta(html, 'og:image'), baseUrl),
    ogSiteName:     getMeta(html, 'og:site_name'),
    twitterTitle:   getMeta(html, 'twitter:title'),
    twitterDescription: getMeta(html, 'twitter:description'),
    twitterImage:   resolveUrl(getMeta(html, 'twitter:image'), baseUrl),
    twitterSite:    getMeta(html, 'twitter:site'),
    favicon:        getFavicon(html, baseUrl),
    themeColor:     getMeta(html, 'theme-color'),
  }
}

function resolveUrl(url: string | null, base: string): string | null {
  if (!url) return null
  try {
    return new URL(url, base).href
  } catch {
    return url
  }
}
