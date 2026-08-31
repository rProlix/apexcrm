export function clampProgress(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

export function mapScrollProgressToTime(input: {
  progress: number
  duration: number
  startTime?: number
  endTime?: number
  reverse?: boolean
}) {
  const duration = Math.max(0, input.duration)
  const start = Math.max(0, Math.min(duration, input.startTime ?? 0))
  const end = Math.max(start, Math.min(duration, input.endTime ?? duration))
  const progress = input.reverse ? 1 - clampProgress(input.progress) : clampProgress(input.progress)
  return start + progress * (end - start)
}

export function shouldUseBlobMode(bytes: number | undefined, thresholdBytes: number) {
  return Number.isFinite(bytes) && Number(bytes) > 0 && Number(bytes) <= thresholdBytes
}

export function coalesceSeekTarget(input: {
  seeking: boolean
  desired: number
  currentPending: number | null
}) {
  return input.seeking ? input.desired : input.currentPending
}
