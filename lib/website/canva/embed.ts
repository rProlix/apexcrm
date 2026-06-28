// lib/website/canva/embed.ts
// Safe Canva embed handling. Pure + dependency-free.
//
// Security model:
//  - Preserve Mode renders a Canva design inside a cross-origin <iframe>.
//  - We ONLY allow iframes whose src points at a canva.com host.
//  - We NEVER pass through <script> tags or arbitrary embed HTML — we extract
//    the design URL and rebuild a clean, responsive iframe ourselves.

const ALLOWED_HOSTS = ['canva.com', 'www.canva.com']

function isAllowedCanvaHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  return ALLOWED_HOSTS.includes(h) || h.endsWith('.canva.com')
}

/** Extracts a safe Canva design embed URL from a raw URL or embed code. */
export function extractCanvaEmbedSrc(input: string | null | undefined): string | null {
  if (!input) return null
  const raw = input.trim()

  // Collect candidate URLs: a bare URL, or src="..."/href="..." inside embed code.
  const candidates: string[] = []
  const srcMatch = raw.match(/src=["']([^"']+)["']/i)
  if (srcMatch) candidates.push(srcMatch[1])
  const urlMatch = raw.match(/https?:\/\/[^\s"'<>]+/i)
  if (urlMatch) candidates.push(urlMatch[0])
  if (/^https?:\/\//i.test(raw)) candidates.push(raw)

  for (const c of candidates) {
    try {
      const u = new URL(c)
      if (u.protocol !== 'https:') continue
      if (!isAllowedCanvaHost(u.hostname)) continue
      // Normalize a /view link into an embed link.
      if (/\/design\//i.test(u.pathname)) {
        if (!u.pathname.endsWith('/view')) {
          // keep as-is if already a watch/embed path
        }
        // Ensure embed param so Canva renders the bare design.
        if (!u.searchParams.has('embed')) u.searchParams.set('embed', '')
      }
      return u.toString().replace(/=$/, '') // tidy trailing "embed="
    } catch { /* skip invalid */ }
  }
  return null
}

/** True if the provided URL/embed code resolves to an allowed Canva embed. */
export function isValidCanvaInput(input: string | null | undefined): boolean {
  return extractCanvaEmbedSrc(input) !== null
}

/**
 * Builds a clean, responsive, script-free iframe wrapper for a Canva design.
 * Returns null if the source is not an allowed Canva URL.
 */
export function buildSafeCanvaIframe(input: string | null | undefined, opts?: { aspectPercent?: number }): string | null {
  const src = extractCanvaEmbedSrc(input)
  if (!src) return null
  const pad = opts?.aspectPercent ?? 56.25 // 16:9 default
  // No <script>; cross-origin iframe is isolated. allowfullscreen for Canva UI.
  return (
    `<div style="position:relative;width:100%;height:0;padding-top:${pad}%;` +
    `overflow:hidden;border-radius:12px;will-change:transform;">` +
    `<iframe loading="lazy" src="${escapeAttr(src)}" ` +
    `style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;padding:0;margin:0;" ` +
    `allowfullscreen="true" allow="fullscreen" referrerpolicy="no-referrer-when-downgrade"></iframe>` +
    `</div>`
  )
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
