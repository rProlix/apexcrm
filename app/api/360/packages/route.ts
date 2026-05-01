// app/api/360/packages/route.ts
// GET /api/360/packages?tenant_id=xxx
//
// Lists product_360_packages for a tenant, with frame counts and product name.
// Owner can query any tenant; admin/staff see only their own.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient }   from '@/lib/supabase/server'
import { resolveStoreUser }          from '@/lib/auth/resolveStoreUser'

export async function GET(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url      = new URL(req.url)
  const tenantId = user.role === 'owner'
    ? (url.searchParams.get('tenant_id') ?? user.tenant_id)
    : user.tenant_id

  const supabase = getSupabaseServerClient()

  const { data: packages, error } = await supabase
    .from('product_360_packages')
    .select(`
      id, name, prompt, frame_count, status, error_message, created_at, updated_at,
      product_id,
      product_360_frames(id)
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[GET /api/360/packages]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const result = (packages ?? []).map(pkg => ({
    ...pkg,
    frames_done: Array.isArray(pkg.product_360_frames) ? pkg.product_360_frames.length : 0,
    product_360_frames: undefined,
  }))

  return NextResponse.json({ packages: result })
}
