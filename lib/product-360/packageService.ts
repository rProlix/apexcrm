// lib/product-360/packageService.ts
// Server-side helpers for package CRUD. Used by API routes.
// SERVER-ONLY.

import { getSupabaseServerClient } from '@/lib/supabase/server'
import { deletePackageStorage }    from './storage'
import type { P360Package, P360PackageSummary, P360PackageWithFrames, P360Frame, P360Hotspot } from './types'

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

  // Step 1 — load packages (no embedded aggregates: safer across PostgREST versions)
  let q = s(supabase)
    .from('product_360_packages')
    .select('*, product:products(name)')
    .eq('tenant_id', opts.tenantId)
    .order('created_at', { ascending: false })

  if (opts.productId)        q = q.eq('product_id', opts.productId)
  if (!opts.includeArchived) q = q.neq('status', 'archived')

  const { data, error } = await q
  if (error) {
    console.error('[listPackages] Supabase error:', error.message, { tenantId: opts.tenantId })
    throw new Error(`listPackages: ${error.message}`)
  }

  const rows = (data ?? []) as Record<string, unknown>[]
  if (rows.length === 0) return []

  // Step 2 — batch-count frames per package (safe separate query, no aggregate syntax)
  const pkgIds = rows.map(r => r.id as string)
  const { data: frameCounts } = await s(supabase)
    .from('product_360_frames')
    .select('package_id')
    .in('package_id', pkgIds)

  const frameCountMap: Record<string, number> = {}
  for (const f of (frameCounts ?? []) as Record<string, unknown>[]) {
    const pid = f.package_id as string
    frameCountMap[pid] = (frameCountMap[pid] ?? 0) + 1
  }

  return rows.map(r => ({
    ...(r as unknown as P360Package),
    frames_done:  frameCountMap[r.id as string] ?? 0,
    product_name: (r.product as { name: string } | null)?.name ?? null,
  }))
}

export async function getPackageWithFrames(
  packageId: string,
  tenantId:  string,
): Promise<P360PackageWithFrames | null> {
  const supabase = db()

  // Load package first, then frames and hotspots separately to avoid
  // PostgREST embedded-order syntax issues across versions.
  const { data: pkg, error: pkgError } = await s(supabase)
    .from('product_360_packages')
    .select('*')
    .eq('id', packageId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (pkgError) throw new Error(`getPackageWithFrames: ${pkgError.message}`)
  if (!pkg) return null

  const [{ data: frames }, { data: hotspots }] = await Promise.all([
    s(supabase)
      .from('product_360_frames')
      .select('*')
      .eq('package_id', packageId)
      .eq('tenant_id', tenantId)
      .order('frame_index', { ascending: true }),
    s(supabase)
      .from('product_360_hotspots')
      .select('*')
      .eq('package_id', packageId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true }),
  ])

  return {
    ...(pkg as unknown as P360Package),
    frames:   (frames   ?? []) as P360Frame[],
    hotspots: (hotspots ?? []) as P360Hotspot[],
  } as P360PackageWithFrames
}

export interface CreatePackageOpts {
  tenantId:             string
  productId:            string
  createdBy:            string | null
  name:                 string
  description?:         string
  packageType?:         string
  generationPrompt?:    string
  generationNotes?:     string
  negativePrompt?:      string
  targetFrameCount?:    number
  settings?:            Record<string, unknown>
  // Presets
  lightingPreset?:      string | null
  backgroundPreset?:    string | null
  categoryPreset?:      string | null
  cameraPreset?:        string | null
  cameraDistance?:      number | null
  cameraHeight?:        number | null
  fov?:                 number | null
  zoom?:                number | null
  shadowStrength?:      number | null
  reflectionIntensity?: number | null
  turnDirection?:       'clockwise' | 'counter_clockwise'
  outputWidth?:         number | null
  outputHeight?:        number | null
  promoTag?:            string | null
  aiModel?:             string
}

export async function createPackage(opts: CreatePackageOpts): Promise<P360Package> {
  const supabase  = db()
  const slug      = generateSlug(opts.name)

  const { data, error } = await s(supabase)
    .from('product_360_packages')
    .insert({
      tenant_id:            opts.tenantId,
      product_id:           opts.productId,
      created_by:           opts.createdBy,
      name:                 opts.name,
      slug,
      description:          opts.description     ?? null,
      package_type:         opts.packageType     ?? 'ai_generated',
      generation_prompt:    opts.generationPrompt ?? null,
      generation_notes:     opts.generationNotes  ?? null,
      negative_prompt:      opts.negativePrompt   ?? null,
      target_frame_count:   opts.targetFrameCount ?? 36,
      settings:             opts.settings ?? {},
      status:               'draft',
      is_enabled:           false,
      is_default:           false,
      generation_provider:  'gemini',
      ai_model:             opts.aiModel ?? (process.env.GEMINI_360_MODEL ?? 'gemini-2.5-flash-lite'),
      // Presets
      lighting_preset:      opts.lightingPreset      ?? null,
      background_preset:    opts.backgroundPreset     ?? null,
      category_preset:      opts.categoryPreset       ?? null,
      camera_preset:        opts.cameraPreset         ?? null,
      camera_distance:      opts.cameraDistance       ?? null,
      camera_height:        opts.cameraHeight         ?? null,
      fov:                  opts.fov                  ?? null,
      zoom:                 opts.zoom                 ?? null,
      shadow_strength:      opts.shadowStrength       ?? null,
      reflection_intensity: opts.reflectionIntensity  ?? null,
      turn_direction:       opts.turnDirection        ?? 'clockwise',
      output_width:         opts.outputWidth          ?? null,
      output_height:        opts.outputHeight         ?? null,
      promo_tag:            opts.promoTag             ?? null,
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
    'generation_notes' | 'negative_prompt' | 'target_frame_count' | 'settings' |
    'lighting_config' | 'camera_config' | 'hotspot_config' | 'cover_frame_url' |
    'model_url' | 'ar_model_url' |
    'lighting_preset' | 'background_preset' | 'category_preset' | 'camera_preset' |
    'camera_distance' | 'camera_height' | 'fov' | 'zoom' | 'shadow_strength' |
    'reflection_intensity' | 'turn_direction' | 'output_width' | 'output_height' |
    'promo_tag' | 'ai_model'
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

export async function duplicatePackage(
  packageId:  string,
  tenantId:   string,
  newName:    string,
  createdBy:  string | null,
): Promise<P360Package> {
  const supabase = db()
  const { data: src } = await s(supabase)
    .from('product_360_packages')
    .select('*')
    .eq('id', packageId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!src) throw new Error('Package not found')

  const slug = generateSlug(newName)
  const { data, error } = await s(supabase)
    .from('product_360_packages')
    .insert({
      tenant_id:            tenantId,
      product_id:           src.product_id,
      created_by:           createdBy,
      name:                 newName,
      slug,
      description:          src.description,
      package_type:         src.package_type,
      generation_prompt:    src.generation_prompt,
      generation_notes:     src.generation_notes,
      negative_prompt:      src.negative_prompt,
      target_frame_count:   src.target_frame_count,
      settings:             src.settings ?? {},
      status:               'draft',
      is_enabled:           false,
      is_default:           false,
      generation_provider:  'gemini',
      ai_model:             src.ai_model ?? (process.env.GEMINI_360_MODEL ?? 'gemini-2.5-flash-lite'),
      lighting_preset:      src.lighting_preset,
      background_preset:    src.background_preset,
      category_preset:      src.category_preset,
      camera_preset:        src.camera_preset,
      camera_distance:      src.camera_distance,
      camera_height:        src.camera_height,
      fov:                  src.fov,
      zoom:                 src.zoom,
      shadow_strength:      src.shadow_strength,
      reflection_intensity: src.reflection_intensity,
      turn_direction:       src.turn_direction ?? 'clockwise',
      output_width:         src.output_width,
      output_height:        src.output_height,
      promo_tag:            src.promo_tag,
      lighting_config:      src.lighting_config,
      camera_config:        src.camera_config,
    })
    .select('*')
    .single()

  if (error) throw new Error(`duplicatePackage: ${error.message}`)
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

// ─── Products (store module bridge) ──────────────────────────────────────────

import type { P360StoreProduct } from './types'

export async function listStoreProducts(opts: {
  tenantId: string
  search?:  string
  page?:    number
  limit?:   number
  activeOnly?: boolean
}): Promise<{ products: P360StoreProduct[]; total: number }> {
  const supabase   = db()
  const pageSize   = opts.limit ?? 24
  const pageOffset = ((opts.page ?? 1) - 1) * pageSize

  // Only select columns that actually exist in the products table (005_ecommerce.sql).
  // The products table does NOT have category, sku, attributes, or image_url columns.
  // Querying non-existent columns causes a PostgREST 42703 error and a 500 response.
  let q = s(supabase)
    .from('products')
    .select('id, tenant_id, name, description, price, currency, inventory_count, is_active, created_at', { count: 'exact' })
    .eq('tenant_id', opts.tenantId)
    .order('name', { ascending: true })
    .range(pageOffset, pageOffset + pageSize - 1)

  if (opts.activeOnly !== false) q = q.eq('is_active', true)
  if (opts.search?.trim()) {
    const searchTerm = opts.search.trim()
    // Only filter on columns that exist
    q = q.or(`name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`)
  }

  const { data, error, count } = await q
  if (error) {
    console.error('[listStoreProducts] products query error:', error.message, { tenantId: opts.tenantId })
    throw new Error(`listStoreProducts: ${error.message}`)
  }

  const rows = (data ?? []) as Record<string, unknown>[]

  // Batch load 360 package counts for these products
  const productIds = rows.map(r => r.id as string)
  const pkgCounts: Record<string, { count: number; hasActive: boolean }> = {}

  if (productIds.length > 0) {
    const { data: pkgs } = await s(supabase)
      .from('product_360_packages')
      .select('product_id, status, is_enabled')
      .in('product_id', productIds)
      .eq('tenant_id', opts.tenantId)
      .neq('status', 'archived')

    for (const pkg of (pkgs ?? []) as Record<string, unknown>[]) {
      const pid = pkg.product_id as string
      if (!pkgCounts[pid]) pkgCounts[pid] = { count: 0, hasActive: false }
      pkgCounts[pid].count++
      if (pkg.status === 'ready' && pkg.is_enabled) pkgCounts[pid].hasActive = true
    }
  }

  // Batch load the first image per product.
  // product_images only has: id, tenant_id, product_id, image_url, created_at
  // There is no is_primary column — grab the earliest image per product instead.
  const imgMap: Record<string, string> = {}

  if (productIds.length > 0) {
    const { data: imgRows } = await s(supabase)
      .from('product_images')
      .select('product_id, image_url')
      .in('product_id', productIds)
      .order('created_at', { ascending: true })

    for (const img of (imgRows ?? []) as Record<string, unknown>[]) {
      const pid = img.product_id as string
      // Only keep the first image we encounter per product (order by created_at asc)
      if (!imgMap[pid] && img.image_url) {
        imgMap[pid] = img.image_url as string
      }
    }
  }

  const products: P360StoreProduct[] = rows.map(r => ({
    id:             r.id           as string,
    tenant_id:      r.tenant_id    as string,
    name:           r.name         as string,
    description:    (r.description as string | null),
    price:          (r.price       as number | null),
    currency:       (r.currency    as string | null),
    is_active:      (r.is_active   as boolean),
    image_url:      imgMap[r.id as string] ?? null,
    has_active_360: pkgCounts[r.id as string]?.hasActive ?? false,
    package_count:  pkgCounts[r.id as string]?.count ?? 0,
    created_at:     r.created_at   as string,
  }))

  return { products, total: count ?? 0 }
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
