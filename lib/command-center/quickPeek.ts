import 'server-only'

import { hasPermission } from '@/lib/auth/permissions'
import {
  CommandCenterAccessError,
  assertActiveModule,
  type CommandCenterContext,
} from '@/lib/command-center/context'
import type {
  CommandRecordType,
  QuickPeekField,
  QuickPeekPayload,
} from '@/lib/command-center/experience'
import { damageEvidenceFromMetadata, damageEvidenceToQuickPeekMedia } from './evidence'

export async function loadQuickPeek(
  context: CommandCenterContext,
  type: CommandRecordType,
  id: string
): Promise<QuickPeekPayload> {
  switch (type) {
    case 'vehicle':
      return loadVehicle(context, id)
    case 'inspection':
      return loadInspection(context, id)
    case 'maintenance':
      return loadMaintenance(context, id)
    case 'customer':
      return loadCustomer(context, id)
    case 'appointment':
      return loadAppointment(context, id)
    case 'order':
      return loadOrder(context, id)
    case 'action':
      return loadAction(context, id)
  }
}

async function loadVehicle(context: CommandCenterContext, id: string): Promise<QuickPeekPayload> {
  assertActiveModule(context, 'vehicles')
  const { data, error } = await context.db
    .from('vehicles')
    .select('id,name,van_number,make,model,year,plate_number,status,updated_at')
    .eq('tenant_id', context.tenantId)
    .eq('id', id)
    .maybeSingle()
  if (error || !data) throw notFound()
  const label = data.van_number ? `Van ${data.van_number}` : data.name
  const actions: QuickPeekPayload['actions'] = [
    { label: 'Open van profile', href: `/dashboard/vehicles/${data.id}`, primary: true },
  ]
  if (context.activeModuleSet.has('damage_ai')) {
    actions.push({
      label: 'View inspections',
      href: `/dashboard/damage-ai?vanId=${data.id}`,
    })
  }
  if (context.activeModuleSet.has('maintenance')) {
    actions.push({
      label: 'View maintenance',
      href: `/dashboard/vehicles/maintenance?vanId=${data.id}`,
    })
  }
  return {
    type: 'vehicle',
    id: data.id,
    moduleKey: 'vehicles',
    title: label,
    subtitle: data.name,
    status: data.status,
    href: `/dashboard/vehicles/${data.id}`,
    fields: compactFields([
      field('Vehicle', [data.year, data.make, data.model].filter(Boolean).join(' ')),
      field('Plate', data.plate_number),
      field('Status', humanize(data.status), toneForStatus(data.status)),
      field('Updated', formatDate(data.updated_at, context.timeZone)),
    ]),
    actions,
    updatedAt: data.updated_at,
  }
}

async function loadInspection(
  context: CommandCenterContext,
  id: string
): Promise<QuickPeekPayload> {
  assertActiveModule(context, 'damage_ai')
  const [{ data, error }, evidenceImage] = await Promise.all([
    context.db
      .from('van_damage_inspections')
      .select(
        'id,title,status,review_status,image_count,damage_count,ai_summary,ai_confidence,van_id,created_at,updated_at'
      )
      .eq('tenant_id', context.tenantId)
      .eq('id', id)
      .maybeSingle(),
    loadInspectionEvidenceImage(context, id),
  ])
  if (error || !data) throw notFound()
  const actions: QuickPeekPayload['actions'] = [
    {
      label: 'Open full inspection',
      href: `/dashboard/damage-ai/inspections/${data.id}`,
      primary: true,
    },
  ]
  if (data.van_id && context.activeModuleSet.has('vehicles')) {
    actions.push({ label: 'Open van', href: `/dashboard/vehicles/${data.van_id}` })
  }
  if (context.activeModuleSet.has('maintenance')) {
    actions.push({
      label: 'Open maintenance',
      href: `/dashboard/vehicles/maintenance?inspectionId=${data.id}`,
    })
  }
  return {
    type: 'inspection',
    id: data.id,
    moduleKey: 'damage_ai',
    title: data.title || 'Van inspection',
    subtitle: `Received ${formatDate(data.created_at, context.timeZone)}`,
    status: data.review_status || data.status,
    summary: data.ai_summary || 'Automated analysis has not provided a summary yet.',
    href: `/dashboard/damage-ai/inspections/${data.id}`,
    fields: [
      field('Inspection status', humanize(data.status), toneForStatus(data.status)),
      field('Review status', humanize(data.review_status), toneForStatus(data.review_status)),
      field('Images', String(data.image_count), 'strong'),
      field('Findings', String(data.damage_count), data.damage_count > 0 ? 'warning' : 'success'),
      field(
        'Analysis confidence',
        data.ai_confidence == null ? 'Not available' : `${Math.round(data.ai_confidence * 100)}%`
      ),
    ],
    actions,
    updatedAt: data.updated_at,
    media: damageEvidenceToQuickPeekMedia(evidenceImage),
  }
}

async function loadMaintenance(
  context: CommandCenterContext,
  id: string
): Promise<QuickPeekPayload> {
  assertActiveModule(context, 'maintenance')
  const { data, error } = await context.db
    .from('fleet_maintenance_items')
    .select(
      'id,maintenance_number,title,description,status,effective_priority,severity,needs_review,van_id,reported_at,due_at,latest_activity_at'
    )
    .eq('tenant_id', context.tenantId)
    .eq('id', id)
    .maybeSingle()
  if (error || !data) throw notFound()
  const actions: QuickPeekPayload['actions'] = [
    {
      label: 'Open maintenance item',
      href: `/dashboard/vehicles/maintenance?itemId=${data.id}`,
      primary: true,
    },
  ]
  if (data.van_id && context.activeModuleSet.has('vehicles')) {
    actions.push({ label: 'Open van', href: `/dashboard/vehicles/${data.van_id}` })
  }
  return {
    type: 'maintenance',
    id: data.id,
    moduleKey: 'maintenance',
    title: data.title,
    subtitle: `Maintenance ${data.maintenance_number}`,
    status: data.status,
    summary: data.description,
    href: `/dashboard/vehicles/maintenance?itemId=${data.id}`,
    fields: compactFields([
      field('Priority', humanize(data.effective_priority), priorityTone(data.effective_priority)),
      field('Severity', humanize(data.severity), priorityTone(data.severity)),
      field('Status', humanize(data.status), toneForStatus(data.status)),
      field('Review', data.needs_review ? 'Human review required' : 'No review flag'),
      field('Reported', formatDate(data.reported_at, context.timeZone)),
      field('Due', data.due_at ? formatDate(data.due_at, context.timeZone) : null),
    ]),
    actions,
    updatedAt: data.latest_activity_at,
  }
}

async function loadCustomer(context: CommandCenterContext, id: string): Promise<QuickPeekPayload> {
  assertActiveModule(context, 'customers')
  if (!hasPermission(context.role, 'view_customers')) {
    throw new CommandCenterAccessError('You do not have access to customer records.')
  }
  const { data, error } = await context.db
    .from('customers')
    .select('id,name,email,phone,created_at,updated_at')
    .eq('tenant_id', context.tenantId)
    .eq('id', id)
    .maybeSingle()
  if (error || !data) throw notFound()
  return {
    type: 'customer',
    id: data.id,
    moduleKey: 'customers',
    title: data.name,
    subtitle: 'Customer',
    href: `/customers/${data.id}`,
    fields: compactFields([
      field('Email', data.email),
      field('Phone', data.phone),
      field('Customer since', formatDate(data.created_at, context.timeZone)),
      field('Updated', formatDate(data.updated_at, context.timeZone)),
    ]),
    actions: [{ label: 'Open customer', href: `/customers/${data.id}`, primary: true }],
    updatedAt: data.updated_at,
  }
}

async function loadAppointment(
  context: CommandCenterContext,
  id: string
): Promise<QuickPeekPayload> {
  assertActiveModule(context, 'appointments')
  const { data, error } = await context.db
    .from('appointments')
    .select('id,service_name,starts_at,ends_at,status,notes,updated_at')
    .eq('tenant_id', context.tenantId)
    .eq('id', id)
    .maybeSingle()
  if (error || !data) throw notFound()
  return {
    type: 'appointment',
    id: data.id,
    moduleKey: 'appointments',
    title: data.service_name,
    subtitle: formatDate(data.starts_at, context.timeZone),
    status: data.status,
    summary: data.notes || undefined,
    href: `/appointments?appointmentId=${data.id}`,
    fields: [
      field('Status', humanize(data.status), toneForStatus(data.status)),
      field('Starts', formatDate(data.starts_at, context.timeZone)),
      field('Ends', formatDate(data.ends_at, context.timeZone)),
    ],
    actions: [
      {
        label: 'Open appointments',
        href: `/appointments?appointmentId=${data.id}`,
        primary: true,
      },
    ],
    updatedAt: data.updated_at,
  }
}

async function loadOrder(context: CommandCenterContext, id: string): Promise<QuickPeekPayload> {
  assertActiveModule(context, 'store')
  const { data, error } = await context.db
    .from('orders')
    .select('id,status,total_amount,created_at')
    .eq('tenant_id', context.tenantId)
    .eq('id', id)
    .maybeSingle()
  if (error || !data) throw notFound()
  return {
    type: 'order',
    id: data.id,
    moduleKey: 'store',
    title: `Order ${data.id.slice(0, 8)}`,
    subtitle: `Placed ${formatDate(data.created_at, context.timeZone)}`,
    status: data.status,
    href: `/store/orders?orderId=${data.id}`,
    fields: [
      field('Status', humanize(data.status), toneForStatus(data.status)),
      field('Total', formatCurrency(data.total_amount), 'strong'),
    ],
    actions: [
      {
        label: 'Open orders',
        href: `/store/orders?orderId=${data.id}`,
        primary: true,
      },
    ],
  }
}

async function loadAction(context: CommandCenterContext, id: string): Promise<QuickPeekPayload> {
  const { data, error } = await context.db
    .from('command_action_items')
    .select(
      'id,module_key,title,description,priority,status,source_record_type,source_record_id,source_record_label,assigned_user_id,assigned_role,due_at,first_detected_at,latest_activity_at,metadata'
    )
    .eq('tenant_id', context.tenantId)
    .eq('id', id)
    .maybeSingle()
  if (error || !data) throw notFound()
  if (!context.activeModuleSet.has(data.module_key)) throw notFound()
  if (
    context.role === 'staff' &&
    data.assigned_user_id !== context.user.id &&
    (data.assigned_user_id !== null ||
      (data.assigned_role !== null && data.assigned_role !== 'staff'))
  ) {
    throw notFound()
  }
  const metadataEvidence = damageEvidenceFromMetadata(data.metadata)
  const sourceEvidence =
    metadataEvidence ||
    (data.source_record_type === 'inspection'
      ? await loadInspectionEvidenceImage(context, data.source_record_id)
      : null)
  return {
    type: 'action',
    id: data.id,
    moduleKey: data.module_key,
    title: data.title,
    subtitle: data.source_record_label || humanize(data.module_key),
    status: data.status,
    summary: data.description,
    href: `/actions?focus=${data.id}`,
    fields: compactFields([
      field('Priority', humanize(data.priority), priorityTone(data.priority)),
      field('Status', humanize(data.status), toneForStatus(data.status)),
      field('First detected', formatDate(data.first_detected_at, context.timeZone)),
      field('Due', data.due_at ? formatDate(data.due_at, context.timeZone) : null),
    ]),
    actions: [{ label: 'Open Action Required', href: `/actions?focus=${data.id}`, primary: true }],
    updatedAt: data.latest_activity_at,
    media: damageEvidenceToQuickPeekMedia(sourceEvidence),
  }
}

async function loadInspectionEvidenceImage(
  context: CommandCenterContext,
  inspectionId: string
): Promise<{ imageId: string; businessId: string; alt: string; caption?: string } | null> {
  const { data } = await context.db
    .from('van_damage_images')
    .select('id,business_id,image_role')
    .eq('tenant_id', context.tenantId)
    .eq('inspection_id', inspectionId)
    .in('status', ['uploaded', 'analyzed'])
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!data?.id || !data.business_id) return null
  return {
    imageId: data.id,
    businessId: data.business_id,
    alt: 'Van damage inspection image',
    caption: data.image_role?.replaceAll('_', ' ') || 'Inspection image',
  }
}

function field(
  label: string,
  value: string | null | undefined,
  tone: QuickPeekField['tone'] = 'default'
): QuickPeekField {
  return { label, value: value || 'Not recorded', tone }
}

function compactFields(fields: QuickPeekField[]): QuickPeekField[] {
  return fields.filter((item) => item.value !== 'Not recorded')
}

function formatDate(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(value))
}

function formatCurrency(value: number | null): string {
  if (value == null) return 'Not recorded'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

function humanize(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function toneForStatus(value: string): QuickPeekField['tone'] {
  if (['failed', 'blocked', 'cancelled', 'canceled'].includes(value)) return 'danger'
  if (['needs_review', 'in_review', 'pending', 'snoozed'].includes(value)) return 'warning'
  if (['complete', 'completed', 'resolved', 'active', 'confirmed'].includes(value)) return 'success'
  return 'default'
}

function priorityTone(value: string): QuickPeekField['tone'] {
  if (['urgent', 'critical'].includes(value)) return 'danger'
  if (['high', 'major'].includes(value)) return 'warning'
  return 'default'
}

function notFound(): CommandCenterAccessError {
  return new CommandCenterAccessError('This record is unavailable.', 404)
}
