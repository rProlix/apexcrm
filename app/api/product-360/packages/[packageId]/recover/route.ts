// app/api/product-360/packages/[packageId]/recover/route.ts
// POST — Force-reconcile and finalize a specific stuck package.
// Owner / admin only.

import { NextRequest, NextResponse }  from 'next/server'
import { resolveP360ApiUser }         from '@/lib/product-360/auth'
import { getSupabaseServerClient }    from '@/lib/supabase/server'
import { reconcilePackageProgress }   from '@/lib/product-360/reconcile'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ packageId: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const { packageId } = await ctx.params
  const user = await resolveP360ApiUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const tenantId = user.isOwner
    ? ((await req.json().catch(() => ({}))) as Record<string, unknown>).tenantId as string | undefined ?? user.tenantId
    : user.tenantId

  if (!tenantId) return NextResponse.json({ error: 'Could not resolve tenant' }, { status: 400 })

  // Validate ownership
  const supabase = getSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pkg } = await (supabase as any)
    .from('product_360_packages')
    .select('id, status')
    .eq('id', packageId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!pkg) return NextResponse.json({ error: 'Package not found' }, { status: 404 })

  const result = await reconcilePackageProgress(packageId, /* force */ true)

  return NextResponse.json({
    packageId,
    ...result,
  })
}
