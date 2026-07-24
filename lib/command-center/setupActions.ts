'use server'

import { dismissOptionalSetupStep as dismissOptionalSetupStepInternal } from './setup'

export async function dismissOptionalSetupStep(input: {
  moduleKey: string
  stepKey: string
  reason?: string
}): Promise<void> {
  return dismissOptionalSetupStepInternal(input)
}
