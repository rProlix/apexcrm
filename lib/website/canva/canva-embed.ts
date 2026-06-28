// lib/website/canva/canva-embed.ts
// Safe Canva embed handling. Pure + dependency-free.
//
// Security model:
//  - Preserve Mode renders a Canva design inside a cross-origin <iframe>.
//  - We NEVER pass through <script> tags or arbitrary embed HTML — we extract
//    the design URL and rebuild a clean, sandboxed iframe ourselves.
//  - Allowed iframe src: canva.com (+sub), canva.site (+sub), or an explicitly
//    allowed custom domain (HTTPS, not internal/private).

import {
  normalizeCanvaUrl,
  validateCanvaPreserveUrl,
  parseCanvaEmbedSource,
  type CanvaUrlValidationResult,
  type CanvaEmbedSource,
} from './canva-url'

/** Pulls the first URL out of a raw URL string or iframe embed code. */
export function extractCanvaEmbedSrc(input: string | null | undefined): string | null {
  if (!input) return null
  const raw = input.trim()

  const candidates: string[] = []
  const srcMatch = raw.match(/src=["']([^"']+)["']/i)
  if (srcMatch) candidates.push(srcMatch[1])
  const urlMatch = raw.match(/https?:\/\/[^\s"'<>]+/i)
  if (urlMatch) candidates.push(urlMatch[0])
  if (!/[<>]/.test(raw)) candidates.push(raw) // bare URL/host

  return candidates[0] ?? null
}

/**
 * Validates a Canva URL OR an iframe embed code (extracting its src) for
 * Preserve Canva Mode. Returns the same result shape as validateCanvaPreserveUrl
 * with validationMode overridden to 'embed_code' when the input was embed HTML.
 */
export function validateCanvaEmbedInput(
  input: string | null | undefined,
  options?: { allowCustomDomains?: boolean },
): CanvaUrlValidationResult {
  if (!input || !input.trim()) return { ok: false, reason: 'Please paste a Canva URL or embed code.' }
  const wasEmbed = /<\s*iframe/i.test(input) || /src=["']/i.test(input)
  const candidate = extractCanvaEmbedSrc(input)
  if (!candidate) return { ok: false, reason: 'Could not find a Canva link in that embed code.' }
  const result = validateCanvaPreserveUrl(candidate, options)
  if (result.ok && wasEmbed) return { ...result, validationMode: 'embed_code' }
  return result
}

/** Backwards-compatible boolean check (native + canva.site only by default). */
export function isValidCanvaInput(
  input: string | null | undefined,
  options?: { allowCustomDomains?: boolean },
): boolean {
  return validateCanvaEmbedInput(input, options).ok
}

/** Returns the safe, framing-ready iframe src for an input, or null. */
export function resolveCanvaEmbedSrc(
  input: string | null | undefined,
  options?: { allowCustomDomains?: boolean },
): string | null {
  const source = parseCanvaEmbedSource({
    canvaUrl: input ?? null,
    embedCode: input && /<\s*iframe/i.test(input) ? input : null,
    isCustomCanvaDomain: options?.allowCustomDomains,
  })
  return source.iframeSrc
}

/**
 * Full embed-source resolution from a Canva URL and/or pasted embed code,
 * preferring the embed code's iframe src. Use this in save/publish flows so the
 * resolved iframe src + diagnostics are persisted with the import.
 */
export function resolveCanvaEmbedSource(input: {
  canvaUrl?: string | null
  embedCode?: string | null
  isCustomCanvaDomain?: boolean
}): CanvaEmbedSource {
  return parseCanvaEmbedSource(input)
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Builds a clean, responsive, script-free, sandboxed iframe wrapper for a Canva
 * design. Returns null when the input is not an allowed Canva/custom source.
 */
export function buildSafeCanvaIframe(
  input: string | null | undefined,
  opts?: { aspectPercent?: number; allowCustomDomains?: boolean },
): string | null {
  const src = resolveCanvaEmbedSrc(input, { allowCustomDomains: opts?.allowCustomDomains })
  if (!src) return null
  const pad = opts?.aspectPercent ?? 56.25 // 16:9 default
  return (
    `<div style="position:relative;width:100%;height:0;padding-top:${pad}%;` +
    `overflow:hidden;border-radius:12px;">` +
    `<iframe loading="lazy" src="${escapeAttr(src)}" ` +
    `style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;padding:0;margin:0;" ` +
    `allowfullscreen="true" allow="fullscreen" referrerpolicy="no-referrer-when-downgrade" ` +
    `sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"></iframe>` +
    `</div>`
  )
}

export { normalizeCanvaUrl }
