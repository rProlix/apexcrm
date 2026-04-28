// app/api/360-spins/route.ts
// GET /api/360-spins  — list spins for a tenant (optionally filtered by product)

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient }   from '@/lib/supabase/server'
import { resolveStoreUser }          from '@/lib/auth/resolveStoreUser'

export async function GET(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const tenantId  = user.role === 'owner'
    ? (req.nextUrl.searchParams.get('tenant_id') ?? user.tenant_id)
    : user.tenant_id
  const productId = req.nextUrl.searchParams.get('product_id')

  const supabase = getSupabaseServerClient()
  let query = supabase
    .from('product_360_spins')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (productId) query = query.eq('product_id', productId) as typeof query

  const { data, error } = await query
  if (error) {
    console.error('[GET /api/360-spins]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ spins: data ?? [] })
}
