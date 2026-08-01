import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveVanDamageAccess } from '@/lib/server/van-damage/access'
import { getVanDamageServiceClient } from '@/lib/server/van-damage/supabase'

export const runtime = 'nodejs'

const schema = z.object({ favorite: z.boolean() })

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ vehicleId: string }> }
) {
  const access = await resolveVanDamageAccess(request.nextUrl.searchParams.get('businessId'))
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const { vehicleId } = await params
  if (!z.string().uuid().safeParse(vehicleId).success) {
    return NextResponse.json({ error: 'Invalid vehicle' }, { status: 400 })
  }
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success)
    return NextResponse.json({ error: 'Invalid favorite state' }, { status: 400 })

  const db = getVanDamageServiceClient()
  const { data: vehicle } = await db
    .from('vehicles')
    .select('id')
    .eq('id', vehicleId)
    .eq('tenant_id', access.tenantId)
    .maybeSingle()
  if (!vehicle) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })

  const favorites = db as unknown as {
    from(table: 'van_damage_favorite_vehicles'): {
      upsert(
        values: Record<string, unknown>,
        options: { onConflict: string }
      ): Promise<{ error: { message: string } | null }>
      delete(): {
        eq(
          column: string,
          value: string
        ): {
          eq(
            column: string,
            value: string
          ): {
            eq(column: string, value: string): Promise<{ error: { message: string } | null }>
          }
        }
      }
    }
  }

  const result = parsed.data.favorite
    ? await favorites.from('van_damage_favorite_vehicles').upsert(
        {
          tenant_id: access.tenantId,
          business_id: access.businessId,
          vehicle_id: vehicleId,
          favorited_by: access.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,business_id,vehicle_id' }
      )
    : await favorites
        .from('van_damage_favorite_vehicles')
        .delete()
        .eq('tenant_id', access.tenantId)
        .eq('business_id', access.businessId)
        .eq('vehicle_id', vehicleId)

  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 })
  return NextResponse.json({ favorite: parsed.data.favorite })
}
