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
    .select('id, name, prompt, frame_count, status, error_message, created_at, updated_at, product_id')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[GET /api/360/packages]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!packages?.length) {
    return NextResponse.json({ packages: [] })
  }

  // Fetch per-package frame counts in one query (avoids N+1 and join typing issues)
  const packageIds = packages.map(p => p.id)
  const { data: frameCounts } = await supabase
    .from('product_360_frames')
    .select('package_id')
    .in('package_id', packageIds)

  const countMap = new Map<string, number>()
  for (const row of frameCounts ?? []) {
    countMap.set(row.package_id, (countMap.get(row.package_id) ?? 0) + 1)
  }

  const result = packages.map(pkg => ({
    ...pkg,
    frames_done: countMap.get(pkg.id) ?? 0,
  }))

  return NextResponse.json({ packages: result })
}
