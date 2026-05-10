// app/api/website/sections/[sectionId]/images/route.ts
// GET — list all generated images for a section, grouped by image_slot.
// Query params:
//   imageSlot        (optional) filter to one slot
//   includeArchived  (optional, default false)

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { WebsiteGeneratedImage } from '@/lib/builder/api'

type RouteContext = {
  params: Promise<{ sectionId: string }>
}

export async function GET(req: NextRequest, context: RouteContext) {
  const { sectionId } = await context.params

  const ctx = await getUserContext()
  if (!ctx || !ctx.tenant_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const imageSlot       = searchParams.get('imageSlot') ?? null
  const includeArchived = searchParams.get('includeArchived') === 'true'

  const supabase = getSupabaseServerClient()

  // website_generated_images is added by migration 057.
  // Cast through unknown until Supabase types are regenerated.
  const db = supabase as unknown as {
    from: (table: 'website_generated_images') => ReturnType<typeof supabase.from>
  }

  let query = (db.from('website_generated_images') as ReturnType<typeof supabase.from>)
    .select('*')
    .eq('tenant_id', ctx.tenant_id)
    .eq('section_id', sectionId)
    .order('created_at', { ascending: false })

  if (imageSlot)        query = query.eq('image_slot', imageSlot)
  if (!includeArchived) query = query.eq('is_archived', false)

  const { data, error } = await query

  if (error) {
    console.error('[section-images/GET]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const images = (data ?? []) as WebsiteGeneratedImage[]

  const activeBySlot: Record<string, WebsiteGeneratedImage | null> = {}
  for (const img of images) {
    if (img.is_active && !img.is_archived && !activeBySlot[img.image_slot]) {
      activeBySlot[img.image_slot] = img
    }
  }

  return NextResponse.json({ images, activeBySlot, sectionId, tenantId: ctx.tenant_id })
}
