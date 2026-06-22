// app/api/website/3d-assets/[assetId]/activate/route.ts
//
// Activate an uploaded asset as the active hero media for a section. This flips
// the is_active flag on website_3d_assets (server-side, tenant-scoped) and
// returns a `contentPatch` the builder client should merge into the section's
// DRAFT content (via the existing optimistic store + autosave). The section
// content itself is the canonical runtime source of truth, so we never write it
// from here — keeping a single, well-tested persistence path for draft/publish.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext }           from '@/lib/auth/getUserContext'
import { getSupabaseServerClient }  from '@/lib/supabase/server'

type RouteContext = { params: Promise<{ assetId: string }> }

type ActivateMode = 'video' | 'image_sequence' | 'poster' | 'fallback'
const VALID_MODES = new Set<ActivateMode>(['video', 'image_sequence', 'poster', 'fallback'])

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Asset = Record<string, any>

/** Natural sort by filename so frame_2 < frame_10 */
function naturalName(a: Asset): string {
  const n = String(a.name ?? a.storage_path ?? '')
  return n.replace(/\d+/g, (m) => m.padStart(8, '0'))
}

export async function POST(req: NextRequest, context: RouteContext) {
  const { assetId } = await context.params
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()

  let body: { section_id?: string; mode?: string } = {}
  try { body = await req.json() } catch { /* allow empty */ }

  const sectionId = body.section_id || null
  const mode = body.mode as ActivateMode | undefined
  if (!mode || !VALID_MODES.has(mode)) {
    return NextResponse.json({ error: 'mode must be video | image_sequence | poster | fallback' }, { status: 400 })
  }

  const db = getSupabaseServerClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: asset } = await (db as any)
    .from('website_3d_assets')
    .select('*')
    .eq('id', assetId)
    .maybeSingle()

  if (!asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
  if (ctx.role !== 'owner' && ctx.tenant_id !== asset.tenant_id) return forbidden()

  const tenantId = asset.tenant_id as string

  // Resolve the ordered frame URLs for an image sequence.
  let imageSequenceUrls: string[] | undefined
  if (mode === 'image_sequence') {
    const sequenceId = (asset.metadata?.sequenceId as string | undefined) ?? null
    const metaFrames = Array.isArray(asset.metadata?.frameUrls)
      ? (asset.metadata.frameUrls as unknown[]).filter((u): u is string => typeof u === 'string')
      : null

    if (metaFrames && metaFrames.length > 0) {
      imageSequenceUrls = metaFrames
    } else if (sequenceId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: frames } = await (db as any)
        .from('website_3d_assets')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('asset_type', 'image_sequence_frame')
        .contains('metadata', { sequenceId })
      const ordered = (frames ?? []) as Asset[]
      ordered.sort((a, b) => {
        const fa = a.frame_index ?? a.sort_order ?? 0
        const fb = b.frame_index ?? b.sort_order ?? 0
        if (fa !== fb) return fa - fb
        return naturalName(a).localeCompare(naturalName(b))
      })
      imageSequenceUrls = ordered.map((f) => f.public_url).filter((u): u is string => !!u)
    } else {
      imageSequenceUrls = asset.public_url ? [asset.public_url as string] : []
    }
  }

  // Flip is_active: clear siblings of the same asset_type for this section, then
  // mark this asset active. Only scope clearing to a section when we have one.
  const activeTypes =
    mode === 'video' ? ['video']
    : mode === 'image_sequence' ? ['image_sequence']
    : mode === 'poster' ? ['poster']
    : ['fallback']

  if (sectionId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any)
      .from('website_3d_assets')
      .update({ is_active: false })
      .eq('tenant_id', tenantId)
      .eq('section_id', sectionId)
      .in('asset_type', activeTypes)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any)
    .from('website_3d_assets')
    .update({ is_active: true, section_id: sectionId ?? asset.section_id ?? null })
    .eq('id', assetId)

  // Build the content patch the client merges into the draft section.
  const url = (asset.public_url ?? asset.signed_url) as string | null
  let contentPatch: Record<string, unknown> = {}
  if (mode === 'video') {
    contentPatch = {
      renderMode: 'video_scrub',
      useImageSequence: false,
      videoUrl: url,
      activeVideoAssetId: assetId,
      activeAssetId: assetId,
    }
  } else if (mode === 'image_sequence') {
    contentPatch = {
      renderMode: 'video_scrub',
      useImageSequence: true,
      imageSequenceUrls: imageSequenceUrls ?? [],
      activeImageSequenceAssetId: assetId,
      activeAssetId: assetId,
    }
  } else if (mode === 'poster') {
    contentPatch = { posterUrl: url, posterAssetId: assetId }
  } else if (mode === 'fallback') {
    contentPatch = { fallbackImageUrl: url, fallbackAssetId: assetId }
  }

  return NextResponse.json({
    ok: true,
    asset: { ...asset, is_active: true },
    contentPatch,
  })
}
