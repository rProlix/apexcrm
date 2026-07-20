import { geminiDamageAnalysisSchema, type GeminiDamageAnalysis } from '../../../lib/van-damage/contracts.js'
import { safeParseGeminiJson } from '../../../lib/ai/parseGeminiJson.js'

type MutableRecord = Record<string, unknown>

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeBoundingBox(box: unknown): unknown {
  if (!box || typeof box !== 'object') return box

  const input = box as MutableRecord
  const x = finiteNumber(input.x)
  const y = finiteNumber(input.y)
  const width = finiteNumber(input.width)
  const height = finiteNumber(input.height)
  if (x == null || y == null || width == null || height == null) return box

  const maxValue = Math.max(x, y, width, height)
  const divisor = maxValue > 100 ? 1000 : maxValue > 1 ? 100 : 1
  const nx = Math.min(1, Math.max(0, x / divisor))
  const ny = Math.min(1, Math.max(0, y / divisor))
  const nwidth = Math.min(1 - nx, Math.max(0, width / divisor))
  const nheight = Math.min(1 - ny, Math.max(0, height / divisor))

  return { x: nx, y: ny, width: nwidth, height: nheight }
}

function normalizeGeminiAnalysis(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  const analysis = value as MutableRecord
  if (!Array.isArray(analysis.items)) return value

  return {
    ...analysis,
    items: analysis.items.map((item) => {
      if (!item || typeof item !== 'object') return item
      const record = item as MutableRecord
      return {
        ...record,
        boundingBox: record.boundingBox == null ? null : normalizeBoundingBox(record.boundingBox),
      }
    }),
  }
}

export function parseDamageAnalysis(text: string): { data: GeminiDamageAnalysis | null; error: string | null } {
  const parsed = safeParseGeminiJson<unknown>(text)
  if (!parsed.data) return { data: null, error: parsed.error }
  const validated = geminiDamageAnalysisSchema.safeParse(normalizeGeminiAnalysis(parsed.data))
  if (!validated.success) return { data: null, error: validated.error.issues.map((issue) => issue.message).join('; ') }
  return { data: validated.data, error: null }
}
