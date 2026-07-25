import 'server-only'

import { getSupabaseServerClient } from '@/lib/supabase/server'
import { MODULE_REGISTRY } from '@/modules/registry'
import type { ModuleKey } from '@/modules/shared/moduleTypes'
import type { ModulePackageInput } from './policy'

export interface OwnerModulePackage {
  id: string
  slug: string
  name: string
  description: string
  benefits: string[]
  status: 'active' | 'archived'
  moduleKeys: ModuleKey[]
  createdAt: string
  updatedAt: string
}

export interface PackageApplication {
  id: string
  tenantId: string
  tenantName: string
  packageId: string | null
  packageName: string
  appliedModules: string[]
  appliedAt: string
}

export const CANONICAL_MODULE_KEYS = Object.keys(MODULE_REGISTRY) as ModuleKey[]

export async function listOwnerModulePackages(options?: {
  includeArchived?: boolean
}): Promise<OwnerModulePackage[]> {
  const db = getSupabaseServerClient()
  let packageQuery = db
    .from('owner_module_packages')
    .select('id, slug, name, description, benefits, status, created_at, updated_at')
    .order('name', { ascending: true })
  if (!options?.includeArchived) packageQuery = packageQuery.eq('status', 'active')

  const [{ data: packages, error: packageError }, { data: items, error: itemError }] =
    await Promise.all([
      packageQuery,
      db
        .from('owner_module_package_items')
        .select('package_id, module_key, sort_order')
        .order('sort_order', { ascending: true }),
    ])
  if (packageError) throw new Error(`Could not load module packages: ${packageError.code}`)
  if (itemError) throw new Error(`Could not load package modules: ${itemError.code}`)

  const byPackage = new Map<string, ModuleKey[]>()
  for (const item of items ?? []) {
    if (!(item.module_key in MODULE_REGISTRY)) continue
    const existing = byPackage.get(item.package_id) ?? []
    existing.push(item.module_key as ModuleKey)
    byPackage.set(item.package_id, existing)
  }

  return (packages ?? []).map((pkg) => ({
    id: pkg.id,
    slug: pkg.slug,
    name: pkg.name,
    description: pkg.description,
    benefits: pkg.benefits,
    status: pkg.status,
    moduleKeys: byPackage.get(pkg.id) ?? [],
    createdAt: pkg.created_at,
    updatedAt: pkg.updated_at,
  }))
}

export async function saveOwnerModulePackage(
  input: ModulePackageInput,
  actorUserId: string
): Promise<string> {
  const db = getSupabaseServerClient()
  const { data, error } = await db.rpc('save_owner_module_package', {
    p_package_id: input.id ?? null,
    p_slug: input.slug,
    p_name: input.name,
    p_description: input.description,
    p_benefits: input.benefits,
    p_module_keys: input.moduleKeys,
    p_actor_user_id: actorUserId,
    p_all_module_keys: CANONICAL_MODULE_KEYS,
  })
  if (error) {
    if (error.code === '23505') throw new Error('A package with this slug already exists.')
    throw new Error(`Could not save module package: ${error.code}`)
  }
  return data
}

export async function archiveOwnerModulePackage(packageId: string): Promise<void> {
  const { error } = await getSupabaseServerClient()
    .from('owner_module_packages')
    .update({ status: 'archived' })
    .eq('id', packageId)
  if (error) throw new Error(`Could not archive module package: ${error.code}`)
}

export async function applyOwnerModulePackage(input: {
  tenantId: string
  packageId: string
  actorUserId: string
}): Promise<string> {
  const { data, error } = await getSupabaseServerClient().rpc('apply_owner_module_package', {
    p_tenant_id: input.tenantId,
    p_package_id: input.packageId,
    p_actor_user_id: input.actorUserId,
    p_all_module_keys: CANONICAL_MODULE_KEYS,
  })
  if (error) throw new Error(`Could not apply module package: ${error.code}`)
  return data
}

export async function listRecentPackageApplications(limit = 12): Promise<PackageApplication[]> {
  const db = getSupabaseServerClient()
  const { data, error } = await db
    .from('tenant_module_package_applications')
    .select('id, tenant_id, package_id, package_name, applied_modules, applied_at')
    .order('applied_at', { ascending: false })
    .limit(Math.max(1, Math.min(limit, 50)))
  if (error) throw new Error(`Could not load package application history: ${error.code}`)

  const tenantIds = Array.from(new Set((data ?? []).map((row) => row.tenant_id)))
  const { data: tenants, error: tenantError } =
    tenantIds.length === 0
      ? { data: [], error: null }
      : await db.from('tenants').select('id, name').in('id', tenantIds)
  if (tenantError) throw new Error(`Could not load package tenants: ${tenantError.code}`)
  const tenantNames = new Map((tenants ?? []).map((tenant) => [tenant.id, tenant.name]))

  return (data ?? []).map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    tenantName: tenantNames.get(row.tenant_id) ?? 'Unknown business',
    packageId: row.package_id,
    packageName: row.package_name,
    appliedModules: row.applied_modules,
    appliedAt: row.applied_at,
  }))
}
