import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { getBrandInitials, hasValidLogoSignature } from '@/lib/design-system/workspaceBranding'

test('workspace initials provide a business-specific fallback', () => {
  assert.equal(getBrandInitials('North Coast Logistics'), 'NL')
  assert.equal(getBrandInitials('Solace'), 'SO')
  assert.equal(getBrandInitials('  '), 'WS')
})

test('logo uploads verify file signatures instead of trusting browser MIME labels', () => {
  assert.equal(
    hasValidLogoSignature(
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      'image/png'
    ),
    true
  )
  assert.equal(
    hasValidLogoSignature(new TextEncoder().encode('<script>alert(1)</script>'), 'image/png'),
    false
  )
  assert.equal(hasValidLogoSignature(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg'), true)
})

test('the launch screen is tenant-owned instead of platform-branded', async () => {
  const [rootLayout, dashboardShell, launchScreen, skeleton] = await Promise.all([
    readFile(path.join(process.cwd(), 'app/layout.tsx'), 'utf8'),
    readFile(path.join(process.cwd(), 'components/dashboard/DashboardShell.tsx'), 'utf8'),
    readFile(path.join(process.cwd(), 'components/ui/AppLaunchScreen.tsx'), 'utf8'),
    readFile(path.join(process.cwd(), 'components/ui/Skeleton.tsx'), 'utf8'),
  ])

  assert.doesNotMatch(rootLayout, /<AppLaunchScreen/)
  assert.match(
    dashboardShell,
    /<AppLaunchScreen tenantName=\{tenantName\} logoUrl=\{tenantLogoUrl\}/
  )
  assert.match(launchScreen, /aria-label=\{`\$\{visibleName\} is preparing your workspace`\}/)
  assert.match(launchScreen, /className="app-launch-logo"/)
  assert.match(launchScreen, /getBrandInitials\(visibleName\)/)
  assert.doesNotMatch(launchScreen, /NexoraNow|Nexora|app-launch-mark-letter">N</)
  assert.doesNotMatch(skeleton, /ApexCRM|Loading ApexCRM/)
})

test('business logo upload is tenant-scoped and updates workspace branding', async () => {
  const [settings, uploadRoute, documentBranding, shell] = await Promise.all([
    readFile(path.join(process.cwd(), 'components/settings/SettingsClient.tsx'), 'utf8'),
    readFile(path.join(process.cwd(), 'app/api/settings/branding/logo/route.ts'), 'utf8'),
    readFile(path.join(process.cwd(), 'components/shell/WorkspaceDocumentBranding.tsx'), 'utf8'),
    readFile(path.join(process.cwd(), 'components/dashboard/DashboardShell.tsx'), 'utf8'),
  ])

  assert.match(settings, /type="file"/)
  assert.match(settings, /accept="image\/png,image\/jpeg,image\/webp"/)
  assert.match(settings, /\/api\/settings\/branding\/logo/)
  assert.match(uploadRoute, /\['owner', 'admin'\]\.includes\(ctx\.role\)/)
  assert.match(uploadRoute, /STORAGE_BUCKETS\.BRAND_ASSETS/)
  assert.match(uploadRoute, /hasValidLogoSignature/)
  assert.match(uploadRoute, /tenantId: ctx\.tenant_id/)
  assert.match(uploadRoute, /logo_storage_path/)
  assert.match(documentBranding, /document\.title = `\$\{tenantName\} Workspace`/)
  assert.match(documentBranding, /link\[rel~='icon'\]/)
  assert.match(shell, /faviconUrl=\{tenantFaviconUrl \?\? tenantLogoUrl\}/)
})
