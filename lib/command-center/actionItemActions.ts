'use server'

import { updateActionItemStatus as updateActionItemStatusInternal } from './actions'
import type { CommandActionStatus } from './types'

export async function updateActionItemStatus(input: {
  actionItemId: string
  status: Extract<CommandActionStatus, 'in_progress' | 'resolved' | 'dismissed' | 'snoozed'>
  reason?: string
  snoozedUntil?: string
}): Promise<void> {
  return updateActionItemStatusInternal(input)
}
