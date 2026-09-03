import { cinematicConfigSchema } from './schema'

export function validateCinematicConfigs(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot))
    return { ok: true as const }
  const pages = (snapshot as { pages?: unknown }).pages
  if (!Array.isArray(pages)) return { ok: true as const }
  for (const page of pages) {
    if (!page || typeof page !== 'object' || Array.isArray(page)) continue
    const sections = (page as { sections?: unknown }).sections
    if (!Array.isArray(sections)) continue
    for (const section of sections) {
      if (!section || typeof section !== 'object' || Array.isArray(section)) continue
      const row = section as Record<string, unknown>
      if (row.section_type !== 'scroll_experience' || row.is_visible === false) continue
      const content = row.content as Record<string, unknown> | undefined
      if (!content?.cinematic) continue
      const parsed = cinematicConfigSchema.safeParse(content.cinematic)
      if (!parsed.success)
        return {
          ok: false as const,
          error: 'A Cinematic Scroll section has an invalid configuration.',
        }
      if (
        parsed.data.engine !== 'layers' &&
        parsed.data.video?.clips.length === 0 &&
        (typeof content.experienceVersionId !== 'string' ||
          typeof content.experienceId !== 'string')
      ) {
        return {
          ok: false as const,
          error:
            'A video or hybrid Cinematic Scroll section needs a ready video before publishing.',
        }
      }
    }
  }
  return { ok: true as const }
}
