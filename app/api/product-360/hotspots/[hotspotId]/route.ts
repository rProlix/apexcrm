// app/api/product-360/hotspots/[hotspotId]/route.ts
import { NextRequest, NextResponse }    from 'next/server'
import { resolveP360ApiUser }           from '@/lib/product-360/auth'
import { updateHotspot, deleteHotspot } from '@/lib/product-360/frameService'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ hotspotId: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { hotspotId } = await ctx.params
  const user = await resolveP360ApiUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const allowed = ['label','description','x','y','z','frame_index','action_type','action_value','is_enabled']
  const updates: Record<string, unknown> = {}
  for (const k of allowed) { if (k in body) updates[k] = body[k] }

  try {
    const hotspot = await updateHotspot(hotspotId, user.tenantId, updates as never)
    return NextResponse.json({ hotspot })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { hotspotId } = await ctx.params
  const user = await resolveP360ApiUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    await deleteHotspot(hotspotId, user.tenantId)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
