import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import {
  colorContrast,
  deriveBrandColorRoles,
  ensureColorContrast,
} from '@/lib/design-system/colorTheory'
import { normalizeTheme } from '@/lib/website/normalizeTheme'
import { resolveWebsitePresentation } from '@/lib/website/resolveWebsitePresentation'
import type { SiteSettings } from '@/lib/website/types'

test('brand roles retain the anchor while meeting text and UI contrast requirements', () => {
  for (const [primary, canvas] of [
    ['#facc15', '#ffffff'],
    ['#6d28d9', '#08080a'],
    ['#22c55e', '#f8fafc'],
    ['#0f172a', '#ffffff'],
  ]) {
    const roles = deriveBrandColorRoles(primary, canvas)
    assert.equal(roles.primary, primary)
    assert.ok(colorContrast(roles.primaryForeground, roles.primary) >= 4.5)
    assert.ok(colorContrast(roles.focus, canvas) >= 3)
    assert.ok(colorContrast(roles.link, canvas) >= 4.5)
    assert.equal(roles.scale[500], primary)
    assert.notEqual(roles.primaryHover, roles.primary)
    assert.notEqual(roles.primaryActive, roles.primaryHover)
  }
})

test('contrast correction is deterministic for light and dark canvases', () => {
  assert.ok(colorContrast(ensureColorContrast('#facc15', '#ffffff'), '#ffffff') >= 4.5)
  assert.ok(colorContrast(ensureColorContrast('#172554', '#08080a'), '#08080a') >= 4.5)
})

test('legacy website themes receive complete accessible semantic color roles', () => {
  const settings = {
    brand_colors: {
      primary: '#facc15',
      accent: '#fb7185',
      background: '#ffffff',
      surface: '#f8fafc',
      text: '#e2e8f0',
      muted: '#64748b',
      border: '#e2e8f0',
    },
    fonts: { heading: 'Inter', body: 'Inter' },
    theme: { mode: 'light' },
  } as unknown as SiteSettings

  const theme = normalizeTheme(settings)
  assert.ok(colorContrast(theme.primaryForeground, theme.primaryColor) >= 4.5)
  assert.ok(colorContrast(theme.textColor, theme.backgroundColor) >= 4.5)
  assert.ok(colorContrast(theme.linkColor, theme.backgroundColor) >= 4.5)
})

test('builder, historical, and published sites share the same presentation resolver', async () => {
  const [preview, versionPreview, published] = await Promise.all([
    readFile(path.join(process.cwd(), 'app/preview/[tenantId]/page.tsx'), 'utf8'),
    readFile(
      path.join(process.cwd(), 'app/(dashboard)/website/versions/[versionId]/preview/page.tsx'),
      'utf8'
    ),
    readFile(path.join(process.cwd(), 'app/sites/[tenant]/layout.tsx'), 'utf8'),
  ])
  assert.match(preview, /resolveWebsitePresentation\(config\.settings\)/)
  assert.match(versionPreview, /resolveWebsitePresentation\(snapshot\.settings/)
  assert.match(published, /resolveWebsitePresentation\(config\.settings\)/)

  const settings = {
    brand_colors: {
      primary: '#38bdf8',
      accent: '#a78bfa',
      background: '#020617',
      surface: '#0f172a',
      text: '#f8fafc',
      muted: '#94a3b8',
      border: '#334155',
    },
    fonts: { heading: 'Inter', body: 'Inter' },
    theme: { mode: 'dark' },
  } as unknown as SiteSettings
  const presentation = resolveWebsitePresentation(settings)
  const vars = presentation.cssVars as Record<string, string>
  assert.equal(vars['--color-primary'], '#38bdf8')
  assert.ok(colorContrast(vars['--color-primary-foreground'], vars['--color-primary']) >= 4.5)
  assert.ok(colorContrast(vars['--color-focus'], vars['--color-bg']) >= 3)
})

test('CRM legacy gold utilities resolve through the tenant color scale', async () => {
  const config = await readFile(path.join(process.cwd(), 'tailwind.config.ts'), 'utf8')
  assert.match(config, /gold:[\s\S]*--tenant-accent-50-rgb/)
  assert.match(config, /--tenant-accent-900-rgb/)
  assert.match(config, /gold-gradient[\s\S]*--tenant-accent-500-rgb/)
})
