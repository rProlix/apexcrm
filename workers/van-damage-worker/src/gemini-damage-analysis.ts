import type { GeminiDamageAnalysis } from '../../../lib/van-damage/contracts.js'
import type { WorkerConfig } from './config.js'
import { parseDamageAnalysis } from './damage-parser.js'

export type AnalysisImage = { id: string; contentType: string; data: Buffer; role?: string | null }

export type GeminiAnalysisResult = {
  analysis: GeminiDamageAnalysis
  rawText: string
  parseError: string | null
}

const PROMPT_VERSION = 'van-damage-v3'

export function getDamagePromptVersion() {
  return PROMPT_VERSION
}

export function assertGeminiInitialized(config: WorkerConfig) {
  if (!config.geminiApiKey) throw new Error('AI analysis credential is not configured')
  if (!config.geminiModel) throw new Error('AI analysis model is not configured')
  return 'AI analysis provider initialized'
}

export function buildDamageInspectionPrompt(context?: string | null) {
  return `You are performing a careful exterior damage inspection of one commercial cargo-van photo.

Inspect the entire visible vehicle methodically before answering:
1. Establish the camera view and visible side: front, rear, driver/left, passenger/right, or roof.
2. Inspect each visible physical panel separately.
3. Look specifically for dents and deformation using multiple visual cues: bent panel edges, disrupted body lines, concave or convex contours, warped gaps, and highlights/reflections that bend consistently with the panel surface.
4. Do not call ordinary reflections, shadows, dirt, decals, door gaps, body seams, or perspective distortion a dent.
5. Inspect for scratches, scuffs, paint transfer, cracks, broken parts, and contamination.
6. Report only defects that are actually visible. If a possible defect cannot be distinguished from reflection or shadow, report it with low confidence and set needsHumanReview instead of silently asserting damage.

Assign the highest visible damage rating using this exact fleet scale:
0 = no visible damage
1 = dirt, mud, dust, grime, leaves, debris, removable marks, or other non-damage contamination
2 = light scratches, scuffs, paint transfer, small cosmetic marks, or minor surface damage
3 = any dent or panel deformation, crack, broken part, bumper/body damage, broken light/mirror/glass, or structural/functional damage

Location accuracy is mandatory. Use the most specific physical region supported by the evidence. Never use a generic side or door when the exact panel and side are visible.
Each supplied image includes a role. A driver_side or passenger_side role is authoritative for
the visible vehicle side: never return a region from the opposite side. Driver/left and
passenger/right always refer to the vehicle's own perspective, not the viewer's screen.
Allowed vehicleArea values:
front_bumper, front_bumper_driver, front_bumper_passenger, rear_bumper, rear_bumper_driver, rear_bumper_passenger,
hood, windshield, roof_front, roof_center, roof_rear, driver_roof_edge, passenger_roof_edge,
driver_front_fender, passenger_front_fender, driver_front_door, passenger_front_door,
driver_sliding_door, passenger_sliding_door, driver_rear_door, passenger_rear_door,
driver_rear_lower_door, passenger_rear_lower_door, rear_door_center_seam,
driver_cargo_panel, passenger_cargo_panel, driver_rear_cargo_panel, passenger_rear_cargo_panel,
driver_rear_quarter, passenger_rear_quarter, driver_rocker_panel, passenger_rocker_panel,
driver_mirror, passenger_mirror, driver_front_wheel, passenger_front_wheel,
driver_rear_wheel, passenger_rear_wheel, driver_headlight, passenger_headlight,
driver_taillight, passenger_taillight, upper_grille, lower_grille, interior, unknown.

Severity must align with the fleet scale: dirt/debris=low; scratches/scuffs=low or medium; every dent/deformation/crack/broken part=high; use critical only for clearly unsafe or functionally compromised damage.
Create a separate item for each distinct defect. Use a tight bounding box around the defect itself, not the whole vehicle or panel. Bounding boxes are normalized 0..1 coordinates relative to the supplied photo.
Set needsHumanReview to true only when damageRating is 3. Ratings 0, 1, and 2 never require the review workflow.

Return JSON only, without markdown, with exactly this shape:
{
  "summary": "specific visible evidence",
  "overallConfidence": 0.0,
  "damageRating": 0,
  "damageRatingLabel": "no_damage|dirt_or_debris|light_scratches|dents_or_damage",
  "damageRatingReason": "specific visible evidence supporting the highest rating",
  "damageCount": 0,
  "vehicleCondition": "excellent|good|fair|poor|unknown",
  "items": [{
    "imageIndex": 0,
    "damageType": "dirt_debris|dent|scratch|crack|broken_light|broken_mirror|paint_damage|bumper_damage|glass_damage|tire_wheel_damage|interior_damage|unknown",
    "vehicleArea": "one allowed vehicleArea value",
    "severity": "low|medium|high|critical|unknown",
    "confidence": 0.0,
    "description": "what is visibly wrong and the visual evidence",
    "repairRecommendation": "specific next step",
    "estimatedCostMin": null,
    "estimatedCostMax": null,
    "boundingBox": {"x":0.0,"y":0.0,"width":0.0,"height":0.0}
  }],
  "needsHumanReview": false,
  "warnings": []
}
For rating 0, items must be empty. For rating 1, use dirt_debris. For rating 2, report each scratch/scuff. For rating 3, report every visible dent, deformation, crack, or broken component.
Slack context: ${context?.slice(0, 4_000) || '(none)'}`
}

export async function analyzeVanDamage(input: {
  config: WorkerConfig
  images: AnalysisImage[]
  context?: string | null
}): Promise<GeminiAnalysisResult> {
  const rawBytes = input.images.reduce((sum, image) => sum + image.data.length, 0)
  if (rawBytes > input.config.maxGeminiRawBytes) {
    throw new Error(`Image exceeds the automated analysis limit (${rawBytes} raw bytes)`)
  }

  const prompt = buildDamageInspectionPrompt(input.context)

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
          responseMimeType: 'application/json',
          maxOutputTokens: 8192,
          thinkingConfig: {
            thinkingLevel: 'high',
          },
        },
      }),
      signal: AbortSignal.timeout(90_000),
    }
  )
  if (!response.ok) {
    await response.text().catch(() => '')
    throw new Error(`AI analysis request failed (${response.status})`)
  }
  const body = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    error?: { message?: string }
  }
  if (body.error) throw new Error('AI analysis request failed')
  const rawText =
    body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? ''
  const parsed = parseDamageAnalysis(
    rawText,
    input.images.map((image) => image.role)
  )
  if (!parsed.data) throw new Error(parsed.error ?? 'AI analysis returned an invalid response')
  return { analysis: parsed.data, rawText, parseError: null }
}
