import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveVanDamageAccess } from '@/lib/server/van-damage/access'
import { getVanDamageServiceClient } from '@/lib/server/van-damage/supabase'
import type { Json } from '@/lib/supabase/types'

export const runtime = 'nodejs'

const schema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('manual'), imageId: z.string().uuid(), reason: z.string().max(500).optional() }),
  z.object({ mode: z.literal('automatic_first_upload'), reason: z.string().max(500).optional() }),
])

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

type LooseQuery = {
  select: (columns: string) => LooseQuery
  eq: (column: string, value: string) => LooseQuery
  in: (column: string, values: string[]) => LooseQuery
  not: (column: string, operator: string, value: unknown) => LooseQuery
  order: (column: string, options: { ascending: boolean }) => LooseQuery
  limit: (count: number) => Promise<{ data: unknown[] | null; error?: { message: string } | null }>
  maybeSingle: () => Promise<{ data: unknown | null; error?: { message: string } | null }>
}

type LooseDb = { from: (table: string) => LooseQuery }

async function loadVehicle(request: NextRequest, vehicleId: string) {
  const access = await resolveVanDamageAccess(request.nextUrl.searchParams.get('businessId'), { manage: true })
  if (!access.ok) return { response: NextResponse.json({ error: access.error }, { status: access.status }) } as const
  const db = getVanDamageServiceClient()
  const { data: vehicle, error } = await db.from('vehicles')
    .select('id, tenant_id, metadata')
    .eq('id', vehicleId)
    .eq('tenant_id', access.tenantId)
    .maybeSingle()
  if (error) return { response: NextResponse.json({ error: error.message }, { status: 500 }) } as const
  if (!vehicle) return { response: NextResponse.json({ error: 'Vehicle not found' }, { status: 404 }) } as const
  return { access, db, vehicle } as const
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ vehicleId: string }> },
) {
  const { vehicleId } = await params
  const loaded = await loadVehicle(request, vehicleId)
  if ('response' in loaded) return loaded.response
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid profile image update' }, { status: 400 })
  const { access, db, vehicle } = loaded
  const looseDb = db as unknown as LooseDb

  let imageId: string | null = null
  if (parsed.data.mode === 'manual') {
    const { data: imageResult, error } = await looseDb.from('van_damage_images')
      .select('id, inspection_id, van_damage_inspections!inner(van_id)')
      .eq('id', parsed.data.imageId)
      .eq('tenant_id', access.tenantId)
      .eq('business_id', access.businessId)
      .maybeSingle()
    const image = imageResult as { id: string; van_damage_inspections?: { van_id?: string } | null } | null
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const inspection = image?.van_damage_inspections as { van_id?: string } | null
    if (!image || inspection?.van_id !== vehicleId) {
      return NextResponse.json({ error: 'Image is not available for this vehicle' }, { status: 404 })
    }
    imageId = image.id
  } else {
    const { data: imageRows } = await looseDb.from('van_damage_images')
      .select('id, upload_order, original_file_index, created_at, van_damage_inspections!inner(van_id)')
      .eq('tenant_id', access.tenantId)
      .eq('business_id', access.businessId)
      .eq('van_damage_inspections.van_id', vehicleId)
      .in('status', ['uploaded', 'analyzed'])
      .not('s3_key', 'is', null)
      .order('created_at', { ascending: true })
      .limit(50)
    const image = (imageRows ?? []) as Array<{ id: string; upload_order: number | null; original_file_index: number | null }>
    imageId = image
      .sort((a, b) => (a.upload_order ?? a.original_file_index ?? 2147483647) - (b.upload_order ?? b.original_file_index ?? 2147483647))[0]?.id ?? null
  }

  const metadata = asRecord(vehicle.metadata)
  const vanDamage = asRecord(metadata.vanDamage)
  const nextMetadata = {
    ...metadata,
    vanDamage: {
      ...vanDamage,
      profileImage: {
        mode: parsed.data.mode,
        imageId,
        updatedAt: new Date().toISOString(),
        updatedBy: access.userId,
        reason: parsed.data.reason ?? null,
      },
    },
  }
  const { error } = await db.from('vehicles').update({ metadata: nextMetadata as unknown as Json })
    .eq('id', vehicleId)
    .eq('tenant_id', access.tenantId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, imageId, mode: parsed.data.mode })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ vehicleId: string }> },
) {
  const { vehicleId } = await params
  const loaded = await loadVehicle(request, vehicleId)
  if ('response' in loaded) return loaded.response
  const metadata = asRecord(loaded.vehicle.metadata)
  const vanDamage = asRecord(metadata.vanDamage)
  const restVanDamage = { ...vanDamage }
  delete restVanDamage.profileImage
  const { error } = await loaded.db.from('vehicles').update({
    metadata: { ...metadata, vanDamage: restVanDamage } as unknown as Json,
  }).eq('id', vehicleId).eq('tenant_id', loaded.access.tenantId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
