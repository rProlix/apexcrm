// app/api/website/registry/slug-available/route.ts
// GET → validate + check availability of a public slug for the tenant.
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { sanitizeTenantId } from '@/lib/website/resolveWebsiteTenant'
import { checkSlugAvailable } from '@/lib/website/registry'

export async function GET(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin', 'staff'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const hint = sanitizeTenantId(req.nextUrl.searchParams.get('tenant_id'))
  const self = sanitizeTenantId(ctx.tenant_id)
  const tenantId = ctx.role === 'owner' ? (hint ?? self) : (self && hint && self !== hint ? null : self ?? hint)
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  const slug = req.nextUrl.searchParams.get('slug') ?? ''
  const result = await checkSlugAvailable(tenantId, slug)
  return NextResponse.json(result)
}
