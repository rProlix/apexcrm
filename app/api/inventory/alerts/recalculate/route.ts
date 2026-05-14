// app/api/inventory/alerts/recalculate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { generateInventoryAlerts } from '@/lib/inventory/predictions'

// ── POST /api/inventory/alerts/recalculate ────────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'owner', 'manager'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const result = await generateInventoryAlerts(user.tenant_id)
  return NextResponse.json({ ok: true, ...result })
}
