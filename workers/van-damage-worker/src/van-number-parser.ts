const EXPLICIT_VAN_NUMBER_PATTERN =
  /\b(?:van|vehicle|truck|unit)(?:\s+(?:number|no\.?|num\.?))?\s*#?\s*([0-9][0-9A-Za-z-]*)\b/i
const HASHTAG_VAN_NUMBER_PATTERN = /(?:^|[^\w])#\s*([0-9][0-9A-Za-z-]*)\b/
const ONLY_VAN_NUMBER_PATTERN = /^\s*([0-9][0-9A-Za-z-]*)\s*$/

function normalizeVanNumber(value: string): string {
  return value.trim()
}

export function extractVanNumber(text: string): string | null {
  const normalizedText = text.replace(/\s+/g, ' ').trim()
  if (!normalizedText) return null

  const explicit = normalizedText.match(EXPLICIT_VAN_NUMBER_PATTERN)
  if (explicit?.[1]) return normalizeVanNumber(explicit[1])

  const hashtag = normalizedText.match(HASHTAG_VAN_NUMBER_PATTERN)
  if (hashtag?.[1]) return normalizeVanNumber(hashtag[1])

  const onlyNumber = normalizedText.match(ONLY_VAN_NUMBER_PATTERN)
  if (onlyNumber?.[1]) return normalizeVanNumber(onlyNumber[1])

  return null
}
