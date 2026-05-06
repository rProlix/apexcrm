// app/api/product-360/packages/[packageId]/archive/route.ts
//
// POST — soft-archive a 360° package.
//
// Archive is a SOFT operation: no images are deleted from Supabase storage.
// The package row is updated to status = 'archived' with metadata.
// Packages in an active generating state are blocked unless forceArchive = true.
//
// Response:
//   { ok: true,  data: { packageId, status, message } }
//   { ok: false, error: { type, title, message, details? } }

import { NextRequest, NextResponse }         from 'next/server'
import { resolveP360ApiUser }                from '@/lib/product-360/auth'
import { archivePackage, getPackageWithFrames } from '@/lib/product-360/packageService'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ packageId: string }> }

const ACTIVE_STATUSES = new Set(['queued', 'planning', 'generating', 'processing'])

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
      error: { type: 'forbidden', title: 'Forbidden', message: 'Only owners and admins can archive packages.' },
    }, { status: 403 })
  }

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* optional body */ }

  const tenantId = user.isOwner
    ? (body.tenantId as string | undefined) ?? user.tenantId
    : user.tenantId

  if (!tenantId) {
    return NextResponse.json({
      ok: false,
      error: { type: 'invalid_request', title: 'Missing tenant', message: 'Could not resolve tenant.' },
    }, { status: 400 })
  }

  const forceArchive  = !!(body.forceArchive)
  const archiveReason = (body.archiveReason as string | undefined) ?? null

  // Load the package to check its status
  let pkg
  try {
    pkg = await getPackageWithFrames(packageId, tenantId)
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: { type: 'internal', title: 'Lookup failed', message: 'Failed to load package.', details: err instanceof Error ? err.message : undefined },
    }, { status: 500 })
  }

  if (!pkg) {
    return NextResponse.json({
      ok: false,
      error: { type: 'not_found', title: 'Not found', message: 'Package not found.' },
    }, { status: 404 })
  }

  if (pkg.status === 'archived') {
    return NextResponse.json({
      ok: true,
      data: { packageId, status: 'archived', message: 'Package is already archived.' },
    })
  }

  if (ACTIVE_STATUSES.has(pkg.status) && !forceArchive) {
    return NextResponse.json({
      ok: false,
      error: {
        type:    'conflict',
        title:   'Generation in progress',
        message: 'This package is currently generating. Stop generation first, or pass forceArchive: true to archive anyway.',
      },
    }, { status: 409 })
  }

  try {
    await archivePackage(packageId, tenantId, pkg.product_id ?? '', {
      archivedBy:    user.userId ?? null,
      archiveReason: archiveReason,
    })
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: { type: 'internal', title: 'Archive failed', message: 'Failed to archive package.', details: err instanceof Error ? err.message : undefined },
    }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    data: { packageId, status: 'archived', message: 'Package archived successfully. No images were deleted.' },
  })
}
