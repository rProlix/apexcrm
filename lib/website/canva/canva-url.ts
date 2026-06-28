// lib/website/canva/canva-url.ts
// Shared Canva URL validation for Preserve Canva Mode. Pure + dependency-free,
// safe on client + server. Accepts canva.com, canva.site (+ subdomains), and
// user-owned custom domains (when explicitly allowed), while rejecting unsafe
// protocols and localhost/private/internal hosts.

export type CanvaValidationMode =
  | 'native_canva_domain'
  | 'canva_site_domain'
  | 'custom_domain'
  | 'embed_code'

export interface CanvaUrlValidationResult {
  ok: boolean
  normalizedUrl?: string
  hostname?: string
  isNativeCanvaDomain?: boolean
  isCanvaSiteDomain?: boolean
  isCustomDomain?: boolean
  validationMode?: CanvaValidationMode
  reason?: string
}

const UNSAFE_PROTOCOLS = ['javascript:', 'data:', 'file:', 'blob:', 'ftp:', 'ws:', 'wss:']

/** Adds https:// when the user pasted a bare host/URL without a protocol. */
export function normalizeCanvaUrl(input: string): string {
  const raw = (input ?? '').trim()
  if (!raw) return ''
  // Already has a scheme (http:, https:, javascript:, etc.) — leave it.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return raw
  // Protocol-relative //host → https://host
  if (raw.startsWith('//')) return `https:${raw}`
  return `https://${raw}`
}

export function isNativeCanvaHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  return h === 'canva.com' || h.endsWith('.canva.com')
}

export function isCanvaSiteHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  return h === 'canva.site' || h.endsWith('.canva.site')
}

/** True for localhost, loopback, private RFC1918 ranges, link-local, and bare/internal hosts. */
export function isUnsafeOrInternalHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '')
  if (!h) return true
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  if (h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.lan')) return true
  // IPv6 loopback / unspecified
  if (h === '::1' || h === '[::1]' || h === '::' || h === '[::]') return true
  // Bare hostname with no dot (e.g. "intranet") — not a public domain.
  if (!h.includes('.') && !h.startsWith('[')) return true

  // IPv4 literals → reject loopback/private/link-local/unspecified.
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])]
    if (a === 127) return true                 // loopback
    if (a === 10) return true                   // private
    if (a === 0) return true                    // unspecified
    if (a === 169 && b === 254) return true     // link-local
    if (a === 192 && b === 168) return true     // private
    if (a === 172 && b >= 16 && b <= 31) return true // private
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
    return false // other IPv4 literals are technically public but discouraged
  }
  return false
}

/**
 * Validates a Canva published URL for Preserve Canva Mode.
 * Custom domains are accepted only when options.allowCustomDomains is true.
 */
export function validateCanvaPreserveUrl(
  input: string,
  options?: { allowCustomDomains?: boolean },
): CanvaUrlValidationResult {
  const raw = (input ?? '').trim()
  if (!raw) return { ok: false, reason: 'Please paste a Canva website URL.' }

  const normalized = normalizeCanvaUrl(raw)

  // Reject unsafe schemes before parsing.
  const lower = normalized.toLowerCase()
  for (const proto of UNSAFE_PROTOCOLS) {
    if (lower.startsWith(proto)) {
      return { ok: false, reason: `Unsafe URL scheme "${proto}" is not allowed.` }
    }
  }

  let url: URL
  try {
    url = new URL(normalized)
  } catch {
    return { ok: false, reason: 'That does not look like a valid URL.' }
  }

  if (url.protocol !== 'https:') {
    return { ok: false, reason: 'Canva websites must be served over HTTPS.' }
  }

  const hostname = url.hostname.toLowerCase()

  if (isUnsafeOrInternalHost(hostname)) {
    return { ok: false, hostname, reason: 'Local, private, or internal addresses are not allowed.' }
  }

  if (isNativeCanvaHost(hostname)) {
    return { ok: true, normalizedUrl: url.toString(), hostname, isNativeCanvaDomain: true, validationMode: 'native_canva_domain' }
  }
  if (isCanvaSiteHost(hostname)) {
    return { ok: true, normalizedUrl: url.toString(), hostname, isCanvaSiteDomain: true, validationMode: 'canva_site_domain' }
  }

  if (options?.allowCustomDomains) {
    return { ok: true, normalizedUrl: url.toString(), hostname, isCustomDomain: true, validationMode: 'custom_domain' }
  }

  return {
    ok: false,
    hostname,
    reason: 'This looks like a custom domain. Enable “This is a custom domain connected to my Canva website” to use it.',
  }
}
