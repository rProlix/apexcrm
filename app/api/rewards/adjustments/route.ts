import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getRewardsProgram } from '@/lib/rewards/getRewardsProgram'
import { recordCommandAudit } from '@/lib/command-center/audit'
import { checkRewardRateLimit } from '@/lib/rewards/rate-limit'

export async function POST(request: NextRequest) {
  const user = await resolveStoreUser(request)
  if (!user || !['owner', 'admin', 'manager'].includes(user.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const limit = checkRewardRateLimit(`adjust:${user.id}`, 30, 60_000)
  if (!limit.allowed)
    return NextResponse.json(
      { error: 'Too many adjustments' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    )
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const customerId = typeof body?.customer_id === 'string' ? body.customer_id : ''
  const points = Number(body?.points_delta)
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
  const idempotencyKey = typeof body?.idempotency_key === 'string' ? body.idempotency_key : ''
  if (
    !customerId ||
    !Number.isInteger(points) ||
    points === 0 ||
    !reason ||
    idempotencyKey.length < 8
  ) {
    return NextResponse.json(
      {
        error:
          'customer_id, non-zero integer points_delta, reason, and idempotency_key are required',
      },
      { status: 400 }
    )
  }
  const program = await getRewardsProgram(user.tenant_id)
  if (!program) return NextResponse.json({ error: 'No active rewards program' }, { status: 409 })
  const db = getSupabaseServerClient() as any
  const { data, error } = await db.rpc('apply_reward_points', {
    p_tenant_id: user.tenant_id,
    p_customer_id: customerId,
    p_program_id: program.id,
    p_transaction_type: 'adjusted',
    p_points_delta: points,
    p_source_type: 'manual',
    p_source_id: user.id,
    p_idempotency_key: idempotencyKey,
    p_description: reason,
    p_performed_by: user.id,
    p_metadata: { reason },
  })
  if (error)
    return NextResponse.json(
      {
        error: /insufficient/i.test(error.message)
          ? 'Adjustment would create a negative balance'
          : 'Adjustment failed',
      },
      { status: 422 }
    )
  await recordCommandAudit({
    tenantId: user.tenant_id,
    actorUserId: user.id,
    action: 'rewards.points_adjusted',
    metadata: { customer_id: customerId, points_delta: points, reason },
  })
  return NextResponse.json({
    ok: true,
    transaction_id: data?.[0]?.transaction_id,
    points_balance: data?.[0]?.points_balance,
  })
}
