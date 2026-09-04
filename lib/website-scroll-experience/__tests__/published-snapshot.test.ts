import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { publishedSiteConfigFromSnapshot } from '@/lib/website/publishedSnapshot'
import type { SiteSettings } from '@/lib/website/types'
import type { WebsiteSnapshot } from '@/lib/website/versionTypes'

const tenantId = '11111111-1111-4111-8111-111111111111'
const settings = {
  tenant_id: tenantId,
  is_published: true,
  custom_domain: 'example.test',
  subdomain: 'sample',
  domain_type: 'custom',
  theme: {},
} as SiteSettings

test('public config renders immutable snapshot content instead of mutable draft rows', () => {
  const snapshot = {
    schemaVersion: 1,
    tenantId,
    capturedAt: '2026-09-03T00:00:00.000Z',
    settings: { site_name: 'Published name', custom_domain: 'stale.example' },
    navigation: [
      { id: 'nav', label: 'Contact', url: '/contact', location: 'header', is_visible: true },
    ],
    pages: [
      {
        id: 'page',
        slug: '',
        title: 'Home',
        meta_description: null,
        page_type: 'home',
        status: 'draft',
        sort_order: 0,
        seo: {},
        sections: [
          {
            id: 'section',
            section_type: 'scroll_experience',
            section_key: 'cinematic',
            sort_order: 0,
            content: { headline: 'Published cinematic copy' },
            style_config: null,
            animation_config: null,
            is_visible: true,
            created_at: '2026-09-03T00:00:00.000Z',
            updated_at: '2026-09-03T00:00:00.000Z',
          },
        ],
      },
    ],
  } satisfies WebsiteSnapshot

  const config = publishedSiteConfigFromSnapshot(tenantId, settings, snapshot)
  assert.equal(config?.pages[0]?.status, 'published')
  assert.equal(
    (config?.pages[0]?.sections[0]?.content as Record<string, unknown>)?.headline,
    'Published cinematic copy'
  )
  assert.equal(config?.navigation.header[0]?.href, '/contact')
  assert.equal(config?.settings.custom_domain, 'example.test')
})

test('snapshot mapping rejects a cross-tenant checkpoint', () => {
  assert.equal(
    publishedSiteConfigFromSnapshot(tenantId, settings, {
      schemaVersion: 1,
      tenantId: '22222222-2222-4222-8222-222222222222',
      capturedAt: '2026-09-03T00:00:00.000Z',
      settings: {},
      navigation: [],
      pages: [],
    }),
    null
  )
})

test('legacy cinematic compatibility is bounded to published snapshot pages and READY media', () => {
  const loader = readFileSync('lib/website/getPublishedSiteConfig.ts', 'utf8')
  const binding = readFileSync('lib/website-scroll-experience/public-binding.ts', 'utf8')
  assert.match(loader, /mergePublishedCinematicCompatibility/)
  assert.match(loader, /\.eq\('section_type', 'scroll_experience'\)/)
  assert.match(loader, /\.eq\('status', 'READY'\)/)
  assert.match(loader, /\.in\('id', snapshotPageIds\)/)
  assert.match(binding, /Transitional compatibility/)
  assert.match(binding, /\.in\('id', snapshotPageIds\)/)
  assert.match(binding, /\.eq\('status', 'published'\)/)
})
