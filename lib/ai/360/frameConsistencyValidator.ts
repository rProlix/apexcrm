// lib/ai/360/frameConsistencyValidator.ts
//
// Uses Gemini vision to validate that a generated frame matches the locked
// scene contract. Detects "product variant drift" (e.g. cheese pizza → combo).
//
// This runs AFTER a frame is generated and BEFORE it is saved as completed.
// If drift is detected, the caller (pump route / generationService) regenerates
// the frame using a corrective prompt from buildCorrectivePrompt().
//
// WHEN TO VALIDATE
//   ultra_strict mode: every non-master frame
//   strict mode:       only when retrying (attempt >= 2)
//   standard mode:     disabled
//
// SERVER-ONLY. Never import from client components.

import { callGeminiMultimodal } from '../geminiRequest'
import { safeParseGeminiJson } from '../parseGeminiJson'
import type {
  Product360LockedScene,
  ConsistencyValidationResult,
} from '../../product-360/lockedSceneVariables'

// ─── Config ───────────────────────────────────────────────────────────────────

const VISION_MODEL         = process.env.P360_VISION_MODEL  ?? 'gemini-2.0-flash-exp'
const PASS_SCORE_THRESHOLD = parseFloat(process.env.P360_CONSISTENCY_THRESHOLD ?? '0.70')
const DRIFT_SCORE_CUTOFF   = 0.45   // below this → always regenerate regardless of mode

// ─── Validation prompt builder ────────────────────────────────────────────────

function buildValidationPrompt(lockedScene: Product360LockedScene): string {
  const variant   = lockedScene.productVariant
  const subType   = lockedScene.identity.subType
  const foodType  = lockedScene.identity.productType
  const vessel    = `${lockedScene.vessel.color} ${lockedScene.vessel.type}`
  const table     = `${lockedScene.environment.tableSurfaceType} ${lockedScene.environment.tableSurfaceColor}`
  const wall      = `${lockedScene.environment.wallOrBackgroundColor} ${lockedScene.environment.wallOrBackgroundType}`
  const isFood    = !!lockedScene.foodDetails
  const isProduct = !!lockedScene.productDetails

  const toppingList = lockedScene.foodDetails?.toppings.length
    ? lockedScene.foodDetails.toppings
        .map(t => `${t.name} (${t.count})`)
        .join(', ')
    : null

  return `You are a quality control inspector for a 360° product photography sequence.

Examine the attached image and compare it against this locked scene contract:

LOCKED PRODUCT VARIANT:
  "${variant}"

REQUIRED PRODUCT TYPE: ${subType}

${isFood ? `REQUIRED FOOD DETAILS:
  Food type: ${lockedScene.foodDetails!.foodType}
  Sub-type: ${lockedScene.foodDetails!.subType}
  Exact appearance: ${lockedScene.foodDetails!.exactDescription}
  ${toppingList ? `Required toppings (ALL must be present): ${toppingList}` : 'No specific toppings required.'}
  ${lockedScene.foodDetails!.cheeseCoverage ? `Cheese: ${lockedScene.foodDetails!.cheeseCoverage}` : ''}
  Forbidden changes: ${lockedScene.foodDetails!.forbiddenFoodChanges.slice(0, 4).join('; ')}` : ''}

${isProduct ? `REQUIRED PRODUCT DETAILS:
  Shape: ${lockedScene.productDetails!.objectShape}
  Material: ${lockedScene.productDetails!.material}
  Color: ${lockedScene.productDetails!.color}` : ''}

REQUIRED VESSEL: ${vessel}
REQUIRED TABLE: ${table}
REQUIRED BACKGROUND: ${wall}

CHECK THESE THINGS IN THE IMAGE:
1. Product variant — is it "${subType}"?
${isFood ? `2. Are ALL required toppings/ingredients present?
3. Are there any EXTRA toppings/ingredients that should NOT be there?
4. ${foodType === 'pizza' ? 'Is this a ' + (lockedScene.foodDetails?.subType?.toLowerCase().includes('cheese') && !lockedScene.foodDetails?.subType?.toLowerCase().includes('combo') ? 'CHEESE-ONLY pizza (no meat, no vegetables)?  ★ This is critical ★' : 'COMBO pizza with visible toppings?  ★ This is critical ★') : 'Are the food details correct?'}` : '2. Is the product correct?'}
5. Does the vessel match? (should be: ${vessel})
6. Does the table surface match? (should be: ${table})
7. Does the background match? (should be: ${wall})

Return ONLY a JSON object. No markdown, no commentary.

{
  "score": <number 0.0 to 1.0, where 1.0 = perfect match>,
  "passed": <true if score >= ${PASS_SCORE_THRESHOLD}>,
  "detectedVariantDrift": <true if the product TYPE or VARIANT changed — e.g. cheese pizza became combo, or combo lost key toppings>,
  "driftDetails": "<if drift detected: precise description of what changed. If no drift: empty string>",
  "issues": ["<issue 1 if any>", "<issue 2 if any>"],
  "shouldRegenerate": <true if score < ${PASS_SCORE_THRESHOLD} OR detectedVariantDrift = true>
}`
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Validate a generated frame against the locked scene contract using Gemini vision.
 *
 * @param frameBase64     - Base64-encoded image data of the generated frame
 * @param mimeType        - MIME type of the image ('image/png' or 'image/jpeg')
 * @param lockedScene     - The locked scene contract to validate against
 * @returns ConsistencyValidationResult or null on Gemini failure
 */
export async function validateFrameAgainstLockedScene(
  frameBase64: string,
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp',
  lockedScene: Product360LockedScene,
): Promise<ConsistencyValidationResult | null> {
  if (!frameBase64) {
    console.warn('[frameConsistencyValidator] No frame data provided — skipping validation')
    return null
  }

  const prompt = buildValidationPrompt(lockedScene)

  const { text, error } = await callGeminiMultimodal({
    model:       VISION_MODEL,
    feature:     '360-consistency-validator',
    temperature: 0.1,
    parts: [
      { inlineData: { mimeType, data: frameBase64 } },
      { text: prompt },
    ],
  })

  if (error) {
    console.warn('[frameConsistencyValidator] Vision API error:', error)
    return null
  }

  if (!text) {
    console.warn('[frameConsistencyValidator] Empty vision response — skipping validation')
    return null
  }

  const { data } = safeParseGeminiJson<{
    score:                 number
    passed:                boolean
    detectedVariantDrift:  boolean
    driftDetails:          string
    issues:                string[]
    shouldRegenerate:      boolean
  }>(text)

  if (!data || typeof data.score !== 'number') {
    console.warn('[frameConsistencyValidator] Could not parse validation result — raw:', text.slice(0, 300))
    return null
  }

  // Override: if score is below hard cutoff, always regenerate
  const shouldRegenerate = data.shouldRegenerate ||
    data.detectedVariantDrift ||
    data.score < DRIFT_SCORE_CUTOFF

  const result: ConsistencyValidationResult = {
    score:                Number(data.score.toFixed(3)),
    passed:               data.score >= PASS_SCORE_THRESHOLD && !data.detectedVariantDrift,
    issues:               Array.isArray(data.issues) ? data.issues.map(String) : [],
    detectedVariantDrift: Boolean(data.detectedVariantDrift),
    driftDetails:         String(data.driftDetails ?? ''),
    shouldRegenerate,
  }

  console.info(
    `[frameConsistencyValidator] score=${result.score} passed=${result.passed} drift=${result.detectedVariantDrift}`,
    result.driftDetails || '',
  )

  return result
}

/**
 * Whether consistency validation should run for this frame and mode.
 *
 * @param consistencyMode  - Package consistency mode
 * @param isMasterFrame    - Whether this is frame 0
 * @param attempt          - Current generation attempt (1-based)
 */
export function shouldValidateFrame(
  consistencyMode: string,
  isMasterFrame: boolean,
  attempt: number,
): boolean {
  if (isMasterFrame) return false  // master frame defines truth, don't validate it
  if (consistencyMode === 'ultra_strict') return true
  if (consistencyMode === 'strict' && attempt >= 2) return true
  return false
}

export { PASS_SCORE_THRESHOLD }
