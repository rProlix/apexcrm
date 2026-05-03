// lib/product-360/packageService.ts
// Server-side helpers for package CRUD. Used by API routes.
// SERVER-ONLY.

import { getSupabaseServerClient } from '@/lib/supabase/server'
import { deletePackageStorage }    from './storage'
import type { P360Package, P360PackageSummary, P360PackageWithFrames } from './types'

const db = () => getSupabaseServerClient()

type Supabase = ReturnType<typeof getSupabaseServerClient>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const s = (supabase: Supabase) => supabase as any

export async function listPackages(opts: {
  tenantId:   string
  productId?: string
  includeArchived?: boolean
}): Promise<P360PackageSummary[]> {
  const supabase = db()
  let q = s(supabase)
    .from('product_360_packages')
    .select(`
      *,
      frames_done:product_360_frames(count),
      product:products(name)
    `)
    .eq('tenant_id', opts.tenantId)
    .order('created_at', { ascending: false })

  if (opts.productId)    q = q.eq('product_id', opts.productId)
  if (!opts.includeArchived) q = q.neq('status', 'archived')

  const { data, error } = await q
  if (error) throw new Error(`listPackages: ${error.message}`)

  return ((data ?? []) as unknown[]).map(row => {
    const r = row as Record<string, unknown>
    return {
      ...(r as unknown as P360Package),
      frames_done:  (r.frames_done as { count: number }[])?.[0]?.count ?? 0,
      product_name: (r.product as { name: string } | null)?.name ?? null,
    }
  })
}

export async function getPackageWithFrames(
  packageId: string,
  tenantId:  string,
): Promise<P360PackageWithFrames | null> {
  const supabase = db()
  const { data, error } = await s(supabase)
    .from('product_360_packages')
    .select(`
      *,
      frames:product_360_frames(* order: frame_index asc),
      hotspots:product_360_hotspots(* order: created_at asc)
    `)
    .eq('id', packageId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error) throw new Error(`getPackageWithFrames: ${error.message}`)
  return data as P360PackageWithFrames | null
}

export async function createPackage(opts: {
  tenantId:          string
  productId:         string
  createdBy:         string | null
  name:              string
  description?:      string
  packageType?:      string
  generationPrompt?: string
  negativePrompt?:   string
  targetFrameCount?: number
  settings?:         Record<string, unknown>
}): Promise<P360Package> {
  const supabase  = db()
  const slug      = generateSlug(opts.name)

  const { data, error } = await s(supabase)
    .from('product_360_packages')
    .insert({
      tenant_id:          opts.tenantId,
      product_id:         opts.productId,
      created_by:         opts.createdBy,
      name:               opts.name,
      slug,
      description:        opts.description ?? null,
      package_type:       opts.packageType ?? 'ai_generated',
      generation_prompt:  opts.generationPrompt ?? null,
      negative_prompt:    opts.negativePrompt   ?? null,
      target_frame_count: opts.targetFrameCount ?? 36,
      settings:           opts.settings ?? {},
      status:             'draft',
      is_enabled:         false,
      is_default:         false,
    })
    .select('*')
    .single()

  if (error) throw new Error(`createPackage: ${error.message}`)
  return data as P360Package
}

export async function updatePackage(
  packageId: string,
  tenantId:  string,
  updates:   Partial<Pick<P360Package,
    'name' | 'slug' | 'description' | 'status' | 'is_enabled' | 'is_default' |
    'package_type' | 'promo_starts_at' | 'promo_ends_at' | 'generation_prompt' |
    'negative_prompt' | 'target_frame_count' | 'settings' | 'lighting_config' |
    'camera_config' | 'hotspot_config' | 'cover_frame_url' | 'model_url' | 'ar_model_url'
  >>,
): Promise<P360Package> {
  const supabase = db()

  // If setting is_default=true, unset default on all other packages for same tenant/product
  if (updates.is_default) {
    // Get the package to find its product_id
    const { data: existing } = await s(supabase)
      .from('product_360_packages')
      .select('product_id')
      .eq('id', packageId)
      .maybeSingle()

    if (existing?.product_id) {
      await s(supabase)
        .from('product_360_packages')
        .update({ is_default: false })
        .eq('tenant_id', tenantId)
        .eq('product_id', existing.product_id)
        .neq('id', packageId)
    }
  }

  const { data, error } = await s(supabase)
    .from('product_360_packages')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', packageId)
    .eq('tenant_id', tenantId)
    .select('*')
    .single()

  if (error) throw new Error(`updatePackage: ${error.message}`)
  return data as P360Package
}

export async function archivePackage(
  packageId: string,
  tenantId:  string,
  productId: string,
): Promise<void> {
  const supabase = db()
  await s(supabase)
    .from('product_360_packages')
    .update({ status: 'archived', is_enabled: false, updated_at: new Date().toISOString() })
    .eq('id', packageId)
    .eq('tenant_id', tenantId)

  // Best-effort storage cleanup
  await deletePackageStorage(tenantId, productId, packageId)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'package'
  return `${base}-${Math.random().toString(36).slice(2, 6)}`
}
