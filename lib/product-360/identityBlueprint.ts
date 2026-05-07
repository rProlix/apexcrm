// lib/product-360/identityBlueprint.ts
//
// Package-level "locked identity blueprint" — a simple, portable JSON contract
// that defines what must NEVER change across all frames in a 360 spin package.
//
// This is provider-agnostic:
//   • Gemini/Imagen → serialized to a dense prompt text block
//   • Leonardo      → serialized to the textVariables blueprint node input
//
// Stored in product_360_packages.locked_identity_blueprint (jsonb).
//
// SERVER-ONLY. Never import from client components.

import { callGeminiText } from '@/lib/ai/geminiRequest'
import { safeParseGeminiJson } from '@/lib/ai/parseGeminiJson'
import type { P360GenerationConfig } from '@/lib/ai/360/types'

// ─── Schema ───────────────────────────────────────────────────────────────────

export interface IdentityBlueprintSubject {
  productName:             string
  exactIngredientsOrParts: string[]
  shape:                   string
  colorPalette:            string[]
  surfaceDetails:          string[]
  mustNotChange:           string[]
}

export interface IdentityBlueprintVessel {
  type:     string
  material: string
  color:    string
  size:     string
  position: string
}

export interface IdentityBlueprintScene {
  table:          string
  wall:           string
  background:     string
  props:          string[]
  lighting:       string
  cameraDistance: string
  lens:           string
  crop:           string
}

export interface IdentityBlueprintRotation {
  frameCount:        number
  angleStepDegrees:  number
  onlyChange:        string
}

export interface IdentityBlueprint {
  subject:       IdentityBlueprintSubject
  vessel:        IdentityBlueprintVessel
  scene:         IdentityBlueprintScene
  rotation:      IdentityBlueprintRotation
  negativeRules: string[]
}

// ─── Default identity blueprint ───────────────────────────────────────────────

export function makeDefaultIdentityBlueprint(
  productName: string,
  frameCount = 24,
): IdentityBlueprint {
  const step = Math.round(360 / frameCount)
  return {
    subject: {
      productName,
      exactIngredientsOrParts: [],
      shape:          'round',
      colorPalette:   [],
      surfaceDetails: [],
      mustNotChange:  ['product shape', 'product color', 'product details'],
    },
    vessel: {
      type:     'plate',
      material: 'ceramic',
      color:    'white',
      size:     'medium, 28cm diameter',
      position: 'centered on table',
    },
    scene: {
      table:          'dark wood surface',
      wall:           'neutral grey wall',
      background:     'gradient: warm grey to off-white',
      props:          [],
      lighting:       '3-point studio lighting, soft shadows',
      cameraDistance: '60cm from product',
      lens:           '85mm portrait lens',
      crop:           'full product visible with 15% margin',
    },
    rotation: {
      frameCount,
      angleStepDegrees: step,
      onlyChange: 'camera/product angle around vertical axis',
    },
    negativeRules: [
      'do not change ingredients',
      'do not add toppings',
      'do not remove toppings',
      'do not change plate',
      'do not change bowl',
      'do not change table',
      'do not change wall',
      'do not change lighting',
      'do not change zoom',
      'do not change crop',
    ],
  }
}

// ─── Gemini-assisted builder ──────────────────────────────────────────────────

const PLANNING_MODEL = process.env.P360_PLANNER_MODEL ?? 'gemini-2.0-flash-001'

function buildPlanningPrompt(
  productName: string,
  productDescription: string,
  config: P360GenerationConfig,
): string {
  const frameCount = config.frameCount ?? 24
  const step       = Math.round(360 / frameCount)

  return `You are a professional 360° product photography art director.

I need you to create a LOCKED IDENTITY BLUEPRINT for a ${frameCount}-frame 360° spin of:
PRODUCT: "${productName}"
DESCRIPTION: "${productDescription}"

Your job: Choose ONE exact visual version of this product and lock every visual detail.
This identity must be used for ALL ${frameCount} frames — only the camera angle changes.

IMPORTANT RULES:
1. Choose one EXACT variant (e.g., "classic pepperoni pizza" — not "pizza"). Be specific.
2. Specify exact ingredients/parts with counts and positions.
3. Specify the exact vessel (plate/bowl/package) with material, color, and size.
4. Specify the exact background, table, wall, and props.
5. Specify the exact lighting setup, camera distance, and crop.
6. List every element that must NEVER change between frames.

Return ONLY valid JSON matching this exact schema:
{
  "subject": {
    "productName": "...",
    "exactIngredientsOrParts": ["..."],
    "shape": "...",
    "colorPalette": ["..."],
    "surfaceDetails": ["..."],
    "mustNotChange": ["..."]
  },
  "vessel": {
    "type": "...",
    "material": "...",
    "color": "...",
    "size": "...",
    "position": "centered on table"
  },
  "scene": {
    "table": "...",
    "wall": "...",
    "background": "...",
    "props": [],
    "lighting": "${config.lightingPreset ?? '3-point studio lighting'}",
    "cameraDistance": "...",
    "lens": "...",
    "crop": "full product visible with 15% margin"
  },
  "rotation": {
    "frameCount": ${frameCount},
    "angleStepDegrees": ${step},
    "onlyChange": "camera/product angle around vertical axis"
  },
  "negativeRules": [
    "do not change ingredients",
    "do not add toppings",
    "do not remove toppings",
    "do not change plate",
    "do not change bowl",
    "do not change table",
    "do not change wall",
    "do not change lighting",
    "do not change zoom",
    "do not change crop"
  ]
}

Be very specific about food products: list every topping, sauce, and garnish by name.
Be very specific about merchandise: list every visible feature and color.
Return ONLY the JSON object, no markdown.`
}

/**
 * Build the locked identity blueprint for a package using Gemini text planning.
 * Falls back to a default blueprint if the AI call fails.
 */
export async function buildIdentityBlueprint(
  productName:        string,
  productDescription: string,
  config:             P360GenerationConfig,
): Promise<IdentityBlueprint> {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? ''

  if (!apiKey) {
    console.warn('[identityBlueprint] No Gemini API key — using default blueprint')
    return makeDefaultIdentityBlueprint(productName, config.frameCount ?? 24)
  }

  try {
    const prompt  = buildPlanningPrompt(productName, productDescription, config)
    const result  = await callGeminiText({ model: PLANNING_MODEL, prompt, temperature: 0.1, feature: '360-identity-blueprint' })

    if (result.error) throw new Error(result.error)

    const { data: parsed } = safeParseGeminiJson<IdentityBlueprint>(result.text)

    if (!parsed || typeof parsed !== 'object' || !parsed.subject) {
      throw new Error('AI response did not match expected schema')
    }

    return normalizeBlueprint(parsed, productName, config.frameCount ?? 24)
  } catch (err) {
    console.warn(`[identityBlueprint] AI planning failed: ${err} — using default blueprint`)
    return makeDefaultIdentityBlueprint(productName, config.frameCount ?? 24)
  }
}

// ─── Normalization helper ─────────────────────────────────────────────────────

function normalizeBlueprint(
  raw:         Partial<IdentityBlueprint>,
  productName: string,
  frameCount:  number,
): IdentityBlueprint {
  const step = Math.round(360 / frameCount)
  const def  = makeDefaultIdentityBlueprint(productName, frameCount)

  return {
    subject: {
      productName:             raw.subject?.productName             ?? productName,
      exactIngredientsOrParts: raw.subject?.exactIngredientsOrParts ?? def.subject.exactIngredientsOrParts,
      shape:                   raw.subject?.shape                   ?? def.subject.shape,
      colorPalette:            raw.subject?.colorPalette            ?? def.subject.colorPalette,
      surfaceDetails:          raw.subject?.surfaceDetails          ?? def.subject.surfaceDetails,
      mustNotChange:           raw.subject?.mustNotChange           ?? def.subject.mustNotChange,
    },
    vessel: {
      type:     raw.vessel?.type     ?? def.vessel.type,
      material: raw.vessel?.material ?? def.vessel.material,
      color:    raw.vessel?.color    ?? def.vessel.color,
      size:     raw.vessel?.size     ?? def.vessel.size,
      position: raw.vessel?.position ?? def.vessel.position,
    },
    scene: {
      table:          raw.scene?.table          ?? def.scene.table,
      wall:           raw.scene?.wall           ?? def.scene.wall,
      background:     raw.scene?.background     ?? def.scene.background,
      props:          raw.scene?.props          ?? def.scene.props,
      lighting:       raw.scene?.lighting       ?? def.scene.lighting,
      cameraDistance: raw.scene?.cameraDistance ?? def.scene.cameraDistance,
      lens:           raw.scene?.lens           ?? def.scene.lens,
      crop:           raw.scene?.crop           ?? def.scene.crop,
    },
    rotation: {
      frameCount:       raw.rotation?.frameCount       ?? frameCount,
      angleStepDegrees: raw.rotation?.angleStepDegrees ?? step,
      onlyChange:       raw.rotation?.onlyChange       ?? def.rotation.onlyChange,
    },
    negativeRules: Array.isArray(raw.negativeRules) && raw.negativeRules.length > 0
      ? raw.negativeRules
      : def.negativeRules,
  }
}

// ─── Serialization ────────────────────────────────────────────────────────────

/**
 * Serialize the identity blueprint to a dense prompt text block.
 * Used for Gemini/Imagen prompt injection.
 */
export function serializeIdentityBlueprintToPrompt(
  bp:          IdentityBlueprint,
  angleDeg:    number,
  frameIndex:  number,
  totalFrames: number,
): string {
  const partsStr = bp.subject.exactIngredientsOrParts.join(', ')
  const rulesStr = bp.negativeRules.map(r => `• ${r}`).join('\n')

  return `
=== LOCKED SCENE IDENTITY (DO NOT CHANGE) ===
PRODUCT: ${bp.subject.productName}
EXACT PARTS/INGREDIENTS: ${partsStr || 'as described'}
SHAPE: ${bp.subject.shape}
COLORS: ${bp.subject.colorPalette.join(', ') || 'natural'}
SURFACE: ${bp.subject.surfaceDetails.join(', ') || 'natural'}
VESSEL: ${bp.vessel.type} | ${bp.vessel.material} | ${bp.vessel.color} | ${bp.vessel.size}
TABLE: ${bp.scene.table}
WALL/BACKGROUND: ${bp.scene.wall} — ${bp.scene.background}
LIGHTING: ${bp.scene.lighting}
CAMERA: ${bp.scene.cameraDistance} | ${bp.scene.lens} | ${bp.scene.crop}
PROPS: ${bp.scene.props.join(', ') || 'none'}

CURRENT FRAME: ${frameIndex + 1} of ${totalFrames} | ANGLE: ${angleDeg}° around vertical axis

ONLY CHANGE ALLOWED: camera/product rotation angle
${rulesStr}
=== END LOCKED SCENE IDENTITY ===`.trim()
}

/**
 * Serialize the identity blueprint to a Leonardo textVariables string.
 * Injected into the textVariables blueprint node input.
 */
export function serializeIdentityBlueprintToTextVariables(
  bp:          IdentityBlueprint,
  angleDeg:    number,
  frameIndex:  number,
  totalFrames: number,
  referenceImageInstruction?: string,
): string {
  const partsStr = bp.subject.exactIngredientsOrParts.join(', ')
  const rulesStr = bp.negativeRules.join('; ')

  const refInstruction = referenceImageInstruction
    ?? 'Use the provided reference image as the canonical visual anchor for this product.'

  return [
    `PRODUCT: ${bp.subject.productName}`,
    partsStr ? `EXACT PARTS: ${partsStr}` : '',
    `VESSEL: ${bp.vessel.type}, ${bp.vessel.material}, ${bp.vessel.color}`,
    `TABLE: ${bp.scene.table}`,
    `BACKGROUND: ${bp.scene.background}`,
    `LIGHTING: ${bp.scene.lighting}`,
    `CAMERA: ${bp.scene.cameraDistance}, ${bp.scene.lens}`,
    `FRAME: ${frameIndex + 1}/${totalFrames} at ${angleDeg}° angle`,
    `REFERENCE IMAGE: ${refInstruction}`,
    `RULES: ${rulesStr}`,
    'INSTRUCTION: same exact product, same exact plate/bowl, same exact toppings/details, same exact table, same exact lighting, same exact camera distance. Only rotate the angle.',
  ].filter(Boolean).join('\n')
}

// ─── Type guard ───────────────────────────────────────────────────────────────

export function isIdentityBlueprint(value: unknown): value is IdentityBlueprint {
  if (!value || typeof value !== 'object') return false
  const bp = value as Record<string, unknown>
  return (
    typeof bp.subject  === 'object' && bp.subject  !== null &&
    typeof bp.vessel   === 'object' && bp.vessel   !== null &&
    typeof bp.scene    === 'object' && bp.scene    !== null &&
    typeof bp.rotation === 'object' && bp.rotation !== null &&
    Array.isArray(bp.negativeRules)
  )
}

export function getIdentityBlueprint(
  lockedIdentityBlueprint: Record<string, unknown> | null | undefined,
): IdentityBlueprint | null {
  if (!lockedIdentityBlueprint) return null
  if (isIdentityBlueprint(lockedIdentityBlueprint)) return lockedIdentityBlueprint
  return null
}
