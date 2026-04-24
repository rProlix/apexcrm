// app/api/rewards/calculate/route.ts
// Returns a points estimate for a set of order items.
// Used by the store checkout to show "You'll earn X points with this order".
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreCustomer } from '@/lib/auth/resolveStoreUser'
import { calculatePoints } from '@/lib/rewards/calculatePoints'
import { getRewardsProgram } from '@/lib/rewards/getRewardsProgram'
import type { OrderItemForRewards } from '@/types/rewards'

// ─── POST /api/rewards/calculate ──────────────────────────────────────────────
// customer or admin — estimate points for a list of order items
// Body: { items: Array<{ product_id: string; quantity: number; price: number }> }
export async function POST(req: NextRequest) {
  const customer = await resolveStoreCustomer(req)
  if (!customer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const items = body.items as OrderItemForRewards[] | undefined
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items array is required' }, { status: 400 })
  }

  const program = await getRewardsProgram(customer.tenant_id)
  const result  = await calculatePoints(customer.tenant_id, program?.id ?? null, items)

  return NextResponse.json({
    total_points: result.total_points,
    breakdown:    result.breakdown,
    program_name: program?.name ?? null,
  })
}
