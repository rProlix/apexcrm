import { geminiDamageAnalysisSchema, type GeminiDamageAnalysis } from '../../../lib/van-damage/contracts.js'
import { safeParseGeminiJson } from '../../../lib/ai/parseGeminiJson.js'

export function parseDamageAnalysis(text: string): { data: GeminiDamageAnalysis | null; error: string | null } {
  const parsed = safeParseGeminiJson<unknown>(text)
  if (!parsed.data) return { data: null, error: parsed.error }
  const validated = geminiDamageAnalysisSchema.safeParse(parsed.data)
  if (!validated.success) return { data: null, error: validated.error.issues.map((issue) => issue.message).join('; ') }
  return { data: validated.data, error: null }
}
