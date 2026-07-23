export type AttributionObservation = {
  id: string
  inspectionId: string
  uploadSessionId?: string | null
  evidenceImageId?: string | null
  reporter?: Record<string, unknown> | null
  slackFileAt?: string | null
  slackMessageAt?: string | null
  uploadStartedAt?: string | null
  inspectionSubmittedAt?: string | null
  inspectionCreatedAt?: string | null
  observedAt: string
  dismissed?: boolean
  invalidated?: boolean
  falsePositive?: boolean
}

export type FirstDetectedAttribution = {
  observationId: string
  inspectionId: string
  uploadSessionId: string | null
  evidenceImageId: string | null
  reporter: Record<string, unknown> | null
  sourceTimestamp: string
  sourceTimestampKind: string
}

function source(observation: AttributionObservation) {
  const candidates: Array<[string | null | undefined, string]> = [
    [observation.slackFileAt, 'slack_file'],
    [observation.slackMessageAt, 'slack_message'],
    [observation.uploadStartedAt, 'upload_session'],
    [observation.inspectionSubmittedAt, 'inspection_submission'],
    [observation.inspectionCreatedAt, 'inspection_created_fallback'],
    [observation.observedAt, 'observation'],
  ]
  return candidates.find(([value]) => value && Number.isFinite(Date.parse(value)))!
}

export function resolveFirstDetectedAttribution(
  observations: AttributionObservation[]
): FirstDetectedAttribution | null {
  const valid = observations.filter(
    (item) => !item.dismissed && !item.invalidated && !item.falsePositive
  )
  if (!valid.length) return null
  const earliest = [...valid].sort((a, b) => {
    const aSource = source(a)[0]!
    const bSource = source(b)[0]!
    return (
      Date.parse(aSource) - Date.parse(bSource) ||
      Date.parse(a.observedAt) - Date.parse(b.observedAt) ||
      a.id.localeCompare(b.id)
    )
  })[0]
  const [sourceTimestamp, sourceTimestampKind] = source(earliest) as [string, string]
  return {
    observationId: earliest.id,
    inspectionId: earliest.inspectionId,
    uploadSessionId: earliest.uploadSessionId ?? null,
    evidenceImageId: earliest.evidenceImageId ?? null,
    reporter: earliest.reporter ?? null,
    sourceTimestamp,
    sourceTimestampKind,
  }
}
