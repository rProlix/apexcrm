import 'server-only'

import { hasPermission } from '@/lib/auth/permissions'
import type { CommandCenterContext } from '@/lib/command-center/context'
import {
  isRecordTypeAvailable,
  normalizeCommandQuery,
  type CommandResult,
} from '@/lib/command-center/experience'

const RESULT_LIMIT = 6

export async function searchCommandCenter(
  context: CommandCenterContext,
  input: string
): Promise<CommandResult[]> {
  const query = normalizeCommandQuery(input)
  if (query.length < 2) return []

  const tasks: Array<Promise<CommandResult[]>> = []
  if (isRecordTypeAvailable('vehicle', context.activeModuleKeys, context.role)) {
    tasks.push(searchVehicles(context, query))
  }
  if (isRecordTypeAvailable('inspection', context.activeModuleKeys, context.role)) {
    tasks.push(searchInspections(context, query))
  }
  if (isRecordTypeAvailable('maintenance', context.activeModuleKeys, context.role)) {
    tasks.push(searchMaintenance(context, query))
  }
  if (
    isRecordTypeAvailable('customer', context.activeModuleKeys, context.role) &&
    hasPermission(context.role, 'view_customers')
  ) {
    tasks.push(searchCustomers(context, query))
  }
  if (isRecordTypeAvailable('appointment', context.activeModuleKeys, context.role)) {
    tasks.push(searchAppointments(context, query))
  }
  if (isRecordTypeAvailable('order', context.activeModuleKeys, context.role)) {
    tasks.push(searchOrders(context, query))
  }
  if (
    context.activeModuleKeys.length > 0 &&
    isRecordTypeAvailable('action', context.activeModuleKeys, context.role)
  ) {
    tasks.push(searchActions(context, query))
  }

  const settled = await Promise.allSettled(tasks)
  return settled
    .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
    .slice(0, 36)
}

async function searchVehicles(
  context: CommandCenterContext,
  query: string
): Promise<CommandResult[]> {
  const pattern = likePattern(query)
  const [nameResult, numberResult] = await Promise.all([
    context.db
      .from('vehicles')
      .select('id,name,van_number,make,model,status')
      .eq('tenant_id', context.tenantId)
      .ilike('name', pattern)
      .limit(RESULT_LIMIT),
    context.db
      .from('vehicles')
      .select('id,name,van_number,make,model,status')
      .eq('tenant_id', context.tenantId)
      .ilike('van_number', pattern)
      .limit(RESULT_LIMIT),
  ])
  const rows = [
    ...(nameResult.error ? [] : (nameResult.data ?? [])),
    ...(numberResult.error ? [] : (numberResult.data ?? [])),
  ]
  return [...new Map(rows.map((row) => [row.id, row])).values()]
    .slice(0, RESULT_LIMIT)
    .map((row) => ({
      id: `vehicle:${row.id}`,
      kind: 'record',
      label: row.van_number ? `Van ${row.van_number}` : row.name,
      description: [row.make, row.model, row.status].filter(Boolean).join(' • '),
      moduleKey: 'vehicles',
      href: `/dashboard/vehicles/${row.id}`,
      recordType: 'vehicle',
      recordId: row.id,
    }))
}

async function searchInspections(
  context: CommandCenterContext,
  query: string
): Promise<CommandResult[]> {
  const { data, error } = await context.db
    .from('van_damage_inspections')
    .select('id,title,status,review_status,image_count,damage_count,created_at')
    .eq('tenant_id', context.tenantId)
    .ilike('title', likePattern(query))
    .order('created_at', { ascending: false })
    .limit(RESULT_LIMIT)
  if (error) return []
  return (data ?? []).map((row) => ({
    id: `inspection:${row.id}`,
    kind: 'record',
    label: row.title || 'Van inspection',
    description: `${row.status.replaceAll('_', ' ')} • ${row.image_count} images • ${row.damage_count} findings`,
    moduleKey: 'damage_ai',
    href: `/dashboard/damage-ai/inspections/${row.id}`,
    recordType: 'inspection',
    recordId: row.id,
  }))
}

async function searchMaintenance(
  context: CommandCenterContext,
  query: string
): Promise<CommandResult[]> {
  const { data, error } = await context.db
    .from('fleet_maintenance_items')
    .select('id,title,status,effective_priority,maintenance_number,latest_activity_at')
    .eq('tenant_id', context.tenantId)
    .ilike('title', likePattern(query))
    .order('latest_activity_at', { ascending: false })
    .limit(RESULT_LIMIT)
  if (error) return []
  return (data ?? []).map((row) => ({
    id: `maintenance:${row.id}`,
    kind: 'record',
    label: `Maintenance ${row.maintenance_number}: ${row.title}`,
    description: `${row.effective_priority} priority • ${row.status.replaceAll('_', ' ')}`,
    moduleKey: 'maintenance',
    href: `/dashboard/vehicles/maintenance?itemId=${row.id}`,
    recordType: 'maintenance',
    recordId: row.id,
  }))
}

async function searchCustomers(
  context: CommandCenterContext,
  query: string
): Promise<CommandResult[]> {
  const { data, error } = await context.db
    .from('customers')
    .select('id,name,email,phone,updated_at')
    .eq('tenant_id', context.tenantId)
    .ilike('name', likePattern(query))
    .order('updated_at', { ascending: false })
    .limit(RESULT_LIMIT)
  if (error) return []
  return (data ?? []).map((row) => ({
    id: `customer:${row.id}`,
    kind: 'record',
    label: row.name,
    description: row.email || row.phone || 'Customer record',
    moduleKey: 'customers',
    href: `/customers/${row.id}`,
    recordType: 'customer',
    recordId: row.id,
  }))
}

async function searchAppointments(
  context: CommandCenterContext,
  query: string
): Promise<CommandResult[]> {
  const { data, error } = await context.db
    .from('appointments')
    .select('id,service_name,starts_at,status,updated_at')
    .eq('tenant_id', context.tenantId)
    .ilike('service_name', likePattern(query))
    .order('starts_at', { ascending: false })
    .limit(RESULT_LIMIT)
  if (error) return []
  return (data ?? []).map((row) => ({
    id: `appointment:${row.id}`,
    kind: 'record',
    label: row.service_name,
    description: `${row.status.replaceAll('_', ' ')} • ${new Date(row.starts_at).toLocaleDateString()}`,
    moduleKey: 'appointments',
    href: `/appointments?appointmentId=${row.id}`,
    recordType: 'appointment',
    recordId: row.id,
  }))
}

async function searchOrders(
  context: CommandCenterContext,
  query: string
): Promise<CommandResult[]> {
  if (!isUuid(query)) return []
  const { data, error } = await context.db
    .from('orders')
    .select('id,status,total_amount,created_at')
    .eq('tenant_id', context.tenantId)
    .eq('id', query)
    .limit(1)
  if (error) return []
  return (data ?? []).map((row) => ({
    id: `order:${row.id}`,
    kind: 'record',
    label: `Order ${row.id.slice(0, 8)}`,
    description: `${row.status.replaceAll('_', ' ')} • ${formatAmount(row.total_amount)}`,
    moduleKey: 'store',
    href: `/store/orders?orderId=${row.id}`,
    recordType: 'order',
    recordId: row.id,
  }))
}

async function searchActions(
  context: CommandCenterContext,
  query: string
): Promise<CommandResult[]> {
  let request = context.db
    .from('command_action_items')
    .select(
      'id,title,description,module_key,priority,status,source_record_label,assigned_user_id,assigned_role,latest_activity_at'
    )
    .eq('tenant_id', context.tenantId)
    .in('module_key', context.activeModuleKeys)
    .in('status', ['open', 'in_progress', 'snoozed'])
    .ilike('title', likePattern(query))
    .order('latest_activity_at', { ascending: false })
    .limit(RESULT_LIMIT)
  if (context.role === 'staff') {
    request = request.or(
      `assigned_user_id.eq.${context.user.id},and(assigned_user_id.is.null,assigned_role.is.null),and(assigned_user_id.is.null,assigned_role.eq.staff)`
    )
  }
  const { data, error } = await request
  if (error) return []
  return (data ?? []).map((row) => ({
    id: `action:${row.id}`,
    kind: 'record',
    label: row.title,
    description: `${row.priority} priority • ${row.source_record_label || row.description}`,
    moduleKey: row.module_key,
    href: `/actions?focus=${row.id}`,
    recordType: 'action',
    recordId: row.id,
  }))
}

function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (character) => `\\${character}`)}%`
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function formatAmount(value: number | null): string {
  if (value == null) return 'Total not recorded'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}
