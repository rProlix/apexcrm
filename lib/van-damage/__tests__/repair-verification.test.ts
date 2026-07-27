import assert from 'node:assert/strict'
import test from 'node:test'
import { applyHumanRepairDecision, canFinalizeRepair } from '../repair-verification'

test('automated output cannot produce a final repaired state', () => {
  assert.throws(
    () =>
      applyHumanRepairDecision({
        currentStatus: 'ai_review_complete',
        decision: 'confirm_repaired',
        reviewerId: null,
      }),
    /human reviewer/
  )
})

test('authorized human confirmation maps to final repaired state', () => {
  const result = applyHumanRepairDecision({
    currentStatus: 'human_review_required',
    decision: 'confirm_repaired',
    reviewerId: 'reviewer-1',
  })
  assert.equal(result.status, 'verified_repaired')
  assert.equal(result.humanDecision, 'confirm_repaired')
  assert.equal(result.reviewedBy, 'reviewer-1')
})

test('rejection and more-image decisions require a reason', () => {
  assert.throws(
    () =>
      applyHumanRepairDecision({
        currentStatus: 'human_review_required',
        decision: 'request_more_images',
        reviewerId: 'reviewer-1',
      }),
    /review note/
  )
})

test('only tenant managers and administrators can finalize repair evidence', () => {
  assert.equal(canFinalizeRepair('manager'), true)
  assert.equal(canFinalizeRepair('staff'), false)
})
