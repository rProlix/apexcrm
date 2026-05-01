// app/api/360/generate/[id]/route.ts
// GET /api/360/generate/[id]
//
// Poll endpoint — returns package status and frame progress.
// Also accepts POST to re-trigger generation (retry after failure).

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient }   from '@/lib/supabase/server'
import { resolveStoreUser }          from '@/lib/auth/resolveStoreUser'
import { generatePackage360 }        from '@/lib/services/spin-generator/generate360Package'
import { safeOptional, safeSingle }  from '@/lib/supabase/safeQuery'
import type { Database }             from '@/lib/supabase/types'

type Product360Package = Database['public']['Tables']['product_360_packages']['Row']

type Params = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params
  const user   = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseServerClient()

  const { data, error } = await supabase
    .from('product_360_packages')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  const pkg = safeOptional<Product360Package>(data as Product360Package | null, error)
  if (!pkg) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Count completed frames for progress display
  const { count: frames_done } = await supabase
    .from('product_360_frames')
    .select('id', { count: 'exact', head: true })
    .eq('package_id', id)

  return NextResponse.json({
    package: {
      ...(pkg as Record<string, unknown>),
      frames_done: frames_done ?? 0,
    },
  })
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const user   = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = getSupabaseServerClient()

  try {
    const { data, error } = await supabase
      .from('product_360_packages')
      .select('id, status, tenant_id')
      .eq('id', id)
      .maybeSingle()

    const pkg = safeSingle<Pick<Product360Package, 'id' | 'status' | 'tenant_id'>>(
      data as Pick<Product360Package, 'id' | 'status' | 'tenant_id'> | null,
      error,
      'Package not found',
    )

    if (pkg.status === 'generating') {
      return NextResponse.json({ error: 'Generation already in progress' }, { status: 409 })
    }

    // Fire-and-forget
    generatePackage360(id).catch(err =>
      console.error('[POST /api/360/generate/[id]] retry error:', err)
    )

    return NextResponse.json({ status: 'generating' })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error'
    const status  = message === 'Package not found' ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
