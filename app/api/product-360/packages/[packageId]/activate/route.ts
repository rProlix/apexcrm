import { NextRequest, NextResponse } from 'next/server'
import { resolveP360ApiUser } from '@/lib/product-360/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { setPrimaryPackage } from '@/lib/product-360/packageService'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ packageId: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const { packageId } = await ctx.params
  const user = await resolveP360ApiUser(req)
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  const tenantId = user.isOwner
    ? (req.nextUrl.searchParams.get('tenantId') ?? user.tenantId)
    : user.tenantId
  if (!tenantId) return NextResponse.json({ ok: false, error: 'Could not resolve tenant' }, { status: 400 })

  try {
    const supabase = getSupabaseServerClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { data: existing, error: existingErr } = await db
      .from('product_360_packages')
      .select('id, tenant_id, product_id, status, preview_image_url')
      .eq('id', packageId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (existingErr) throw new Error(existingErr.message)
    if (!existing) return NextResponse.json({ ok: false, error: 'Package not found' }, { status: 404 })

    const status = String(existing.status ?? '')
    if (status !== 'ready' && status !== 'completed') {
      return NextResponse.json({
        ok: false,
        error: `Only ready/completed packages can be activated. Current status: ${status || 'unknown'}`,
      }, { status: 409 })
    }

    const pkg = await setPrimaryPackage(packageId, tenantId)
    await db
      .from('product_360_packages')
      .update({ is_enabled: true, updated_at: new Date().toISOString() })
      .eq('id', packageId)
      .eq('tenant_id', tenantId)

    if (existing.product_id) {
      await db
        .from('products')
        .update({ spin_package_id: packageId, updated_at: new Date().toISOString() })
        .eq('id', existing.product_id)
        .eq('tenant_id', tenantId)
    }

    return NextResponse.json({ ok: true, package: { ...pkg, is_enabled: true } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to activate package'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
