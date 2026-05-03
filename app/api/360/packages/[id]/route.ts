// app/api/360/packages/[id]/route.ts
// GET    /api/360/packages/[id]   — get package with frames
// PATCH  /api/360/packages/[id]   — update name, description, product_id, status, settings
// DELETE /api/360/packages/[id]   — delete package + frames + storage

import { NextRequest, NextResponse }    from 'next/server'
import { getSupabaseServerClient }      from '@/lib/supabase/server'
import { resolve360ApiUser }            from '@/lib/360/auth'
import { delete360PackageStorage }      from '@/lib/360/storage'

type Params = { params: Promise<{ id: string }> }

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params
  const user   = await resolve360ApiUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseServerClient()

  const { data: pkg, error } = await supabase
    .from('product_360_packages')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error || !pkg) return NextResponse.json({ error: 'Package not found' }, { status: 404 })

  // Admin must match tenant
  if (user.role !== 'owner' && pkg.tenant_id !== user.tenant_id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: frames } = await supabase
    .from('product_360_frames')
    .select('id, frame_index, angle_degrees, image_url, storage_path, width, height, created_at')
    .eq('package_id', id)
    .order('frame_index')

  return NextResponse.json({ package: { ...pkg, frames: frames ?? [] } })
}

// ─── PATCH ───────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const user   = await resolve360ApiUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const supabase = getSupabaseServerClient()

  // Verify ownership
  const { data: existing } = await supabase
    .from('product_360_packages')
    .select('id, tenant_id')
    .eq('id', id)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Package not found' }, { status: 404 })
  if (user.role !== 'owner' && existing.tenant_id !== user.tenant_id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const allowedStatuses = ['draft', 'queued', 'generating', 'ready', 'failed']
  const updates: Record<string, unknown> = {}

  if (typeof body.name === 'string' && body.name.trim())
    updates.name = body.name.trim()
  if ('description' in body)
    updates.description = typeof body.description === 'string' ? body.description.trim() || null : null
  if ('product_id' in body)
    updates.product_id = typeof body.product_id === 'string' ? body.product_id || null : null
  if ('prompt' in body)
    updates.prompt = typeof body.prompt === 'string' ? body.prompt.trim() || null : null
  if (typeof body.status === 'string' && allowedStatuses.includes(body.status))
    updates.status = body.status
  if (body.settings && typeof body.settings === 'object')
    updates.settings = body.settings

  if (!Object.keys(updates).length)
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated, error } = await (supabase as any)
    .from('product_360_packages')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[PATCH /api/360/packages/[id]]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ package: updated })
}

// ─── DELETE ──────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params
  const user   = await resolve360ApiUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = getSupabaseServerClient()

  const { data: pkg } = await supabase
    .from('product_360_packages')
    .select('id, tenant_id')
    .eq('id', id)
    .maybeSingle()

  if (!pkg) return NextResponse.json({ error: 'Package not found' }, { status: 404 })
  if (user.role !== 'owner' && pkg.tenant_id !== user.tenant_id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Detach from products
  await supabase
    .from('products')
    .update({ spin_package_id: null })
    .eq('spin_package_id', id)
    .eq('tenant_id', pkg.tenant_id)

  // Delete from DB (frames cascade)
  const { error } = await supabase
    .from('product_360_packages')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[DELETE /api/360/packages/[id]]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Best-effort storage cleanup (non-fatal)
  const storageOk = await delete360PackageStorage(pkg.tenant_id, id)

  return NextResponse.json({
    success: true,
    ...(storageOk ? {} : { warning: 'Package deleted but storage cleanup failed' }),
  })
}
