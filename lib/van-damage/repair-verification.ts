export type RepairStatus =
  | 'awaiting_repair'
  | 'repair_scheduled'
  | 'repair_in_progress'
  | 'ready_for_verification'
  | 'verification_processing'
  | 'ai_review_complete'
  | 'human_review_required'
  | 'verified_repaired'
  | 'partially_repaired'
  | 'damage_still_visible'
  | 'verification_rejected'
  | 'insufficient_images'
  | 'reopened'

export type HumanRepairDecision =
  | 'confirm_repaired'
  | 'confirm_partially_repaired'
  | 'confirm_damage_still_present'
  | 'reject_verification_images'
  | 'request_more_images'
  | 'reopen_damage_case'

const DECISION_STATUS: Record<HumanRepairDecision, RepairStatus> = {
  confirm_repaired: 'verified_repaired',
  confirm_partially_repaired: 'partially_repaired',
  confirm_damage_still_present: 'damage_still_visible',
  reject_verification_images: 'verification_rejected',
  request_more_images: 'insufficient_images',
  reopen_damage_case: 'reopened',
}

export function applyHumanRepairDecision(input: {
  currentStatus: RepairStatus
  decision: HumanRepairDecision
  reviewerId: string | null
  reviewNote?: string
}) {
  if (!input.reviewerId) throw new Error('An authorized human reviewer is required.')
  if (
    ![
      'ai_review_complete',
      'human_review_required',
      'insufficient_images',
      'partially_repaired',
      'damage_still_visible',
    ].includes(input.currentStatus)
  ) {
    throw new Error('This repair verification is not ready for a final decision.')
  }
  if (
    ['reject_verification_images', 'request_more_images', 'reopen_damage_case'].includes(
      input.decision
    ) &&
    !input.reviewNote?.trim()
  ) {
    throw new Error('A review note is required for this decision.')
  }
  return {
    status: DECISION_STATUS[input.decision],
    humanDecision: input.decision,
    reviewedBy: input.reviewerId,
    reviewedAt: new Date().toISOString(),
    reviewNote: input.reviewNote?.trim() || null,
  }
}

export function canFinalizeRepair(role: string) {
  return ['owner', 'admin', 'manager'].includes(role)
}
