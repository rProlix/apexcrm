import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { canRoleSeeAction, filterAndSortActionItems } from '@/lib/command-center/actionPolicy'
import { filterActivityItems } from '@/lib/command-center/activityPolicy'
import { getModuleAssistantQuestions } from '@/lib/command-center/assistantPolicy'
import {
  normalizeAssistantQuestion,
  resolveCommandAssistantIntent,
} from '@/lib/command-center/assistantIntent'
import { getAvailableNotificationEvents } from '@/lib/command-center/notificationPolicy'
import { canEditNote, isNoteEntityType, NOTE_ENTITY_TYPES } from '@/lib/command-center/notePolicy'
import { getAvailableReports, renderReportCsv, renderReportPdf } from '@/lib/command-center/reports'
import { evaluateSetupStatus, setupDefinitionIsActive } from '@/lib/command-center/setupPolicy'
import { formatInTenantTime, getTenantDateRange } from '@/lib/command-center/time'
import {
  damageEvidenceFromMetadata,
  damageEvidenceMetadata,
  damageEvidenceToQuickPeekMedia,
} from '@/lib/command-center/evidence'
import type { ActionItem, ActivityItem } from '@/lib/command-center/types'

const actionBase: ActionItem = {
  id: 'action-1',
  tenantId: 'tenant-a',
  moduleKey: 'maintenance',
  sourceRecordType: 'maintenance_item',
  sourceRecordId: 'record-1',
  sourceRecordLabel: 'Van 64',
  actionType: 'maintenance_urgent',
  title: 'Urgent maintenance for Van 64',
  description: 'A tire issue needs attention.',
  priority: 'urgent',
  status: 'open',
  assignedUserId: 'user-a',
  assignedRole: 'staff',
  dueAt: '2026-07-23T10:00:00.000Z',
  firstDetectedAt: '2026-07-22T10:00:00.000Z',
  latestActivityAt: '2026-07-23T09:00:00.000Z',
  resolvedAt: null,
  dismissedAt: null,
  snoozedUntil: null,
  href: '/dashboard/vehicles/maintenance?itemId=record-1',
}

test('action inbox search is case-insensitive and priority sorting is deterministic', () => {
  const normal: ActionItem = {
    ...actionBase,
    id: 'action-2',
    title: 'Review inspection',
    sourceRecordLabel: 'Van 12',
    priority: 'normal',
    assignedUserId: null,
  }
  const result = filterAndSortActionItems(
    [normal, actionBase],
    { search: 'vAn', status: 'open', sort: 'priority' },
    'user-a',
    new Date('2026-07-24T12:00:00.000Z')
  )
  assert.deepEqual(
    result.map((item) => item.id),
    ['action-1', 'action-2']
  )
})

test('action inbox assigned-to-me and overdue filters use authoritative fields', () => {
  const other = { ...actionBase, id: 'action-2', assignedUserId: 'user-b' }
  const result = filterAndSortActionItems(
    [actionBase, other],
    { assignedToMe: true, overdue: true },
    'user-a',
    new Date('2026-07-24T12:00:00.000Z')
  )
  assert.deepEqual(
    result.map((item) => item.id),
    ['action-1']
  )
})

test('action inbox review and source filters compose', () => {
  const review = {
    ...actionBase,
    actionType: 'inspection_needs_review',
    sourceRecordType: 'inspection',
  }
  const result = filterAndSortActionItems(
    [review, actionBase],
    { needsReview: true, sourceType: 'inspection' },
    'user-a'
  )
  assert.deepEqual(
    result.map((item) => item.id),
    ['action-1']
  )
})

test('staff cannot see admin-assigned or another user’s action', () => {
  assert.equal(canRoleSeeAction(actionBase, 'user-a', 'staff'), true)
  assert.equal(canRoleSeeAction(actionBase, 'user-b', 'staff'), false)
  assert.equal(
    canRoleSeeAction(
      { ...actionBase, assignedUserId: null, assignedRole: 'admin' },
      'user-a',
      'staff'
    ),
    false
  )
  assert.equal(canRoleSeeAction(actionBase, 'admin-user', 'admin'), true)
})

test('setup state is derived from live facts and optional dismissals cannot hide required work', () => {
  assert.equal(
    evaluateSetupStatus({
      required: true,
      complete: false,
      blocked: false,
      inProgress: false,
      previouslyDismissed: true,
    }),
    'not_started'
  )
  assert.equal(
    evaluateSetupStatus({
      required: false,
      complete: false,
      blocked: false,
      inProgress: false,
      previouslyDismissed: true,
    }),
    'dismissed'
  )
  assert.equal(
    evaluateSetupStatus({
      required: true,
      complete: true,
      blocked: true,
      inProgress: false,
    }),
    'complete'
  )
})

test('setup module policy hides inactive module steps and preserves fleet dependencies', () => {
  assert.equal(setupDefinitionIsActive('appointments', ['appointments', 'payments']), true)
  assert.equal(setupDefinitionIsActive('store', ['appointments', 'payments']), false)
  assert.equal(setupDefinitionIsActive('vehicles', ['damage_ai', 'maintenance']), true)
  assert.equal(setupDefinitionIsActive('core', []), true)
})

test('activity feed search and module filter are case-insensitive and newest-first', () => {
  const items: ActivityItem[] = [
    activity('one', 'maintenance', 'Jordan completed Van 64 maintenance', '2026-07-24T09:00:00Z'),
    activity('two', 'appointments', 'Maria changed availability', '2026-07-24T10:00:00Z'),
  ]
  assert.deepEqual(
    filterActivityItems(items, { search: 'JORDAN', module: 'maintenance' }).map((item) => item.id),
    ['one']
  )
  assert.deepEqual(
    filterActivityItems(items, {}).map((item) => item.id),
    ['two', 'one']
  )
})

test('notification events and AI assistants are active-module aware', () => {
  const events = getAvailableNotificationEvents(['appointments', 'payments'])
  assert.ok(events.some((item) => item.moduleKey === 'appointments'))
  assert.ok(events.some((item) => item.moduleKey === 'payments'))
  assert.ok(events.some((item) => item.moduleKey === 'core'))
  assert.equal(
    events.some((item) => item.moduleKey === 'maintenance'),
    false
  )

  const assistants = getModuleAssistantQuestions(['maintenance'])
  assert.deepEqual(
    assistants.map((item) => item.moduleKey),
    ['maintenance']
  )
})

test('natural-language companion recognizes review and missing-inspection requests', () => {
  assert.deepEqual(
    resolveCommandAssistantIntent('Find me vans that have not been reviewed yet', {
      now: new Date('2026-07-28T18:00:00.000Z'),
      timeZone: 'America/Los_Angeles',
    }),
    { type: 'unreviewed_vans' }
  )
  assert.deepEqual(
    resolveCommandAssistantIntent('Show vans missing an inspection for yesterday', {
      now: new Date('2026-07-28T18:00:00.000Z'),
      timeZone: 'America/Los_Angeles',
    }),
    {
      type: 'missing_inspections',
      date: '2026-07-27',
      dateLabel: 'yesterday',
    }
  )
})

test('companion input is bounded and unknown language safely uses grounded assistance', () => {
  assert.equal(
    resolveCommandAssistantIntent('Help me understand today’s operations', {
      timeZone: 'America/Los_Angeles',
    }).type,
    'general'
  )
  assert.equal(normalizeAssistantQuestion(`  show   me ${'vans '.repeat(200)}`).length, 500)
})

test('report registry returns only active, role-permitted reports', () => {
  const adminReports = getAvailableReports(['store', 'payments'], 'admin')
  assert.ok(adminReports.some((report) => report.moduleKey === 'store'))
  assert.ok(adminReports.some((report) => report.moduleKey === 'payments'))
  assert.equal(
    adminReports.some((report) => report.moduleKey === 'damage_ai'),
    false
  )
  assert.equal(getAvailableReports(['store'], 'staff').length, 0)
  assert.equal(getAvailableReports(['store'], 'customer').length, 0)
})

test('fleet reports use business-scoped operational sources and readable vehicle labels', async () => {
  const reports = await readFile(path.join(process.cwd(), 'lib/command-center/reports.ts'), 'utf8')
  assert.match(reports, /customLoad: loadFleetWeeklyInspectionsReport/)
  assert.match(reports, /customLoad: loadFleetDamageByVanReport/)
  assert.match(reports, /customLoad: loadFleetMaintenanceCostReport/)
  assert.match(reports, /customLoad: loadFleetDriverUploadHistoryReport/)
  assert.match(reports, /\.from\('van_damage_cases'\)/)
  assert.match(reports, /\.from\('van_damage_observations'\)/)
  assert.doesNotMatch(reports, /fleet_damage_by_van[\s\S]*table: 'van_damage_items'/)
  assert.match(reports, /\.gte\('updated_at', range\.startIso\)/)
  assert.match(reports, /\.gte\('latest_activity_at', range\.startIso\)/)
  assert.match(reports, /loadInspectionImageCounts\(context, inspectionIds\)/)
  assert.match(reports, /loadInspectionDamageCounts\(context, inspectionIds\)/)
  assert.match(reports, /loadSessionImageCounts/)
  assert.ok((reports.match(/\.eq\('business_id', context\.tenantId\)/g) ?? []).length >= 4)
  assert.match(reports, /\.from\('vehicles'\)/)
  assert.match(reports, /Van \$\{vanNumber\}/)
  assert.match(reports, /\.from\('van_damage_upload_sessions'\)/)
  assert.match(reports, /formatDriverName\(asRecord\(row\.driver_snapshot\)\)/)
})

test('CSV and PDF report renderers produce downloadable file signatures', () => {
  const data = {
    summary: [{ label: 'Orders', value: 1 }],
    columns: [
      { key: 'order', label: 'Order' },
      { key: 'total', label: 'Total' },
    ],
    rows: [{ order: 'A-100', total: '$25.00' }],
    emptyMessage: 'No orders.',
  }
  const csv = new TextDecoder().decode(renderReportCsv(data))
  assert.match(csv, /"Order","Total"/)
  assert.match(csv, /"A-100","\$25.00"/)

  const pdf = renderReportPdf({
    tenantName: 'Tenant A',
    reportName: 'Sales',
    dateFrom: '2026-07-01',
    dateTo: '2026-07-24',
    generatedAt: 'Jul 24, 2026',
    generatedBy: 'admin@example.com',
    data,
  })
  assert.equal(new TextDecoder().decode(pdf.slice(0, 8)), '%PDF-1.4')
  assert.ok(pdf.byteLength > 500)
})

test('universal note entity types are controlled and edit permissions are role-aware', () => {
  assert.equal(isNoteEntityType('vehicle'), true)
  assert.equal(isNoteEntityType('users'), false)
  assert.equal(new Set(NOTE_ENTITY_TYPES).size, NOTE_ENTITY_TYPES.length)
  assert.equal(canEditNote('staff', 'author', 'author'), true)
  assert.equal(canEditNote('staff', 'other', 'author'), false)
  assert.equal(canEditNote('admin', 'other', 'author'), true)
  assert.equal(canEditNote('customer', 'author', 'author'), false)
})

test('tenant date range respects daylight saving time', () => {
  const spring = getTenantDateRange('2026-03-08', '2026-03-08', 'America/Los_Angeles')
  const fall = getTenantDateRange('2026-11-01', '2026-11-01', 'America/Los_Angeles')
  assert.equal(
    (new Date(spring.endIso).getTime() - new Date(spring.startIso).getTime()) / 3_600_000,
    23
  )
  assert.equal(
    (new Date(fall.endIso).getTime() - new Date(fall.startIso).getTime()) / 3_600_000,
    25
  )
})

test('tenant time formatting supports dateStyle and timeStyle without conflicting options', () => {
  assert.doesNotThrow(() =>
    formatInTenantTime('2026-07-24T12:00:00.000Z', 'America/Los_Angeles', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  )
})

test('customer-facing command-center UI is provider-neutral', async () => {
  const roots = [
    path.join(process.cwd(), 'components/command-center'),
    path.join(process.cwd(), 'app/(dashboard)/actions'),
    path.join(process.cwd(), 'app/(dashboard)/reports'),
    path.join(process.cwd(), 'app/(dashboard)/notifications'),
    path.join(process.cwd(), 'app/(dashboard)/setup'),
  ]
  const files = (await Promise.all(roots.map(readTsxFiles))).flat()
  const contents = await Promise.all(files.map((file) => readFile(file, 'utf8')))
  assert.equal(/\bgemini\b/i.test(contents.join('\n')), false)
})

test('damage evidence metadata carries private image references without raw URLs', () => {
  const metadata = damageEvidenceMetadata({
    imageId: 'image-1',
    businessId: 'business-1',
    alt: 'Inspection photo',
    caption: 'driver side',
  })

  assert.deepEqual(damageEvidenceFromMetadata(metadata), {
    imageId: 'image-1',
    businessId: 'business-1',
    alt: 'Inspection photo',
    caption: 'driver side',
  })
  assert.deepEqual(damageEvidenceToQuickPeekMedia(damageEvidenceFromMetadata(metadata)), [
    {
      kind: 'damage_image',
      imageId: 'image-1',
      businessId: 'business-1',
      alt: 'Inspection photo',
      caption: 'driver side',
    },
  ])
  assert.equal(JSON.stringify(metadata).includes('https://'), false)
  assert.equal(damageEvidenceFromMetadata({ evidence_image_id: 'image-1' }), null)
})

test('command-center damage previews use signed image rendering', async () => {
  const [quickPeek, actionInbox, quickPeekLoader, actionLoader] = await Promise.all([
    readFile(path.join(process.cwd(), 'components/command-center/QuickPeek.tsx'), 'utf8'),
    readFile(
      path.join(process.cwd(), 'components/command-center/ActionInboxWorkspace.tsx'),
      'utf8'
    ),
    readFile(path.join(process.cwd(), 'lib/command-center/quickPeek.ts'), 'utf8'),
    readFile(path.join(process.cwd(), 'lib/command-center/actions.ts'), 'utf8'),
  ])

  assert.match(quickPeek, /SignedDamageImage/)
  assert.match(actionInbox, /SignedDamageImage/)
  assert.match(quickPeekLoader, /loadInspectionEvidenceImage/)
  assert.match(actionLoader, /damageEvidenceMetadata/)
  assert.doesNotMatch(quickPeek, /slack_file_url/)
  assert.doesNotMatch(actionInbox, /slack_file_url/)
})

test('command-center migration enables RLS on every new tenant table', async () => {
  const sql = await readFile(
    path.join(process.cwd(), 'supabase/migrations/20260724120000_command_center.sql'),
    'utf8'
  )
  for (const table of [
    'command_action_items',
    'command_setup_steps',
    'command_report_runs',
    'universal_notes',
    'universal_note_attachments',
    'notification_rules',
    'notifications',
  ]) {
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, 'i'))
  }
  assert.match(sql, /command_is_tenant_member\(tenant_id\)/)
  assert.match(sql, /command_has_active_module\(tenant_id, ARRAY\[module_key\]\)/)
  assert.match(sql, /command_note_entity_belongs_to_tenant\(tenant_id, entity_type, entity_id\)/)
})

function activity(id: string, moduleKey: string, title: string, occurredAt: string): ActivityItem {
  return {
    id,
    moduleKey,
    actor: title.split(' ')[0],
    actorRole: 'staff',
    actionType: 'updated',
    sourceRecordType: null,
    sourceRecordId: null,
    title,
    description: title,
    href: null,
    occurredAt,
    visibility: 'staff',
  }
}

async function readTsxFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name)
      if (entry.isDirectory()) return readTsxFiles(fullPath)
      return entry.isFile() && /\.(tsx?|jsx?)$/.test(entry.name) ? [fullPath] : []
    })
  )
  return nested.flat()
}
