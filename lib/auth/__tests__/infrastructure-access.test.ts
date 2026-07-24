import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('infrastructure navigation, page, and API use the platform-owner boundary', async () => {
  const [sidebar, page, api] = await Promise.all([
    readFile(new URL('../../../components/shell/Sidebar.tsx', import.meta.url), 'utf8'),
    readFile(
      new URL('../../../app/(dashboard)/owner/infrastructure/page.tsx', import.meta.url),
      'utf8'
    ),
    readFile(new URL('../../../app/api/van-damage/health/route.ts', import.meta.url), 'utf8'),
  ])
  assert.match(sidebar, /isOwner &&/)
  assert.match(sidebar, /Infrastructure Configuration/)
  assert.match(page, /requirePlatformOwner/)
  assert.match(api, /resolvePlatformOwnerAccess/)
  assert.doesNotMatch(api, /\['owner', 'admin'\]/)
})

test('owner infrastructure status is redacted before it reaches the browser', async () => {
  const source = await readFile(
    new URL('../../server/infrastructure/status.ts', import.meta.url),
    'utf8'
  )
  assert.match(source, /getRedactedInfrastructureStatus/)
  assert.doesNotMatch(source, /process\.env\[[^\]]+\]/)
  assert.doesNotMatch(source, /serviceRoleKey|clientSecret|signingSecret|apiKey/)
})
