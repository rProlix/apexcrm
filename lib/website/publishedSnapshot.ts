import type {
  PublishedSiteConfig,
  SiteNavigationItem,
  SitePage,
  SiteSection,
  SiteSettings,
} from './types'
import type { WebsiteSnapshot } from './versionTypes'
import { normalizeTheme } from './normalizeTheme'

/** Maps an immutable published checkpoint to the existing public renderer contract. */
export function publishedSiteConfigFromSnapshot(
  tenantId: string,
  liveSettings: SiteSettings,
  snapshot: WebsiteSnapshot
): PublishedSiteConfig | null {
  if (
    snapshot.schemaVersion !== 1 ||
    snapshot.tenantId !== tenantId ||
    !Array.isArray(snapshot.pages)
  )
    return null

  const settings = {
    ...liveSettings,
    ...(snapshot.settings as Partial<SiteSettings>),
    tenant_id: tenantId,
    // Publication state and domain routing remain operational controls.
    is_published: liveSettings.is_published,
    custom_domain: liveSettings.custom_domain,
    subdomain: liveSettings.subdomain,
    domain_type: liveSettings.domain_type,
  } as SiteSettings

  const pages = snapshot.pages
    .filter((page) => page.status !== 'archived')
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(
      (page) =>
        ({
          ...page,
          tenant_id: tenantId,
          status: 'published',
          sections: page.sections
            .filter((section) => section.is_visible !== false)
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((section) => ({ ...section, tenant_id: tenantId, page_id: page.id })),
        }) as unknown as SitePage & { sections: SiteSection[] }
    )

  const navigation = snapshot.navigation
    .filter((item) => item.is_visible !== false)
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
    .map(
      (item) =>
        ({
          ...item,
          tenant_id: tenantId,
          href: typeof item.href === 'string' ? item.href : String(item.url ?? '/'),
          location: item.location === 'footer' ? 'footer' : 'header',
          is_visible: true,
        }) as SiteNavigationItem
    )

  return {
    tenant_id: tenantId,
    settings,
    pages,
    navigation: {
      header: navigation.filter((item) => item.location === 'header'),
      footer: navigation.filter((item) => item.location === 'footer'),
    },
    theme: normalizeTheme(settings),
  }
}
