import type { GeminiDamageAnalysis } from '../../../lib/van-damage/contracts.js'
import type { WorkerConfig } from './config.js'
import { parseDamageAnalysis } from './damage-parser.js'

export type AnalysisImage = { id: string; contentType: string; data: Buffer; role?: string | null }

export type GeminiAnalysisResult = {
  analysis: GeminiDamageAnalysis
  rawText: string
  parseError: string | null
}

const PROMPT_VERSION = 'van-damage-v1'

export function getDamagePromptVersion() { return PROMPT_VERSION }

export function assertGeminiInitialized(config: WorkerConfig) {
  if (!config.geminiApiKey) throw new Error('Gemini API key is not configured')
  if (!config.geminiModel) throw new Error('Gemini model is not configured')
  return `model ${config.geminiModel}`
}

function reviewResult(warning: string): GeminiAnalysisResult {
  return {
    analysis: {
      summary: 'Automated analysis requires human review.',
      overallConfidence: 0,
      damageCount: 0,
      vehicleCondition: 'unknown',
      items: [],
      needsHumanReview: true,
      warnings: [warning],
    },
    rawText: '',
    parseError: warning,
  }
}

export async function analyzeVanDamage(input: {
  config: WorkerConfig
  images: AnalysisImage[]
  context?: string | null
}): Promise<GeminiAnalysisResult> {
  const rawBytes = input.images.reduce((sum, image) => sum + image.data.length, 0)
  if (rawBytes > input.config.maxGeminiRawBytes) {
    return reviewResult(`Image set exceeds inline Gemini limit (${rawBytes} raw bytes)`)
  }

  const prompt = `You are a cautious commercial vehicle damage inspector.
Analyze all supplied van images together. Do not claim damage that is not clearly visible.
Return JSON only, without markdown, with exactly this shape:
{
  "summary": "string",
  "overallConfidence": 0.0,
  "damageCount": 0,
  "vehicleCondition": "excellent|good|fair|poor|unknown",
  "items": [{
    "imageIndex": 0,
    "damageType": "dent|scratch|crack|broken_light|broken_mirror|paint_damage|bumper_damage|glass_damage|tire_wheel_damage|interior_damage|unknown",
    "vehicleArea": "front_bumper|rear_bumper|driver_side|passenger_side|roof|hood|door|mirror|wheel|interior|unknown",
    "severity": "low|medium|high|critical|unknown",
    "confidence": 0.0,
    "description": "string",
    "repairRecommendation": "string",
    "estimatedCostMin": null,
    "estimatedCostMax": null,
    "boundingBox": {"x":0.0,"y":0.0,"width":0.0,"height":0.0}
  }],
  "needsHumanReview": true,
  "warnings": []
}
Bounding boxes use normalized 0..1 coordinates and must remain inside the image.
Use null for unknown costs or bounding boxes. Set needsHumanReview when images are unclear, incomplete, conflicting, or confidence is below 0.75.
Slack context: ${input.context?.slice(0, 4_000) || '(none)'}`

  const parts: Array<Record<string, unknown>> = [{ text: prompt }]
  for (const [index, image] of input.images.entries()) {
    parts.push({ text: `Image ${index}; role=${image.role ?? 'unknown'}` })
    parts.push({ inlineData: { mimeType: image.contentType, data: image.data.toString('base64') } })
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.config.geminiModel)}:generateContent?key=${encodeURIComponent(input.config.geminiApiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
          maxOutputTokens: 8192,
        },
      }),
      signal: AbortSignal.timeout(90_000),
    },
  )
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 300)
    throw new Error(`Gemini HTTP ${response.status}: ${detail}`)
  }
  const body = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    error?: { message?: string }
  }
  if (body.error) throw new Error(`Gemini API error: ${body.error.message ?? 'unknown error'}`)
  const rawText = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? ''
  const parsed = parseDamageAnalysis(rawText)
  if (!parsed.data) return { ...reviewResult(parsed.error ?? 'Gemini returned invalid JSON'), rawText }
  return { analysis: parsed.data, rawText, parseError: null }
}
