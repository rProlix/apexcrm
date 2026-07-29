import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import {
  filterCommandResults,
  getCommandNavigation,
  isRecordTypeAvailable,
  normalizeCommandQuery,
} from '@/lib/command-center/experience'

const modules = [
  { key: 'vehicles', label: 'Fleet', href: '/dashboard/vehicles' },
  { key: 'damage_ai', label: 'Van Damage AI', href: '/dashboard/damage-ai' },
]

test('command center exposes only active module navigation and role-safe actions', () => {
  const staffResults = getCommandNavigation({
    modules,
    role: 'staff',
    isPlatformAdmin: false,
    commandCenter: {
      inbox: true,
      activity: true,
      reports: false,
      setup: false,
      notifications: false,
    },
  })
  assert.ok(staffResults.some((result) => result.id === 'module:vehicles'))
  assert.ok(staffResults.some((result) => result.id === 'module:damage_ai'))
  assert.equal(
    staffResults.some((result) => result.id === 'owner:packages'),
    false
  )
  assert.equal(
    staffResults.some((result) => result.id === 'settings'),
    false
  )
  assert.equal(
    staffResults.some((result) => result.id === 'action:invite-customer'),
    false
  )

  const ownerResults = getCommandNavigation({
    modules,
    role: 'owner',
    isPlatformAdmin: true,
    commandCenter: {
      inbox: true,
      activity: true,
      reports: true,
      setup: true,
      notifications: true,
    },
  })
  assert.ok(ownerResults.some((result) => result.id === 'owner:packages'))
  assert.ok(ownerResults.some((result) => result.id === 'settings'))
})

test('command search normalization is bounded and matching is case-insensitive', () => {
  assert.equal(normalizeCommandQuery(`  Van \n ${'x'.repeat(100)}  `).length, 80)
  const results = filterCommandResults(
    getCommandNavigation({
      modules,
      role: 'staff',
      isPlatformAdmin: false,
      commandCenter: {
        inbox: true,
        activity: false,
        reports: false,
        setup: false,
        notifications: false,
      },
    }),
    'vAn DAMAGE'
  )
  assert.deepEqual(
    results.map((result) => result.id),
    ['module:damage_ai']
  )
})

test('record availability follows active modules and customer permissions', () => {
  assert.equal(isRecordTypeAvailable('vehicle', ['vehicles'], 'staff'), true)
  assert.equal(isRecordTypeAvailable('vehicle', ['damage_ai'], 'staff'), false)
  assert.equal(isRecordTypeAvailable('inspection', ['damage_ai'], 'staff'), true)
  assert.equal(isRecordTypeAvailable('maintenance', ['vehicles'], 'staff'), false)
  assert.equal(isRecordTypeAvailable('customer', ['customers'], 'customer'), false)
})

test('remote search and Quick Peek are tenant scoped, module gated, and provider neutral', async () => {
  const [search, peek, searchRoute, peekRoute] = await Promise.all([
    source('lib/command-center/search.ts'),
    source('lib/command-center/quickPeek.ts'),
    source('app/api/command-center/search/route.ts'),
    source('app/api/command-center/quick-peek/route.ts'),
  ])
  assert.ok((search.match(/\.eq\('tenant_id', context\.tenantId\)/g) ?? []).length >= 7)
  assert.ok((peek.match(/\.eq\('tenant_id', context\.tenantId\)/g) ?? []).length >= 7)
  assert.match(search, /isRecordTypeAvailable/)
  assert.match(peek, /assertActiveModule/)
  assert.match(searchRoute, /requireCommandCenterContext\('view_dashboard'\)/)
  assert.match(peekRoute, /requireCommandCenterContext\('view_dashboard'\)/)
  assert.doesNotMatch(`${search}\n${peek}`, /\b(ai_model|provider|raw_response|input_summary)\b/i)
})

test('natural-language companion is tenant scoped, module gated, and available from command search', async () => {
  const [assistant, route, commandCenter] = await Promise.all([
    source('lib/command-center/ai.ts'),
    source('app/api/command-center/ai/route.ts'),
    source('components/command-center/GlobalCommandCenter.tsx'),
  ])
  assert.match(assistant, /requireCommandCenterContext\('use_modules'\)/)
  assert.match(assistant, /assertActiveModule\(context, 'damage_ai'\)/)
  assert.ok((assistant.match(/\.eq\('tenant_id', context\.tenantId\)/g) ?? []).length >= 2)
  assert.match(assistant, /loadInspectionCompliance\(context/)
  assert.match(route, /requestCommandAssistant/)
  assert.match(route, /typeof body\.query === 'string'/)
  assert.match(commandCenter, /Ask Nexora companion/)
  assert.match(commandCenter, /JSON\.stringify\(\{ query: question \}\)/)
  assert.doesNotMatch(commandCenter, /\bgemini\b/i)
})

test('global topbar menus render above page content without clipping', async () => {
  const [globals, topbar, commandCenter] = await Promise.all([
    source('app/globals.css'),
    source('components/shell/TopBar.tsx'),
    source('components/command-center/GlobalCommandCenter.tsx'),
  ])
  assert.match(globals, /--z-sticky:\s*20;/)
  assert.match(globals, /--z-popover:\s*70;/)
  assert.match(globals, /--z-modal:\s*80;/)
  assert.match(globals, /\.crm-topbar\s*\{[\s\S]*z-index:\s*var\(--z-popover\);/)
  assert.match(globals, /\.crm-topbar\s*\{[\s\S]*overflow:\s*visible;/)
  assert.match(globals, /\.crm-popover\s*\{[\s\S]*z-index:\s*var\(--z-modal\);/)
  assert.doesNotMatch(topbar, /crm-topbar[^'"]*z-20/)
  assert.doesNotMatch(topbar, /crm-popover[^'"]*z-50/)
  assert.match(commandCenter, /z-\[var\(--z-modal\)\]/)
})

test('one global realtime channel serves active modules without exposing row payloads', async () => {
  const files = await readCodeFiles(path.join(process.cwd(), 'components'))
  const contents = await Promise.all(files.map((file) => readFile(file, 'utf8')))
  const joined = contents.join('\n')
  assert.equal((joined.match(/\.channel\(/g) ?? []).length, 1)

  const provider = await source('components/command-center/OperationsRealtimeProvider.tsx')
  assert.match(provider, /activeModuleKeys/)
  assert.match(provider, /filter: `tenant_id=eq\.\$\{tenantId\}`/)
  assert.match(provider, /SafeOperationEvent/)
  assert.doesNotMatch(provider, /\b(payload|record|old_record|new_record)\b/)
})

test('focus mode advances only after confirmed terminal status and core workflows avoid prompts', async () => {
  const [focus, statusControls, setup, maintenance] = await Promise.all([
    source('components/command-center/ActionInboxWorkspace.tsx'),
    source('components/command-center/ActionStatusControls.tsx'),
    source('components/command-center/SetupStepActions.tsx'),
    source('components/maintenance/MaintenanceWorkspace.tsx'),
  ])
  assert.match(focus, /status !== 'resolved' && status !== 'dismissed'/)
  assert.match(focus, /onConfirmed/)
  assert.match(statusControls, /await updateActionItemStatus/)
  assert.doesNotMatch(`${focus}\n${statusControls}\n${setup}\n${maintenance}`, /\bwindow\.prompt\(/)
})

async function source(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), 'utf8')
}

async function readCodeFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name)
      if (entry.isDirectory()) return readCodeFiles(fullPath)
      return entry.isFile() && /\.(tsx?|jsx?)$/.test(entry.name) ? [fullPath] : []
    })
  )
  return nested.flat()
}
