import type { SetupStatus } from './types'

export function evaluateSetupStatus(input: {
  required: boolean
  complete: boolean
  blocked: boolean
  inProgress: boolean
  previouslyDismissed?: boolean
}): SetupStatus {
  if (input.complete) return 'complete'
  if (input.previouslyDismissed && !input.required) return 'dismissed'
  if (input.blocked) return 'blocked'
  if (input.inProgress) return 'in_progress'
  return input.required ? 'not_started' : 'optional'
}

export function setupDefinitionIsActive(
  moduleKey: string,
  activeModuleKeys: Iterable<string>
): boolean {
  const active = new Set(activeModuleKeys)
  if (moduleKey === 'core') return true
  if (moduleKey === 'vehicles') {
    return active.has('vehicles') || active.has('damage_ai') || active.has('maintenance')
  }
  return active.has(moduleKey)
}
