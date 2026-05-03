// app/api/product-360/frames/[frameId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveP360ApiUser }        from '@/lib/product-360/auth'
import { updateFrame, deleteFrame }  from '@/lib/product-360/frameService'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ frameId: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { frameId } = await ctx.params
  const user = await resolveP360ApiUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const updates: Record<string, unknown> = {}
  if ('alt_text'    in body) updates.alt_text    = body.alt_text
  if ('frame_index' in body) updates.frame_index = body.frame_index
  if ('metadata'    in body) updates.metadata    = body.metadata

  try {
    const frame = await updateFrame(frameId, user.tenantId, updates as never)
    return NextResponse.json({ frame })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { frameId } = await ctx.params
  const user = await resolveP360ApiUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    await deleteFrame(frameId, user.tenantId)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
