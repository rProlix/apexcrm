// app/api/ai/generate-360/[id]/route.ts
// GET  /api/ai/generate-360/[id]  — poll status + progress
// DELETE  /api/ai/generate-360/[id]  — delete spin + storage

import { NextRequest, NextResponse }     from 'next/server'
import { getSupabaseServerClient }       from '@/lib/supabase/server'
import { resolveStoreUser }              from '@/lib/auth/resolveStoreUser'
import { delete360SpinFrames }           from '@/lib/services/spin-generator/generate360'

type Params = { params: Promise<{ id: string }> }

// ─── GET ─────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params
  const user    = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase
    .from('product_360_spins')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', user.tenant_id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const urls         = Array.isArray(data.image_urls) ? data.image_urls as string[] : []
  const frames_done  = urls.filter(Boolean).length

  return NextResponse.json({
    spin: {
      ...data,
      frames_done,
      frames_total: data.total_frames,
    }
  })
}

// ─── DELETE ───────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params
  const user    = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = getSupabaseServerClient()

  const { data: spin } = await supabase
    .from('product_360_spins')
    .select('id, tenant_id, product_id')
    .eq('id', id)
    .eq('tenant_id', user.tenant_id)
    .single()

  if (!spin) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Detach from product
  await supabase
    .from('products')
    .update({ spin_360_id: null })
    .eq('spin_360_id', id)
    .eq('tenant_id', user.tenant_id)

  // Clean up storage
  try {
    await delete360SpinFrames(spin.tenant_id, spin.product_id, spin.id)
  } catch (err) {
    console.warn('[DELETE /api/ai/generate-360] storage cleanup error:', err)
  }

  const { error } = await supabase
    .from('product_360_spins')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[DELETE /api/ai/generate-360]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
