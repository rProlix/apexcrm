// app/api/spin-packages/[id]/generate/route.ts
// POST /api/spin-packages/[id]/generate
//
// Triggers the 360° image generation pipeline for a given spin package.
// Owner / admin only.  The function runs inline (Fluid Compute) and streams
// back the final result. For large image_count values, upgrade the Vercel
// function maxDuration in vercel.json or switch to a Queue-based approach.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient }   from '@/lib/supabase/server'
import { resolveStoreUser }          from '@/lib/auth/resolveStoreUser'
import { runSpinGeneration, repairMissingFrames } from '@/lib/services/spin-generator'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const user    = await resolveStoreUser(req)
  if (!user)              return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = getSupabaseServerClient()

  // Verify ownership
  const { data: pkg } = await supabase
    .from('spin_packages')
    .select('id, status, tenant_id')
    .eq('id', id)
    .eq('tenant_id', user.tenant_id)
    .single()

  if (!pkg) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (pkg.status === 'generating') {
    return NextResponse.json({ error: 'Generation already in progress' }, { status: 409 })
  }

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* optional body */ }

  const repair = body.repair === true

  try {
    const result = repair
      ? await repairMissingFrames(id)
      : await runSpinGeneration(id)

    if (!result.success) {
      return NextResponse.json({ error: result.error, frame_count: result.frame_count }, { status: 500 })
    }

    return NextResponse.json({ success: true, frame_count: result.frame_count })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[POST /api/spin-packages/[id]/generate]', msg)

    // Mark package as failed
    await supabase
      .from('spin_packages')
      .update({ status: 'failed', error_message: msg })
      .eq('id', id)

    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
