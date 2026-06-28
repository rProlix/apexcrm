// lib/website/canva/link-mapper.ts
// Maps extracted PDF links and AI-detected button labels to working NexoraNow
// routes and external URLs. Pure + dependency-free.

export type LinkActionType =
  | 'url'
  | 'internal_route'
  | 'rsvp'
  | 'event_camera'
  | 'gallery'
  | 'login'
  | 'details'
  | 'registry'
  | 'contact'
  | 'unknown'

export interface MappedLink {
  id: string
  label: string
  pageNumber?: number
  actionType: LinkActionType
  href: string
  source: 'pdf_annotation' | 'ai_detected' | 'native_pov' | 'manual'
  dead?: boolean
  warning?: string
}

export interface EventRouteContext {
  eventSlug: string
  povEnabled?: boolean
}

const RSVP_RE = /\b(rsvp|sign\s*up|register|confirm\s*attendance|save\s*the\s*date|attending)\b/i
const CAMERA_RE = /\b(event\s*camera|pov\s*camera|upload\s*memories|camera|take\s*photos)\b/i
const GALLERY_RE = /\b(gallery|view\s*gallery|memories|photo\s*album)\b/i
const LOGIN_RE = /\b(login|sign\s*in|guest\s*login|enter\s*pin)\b/i
const DETAILS_RE = /\b(event\s*details|details|location|venue|directions|when\s*&?\s*where)\b/i
const REGISTRY_RE = /\b(registry|gift\s*registry|wish\s*list)\b/i
const CONTACT_RE = /\b(contact|email|call|reach\s*us)\b/i

export function detectRsvpIntent(text: string): boolean {
  return RSVP_RE.test(text)
}

export function classifyLinkLabel(label: string): LinkActionType {
  const t = label.trim()
  if (!t) return 'unknown'
  if (RSVP_RE.test(t)) return 'rsvp'
  if (CAMERA_RE.test(t)) return 'event_camera'
  if (GALLERY_RE.test(t)) return 'gallery'
  if (LOGIN_RE.test(t)) return 'login'
  if (DETAILS_RE.test(t)) return 'details'
  if (REGISTRY_RE.test(t)) return 'registry'
  if (CONTACT_RE.test(t)) return 'contact'
  return 'unknown'
}

function safeExternalUrl(url: string): string | null {
  const u = url.trim()
  if (/^https?:\/\//i.test(u)) return u
  if (/^mailto:/i.test(u)) return u
  if (/^tel:/i.test(u)) return u
  if (/^www\./i.test(u)) return `https://${u}`
  return null
}

export function routeForAction(action: LinkActionType, ctx: EventRouteContext, externalUrl?: string): { href: string; dead?: boolean; warning?: string } {
  const slug = ctx.eventSlug
  switch (action) {
    case 'rsvp':
      return { href: `/events/${slug}/rsvp` }
    case 'event_camera':
      return ctx.povEnabled ? { href: `/events/${slug}/camera` } : { href: '#', dead: true, warning: 'Event Camera is not enabled for this site.' }
    case 'gallery':
      return ctx.povEnabled ? { href: `/events/${slug}/gallery` } : { href: '#', dead: true, warning: 'Gallery is not enabled for this site.' }
    case 'login':
      return { href: `/events/${slug}` }
    case 'details':
      return { href: '#event-details' }
    case 'registry':
    case 'contact':
    case 'url': {
      const ext = externalUrl ? safeExternalUrl(externalUrl) : null
      if (ext) return { href: ext }
      return { href: '#', dead: true, warning: 'Button detected but no destination was found. Assign a link in Link Mapping.' }
    }
    default: {
      const ext = externalUrl ? safeExternalUrl(externalUrl) : null
      if (ext) return { href: ext }
      return { href: '#', dead: true, warning: 'Button detected but no destination was found. Assign a link in Link Mapping.' }
    }
  }
}

export function mapExtractedPdfLink(
  link: { label?: string; url?: string; pageNumber?: number },
  ctx: EventRouteContext,
  index: number,
): MappedLink {
  const label = (link.label || link.url || `Link ${index + 1}`).trim()
  const external = link.url ? safeExternalUrl(link.url) : null
  let action = classifyLinkLabel(label)
  if (action === 'unknown' && external) action = 'url'
  const routed = routeForAction(action, ctx, external ?? undefined)
  return {
    id: `pdf-link-${index}`,
    label,
    pageNumber: link.pageNumber,
    actionType: action === 'unknown' && external ? 'url' : action,
    href: routed.href,
    source: 'pdf_annotation',
    dead: routed.dead,
    warning: routed.warning,
  }
}

export function mapAiDetectedButton(
  btn: { label?: string; href?: string; actionType?: string; pageNumber?: number },
  ctx: EventRouteContext,
  index: number,
): MappedLink {
  const label = String(btn.label ?? `Button ${index + 1}`).trim()
  const actionRaw = String(btn.actionType ?? '').toLowerCase()
  let action: LinkActionType = classifyLinkLabel(label)
  if (actionRaw.includes('rsvp')) action = 'rsvp'
  else if (actionRaw.includes('camera')) action = 'event_camera'
  else if (actionRaw.includes('gallery')) action = 'gallery'
  else if (actionRaw.includes('login')) action = 'login'
  else if (actionRaw.includes('details')) action = 'details'
  const external = btn.href ? safeExternalUrl(btn.href) ?? undefined : undefined
  const routed = routeForAction(action, ctx, external)
  return {
    id: `ai-btn-${index}`,
    label,
    pageNumber: btn.pageNumber,
    actionType: action,
    href: routed.href,
    source: 'ai_detected',
    dead: routed.dead,
    warning: routed.warning,
  }
}

export function buildLinkMapping(
  pdfLinks: Array<{ label?: string; url?: string; pageNumber?: number }>,
  aiButtons: Array<{ label?: string; href?: string; actionType?: string; pageNumber?: number }>,
  ctx: EventRouteContext,
): MappedLink[] {
  const mapped: MappedLink[] = []
  const seen = new Set<string>()
  for (let i = 0; i < pdfLinks.length; i++) {
    const m = mapExtractedPdfLink(pdfLinks[i], ctx, i)
    const key = `${m.label}|${m.href}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    mapped.push(m)
  }
  for (let i = 0; i < aiButtons.length; i++) {
    const m = mapAiDetectedButton(aiButtons[i], ctx, i)
    const key = `${m.label}|${m.href}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    mapped.push(m)
  }
  if (ctx.povEnabled) {
    mapped.push({
      id: 'native-camera', label: 'Open Event Camera', actionType: 'event_camera',
      href: `/events/${ctx.eventSlug}/camera`, source: 'native_pov',
    })
    mapped.push({
      id: 'native-gallery', label: 'View Gallery', actionType: 'gallery',
      href: `/events/${ctx.eventSlug}/gallery`, source: 'native_pov',
    })
  }
  return mapped
}

export function deadLinkCount(links: MappedLink[]): number {
  return links.filter((l) => l.dead).length
}
