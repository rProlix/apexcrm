// lib/product-360/frameService.ts
// Frame + hotspot CRUD helpers. SERVER-ONLY.

import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { P360Frame, P360Hotspot } from './types'

const db = () => getSupabaseServerClient()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const s  = (supabase: ReturnType<typeof db>) => supabase as any

// ─── Frames ───────────────────────────────────────────────────────────────────

export async function listFrames(packageId: string): Promise<P360Frame[]> {
  const supabase = db()
  const { data, error } = await s(supabase)
    .from('product_360_frames')
    .select('*')
    .eq('package_id', packageId)
    .order('frame_index', { ascending: true })

  if (error) throw new Error(`listFrames: ${error.message}`)
  return (data ?? []) as P360Frame[]
}

export async function upsertFrame(opts: {
  packageId:    string
  tenantId:     string
  productId:    string
  frameIndex:   number
  angleDegrees: number
  imageUrl:     string
  storagePath?: string
  width?:       number
  height?:      number
  fileSize?:    number
  altText?:     string
}): Promise<P360Frame> {
  const supabase = db()
  const { data, error } = await s(supabase)
    .from('product_360_frames')
    .upsert({
      package_id:    opts.packageId,
      tenant_id:     opts.tenantId,
      product_id:    opts.productId,
      frame_index:   opts.frameIndex,
      angle_degrees: opts.angleDegrees,
      image_url:     opts.imageUrl,
      storage_path:  opts.storagePath  ?? null,
      width:         opts.width        ?? null,
      height:        opts.height       ?? null,
      file_size:     opts.fileSize     ?? null,
      alt_text:      opts.altText      ?? null,
    }, { onConflict: 'package_id,frame_index' })
    .select('*')
    .single()

  if (error) throw new Error(`upsertFrame: ${error.message}`)
  return data as P360Frame
}

export async function updateFrame(
  frameId:  string,
  tenantId: string,
  updates:  Partial<Pick<P360Frame, 'alt_text' | 'frame_index' | 'metadata'>>,
): Promise<P360Frame> {
  const supabase = db()
  const { data, error } = await s(supabase)
    .from('product_360_frames')
    .update(updates)
    .eq('id', frameId)
    .eq('tenant_id', tenantId)
    .select('*')
    .single()

  if (error) throw new Error(`updateFrame: ${error.message}`)
  return data as P360Frame
}

export async function deleteFrame(frameId: string, tenantId: string): Promise<void> {
  const supabase = db()
  const { error } = await s(supabase)
    .from('product_360_frames')
    .delete()
    .eq('id', frameId)
    .eq('tenant_id', tenantId)

  if (error) throw new Error(`deleteFrame: ${error.message}`)
}

// ─── Hotspots ─────────────────────────────────────────────────────────────────

export async function listHotspots(packageId: string): Promise<P360Hotspot[]> {
  const supabase = db()
  const { data, error } = await s(supabase)
    .from('product_360_hotspots')
    .select('*')
    .eq('package_id', packageId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`listHotspots: ${error.message}`)
  return (data ?? []) as P360Hotspot[]
}

export async function createHotspot(opts: {
  tenantId:    string
  packageId:   string
  productId:   string
  frameIndex?: number
  label:       string
  description?: string
  x:           number
  y:           number
  z?:          number
  actionType?: string
  actionValue?: string
}): Promise<P360Hotspot> {
  const supabase = db()
  const { data, error } = await s(supabase)
    .from('product_360_hotspots')
    .insert({
      tenant_id:    opts.tenantId,
      package_id:   opts.packageId,
      product_id:   opts.productId,
      frame_index:  opts.frameIndex  ?? null,
      label:        opts.label,
      description:  opts.description ?? null,
      x:            opts.x,
      y:            opts.y,
      z:            opts.z           ?? null,
      action_type:  opts.actionType  ?? 'info',
      action_value: opts.actionValue ?? null,
    })
    .select('*')
    .single()

  if (error) throw new Error(`createHotspot: ${error.message}`)
  return data as P360Hotspot
}

export async function updateHotspot(
  hotspotId: string,
  tenantId:  string,
  updates:   Partial<Pick<P360Hotspot,
    'label' | 'description' | 'x' | 'y' | 'z' | 'frame_index' |
    'action_type' | 'action_value' | 'is_enabled'
  >>,
): Promise<P360Hotspot> {
  const supabase = db()
  const { data, error } = await s(supabase)
    .from('product_360_hotspots')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', hotspotId)
    .eq('tenant_id', tenantId)
    .select('*')
    .single()

  if (error) throw new Error(`updateHotspot: ${error.message}`)
  return data as P360Hotspot
}

export async function deleteHotspot(hotspotId: string, tenantId: string): Promise<void> {
  const supabase = db()
  const { error } = await s(supabase)
    .from('product_360_hotspots')
    .delete()
    .eq('id', hotspotId)
    .eq('tenant_id', tenantId)

  if (error) throw new Error(`deleteHotspot: ${error.message}`)
}

// ─── Post-frame-upload helpers ────────────────────────────────────────────────

/**
 * After a frame is uploaded, updates cover_frame_url from frame 0
 * and sets status to 'ready' if frame_count >= target_frame_count.
 */
export async function syncPackageAfterFrameUpload(opts: {
  packageId:        string
  tenantId:         string
  targetFrameCount: number
  newFrameIndex:    number
  newImageUrl:      string
}): Promise<void> {
  const { packageId, tenantId, targetFrameCount, newFrameIndex, newImageUrl } = opts
  const supabase = db()

  // Count uploaded frames
  const { count } = await s(supabase)
    .from('product_360_frames')
    .select('id', { count: 'exact', head: true })
    .eq('package_id', packageId)

  const framesDone  = count ?? 0
  const isComplete  = framesDone >= targetFrameCount
  const updateFields: Record<string, unknown> = {
    frame_count: framesDone,
    updated_at:  new Date().toISOString(),
  }

  if (isComplete) updateFields.status = 'ready'
  if (newFrameIndex === 0) updateFields.cover_frame_url = newImageUrl

  await s(supabase)
    .from('product_360_packages')
    .update(updateFields)
    .eq('id', packageId)
    .eq('tenant_id', tenantId)
}
