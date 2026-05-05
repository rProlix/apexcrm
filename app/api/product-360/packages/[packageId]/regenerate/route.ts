// app/api/product-360/packages/[packageId]/regenerate/route.ts
// POST — Regenerate ALL frames in a package (re-runs even if status is ready).
// Awaits generatePackage() synchronously for the same reason as the generate route.

import { NextRequest, NextResponse }           from 'next/server'
import { resolveP360ApiUser, resolveTenantId } from '@/lib/product-360/auth'
import { getSupabaseServerClient }             from '@/lib/supabase/server'
import { generatePackage }                     from '@/lib/product-360/generationService'

export const dynamic     = 'force-dynamic'
export const maxDuration = 300

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ packageId: string }> },
) {
  const { packageId } = await params
  const user = await resolveP360ApiUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* ok */ }

  const tenantId = resolveTenantId(user, body.tenantId as string | null)
  if (!tenantId) return NextResponse.json({ error: 'Could not resolve tenant' }, { status: 400 })

  const supabase = getSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // Validate ownership
  const { data: pkg } = await db
    .from('product_360_packages')
    .select('id, status')
    .eq('id', packageId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!pkg) return NextResponse.json({ error: 'Package not found' }, { status: 404 })

  // Reset state before regenerating
  await db
    .from('product_360_packages')
    .update({
      status:           'queued',
      generation_error: null,
      frames_done:      0,
      progress_percent: 0,
      updated_at:       new Date().toISOString(),
    })
    .eq('id', packageId)

  console.info(`[p360:regenerate/route] pkg=${packageId} queued for regeneration…`)

  const result = await generatePackage(packageId)

  if (!result.success) {
    return NextResponse.json({
      success:  false,
      status:   'failed',
      error:    result.errorMessage ?? 'Regeneration failed',
      packageId,
    }, { status: 500 })
  }

  return NextResponse.json({
    success:         true,
    status:          'ready',
    packageId,
    framesGenerated: result.framesGenerated,
    previewUrl:      result.previewUrl ?? null,
    message:         'Regeneration complete',
  })
}
