import { ScrollExperiencePlayer } from './ScrollExperiencePlayer'
import { normalizeScrollExperienceContent } from '@/lib/website-scroll-experience/types'
import { normalizeCinematicConfig } from '@/lib/website-cinematic/schema'
import { CinematicRenderer } from '@/components/website/cinematic/CinematicRenderer'

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
  const cinematic = normalizeCinematicConfig(normalized.cinematic)
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
  if (cinematic) {
    return (
      <CinematicRenderer
        config={cinematic}
        desktopSrc={base ? `${base}/desktop${query}` : undefined}
        mobileSrc={base ? `${base}/mobile${query}` : undefined}
        posterSrc={base ? `${base}/poster${query}` : normalized.posterUrl}
      />
    )
  }
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
