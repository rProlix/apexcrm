const TEXT_KEYS = [
  'headline',
  'subheadline',
  'heading',
  'subheading',
  'subtitle',
  'title',
  'body',
  'text',
  'ctaLabel',
  'ctaSecondaryLabel',
] as const

const IMAGE_KEYS = [
  'backgroundImage',
  'background_image',
  'image',
  'imageUrl',
  'image_url',
  'bannerImage',
  'banner_image',
] as const

const ITEM_TEXT_KEYS = [
  'name',
  'title',
  'question',
  'description',
  'answer',
  'text',
  'quote',
  'role',
  'price',
] as const

function clip(value: string, maxLength: number): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength)
}

/**
 * Produces a compact, bounded content brief for visual planning. This lets the
 * model understand section density and media needs without sending an entire
 * section payload or any internal storage identifiers.
 */
export function summarizeRestyleSectionContent(
  input: unknown
): Record<string, string | number | boolean | Array<Record<string, string>>> {
  const content =
    input && typeof input === 'object' && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {}

  const summary: Record<string, string | number | boolean | Array<Record<string, string>>> = {}

  for (const key of TEXT_KEYS) {
    const value = content[key]
    if (typeof value === 'string' && value.trim()) {
      summary[key] = clip(value, key === 'body' || key === 'text' ? 320 : 140)
    }
  }

  const availableImageKeys = IMAGE_KEYS.filter((key) => {
    const value = content[key]
    return typeof value === 'string' && value.trim().length > 0
  })
  summary.hasImage = availableImageKeys.length > 0

  if (Array.isArray(content.items)) {
    summary.itemCount = content.items.length
    const itemPreview = content.items.slice(0, 6).flatMap((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return []
      const item = value as Record<string, unknown>
      const preview: Record<string, string> = {}
      for (const key of ITEM_TEXT_KEYS) {
        if (typeof item[key] === 'string' && item[key].trim()) {
          preview[key] = clip(item[key], 120)
        }
      }
      return Object.keys(preview).length > 0 ? [preview] : []
    })
    if (itemPreview.length > 0) summary.itemPreview = itemPreview
  }

  return summary
}
