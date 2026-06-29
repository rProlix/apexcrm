// lib/website/import-engine/detect-source.ts
// Auto-detect design import source from URL, MIME, filename, or content hints.

import type { DesignImportSourceType } from '@/lib/website/import-engine/types'

const CANVA_HOSTS = ['canva.com', 'canva.site', 'my.canva.site']

export function detectSourceFromUrl(url: string): DesignImportSourceType {
  try {
    const u = new URL(url.trim())
    const host = u.hostname.toLowerCase()
    if (host.endsWith('.canva.site') || host === 'canva.site') return 'canva_site'
    if (CANVA_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return 'canva_url'
    if (host.includes('figma.com')) return 'figma_export'
    if (host.includes('docs.google.com') && u.pathname.includes('/presentation')) return 'google_slides'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

export function detectSourceFromFile(opts: {
  mimeType?: string
  fileName?: string
  url?: string
}): DesignImportSourceType {
  if (opts.url) {
    const fromUrl = detectSourceFromUrl(opts.url)
    if (fromUrl !== 'unknown') return fromUrl
  }

  const name = (opts.fileName ?? '').toLowerCase()
  const mime = (opts.mimeType ?? '').toLowerCase()

  if (mime === 'application/pdf' || /\.pdf$/i.test(name)) {
    if (/invit|wedding|baby|shower|rsvp|event/i.test(name)) return 'pdf_invitation'
    if (/brochure|flyer|menu|catalog/i.test(name)) return name.includes('flyer') ? 'flyer' : 'pdf_brochure'
    if (/canva/i.test(name)) return 'canva_pdf'
    return 'pdf'
  }

  if (/\.(png|jpe?g|webp|gif)$/i.test(name) || mime.startsWith('image/')) {
    return 'image'
  }

  if (/\.(pptx?|key)$/i.test(name) || mime.includes('presentation')) return 'presentation'
  if (/\.zip$/i.test(name)) {
    if (/canva/i.test(name)) return 'canva_zip'
    return 'unknown'
  }
  if (/\.fig$/i.test(name)) return 'figma_export'

  return 'unknown'
}

export function isCanvaHostedDomain(hostname: string): boolean {
  const h = hostname.toLowerCase()
  return h.endsWith('.canva.site') || CANVA_HOSTS.some((c) => h === c || h.endsWith(`.${c}`))
}

export function normalizeSourceType(raw: DesignImportSourceType): DesignImportSourceType {
  if (raw === 'canva_site' || raw === 'canva_custom_domain') return raw
  if (raw === 'pdf_invitation' || raw === 'pdf_brochure' || raw === 'flyer') return raw
  if (raw === 'canva_pdf') return 'canva_pdf'
  if (raw === 'pdf') return 'pdf'
  return raw
}
