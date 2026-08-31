export type ScrollPublishedBinding = {
  experienceId: string
  experienceVersionId: string
  componentInstanceId: string
}

export function collectScrollExperienceBindings(snapshot: unknown): ScrollPublishedBinding[] {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return []
  const pages = (snapshot as { pages?: unknown }).pages
  if (!Array.isArray(pages)) return []
  const bindings: ScrollPublishedBinding[] = []
  for (const page of pages) {
    if (!page || typeof page !== 'object' || Array.isArray(page)) continue
    const sections = (page as { sections?: unknown }).sections
    if (!Array.isArray(sections)) continue
    for (const section of sections) {
      if (!section || typeof section !== 'object' || Array.isArray(section)) continue
      const row = section as Record<string, unknown>
      if (row.section_type !== 'scroll_experience' || row.is_visible === false) continue
      const content =
        row.content && typeof row.content === 'object' && !Array.isArray(row.content)
          ? (row.content as Record<string, unknown>)
          : {}
      if (
        typeof content.experienceId !== 'string' ||
        typeof content.experienceVersionId !== 'string'
      )
        continue
      bindings.push({
        experienceId: content.experienceId,
        experienceVersionId: content.experienceVersionId,
        componentInstanceId: typeof row.id === 'string' ? row.id : content.experienceId,
      })
    }
  }
  return bindings
}
