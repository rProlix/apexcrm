// app/api/customers/search/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { hasPermission } from '@/lib/auth/permissions'
import { searchTenantCustomers } from '@/lib/customers/searchTenantCustomers'

// ─── GET /api/customers/search?q=... ─────────────────────────────────────────
// Tenant-scoped full-text search across name, email, phone.
// Only admin/owner can search customers.
export async function GET(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(ctx.role, 'view_customers')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const q      = req.nextUrl.searchParams.get('q') ?? ''
  const limit  = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 20), 50)

  const tenantId = ctx.role === 'owner'
    ? (req.nextUrl.searchParams.get('tenant_id') ?? ctx.tenant_id)
    : ctx.tenant_id

  if (!tenantId) {
    return NextResponse.json({ error: 'tenant_id required' }, { status: 400 })
  }

  if (!q.trim()) {
    return NextResponse.json({ customers: [] })
  }

  const customers = await searchTenantCustomers(tenantId, q, limit)
  return NextResponse.json({ customers })
}
