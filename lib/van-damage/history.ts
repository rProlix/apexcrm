export type SlackDriverSnapshot = {
  slackWorkspaceId?: string | null
  slackUserId?: string | null
  displayName?: string | null
  realName?: string | null
  username?: string | null
  avatarUrl?: string | null
}

export type DamageFingerprintInput = {
  tenantId: string
  vanId: string
  vehicleArea?: string | null
  damageType?: string | null
}

export type DamageCaseCandidate = DamageFingerprintInput & {
  id: string
  lifecycleStatus: string
  observationCount: number
  maxSeverity?: string | null
}

export type DamageObservationDecision =
  | { kind: 'new_damage'; fingerprint: string }
  | { kind: 'existing_damage_observed'; caseId: string; fingerprint: string }
  | { kind: 'possible_duplicate'; candidateIds: string[]; fingerprint: string; reason: string }
  | { kind: 'recurrent_damage'; previousCaseId: string; fingerprint: string }

const unresolvedCaseStates = new Set([
  'active', 'needs_review', 'confirmed', 'repair_scheduled', 'in_repair', 'awaiting_verification', 'recurrent',
])
const repairedCaseStates = new Set(['repaired', 'resolved'])

export function slackTsToIso(slackTs: string | null | undefined): string | null {
  if (!slackTs || !/^\d{9,}(?:\.\d{1,6})?$/.test(slackTs)) return null
  const [seconds, fraction = '0'] = slackTs.split('.')
  const millis = Math.floor(Number(`0.${fraction}`) * 1000)
  return new Date(Number(seconds) * 1000 + millis).toISOString()
}

export function formatDriverName(snapshot: SlackDriverSnapshot | null | undefined): string {
  if (!snapshot) return 'Unknown driver'
  const named = [snapshot.displayName, snapshot.realName, snapshot.username]
    .find((value) => typeof value === 'string' && value.trim())
  if (named) return named.trim()
  if (snapshot.slackUserId) return `Slack user ${snapshot.slackUserId.slice(0, 6)}`
  return 'Unknown driver'
}

export function canonicalDamageType(value: string | null | undefined): string {
  const raw = (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_')
  if (!raw || raw === 'unknown') return 'unknown'
  if (raw.includes('dirt') || raw.includes('debris')) return 'dirt_debris'
  if (raw.includes('scratch') || raw.includes('scuff')) return 'scratch'
  if (raw.includes('dent')) return 'dent'
  if (raw.includes('crack')) return 'crack'
  if (raw.includes('glass') || raw.includes('window') || raw.includes('windshield')) return 'glass_damage'
  if (raw.includes('mirror')) return 'broken_mirror'
  if (raw.includes('light')) return 'broken_light'
  if (raw.includes('paint')) return 'paint_damage'
  if (raw.includes('bumper')) return 'bumper_damage'
  if (raw.includes('wheel') || raw.includes('tire')) return 'tire_wheel_damage'
  if (raw.includes('interior')) return 'interior_damage'
  return raw
}

export function canonicalVehicleRegion(value: string | null | undefined): string {
  const raw = (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_')
  if (!raw || raw === 'unknown' || raw === 'unspecified') return 'unspecified'
  if (raw.includes('front')) return 'front_bumper'
  if (raw.includes('rear') || raw.includes('back')) return 'rear_bumper'
  if (raw.includes('driver') || raw.includes('left')) return 'driver_side'
  if (raw.includes('passenger') || raw.includes('right')) return 'passenger_side'
  if (raw.includes('roof')) return 'roof'
  if (raw.includes('hood')) return 'hood'
  if (raw.includes('mirror')) return 'mirror'
  if (raw.includes('wheel') || raw.includes('tire')) return 'wheel'
  if (raw.includes('door')) return 'door'
  if (raw.includes('interior')) return 'interior'
  return raw
}

export function buildDamageFingerprint(input: DamageFingerprintInput): string {
  return [
    input.tenantId,
    input.vanId,
    canonicalVehicleRegion(input.vehicleArea),
    canonicalDamageType(input.damageType),
  ].join(':')
}

export function orderSlackFiles<T extends { id: string; created?: number | null }>(files: T[]): Array<T & { uploadOrder: number }> {
  return files
    .map((file, index) => ({ ...file, originalIndex: index }))
    .sort((a, b) => {
      const createdA = typeof a.created === 'number' ? a.created : Number.POSITIVE_INFINITY
      const createdB = typeof b.created === 'number' ? b.created : Number.POSITIVE_INFINITY
      if (createdA !== createdB) return createdA - createdB
      return a.originalIndex - b.originalIndex || a.id.localeCompare(b.id)
    })
    .map((file, index) => ({ ...file, uploadOrder: index }))
}

export function classifyDamageObservation(
  finding: DamageFingerprintInput & { confidence?: number | null },
  candidates: DamageCaseCandidate[],
): DamageObservationDecision {
  const fingerprint = buildDamageFingerprint(finding)
  const region = canonicalVehicleRegion(finding.vehicleArea)
  const type = canonicalDamageType(finding.damageType)
  if (region === 'unspecified' || type === 'unknown' || (finding.confidence ?? 1) < 0.55) {
    const candidateIds = candidates.map((candidate) => candidate.id)
    return { kind: 'possible_duplicate', candidateIds, fingerprint, reason: 'Ambiguous region, type, or confidence requires human review.' }
  }

  const sameFingerprint = candidates.filter((candidate) => buildDamageFingerprint(candidate) === fingerprint)
  const unresolved = sameFingerprint.filter((candidate) => unresolvedCaseStates.has(candidate.lifecycleStatus))
  if (unresolved.length === 1) return { kind: 'existing_damage_observed', caseId: unresolved[0].id, fingerprint }
  if (unresolved.length > 1) {
    return { kind: 'possible_duplicate', candidateIds: unresolved.map((candidate) => candidate.id), fingerprint, reason: 'Multiple active cases share this fingerprint.' }
  }
  const repaired = sameFingerprint.find((candidate) => repairedCaseStates.has(candidate.lifecycleStatus))
  if (repaired) return { kind: 'recurrent_damage', previousCaseId: repaired.id, fingerprint }
  return { kind: 'new_damage', fingerprint }
}
