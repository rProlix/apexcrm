// app/api/product-360/packages/[packageId]/unarchive/route.ts
//
// POST — restore a soft-archived 360° package.
//
// Restores the package to the most appropriate status based on its frame data
// and error state. See unarchivePackage() in packageService for restore logic.
//
// Response:
//   { ok: true,  data: { packageId, status, restoredTo, message } }
//   { ok: false, error: { type, title, message, details? } }

import { NextRequest, NextResponse }    from 'next/server'
import { resolveP360ApiUser }           from '@/lib/product-360/auth'
import { unarchivePackage }             from '@/lib/product-360/packageService'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ packageId: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const { packageId } = await ctx.params

  const user = await resolveP360ApiUser(req)
  if (!user) {
    return NextResponse.json({
      ok: false,
      error: { type: 'auth_error', title: 'Unauthorized', message: 'Authentication required.' },
    }, { status: 401 })
  }
  if (user.role !== 'owner' && user.role !== 'admin') {
    return NextResponse.json({
      ok: false,
      error: { type: 'forbidden', title: 'Forbidden', message: 'Only owners and admins can unarchive packages.' },
    }, { status: 403 })
  }

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* optional */ }

  const tenantId = user.isOwner
    ? (body.tenantId as string | undefined) ?? user.tenantId
    : user.tenantId

  if (!tenantId) {
    return NextResponse.json({
      ok: false,
      error: { type: 'invalid_request', title: 'Missing tenant', message: 'Could not resolve tenant.' },
    }, { status: 400 })
  }

  try {
    const pkg = await unarchivePackage(packageId, tenantId)
    return NextResponse.json({
      ok: true,
      data: {
        packageId,
        status:     pkg.status,
        restoredTo: pkg.status,
        message:    `Package restored to "${pkg.status}".`,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to unarchive package'
    const status = msg.includes('not found') ? 404 : msg.includes('Cannot unarchive') ? 409 : 500
    return NextResponse.json({
      ok: false,
      error: { type: 'internal', title: 'Unarchive failed', message: msg },
    }, { status })
  }
}
