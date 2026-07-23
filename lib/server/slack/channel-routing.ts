export type SlackChannelPurpose = 'damage_inspection' | 'maintenance'

export function resolveSlackChannelPurpose(
  value: string | null | undefined
): SlackChannelPurpose | null {
  if (value === 'maintenance') return 'maintenance'
  if (value === 'damage_inspection') return 'damage_inspection'
  return null
}
