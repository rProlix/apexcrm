// app/api/360/products/route.ts
// GET /api/360/products?tenant_id=xxx
//
// Returns products for the tenant that can have a 360 spin viewer attached.
// Includes current spin_package_id so the UI can show whether a package is already attached.

import { NextRequest, NextResponse }  from 'next/server'
import { getSupabaseServerClient }    from '@/lib/supabase/server'
import { resolve360ApiUser, resolveTenantFor360Request } from '@/lib/360/auth'

export async function GET(req: NextRequest) {
  const user = await resolve360ApiUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url      = new URL(req.url)
  const tenantId = resolveTenantFor360Request(user, url.searchParams.get('tenant_id'))
  if (!tenantId) return NextResponse.json({ error: 'Could not resolve tenant' }, { status: 400 })

  const supabase = getSupabaseServerClient()

  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, description, image_url, spin_package_id, is_active')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('name')

  if (error) {
    console.error('[GET /api/360/products]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ products: products ?? [] })
}
