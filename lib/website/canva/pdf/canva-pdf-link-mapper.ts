// lib/website/canva/pdf/canva-pdf-link-mapper.ts
// Maps PDF link annotations and detected labels to working actions with
// hotspot overlays or fallback buttons. Pure + dependency-free.

export type PdfLinkActionType =
  | 'external_url'
  | 'internal_route'
  | 'rsvp'
  | 'registry'
  | 'event_camera'
  | 'gallery'
  | 'login'
  | 'details'
  | 'unknown'

export interface PdfLinkAnnotation {
  label?: string
  url?: string
  pageNumber: number
  x?: number
  y?: number
  width?: number
  height?: number
  pageWidth?: number
  pageHeight?: number
}

export interface PdfMappedAction {
  id: string
  label: string
  actionType: PdfLinkActionType
  href: string
  pageNumber: number
  source: 'pdf_annotation' | 'ai_detected' | 'native_pov'
  dead?: boolean
  warning?: string
  xPercent?: number
  yPercent?: number
  widthPercent?: number
  heightPercent?: number
  hasCoordinates: boolean
}

export interface PdfOverlayConfig {
  id: string
  label: string
  actionType: PdfLinkActionType
  href?: string
  xPercent?: number
  yPercent?: number
  widthPercent?: number
  heightPercent?: number
  style: 'invisible_hotspot' | 'visible_button'
}

export interface PdfFallbackAction {
  label: string
  actionType: PdfLinkActionType
  href?: string
  dead?: boolean
  warning?: string
}

export interface EventRouteContext {
  eventSlug: string
  povEnabled?: boolean
}

const RSVP_RE = /\b(rsvp|sign\s*up|register|confirm\s*attendance|save\s*the\s*date|attending)\b/i
const REGISTRY_RE = /\b(registry|gift\s*registry|wish\s*list)\b/i
const TARGET_RE = /\btarget\b/i
const AMAZON_RE = /\bamazon\b/i
const CAMERA_RE = /\b(event\s*camera|pov\s*camera|upload\s*memories|camera|take\s*photos)\b/i
const GALLERY_RE = /\b(gallery|view\s*gallery|memories|photo\s*album)\b/i
const LOGIN_RE = /\b(login|sign\s*in|guest\s*login|enter\s*pin)\b/i
const DETAILS_RE = /\b(event\s*details|details|location|venue|directions|schedule|when\s*&?\s*where)\b/i

export function detectRsvpIntent(text: string): boolean {
  return RSVP_RE.test(text)
}

function safeExternalUrl(url: string): string | null {
  const u = url.trim()
  if (/^https?:\/\//i.test(u)) return u
  if (/^mailto:/i.test(u)) return u
  if (/^tel:/i.test(u)) return u
  if (/^www\./i.test(u)) return `https://${u}`
  return null
}

export function classifyPdfLinkLabel(label: string, url?: string): PdfLinkActionType {
  const t = label.trim()
  const u = (url ?? '').toLowerCase()
  if (RSVP_RE.test(t)) return 'rsvp'
  if (REGISTRY_RE.test(t) || REGISTRY_RE.test(u)) return 'registry'
  if (CAMERA_RE.test(t)) return 'event_camera'
  if (GALLERY_RE.test(t)) return 'gallery'
  if (LOGIN_RE.test(t)) return 'login'
  if (DETAILS_RE.test(t)) return 'details'
  if (TARGET_RE.test(t) || u.includes('target.com')) return 'external_url'
  if (AMAZON_RE.test(t) || u.includes('amazon.')) return 'external_url'
  if (url && safeExternalUrl(url)) return 'external_url'
  return 'unknown'
}

export function routeForPdfAction(
  action: PdfLinkActionType,
  ctx: EventRouteContext,
  externalUrl?: string,
  label?: string,
): { href: string; dead?: boolean; warning?: string } {
  const slug = ctx.eventSlug
  switch (action) {
    case 'rsvp':
      return { href: `/events/${slug}/rsvp` }
    case 'event_camera':
      return ctx.povEnabled
        ? { href: `/events/${slug}/camera` }
        : { href: '#', dead: true, warning: 'Event Camera is not enabled.' }
    case 'gallery':
      return ctx.povEnabled
        ? { href: `/events/${slug}/gallery` }
        : { href: '#', dead: true, warning: 'Gallery is not enabled.' }
    case 'login':
      return { href: `/events/${slug}` }
    case 'details':
      return { href: '#event-details' }
    case 'registry':
    case 'external_url': {
      const ext = externalUrl ? safeExternalUrl(externalUrl) : null
      if (ext) return { href: ext }
      if (label && REGISTRY_RE.test(label)) {
        return { href: '#', dead: true, warning: 'Registry link detected but no URL found. Assign in Link Mapping.' }
      }
      return { href: '#', dead: true, warning: `Button "${label ?? 'Link'}" detected but no destination was found.` }
    }
    default: {
      const ext = externalUrl ? safeExternalUrl(externalUrl) : null
      if (ext) return { href: ext }
      return { href: '#', dead: true, warning: `Button "${label ?? 'Link'}" detected but no destination was found.` }
    }
  }
}

function pdfCoordsToPercent(link: PdfLinkAnnotation): {
  xPercent?: number; yPercent?: number; widthPercent?: number; heightPercent?: number; hasCoordinates: boolean
} {
  const pw = link.pageWidth ?? 0
  const ph = link.pageHeight ?? 0
  if (!pw || !ph || link.x == null || link.y == null) {
    return { hasCoordinates: false }
  }
  const x = link.x
  const y = link.y
  const w = link.width ?? 40
  const h = link.height ?? 20
  const xPercent = Math.max(0, Math.min(100, (x / pw) * 100))
  const yFromTop = ph - y - h
  const yPercent = Math.max(0, Math.min(100, (yFromTop / ph) * 100))
  const widthPercent = Math.max(3, Math.min(100, (w / pw) * 100))
  const heightPercent = Math.max(3, Math.min(100, (h / ph) * 100))
  return { xPercent, yPercent, widthPercent, heightPercent, hasCoordinates: true }
}

export function mapPdfLinkAnnotation(link: PdfLinkAnnotation, ctx: EventRouteContext, index: number): PdfMappedAction {
  const label = (link.label || link.url || `Link ${index + 1}`).trim()
  const external = link.url ? safeExternalUrl(link.url) ?? undefined : undefined
  const action = classifyPdfLinkLabel(label, link.url)
  const routed = routeForPdfAction(action, ctx, external, label)
  const coords = pdfCoordsToPercent(link)
  return {
    id: `pdf-link-${link.pageNumber}-${index}`,
    label,
    actionType: action === 'unknown' && external ? 'external_url' : action,
    href: routed.href,
    pageNumber: link.pageNumber,
    source: 'pdf_annotation',
    dead: routed.dead,
    warning: routed.warning,
    ...coords,
  }
}

export function buildPdfLinkMapping(
  annotations: PdfLinkAnnotation[],
  aiButtons: Array<{ label?: string; href?: string; actionType?: string; pageNumber?: number }>,
  ctx: EventRouteContext,
): PdfMappedAction[] {
  const mapped: PdfMappedAction[] = []
  const seen = new Set<string>()

  for (let i = 0; i < annotations.length; i++) {
    const m = mapPdfLinkAnnotation(annotations[i], ctx, i)
    const key = `${m.pageNumber}|${m.label}|${m.href}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    mapped.push(m)
  }

  for (let i = 0; i < aiButtons.length; i++) {
    const btn = aiButtons[i]
    const label = String(btn.label ?? `Button ${i + 1}`).trim()
    const pageNumber = btn.pageNumber ?? 1
    const external = btn.href ? safeExternalUrl(btn.href) ?? undefined : undefined
    let action = classifyPdfLinkLabel(label, btn.href)
    const raw = String(btn.actionType ?? '').toLowerCase()
    if (raw.includes('rsvp')) action = 'rsvp'
    else if (raw.includes('registry')) action = 'registry'
    else if (raw.includes('camera')) action = 'event_camera'
    else if (raw.includes('gallery')) action = 'gallery'
    const routed = routeForPdfAction(action, ctx, external, label)
    const key = `${pageNumber}|${label}|${routed.href}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    mapped.push({
      id: `ai-btn-${i}`,
      label,
      actionType: action,
      href: routed.href,
      pageNumber,
      source: 'ai_detected',
      dead: routed.dead,
      warning: routed.warning,
      hasCoordinates: false,
    })
  }

  if (ctx.povEnabled) {
    mapped.push({
      id: 'native-camera', label: 'Open Event Camera', actionType: 'event_camera',
      href: `/events/${ctx.eventSlug}/camera`, pageNumber: 1, source: 'native_pov', hasCoordinates: false,
    })
    mapped.push({
      id: 'native-gallery', label: 'View Gallery', actionType: 'gallery',
      href: `/events/${ctx.eventSlug}/gallery`, pageNumber: 1, source: 'native_pov', hasCoordinates: false,
    })
  }

  return mapped
}

export function overlaysAndFallbacksForPage(
  pageNumber: number,
  links: PdfMappedAction[],
): { overlays: PdfOverlayConfig[]; fallbackActions: PdfFallbackAction[] } {
  const pageLinks = links.filter((l) => l.pageNumber === pageNumber && !l.dead)
  const overlays: PdfOverlayConfig[] = []
  const fallbackActions: PdfFallbackAction[] = []

  for (const l of pageLinks) {
    if (l.hasCoordinates && l.xPercent != null && l.yPercent != null) {
      overlays.push({
        id: l.id,
        label: l.label,
        actionType: l.actionType,
        href: l.href,
        xPercent: l.xPercent,
        yPercent: l.yPercent,
        widthPercent: l.widthPercent,
        heightPercent: l.heightPercent,
        style: 'invisible_hotspot',
      })
    } else {
      fallbackActions.push({ label: l.label, actionType: l.actionType, href: l.href })
    }
  }

  return { overlays, fallbackActions }
}

export function deadPdfLinkCount(links: PdfMappedAction[]): number {
  return links.filter((l) => l.dead).length
}
