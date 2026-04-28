// app/api/ai/generate-360/[id]/run/route.ts
// POST /api/ai/generate-360/[id]/run
//
// Triggers the long-running generation pipeline for a spin record.
// Called by the client immediately after creating the record.
// The client does NOT await this response — it polls /[id] for progress.
//
// Owner / admin only.

import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser }          from '@/lib/auth/resolveStoreUser'
import { getSupabaseServerClient }   from '@/lib/supabase/server'
import { generate360Spin }           from '@/lib/services/spin-generator/generate360'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const user    = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = getSupabaseServerClient()

  // Verify ownership + not already running
  const { data: spin } = await supabase
    .from('product_360_spins')
    .select('id, status, tenant_id')
    .eq('id', id)
    .eq('tenant_id', user.tenant_id)
    .single()

  if (!spin) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (spin.status === 'generating') {
    return NextResponse.json({ error: 'Generation already in progress' }, { status: 409 })
  }

  // Run generation. This is a long-lived call on Vercel Fluid Compute (up to 300s).
  // The client does not await this endpoint — it polls /[id] for status instead.
  try {
    const result = await generate360Spin(id)
    if (!result.success) {
      return NextResponse.json({ error: result.error, frame_count: result.frame_count }, { status: 500 })
    }
    return NextResponse.json({ success: true, frame_count: result.frame_count })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[POST /api/ai/generate-360/[id]/run]', msg)
    await supabase
      .from('product_360_spins')
      .update({ status: 'failed', error_message: msg })
      .eq('id', id)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
