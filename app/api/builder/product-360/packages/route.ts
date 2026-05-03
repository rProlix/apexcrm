// app/api/builder/product-360/packages/route.ts
// Builder API: returns packages and products for the website builder editor.

import { NextRequest, NextResponse } from 'next/server'
import { resolveP360ApiUser }        from '@/lib/product-360/auth'
import { listPackages }              from '@/lib/product-360/packageService'
import { getSupabaseServerClient }   from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// GET /api/builder/product-360/packages
export async function GET(req: NextRequest) {
  const user = await resolveP360ApiUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const tenantId = user.isOwner
    ? (req.nextUrl.searchParams.get('tenantId') ?? user.tenantId)
    : user.tenantId

  const supabase = getSupabaseServerClient()

  // Get products
  const { data: products } = await supabase
    .from('products')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('name')

  // Get packages (only ready + enabled for builder selection)
  const packages = await listPackages({ tenantId })

  return NextResponse.json({
    products: products ?? [],
    packages,
  })
}
