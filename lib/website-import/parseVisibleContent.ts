// lib/website-import/parseVisibleContent.ts
// Extracts human-readable content from raw HTML using regex patterns.
// Focuses on headings, paragraphs, contact info, and operational data.

import type { ParsedVisibleContent } from './types'

// ── HTML helpers ──────────────────────────────────────────────────────────────

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function decodeEntities(html: string): string {
  return html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

function innerText(tagHtml: string): string {
  return decodeEntities(stripTags(tagHtml)).trim()
}

// ── Section extraction ────────────────────────────────────────────────────────

function extractHeadings(html: string): string[] {
  const re = /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const text = innerText(m[1])
    if (text.length > 2 && text.length < 200) out.push(text)
  }
  return [...new Set(out)]
}

function extractParagraphs(html: string): string[] {
  const re = /<p[^>]*>([\s\S]*?)<\/p>/gi
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const text = innerText(m[1])
    if (text.length > 20 && text.length < 2000) out.push(text)
  }
  // Deduplicate and return top 30
  return [...new Set(out)].slice(0, 30)
}

function extractLists(html: string): string[][] {
  const listRe = /<(?:ul|ol)[^>]*>([\s\S]*?)<\/(?:ul|ol)>/gi
  const itemRe = /<li[^>]*>([\s\S]*?)<\/li>/gi
  const out: string[][] = []
  let lm: RegExpExecArray | null

  while ((lm = listRe.exec(html)) !== null) {
    const items: string[] = []
    let im: RegExpExecArray | null
    const listHtml = lm[1]
    while ((im = itemRe.exec(listHtml)) !== null) {
      const text = innerText(im[1])
      if (text.length > 1 && text.length < 300) items.push(text)
    }
    if (items.length > 0) out.push(items)
  }

  return out.slice(0, 10)
}

function extractLinks(html: string, baseUrl: string): Array<{ href: string; text: string }> {
  const re = /<a[^>]+href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi
  const out: Array<{ href: string; text: string }> = []
  let m: RegExpExecArray | null

  while ((m = re.exec(html)) !== null) {
    const href = m[1].trim()
    const text = innerText(m[2])
    if (!href || !text || text.length > 100) continue
    try {
      const resolved = new URL(href, baseUrl).href
      out.push({ href: resolved, text })
    } catch {
      // skip unresolvable
    }
  }

  return out.slice(0, 100)
}

function extractImages(html: string, baseUrl: string): Array<{ src: string; alt: string }> {
  const re = /<img[^>]+src=["']([^"']+)["'][^>]*(?:alt=["']([^"']*)["'])?[^>]*>/gi
  const altRe = /alt=["']([^"']*)["']/i
  const out: Array<{ src: string; alt: string }> = []
  let m: RegExpExecArray | null

  while ((m = re.exec(html)) !== null) {
    const src = m[1].trim()
    if (!src || src.startsWith('data:')) continue

    // Handle separate alt extraction for reversed attribute order
    const altMatch = altRe.exec(m[0])
    const alt = altMatch?.[1] ?? ''

    try {
      const resolved = new URL(src, baseUrl).href
      // Skip tiny tracking pixels
      if (resolved.includes('1x1') || resolved.includes('pixel')) continue
      out.push({ src: resolved, alt: decodeEntities(alt) })
    } catch {
      // skip
    }
  }

  return out.slice(0, 50)
}

// ── Contact info extraction ───────────────────────────────────────────────────

const PHONE_RE =
  /(?:\+1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?:\s?(?:ext|x)\s?\d{1,5})?/g

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g

function extractPhones(text: string): string[] {
  const matches = text.match(PHONE_RE) ?? []
  return [...new Set(matches.map((p) => p.trim()))].slice(0, 5)
}

function extractEmails(text: string): string[] {
  const matches = text.match(EMAIL_RE) ?? []
  const filtered = matches.filter(
    (e) =>
      !e.includes('example.com') &&
      !e.includes('youremail') &&
      !e.endsWith('.png') &&
      !e.endsWith('.jpg'),
  )
  return [...new Set(filtered)].slice(0, 5)
}

// Simplified address pattern — looks for lines that look like addresses
function extractAddresses(text: string): string[] {
  const re =
    /\d+\s[\w\s.]+(?:street|st|avenue|ave|boulevard|blvd|road|rd|drive|dr|lane|ln|way|court|ct|place|pl)[,\s]+[\w\s]+,?\s+[A-Z]{2}\s+\d{5}/gi
  const matches = text.match(re) ?? []
  return [...new Set(matches.map((a) => a.trim()))].slice(0, 3)
}

// ── Hours extraction ──────────────────────────────────────────────────────────

const HOURS_PATTERNS = [
  /(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)[^.]{0,60}(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)[^.]{0,30})/gi,
  /(?:open|hours|schedule)[^.]{0,80}/gi,
]

function extractHours(text: string): string[] {
  const out: string[] = []
  for (const re of HOURS_PATTERNS) {
    const matches = text.match(re) ?? []
    out.push(...matches.map((h) => h.trim()))
  }
  return [...new Set(out)].slice(0, 14)
}

// ── CTA detection ────────────────────────────────────────────────────────────

const CTA_RE =
  /(?:call|book|schedule|contact|get|sign|order|buy|shop|request|learn|find|start)\s[\w\s]{2,30}/gi

function extractCtaTexts(html: string): string[] {
  const buttonRe = /<(?:button|a)[^>]*>([\s\S]*?)<\/(?:button|a)>/gi
  const out: string[] = []
  let m: RegExpExecArray | null

  while ((m = buttonRe.exec(html)) !== null) {
    const text = innerText(m[1])
    if (text.length > 2 && text.length < 60 && CTA_RE.test(text)) {
      out.push(text)
    }
    CTA_RE.lastIndex = 0
  }

  return [...new Set(out)].slice(0, 10)
}

// ── Main ──────────────────────────────────────────────────────────────────────

/**
 * Parse visible content from raw HTML.
 */
export function parseVisibleContent(
  html: string,
  baseUrl: string,
): ParsedVisibleContent {
  const bodyMatch = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)
  const bodyHtml = bodyMatch?.[1] ?? html

  // Strip nav, header, footer for cleaner text extraction
  const contentHtml = bodyHtml
    .replace(/<(?:nav|header|footer)[^>]*>[\s\S]*?<\/(?:nav|header|footer)>/gi, '')
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')

  const plainText = stripTags(decodeEntities(contentHtml))

  return {
    headings:     extractHeadings(contentHtml),
    paragraphs:   extractParagraphs(contentHtml),
    lists:        extractLists(contentHtml),
    links:        extractLinks(bodyHtml, baseUrl),
    images:       extractImages(bodyHtml, baseUrl),
    phoneNumbers: extractPhones(plainText),
    emails:       extractEmails(plainText),
    addresses:    extractAddresses(plainText),
    hours:        extractHours(plainText),
    ctaTexts:     extractCtaTexts(contentHtml),
  }
}
