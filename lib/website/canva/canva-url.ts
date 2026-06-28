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

// ─────────────────────────────────────────────────────────────────────────────
// Embed-source resolution (shared by the public renderer + import save flow).
// ─────────────────────────────────────────────────────────────────────────────

/** True only for safe, public, HTTPS URLs (no js:/data:/file:/private hosts). */
export function isSafeHttpUrl(input: string): boolean {
  const normalized = normalizeCanvaUrl(input)
  const lower = normalized.toLowerCase()
  for (const proto of UNSAFE_PROTOCOLS) if (lower.startsWith(proto)) return false
  try {
    const url = new URL(normalized)
    if (url.protocol !== 'https:') return false
    if (isUnsafeOrInternalHost(url.hostname)) return false
    return true
  } catch {
    return false
  }
}

/**
 * Canva's design-view pages (canva.com/design/<id>/view) only frame reliably
 * with the ?embed flag. This appends it when missing; other Canva/custom URLs
 * are returned unchanged.
 */
export function toCanvaIframeSrc(normalizedUrl: string): string {
  try {
    const url = new URL(normalizedUrl)
    const host = url.hostname.toLowerCase()
    const isNative = host === 'canva.com' || host.endsWith('.canva.com')
    if (isNative && /\/design\//.test(url.pathname)) {
      if (!url.pathname.includes('/view')) {
        url.pathname = url.pathname.replace(/\/?$/, '/view')
      }
      if (!url.searchParams.has('embed')) url.searchParams.set('embed', '')
      // URLSearchParams renders ?embed= ; Canva accepts the bare flag form.
      return url.toString().replace(/embed=$/, 'embed').replace(/embed=&/, 'embed&')
    }
    return url.toString()
  } catch {
    return normalizedUrl
  }
}

export type CanvaEmbedSourceType = 'canva_url' | 'canva_site' | 'custom_domain' | 'embed_code'

export interface CanvaEmbedSource {
  originalInput: string
  normalizedUrl: string | null
  iframeSrc: string | null
  sourceDomain: string | null
  sourceType: CanvaEmbedSourceType
  validationMode: CanvaValidationMode
  canAttemptIframe: boolean
  requiresExternalOpenFallback: boolean
  warnings: string[]
}

/** Extracts the first iframe src (or bare URL) from raw embed code / a URL. */
function extractSrcFromEmbed(input: string): { src: string | null; wasEmbed: boolean } {
  const raw = input.trim()
  const wasEmbed = /<\s*iframe/i.test(raw) || /src\s*=\s*["']/i.test(raw)
  const srcMatch = raw.match(/src\s*=\s*["']([^"']+)["']/i)
  if (srcMatch) return { src: srcMatch[1], wasEmbed: true }
  const urlMatch = raw.match(/https?:\/\/[^\s"'<>]+/i)
  if (urlMatch) return { src: urlMatch[0], wasEmbed }
  if (!/[<>]/.test(raw)) return { src: raw, wasEmbed: false }
  return { src: null, wasEmbed }
}

/**
 * Resolves the highest-priority safe Canva embed source for rendering.
 * Priority: pasted embed code → Canva URL. Never returns raw HTML.
 */
export function parseCanvaEmbedSource(input: {
  canvaUrl?: string | null
  embedCode?: string | null
  isCustomCanvaDomain?: boolean
}): CanvaEmbedSource {
  const allowCustomDomains = Boolean(input.isCustomCanvaDomain)
  const embedCode = (input.embedCode ?? '').trim()
  const canvaUrl = (input.canvaUrl ?? '').trim()
  const originalInput = embedCode || canvaUrl
  const warnings: string[] = []

  const empty: CanvaEmbedSource = {
    originalInput, normalizedUrl: null, iframeSrc: null, sourceDomain: null,
    sourceType: 'canva_url', validationMode: 'native_canva_domain',
    canAttemptIframe: false, requiresExternalOpenFallback: true, warnings,
  }
  if (!originalInput) {
    warnings.push('No Canva URL or embed code was provided.')
    return empty
  }

  // Prefer the official embed code's src when present.
  let candidate: string | null = null
  let cameFromEmbed = false
  if (embedCode) {
    const { src, wasEmbed } = extractSrcFromEmbed(embedCode)
    candidate = src
    cameFromEmbed = wasEmbed || !!src
    if (!candidate) warnings.push('Could not find an iframe src in the pasted embed code.')
  }
  if (!candidate && canvaUrl) {
    const { src } = extractSrcFromEmbed(canvaUrl)
    candidate = src ?? canvaUrl
  }
  if (!candidate) return empty

  const validation = validateCanvaPreserveUrl(candidate, { allowCustomDomains })
  if (!validation.ok || !validation.normalizedUrl) {
    warnings.push(validation.reason ?? 'The Canva URL could not be validated.')
    return {
      ...empty,
      normalizedUrl: null,
      sourceDomain: validation.hostname ?? null,
    }
  }

  const iframeSrc = toCanvaIframeSrc(validation.normalizedUrl)
  const sourceType: CanvaEmbedSourceType = cameFromEmbed
    ? 'embed_code'
    : validation.isNativeCanvaDomain
      ? 'canva_url'
      : validation.isCanvaSiteDomain
        ? 'canva_site'
        : 'custom_domain'
  const validationMode: CanvaValidationMode = cameFromEmbed ? 'embed_code' : (validation.validationMode ?? 'native_canva_domain')

  const isCustom = validation.isCustomDomain === true
  if (isCustom) {
    warnings.push('Custom domains can block iframe embedding. If that happens, a polished “Open Canva Website” fallback is shown while Event Camera and Gallery stay available.')
  }

  return {
    originalInput,
    normalizedUrl: validation.normalizedUrl,
    iframeSrc,
    sourceDomain: validation.hostname ?? null,
    sourceType,
    validationMode,
    canAttemptIframe: true,
    // We always *attempt* the iframe; custom domains are the most likely to need
    // the external fallback, but we never refuse to try first.
    requiresExternalOpenFallback: false,
    warnings,
  }
}
