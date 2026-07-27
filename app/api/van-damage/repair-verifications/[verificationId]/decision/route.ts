import { NextRequest, NextResponse } from 'next/server'
import {
  assertActiveModule,
  isTenantAdmin,
  requireCommandCenterContext,
} from '@/lib/command-center/context'
import {
  applyHumanRepairDecision,
  type HumanRepairDecision,
  type RepairStatus,
} from '@/lib/van-damage/repair-verification'

const DECISIONS = new Set<HumanRepairDecision>([
  'confirm_repaired',
  'confirm_partially_repaired',
  'confirm_damage_still_present',
  'reject_verification_images',
  'request_more_images',
  'reopen_damage_case',
])

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ verificationId: string }> }
) {
  try {
    const context = await requireCommandCenterContext('use_modules')
    assertActiveModule(context, 'damage_ai')
    if (!isTenantAdmin(context.role)) {
      return NextResponse.json({ error: 'An authorized reviewer is required.' }, { status: 403 })
    }
    const { verificationId } = await params
    const body = (await request.json()) as { decision?: string; reviewNote?: string }
    if (!DECISIONS.has(body.decision as HumanRepairDecision)) {
      return NextResponse.json({ error: 'Choose a valid review decision.' }, { status: 400 })
    }
    const db = context.db as any
    const { data: verification, error } = await db
      .from('van_damage_repair_verifications')
      .select('id,tenant_id,repair_id,damage_case_id,status,human_decision')
      .eq('id', verificationId)
      .eq('tenant_id', context.tenantId)
      .maybeSingle()
    if (error || !verification) {
      return NextResponse.json({ error: 'Repair verification was not found.' }, { status: 404 })
    }
    const result = applyHumanRepairDecision({
      currentStatus: verification.status as RepairStatus,
      decision: body.decision as HumanRepairDecision,
      reviewerId: context.user.id,
      reviewNote: body.reviewNote,
    })
    const { error: updateError } = await db
      .from('van_damage_repair_verifications')
      .update({
        status: result.status,
        human_decision: result.humanDecision,
        human_review_note: result.reviewNote,
        reviewed_by: result.reviewedBy,
        reviewed_at: result.reviewedAt,
        completed_at: result.reviewedAt,
        updated_at: result.reviewedAt,
      })
      .eq('id', verification.id)
      .eq('tenant_id', context.tenantId)
    if (updateError) throw new Error(`decision_update_${updateError.code}`)

    const caseStatus =
      result.status === 'verified_repaired'
        ? 'repaired'
        : result.status === 'reopened'
          ? 'active'
          : result.status === 'partially_repaired' || result.status === 'damage_still_visible'
            ? 'confirmed'
            : null
    await Promise.all([
      db
        .from('van_damage_repairs')
        .update({
          status: result.status,
          verified_repaired_at: result.status === 'verified_repaired' ? result.reviewedAt : null,
          updated_at: result.reviewedAt,
        })
        .eq('id', verification.repair_id)
        .eq('tenant_id', context.tenantId),
      caseStatus
        ? db
            .from('van_damage_cases')
            .update({
              lifecycle_status: caseStatus,
              updated_at: result.reviewedAt,
            })
            .eq('id', verification.damage_case_id)
            .eq('tenant_id', context.tenantId)
        : Promise.resolve(),
      db.from('activity_logs').insert({
        tenant_id: context.tenantId,
        actor_type: 'user',
        actor_id: context.user.id,
        action: `van_damage.repair_verification.${result.humanDecision}`,
        entity_type: 'damage_case',
        entity_id: verification.damage_case_id,
        metadata: {
          repair_id: verification.repair_id,
          verification_id: verification.id,
          before: verification.status,
          after: result.status,
        },
      }),
      db
        .from('command_action_items')
        .update({
          status: result.status === 'verified_repaired' ? 'resolved' : 'in_progress',
          resolved_at: result.status === 'verified_repaired' ? result.reviewedAt : null,
          resolved_by: result.status === 'verified_repaired' ? context.user.id : null,
          latest_activity_at: result.reviewedAt,
        })
        .eq('tenant_id', context.tenantId)
        .eq('source_record_type', 'repair_verification')
        .eq('source_record_id', verification.id),
    ])
    return NextResponse.json({ ok: true, status: result.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save repair review.'
    return NextResponse.json(
      { error: message.includes('required') ? message : 'Unable to save repair review.' },
      { status: 400 }
    )
  }
}
