'use client'

import { useEffect } from 'react'

export function WorkspaceDocumentBranding({
  tenantName,
  faviconUrl,
}: {
  tenantName: string
  faviconUrl?: string | null
}) {
  useEffect(() => {
    const previousTitle = document.title
    document.title = `${tenantName} Workspace`

    if (!faviconUrl) {
      return () => {
        document.title = previousTitle
      }
    }

    const existing = document.querySelector<HTMLLinkElement>("link[rel~='icon']")
    const favicon = existing ?? document.createElement('link')
    const previousHref = existing?.href ?? null
    favicon.rel = 'icon'
    favicon.href = faviconUrl
    if (!existing) document.head.appendChild(favicon)

    return () => {
      document.title = previousTitle
      if (existing && previousHref) existing.href = previousHref
      else favicon.remove()
    }
  }, [faviconUrl, tenantName])

  return null
}
