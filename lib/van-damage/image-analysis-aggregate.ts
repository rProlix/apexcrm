export type ImageAnalysisState =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'needs_review'
  | 'failed'
  | 'skipped'
  | 'cancelled'

export type ImageAnalysisInput = {
  status: ImageAnalysisState
  confidence: number | null
  damageCount?: number
}

export function aggregateImageAnalyses(images: ImageAnalysisInput[]) {
  const count = (states: ImageAnalysisState[]) =>
    images.filter((image) => states.includes(image.status)).length
  const completed = count(['completed'])
  const needsReview = count(['needs_review'])
  const failed = count(['failed'])
  const skipped = count(['skipped', 'cancelled'])
  const queued = count(['queued'])
  const processing = count(['processing'])
  const validConfidences = images
    .filter((image) => ['completed', 'needs_review'].includes(image.status))
    .map((image) => image.confidence)
    .filter((confidence): confidence is number => confidence !== null)

  let status:
    | 'awaiting_images'
    | 'queued'
    | 'processing'
    | 'partially_complete'
    | 'complete'
    | 'complete_with_warnings'
    | 'needs_review'
    | 'failed'
    | 'no_analyzable_images'
  if (!images.length) status = 'awaiting_images'
  else if (processing) status = completed + needsReview ? 'partially_complete' : 'processing'
  else if (queued) status = completed + needsReview ? 'partially_complete' : 'queued'
  else if (completed && failed + skipped + needsReview) status = 'complete_with_warnings'
  else if (completed) status = 'complete'
  else if (needsReview) status = 'needs_review'
  else if (failed) status = 'failed'
  else status = 'no_analyzable_images'

  return {
    status,
    total: images.length,
    queued,
    processing,
    completed,
    needsReview,
    failed,
    skipped,
    damageCount: images
      .filter((image) => ['completed', 'needs_review'].includes(image.status))
      .reduce((total, image) => total + (image.damageCount ?? 0), 0),
    confidence:
      validConfidences.length > 0
        ? validConfidences.reduce((total, confidence) => total + confidence, 0) /
          validConfidences.length
        : null,
  }
}
