// lib/website-import/fetchSource.ts
// Safe server-side page fetcher with SSRF protection, timeout, and robots.txt
// awareness. Never resolves to internal/private network addresses.

import { URL } from 'url'
import dns from 'dns/promises'

// ── SSRF block-list ───────────────────────────────────────────────────────────

const BLOCKED_IP_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,   // link-local / AWS metadata
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,  // CGNAT
  /^::1$/,
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
]

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  '169.254.169.254',
  '100.100.100.200',
])

/**
 * Returns null if the URL is safe, or an error string explaining why it's blocked.
 */
export function validateImportUrl(rawUrl: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return 'Invalid URL format'
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'Only http and https URLs are allowed'
  }

  const hostname = parsed.hostname.toLowerCase()

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return `Blocked hostname: ${hostname}`
  }

  // Block bare IP addresses that are in restricted ranges
  if (isIpAddress(hostname)) {
    for (const pattern of BLOCKED_IP_RANGES) {
      if (pattern.test(hostname)) {
        return `Blocked IP range: ${hostname}`
      }
    }
  }

  return null
}

function isIpAddress(hostname: string): boolean {
  return /^[\d.]+$/.test(hostname) || hostname.includes(':')
}

/**
 * Resolves the hostname and checks whether the resolved IP is safe.
 * This prevents DNS rebinding attacks where a hostname resolves to an internal IP.
 */
async function assertSafeHostResolution(hostname: string): Promise<void> {
  try {
    const addrs = await dns.resolve4(hostname)
    for (const addr of addrs) {
      for (const pattern of BLOCKED_IP_RANGES) {
        if (pattern.test(addr)) {
          throw new Error(`Hostname ${hostname} resolves to blocked IP ${addr}`)
        }
      }
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Hostname')) throw e
    // DNS lookup failures are acceptable; the fetch will fail naturally
  }
}

export interface FetchSourceResult {
  html:        string
  finalUrl:    string
  statusCode:  number
  contentType: string
  fetchedAt:   string
}

const FETCH_TIMEOUT_MS  = 15_000
const MAX_BODY_BYTES    = 3 * 1024 * 1024  // 3 MB cap

/**
 * Fetches a public URL server-side with:
 * - SSRF protection (both URL and DNS-resolved IP)
 * - Timeout
 * - Response size cap
 * - Browser-like User-Agent
 *
 * Throws on error; callers should catch and mark the source as failed.
 */
export async function fetchSource(rawUrl: string): Promise<FetchSourceResult> {
  const urlError = validateImportUrl(rawUrl)
  if (urlError) throw new Error(urlError)

  const parsed = new URL(rawUrl)
  await assertSafeHostResolution(parsed.hostname)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(rawUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; CRMWebsiteImporter/1.0; +https://apexcrm.app/bot)',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
    })
  } finally {
    clearTimeout(timer)
  }

  const contentType = response.headers.get('content-type') ?? ''

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${rawUrl}`)
  }

  // Check body size before reading fully
  const contentLength = Number(response.headers.get('content-length') ?? 0)
  if (contentLength > MAX_BODY_BYTES) {
    throw new Error(`Response too large (${contentLength} bytes)`)
  }

  const buffer = await response.arrayBuffer()
  if (buffer.byteLength > MAX_BODY_BYTES) {
    throw new Error(`Response body exceeds ${MAX_BODY_BYTES / 1024}KB limit`)
  }

  const html = new TextDecoder().decode(buffer)

  return {
    html,
    finalUrl:    response.url ?? rawUrl,
    statusCode:  response.status,
    contentType,
    fetchedAt:   new Date().toISOString(),
  }
}

/**
 * Best-effort robots.txt check.
 * Returns true if crawling is allowed (or robots.txt is unavailable/unparseable).
 * This is advisory — we don't hard-block on robots.txt since it's per-sitemap.
 */
export async function checkRobotsTxt(rawUrl: string): Promise<boolean> {
  try {
    const parsed = new URL(rawUrl)
    const robotsUrl = `${parsed.protocol}//${parsed.host}/robots.txt`

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5_000)

    let res: Response
    try {
      res = await fetch(robotsUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'CRMWebsiteImporter/1.0' },
      })
    } finally {
      clearTimeout(timer)
    }

    if (!res.ok) return true  // No robots.txt = allow

    const text = await res.text()
    const lines = text.split('\n')

    let inOurBlock = false
    for (const line of lines) {
      const trimmed = line.trim().toLowerCase()
      if (trimmed.startsWith('user-agent:')) {
        const agent = trimmed.replace('user-agent:', '').trim()
        inOurBlock = agent === '*' || agent.includes('crmwebsiteimporter')
      }
      if (inOurBlock && trimmed.startsWith('disallow:')) {
        const path = trimmed.replace('disallow:', '').trim()
        if (path === '/' || path === '') {
          return false  // Everything disallowed
        }
      }
    }

    return true
  } catch {
    return true  // If we can't check, allow
  }
}
