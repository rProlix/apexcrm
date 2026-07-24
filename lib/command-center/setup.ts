import 'server-only'

import { revalidatePath } from 'next/cache'
import { hasPermission } from '@/lib/auth/permissions'
import { recordCommandAudit } from './audit'
import { isTenantAdmin, requireCommandCenterContext, type CommandCenterContext } from './context'
import type { SetupChecklistItem, SetupStatus } from './types'
import { evaluateSetupStatus } from './setupPolicy'

export interface SetupFacts {
  staffCount: number
  vehicleCount: number
  vehicleImageCount: number
  inspectionCount: number
  slackConnected: boolean
  inspectionChannelSelected: boolean
  maintenanceChannelSelected: boolean
  maintenanceCount: number
  appointmentCount: number
  appointmentServiceCount: number
  availabilityConfigured: boolean
  paymentProviderConnected: boolean
  productCount: number
  orderCount: number
  rewardProgramCount: number
  customerCount: number
  websitePageCount: number
  websitePublished: boolean
  domainConnected: boolean
}

interface SetupDefinition {
  moduleKey: string
  stepKey: string
  title: string
  description: string
  requiredPermission: string
  actionLabel: string
  actionHref: string
  required: boolean
  sortOrder: number
  complete: (facts: SetupFacts) => boolean
  inProgress?: (facts: SetupFacts) => boolean
  blocked?: (facts: SetupFacts) => string | null
}

export async function loadSetupChecklist(): Promise<{
  items: SetupChecklistItem[]
  completed: number
  required: number
  percent: number
  allRequiredComplete: boolean
}> {
  const context = await requireCommandCenterContext('view_dashboard')
  const facts = await loadSetupFacts(context)
  const definitions = buildSetupDefinitions(context.activeModuleSet, context.businessType).filter(
    (definition) => hasPermission(context.role, definition.requiredPermission)
  )

  const { data: saved, error } = await context.db
    .from('command_setup_steps')
    .select('*')
    .eq('tenant_id', context.tenantId)
  if (error) throw new Error(`Setup state could not be loaded: ${error.code}`)

  const savedByKey = new Map((saved ?? []).map((row) => [`${row.module_key}:${row.step_key}`, row]))
  const now = new Date().toISOString()
  const items: SetupChecklistItem[] = []

  for (const definition of definitions) {
    const key = `${definition.moduleKey}:${definition.stepKey}`
    const previous = savedByKey.get(key)
    const complete = definition.complete(facts)
    const blocker = definition.blocked?.(facts) ?? null
    const status = evaluateSetupStatus({
      required: definition.required,
      complete,
      blocked: Boolean(blocker),
      inProgress: definition.inProgress?.(facts) ?? false,
      previouslyDismissed: previous?.status === 'dismissed',
    })
    const completedAt = complete ? (previous?.completed_at ?? now) : null

    const { error: upsertError } = await context.db.from('command_setup_steps').upsert(
      {
        tenant_id: context.tenantId,
        module_key: definition.moduleKey,
        step_key: definition.stepKey,
        status,
        completed_at: completedAt,
        dismissed_at: status === 'dismissed' ? previous?.dismissed_at : null,
        dismissed_by: status === 'dismissed' ? previous?.dismissed_by : null,
        dismissal_reason: status === 'dismissed' ? previous?.dismissal_reason : null,
        last_evaluated_at: now,
        metadata: {},
      },
      { onConflict: 'tenant_id,module_key,step_key' }
    )
    if (upsertError) throw new Error(`Setup state could not be saved: ${upsertError.code}`)

    if (complete && previous?.status !== 'complete') {
      await recordCommandAudit({
        tenantId: context.tenantId,
        actorUserId: null,
        action: 'command_center.setup.completed',
        metadata: { module_key: definition.moduleKey, step_key: definition.stepKey },
      })
    }

    items.push({
      id: previous?.id ?? key,
      moduleKey: definition.moduleKey,
      stepKey: definition.stepKey,
      title: definition.title,
      description: definition.description,
      status,
      requiredPermission: definition.requiredPermission,
      actionLabel: definition.actionLabel,
      actionHref: definition.actionHref,
      required: definition.required,
      sortOrder: definition.sortOrder,
      completedAt,
      blocker: blocker ?? undefined,
    })
  }

  items.sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))
  const requiredItems = items.filter((item) => item.required)
  const completed = requiredItems.filter((item) => item.status === 'complete').length
  const required = requiredItems.length

  return {
    items,
    completed,
    required,
    percent: required === 0 ? 100 : Math.round((completed / required) * 100),
    allRequiredComplete: required === 0 || completed === required,
  }
}

export async function dismissOptionalSetupStep(input: {
  moduleKey: string
  stepKey: string
  reason?: string
}): Promise<void> {
  const context = await requireCommandCenterContext('view_modules')
  if (!isTenantAdmin(context.role)) throw new Error('Administrator access is required.')
  const definition = buildSetupDefinitions(context.activeModuleSet, context.businessType).find(
    (candidate) => candidate.moduleKey === input.moduleKey && candidate.stepKey === input.stepKey
  )
  if (!definition || definition.required) {
    throw new Error('Only optional setup steps can be dismissed.')
  }

  const now = new Date().toISOString()
  const { error } = await context.db.from('command_setup_steps').upsert(
    {
      tenant_id: context.tenantId,
      module_key: input.moduleKey,
      step_key: input.stepKey,
      status: 'dismissed',
      dismissed_at: now,
      dismissed_by: context.user.id,
      dismissal_reason: input.reason?.trim() || null,
      last_evaluated_at: now,
    },
    { onConflict: 'tenant_id,module_key,step_key' }
  )
  if (error) throw new Error(`Setup step could not be dismissed: ${error.code}`)

  await recordCommandAudit({
    tenantId: context.tenantId,
    actorUserId: context.user.id,
    action: 'command_center.setup.dismissed',
    metadata: {
      module_key: input.moduleKey,
      step_key: input.stepKey,
      reason: input.reason?.trim(),
    },
  })
  revalidatePath('/setup')
  revalidatePath('/dashboard')
}

export function resolveSetupItemsForFacts(input: {
  activeModuleKeys: string[]
  businessType?: string
  role: 'owner' | 'admin' | 'manager' | 'staff' | 'customer'
  facts: SetupFacts
}): SetupChecklistItem[] {
  return buildSetupDefinitions(new Set(input.activeModuleKeys), input.businessType ?? 'general')
    .filter((definition) => hasPermission(input.role, definition.requiredPermission))
    .map((definition) => {
      const blocker = definition.blocked?.(input.facts) ?? null
      const status: SetupStatus = evaluateSetupStatus({
        required: definition.required,
        complete: definition.complete(input.facts),
        blocked: Boolean(blocker),
        inProgress: definition.inProgress?.(input.facts) ?? false,
      })
      return {
        id: `${definition.moduleKey}:${definition.stepKey}`,
        moduleKey: definition.moduleKey,
        stepKey: definition.stepKey,
        title: definition.title,
        description: definition.description,
        status,
        requiredPermission: definition.requiredPermission,
        actionLabel: definition.actionLabel,
        actionHref: definition.actionHref,
        required: definition.required,
        sortOrder: definition.sortOrder,
        completedAt: null,
        blocker: blocker ?? undefined,
      }
    })
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

function buildSetupDefinitions(
  activeModules: Set<string>,
  businessType: string
): SetupDefinition[] {
  const definitions: SetupDefinition[] = []
  const hasFleet =
    activeModules.has('vehicles') ||
    activeModules.has('damage_ai') ||
    activeModules.has('maintenance')

  if (hasFleet) {
    definitions.push({
      moduleKey: 'vehicles',
      stepKey: 'add_vehicle',
      title: 'Add your first van',
      description: 'Create a vehicle profile so inspections and maintenance can be linked.',
      requiredPermission: 'use_modules',
      actionLabel: 'Add van',
      actionHref: '/dashboard/vehicles',
      required: true,
      sortOrder: 10,
      complete: (facts) => facts.vehicleCount > 0,
    })
  }
  if (activeModules.has('damage_ai')) {
    definitions.push(
      {
        moduleKey: 'damage_ai',
        stepKey: 'connect_slack',
        title: 'Connect Slack',
        description: 'Authorize the workspace that receives inspection images.',
        requiredPermission: 'view_modules',
        actionLabel: 'Connect Slack',
        actionHref: '/dashboard/damage-ai/settings/slack',
        required: true,
        sortOrder: 20,
        complete: (facts) => facts.slackConnected,
      },
      {
        moduleKey: 'damage_ai',
        stepKey: 'inspection_channel',
        title: 'Select an inspection image channel',
        description: 'Choose any joined Slack channel for incoming van images.',
        requiredPermission: 'view_modules',
        actionLabel: 'Choose channel',
        actionHref: '/dashboard/damage-ai/settings/slack',
        required: true,
        sortOrder: 30,
        complete: (facts) => facts.inspectionChannelSelected,
        blocked: (facts) => (facts.slackConnected ? null : 'Connect Slack first.'),
      },
      {
        moduleKey: 'damage_ai',
        stepKey: 'profile_image',
        title: 'Upload a van profile image',
        description: 'Give at least one van a reference image for reliable matching.',
        requiredPermission: 'use_modules',
        actionLabel: 'Open fleet',
        actionHref: '/dashboard/vehicles',
        required: true,
        sortOrder: 40,
        complete: (facts) => facts.vehicleImageCount > 0,
        blocked: (facts) => (facts.vehicleCount > 0 ? null : 'Add a van first.'),
      },
      {
        moduleKey: 'damage_ai',
        stepKey: 'first_inspection',
        title: 'Run the first inspection',
        description: 'Upload a van image in the configured Slack channel.',
        requiredPermission: 'use_modules',
        actionLabel: 'View inspections',
        actionHref: '/dashboard/damage-ai',
        required: true,
        sortOrder: 50,
        complete: (facts) => facts.inspectionCount > 0,
        blocked: (facts) =>
          facts.inspectionChannelSelected ? null : 'Select the inspection channel first.',
      }
    )
  }
  if (activeModules.has('maintenance')) {
    definitions.push({
      moduleKey: 'maintenance',
      stepKey: 'maintenance_channel',
      title: 'Select a maintenance reporting channel',
      description: 'Choose a joined Slack channel for maintenance reports.',
      requiredPermission: 'view_modules',
      actionLabel: 'Choose channel',
      actionHref: '/dashboard/damage-ai/settings/slack',
      required: true,
      sortOrder: 60,
      complete: (facts) => facts.maintenanceChannelSelected,
      blocked: (facts) => (facts.slackConnected ? null : 'Connect Slack first.'),
    })
  }
  if (activeModules.has('appointments')) {
    definitions.push(
      {
        moduleKey: 'appointments',
        stepKey: 'services',
        title: 'Add appointment services',
        description: `Add the services customers can book${businessType !== 'general' ? ` for your ${businessType} business` : ''}.`,
        requiredPermission: 'view_modules',
        actionLabel: 'Add services',
        actionHref: '/appointments/settings',
        required: true,
        sortOrder: 100,
        complete: (facts) => facts.appointmentServiceCount > 0,
      },
      {
        moduleKey: 'appointments',
        stepKey: 'availability',
        title: 'Set appointment availability',
        description: 'Define business hours and bookable times.',
        requiredPermission: 'view_modules',
        actionLabel: 'Set availability',
        actionHref: '/appointments/availability',
        required: true,
        sortOrder: 110,
        complete: (facts) => facts.availabilityConfigured,
      }
    )
  }
  if (activeModules.has('payments')) {
    definitions.push({
      moduleKey: 'payments',
      stepKey: 'provider',
      title: 'Connect a payment provider',
      description: 'Connect a supported provider before accepting live payments.',
      requiredPermission: 'view_modules',
      actionLabel: 'Connect payments',
      actionHref: '/payments/providers',
      required: true,
      sortOrder: 120,
      complete: (facts) => facts.paymentProviderConnected,
    })
  }
  if (activeModules.has('store')) {
    definitions.push({
      moduleKey: 'store',
      stepKey: 'product',
      title: 'Add your first product',
      description: 'Create a real product before publishing the storefront.',
      requiredPermission: 'use_modules',
      actionLabel: 'Add product',
      actionHref: '/store/products',
      required: true,
      sortOrder: 130,
      complete: (facts) => facts.productCount > 0,
    })
  }
  if (activeModules.has('rewards')) {
    definitions.push({
      moduleKey: 'rewards',
      stepKey: 'program',
      title: 'Create a rewards program',
      description: 'Configure how customers earn and redeem rewards.',
      requiredPermission: 'view_modules',
      actionLabel: 'Create program',
      actionHref: '/dashboard/rewards/programs',
      required: true,
      sortOrder: 140,
      complete: (facts) => facts.rewardProgramCount > 0,
    })
  }
  if (activeModules.has('website')) {
    definitions.push(
      {
        moduleKey: 'website',
        stepKey: 'pages',
        title: 'Build your first website page',
        description: 'Create real content for the customer-facing site.',
        requiredPermission: 'use_modules',
        actionLabel: 'Open builder',
        actionHref: '/website',
        required: true,
        sortOrder: 150,
        complete: (facts) => facts.websitePageCount > 0,
      },
      {
        moduleKey: 'website',
        stepKey: 'publish',
        title: 'Publish the website',
        description: 'Make the approved website visible to customers.',
        requiredPermission: 'view_modules',
        actionLabel: 'Publish website',
        actionHref: '/website',
        required: true,
        sortOrder: 160,
        complete: (facts) => facts.websitePublished,
        blocked: (facts) => (facts.websitePageCount > 0 ? null : 'Build a page first.'),
      },
      {
        moduleKey: 'website',
        stepKey: 'domain',
        title: 'Connect a custom domain',
        description: 'Optional: use a verified business domain.',
        requiredPermission: 'view_modules',
        actionLabel: 'Connect domain',
        actionHref: '/settings/domain',
        required: false,
        sortOrder: 170,
        complete: (facts) => facts.domainConnected,
      }
    )
  }

  definitions.push({
    moduleKey: 'core',
    stepKey: 'invite_staff',
    title: 'Invite staff',
    description: 'Add the people who will work in this CRM.',
    requiredPermission: 'manage_staff',
    actionLabel: 'Invite staff',
    actionHref: '/staff',
    required: false,
    sortOrder: 900,
    complete: (facts) => facts.staffCount > 1,
  })
  return definitions
}

async function loadSetupFacts(context: CommandCenterContext): Promise<SetupFacts> {
  const db = context.db
  const hasFleet =
    context.activeModuleSet.has('vehicles') ||
    context.activeModuleSet.has('damage_ai') ||
    context.activeModuleSet.has('maintenance')
  const usesSlack =
    context.activeModuleSet.has('damage_ai') || context.activeModuleSet.has('maintenance')
  const hasCustomers =
    context.activeModuleSet.has('customers') ||
    context.activeModuleSet.has('contacts') ||
    context.activeModuleSet.has('leads')
  const [
    staff,
    vehicles,
    vehicleImages,
    inspections,
    integrations,
    channels,
    maintenance,
    appointments,
    services,
    availability,
    paymentProviders,
    products,
    orders,
    rewardPrograms,
    customers,
    pages,
    siteSettings,
    domains,
  ] = await Promise.all([
    countRows(db, 'users', context.tenantId),
    countRowsWhen(hasFleet, db, 'vehicles', context.tenantId),
    countRowsWhen(
      context.activeModuleSet.has('damage_ai'),
      db,
      'van_damage_images',
      context.tenantId,
      {
        image_role: 'vehicle_profile',
      }
    ),
    countRowsWhen(
      context.activeModuleSet.has('damage_ai'),
      db,
      'van_damage_inspections',
      context.tenantId
    ),
    countRowsWhen(usesSlack, db, 'van_slack_integrations', context.tenantId, {
      status: 'active',
    }),
    usesSlack ? loadSlackChannelPurposes(context) : Promise.resolve(new Set<string>()),
    countRowsWhen(
      context.activeModuleSet.has('maintenance'),
      db,
      'fleet_maintenance_items',
      context.tenantId
    ),
    countRowsWhen(
      context.activeModuleSet.has('appointments'),
      db,
      'appointments',
      context.tenantId
    ),
    countRowsWhen(
      context.activeModuleSet.has('appointments'),
      db,
      'appointment_services',
      context.tenantId
    ),
    countRowsWhen(
      context.activeModuleSet.has('appointments'),
      db,
      'availability_rules',
      context.tenantId,
      { is_active: true }
    ),
    countRowsWhen(
      context.activeModuleSet.has('payments'),
      db,
      'payment_providers',
      context.tenantId,
      { is_active: true }
    ),
    countRowsWhen(context.activeModuleSet.has('store'), db, 'products', context.tenantId),
    countRowsWhen(context.activeModuleSet.has('store'), db, 'orders', context.tenantId),
    countRowsWhen(
      context.activeModuleSet.has('rewards'),
      db,
      'rewards_programs',
      context.tenantId,
      { is_active: true }
    ),
    countRowsWhen(hasCustomers, db, 'customers', context.tenantId),
    countRowsWhen(context.activeModuleSet.has('website'), db, 'site_pages', context.tenantId),
    context.activeModuleSet.has('website')
      ? loadSingleRecord(db, 'site_settings', context.tenantId, 'is_published')
      : Promise.resolve(false),
    countRowsWhen(context.activeModuleSet.has('website'), db, 'tenant_domains', context.tenantId, {
      is_verified: true,
      domain_type: 'custom',
    }),
  ])

  return {
    staffCount: staff,
    vehicleCount: vehicles,
    vehicleImageCount: vehicleImages,
    inspectionCount: inspections,
    slackConnected: integrations > 0,
    inspectionChannelSelected: channels.has('damage_inspection'),
    maintenanceChannelSelected: channels.has('maintenance'),
    maintenanceCount: maintenance,
    appointmentCount: appointments,
    appointmentServiceCount: services,
    availabilityConfigured: availability > 0,
    paymentProviderConnected: paymentProviders > 0,
    productCount: products,
    orderCount: orders,
    rewardProgramCount: rewardPrograms,
    customerCount: customers,
    websitePageCount: pages,
    websitePublished: siteSettings === true,
    domainConnected: domains > 0,
  }
}

function countRowsWhen(
  enabled: boolean,
  db: CommandCenterContext['db'],
  table: string,
  tenantId: string,
  equals: Record<string, unknown> = {}
): Promise<number> {
  return enabled ? countRows(db, table, tenantId, equals) : Promise.resolve(0)
}

type UntypedQuery = {
  select: (columns: string, options?: { count?: 'exact'; head?: boolean }) => UntypedQuery
  eq: (column: string, value: unknown) => UntypedQuery
  maybeSingle: () => Promise<{
    data: Record<string, unknown> | null
    error: { code: string } | null
  }>
  then: PromiseLike<{ count: number | null; error: { code: string } | null }>['then']
}

type UntypedDb = {
  from: (table: string) => UntypedQuery
}

async function countRows(
  db: CommandCenterContext['db'],
  table: string,
  tenantId: string,
  equals: Record<string, unknown> = {}
): Promise<number> {
  let query = (db as unknown as UntypedDb)
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
  for (const [column, value] of Object.entries(equals)) query = query.eq(column, value)
  const { count, error } = await query
  if (error) throw new Error(`Setup query failed for ${table}: ${error.code}`)
  return count ?? 0
}

async function loadSingleRecord(
  db: CommandCenterContext['db'],
  table: string,
  tenantId: string,
  column: string
): Promise<unknown> {
  const { data, error } = await (db as unknown as UntypedDb)
    .from(table)
    .select(column)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error) throw new Error(`Setup query failed for ${table}: ${error.code}`)
  return data?.[column]
}

async function loadSlackChannelPurposes(context: CommandCenterContext): Promise<Set<string>> {
  const { data, error } = await context.db
    .from('van_slack_channels')
    .select('purpose')
    .eq('tenant_id', context.tenantId)
    .eq('is_enabled', true)
  if (error) throw new Error(`Setup query failed for Slack channels: ${error.code}`)
  return new Set((data ?? []).map((channel) => channel.purpose))
}
