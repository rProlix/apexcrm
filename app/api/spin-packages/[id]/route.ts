// app/api/spin-packages/[id]/route.ts
// GET    /api/spin-packages/[id]   — fetch one package with its images
// DELETE /api/spin-packages/[id]   — delete package + storage (owner only)

import { NextRequest, NextResponse }      from 'next/server'
import { getSupabaseServerClient }        from '@/lib/supabase/server'
import { resolveStoreUser }               from '@/lib/auth/resolveStoreUser'
import { deletePackageFrames }            from '@/lib/services/spin-generator'

type Params = { params: Promise<{ id: string }> }

// ─── GET /api/spin-packages/[id] ─────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params
  const user    = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase
    .from('spin_packages')
    .select('*, spin_images(id, image_url, frame_index, storage_path, created_at)')
    .eq('id', id)
    .eq('tenant_id', user.tenant_id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ package: data })
}

// ─── DELETE /api/spin-packages/[id] ──────────────────────────────────────────
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params
  const user    = await resolveStoreUser(req)
  if (!user)              return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = getSupabaseServerClient()

  // Load to get tenant + product IDs for storage cleanup
  const { data: pkg } = await supabase
    .from('spin_packages')
    .select('id, tenant_id, product_id')
    .eq('id', id)
    .eq('tenant_id', user.tenant_id)
    .single()

  if (!pkg) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Detach from any product first
  await supabase
    .from('products')
    .update({ spin_package_id: null })
    .eq('spin_package_id', id)

  // Delete storage files (best-effort — do not fail if bucket is empty)
  try {
    await deletePackageFrames(pkg.tenant_id, pkg.product_id, pkg.id)
  } catch (err) {
    console.warn('[DELETE /api/spin-packages] storage cleanup error:', err)
  }

  // Delete DB record (cascades to spin_images)
  const { error } = await supabase
    .from('spin_packages')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[DELETE /api/spin-packages]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
