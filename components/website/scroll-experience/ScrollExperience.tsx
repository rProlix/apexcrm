import { ScrollExperiencePlayer } from './ScrollExperiencePlayer'
import { normalizeScrollExperienceContent } from '@/lib/website-scroll-experience/types'

export function ScrollExperience({
  content,
  componentInstanceId,
  mode = 'public',
}: {
  content: unknown
  componentInstanceId: string
  mode?: 'public' | 'preview' | 'editor'
}) {
  const normalized = normalizeScrollExperienceContent(content)
  const versionId = normalized.experienceVersionId
  const experienceId = normalized.experienceId
  const base = versionId
    ? mode === 'public'
      ? `/api/public/scroll-experiences/${encodeURIComponent(versionId)}/media`
      : experienceId
        ? `/api/website-builder/scroll-experiences/${encodeURIComponent(experienceId)}/media`
        : null
    : null
  const query =
    mode === 'public' || !versionId ? '' : `?version_id=${encodeURIComponent(versionId)}`
  return (
    <ScrollExperiencePlayer
      content={normalized}
      componentInstanceId={componentInstanceId}
      desktopSrc={base ? `${base}/desktop${query}` : undefined}
      mobileSrc={base ? `${base}/mobile${query}` : undefined}
      posterSrc={base ? `${base}/poster${query}` : normalized.posterUrl}
      interactive={mode === 'public' || normalized.previewInteraction === true}
      analyticsEnabled={mode === 'public'}
    />
  )
}
