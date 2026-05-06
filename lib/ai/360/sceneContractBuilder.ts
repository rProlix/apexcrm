// lib/ai/360/sceneContractBuilder.ts
//
// Uses Gemini text API to plan and LOCK an exact product360 scene contract
// BEFORE any frame is generated.
//
// WHY THIS EXISTS
//   Without this pre-generation planning step, the image model receives a
//   vague product description ("pizza") and invents a different version for
//   each frame — cheese on one, combo on another. This is the root cause of
//   product variant drift.
//
//   By asking Gemini to commit to ONE specific version (cheese OR combo, not
//   both) and capture every visual detail (exact toppings, count, placement,
//   vessel, table, wall, lighting) before frame 0, we lock the AI's creative
//   choices into the contract. Every subsequent frame prompt then receives
//   these exact details, leaving no room for improvisation.
//
// USAGE
//   const lockedScene = await buildSceneContract(subject, genConfig, blueprint)
//   blueprint.lockedScene = lockedScene
//   // save to DB, then use for all frame generation
//
// SERVER-ONLY. Never import from client components.

import { callGeminiText } from '../geminiRequest'
import {
  type Product360LockedScene,
  computeOrbitAngles,
  DEFAULT_CONSISTENCY_CONTRACT,
} from '../../product-360/lockedSceneVariables'
import type { NormalizedProductSubject } from './normalizeProduct'
import type { P360GenerationConfig } from './types'

// ─── Default Gemini model for planning ───────────────────────────────────────

const PLANNER_MODEL = process.env.P360_PLANNER_MODEL ?? 'gemini-2.0-flash-exp'

// ─── Food-category helpers ────────────────────────────────────────────────────

const FOOD_CATEGORIES = new Set([
  'food', 'beverage', 'drink', 'dessert', 'bakery',
  'restaurant', 'cafe', 'coffee', 'tea', 'juice',
  'snack', 'pizza', 'burger', 'taco', 'bowl', 'soup',
  'pasta', 'sushi', 'salad', 'sandwich', 'noodle',
])

const BEVERAGE_KEYWORDS = ['coffee', 'tea', 'juice', 'drink', 'beverage', 'beer', 'wine', 'cocktail', 'shake', 'smoothie', 'soda', 'latte', 'espresso', 'cappuccino']

function isFood(subject: NormalizedProductSubject, config: P360GenerationConfig): boolean {
  const cat = (subject.productCategory ?? '').toLowerCase()
  const name = (subject.name ?? '').toLowerCase()
  const desc = (subject.rawDescription ?? '').toLowerCase()
  if (FOOD_CATEGORIES.has(cat)) return true
  if (FOOD_CATEGORIES.has(config.categoryPreset ?? '')) return true
  const combined = `${name} ${desc} ${cat}`
  return FOOD_CATEGORIES.has(name) ||
    [...FOOD_CATEGORIES].some(kw => combined.includes(kw))
}

function isBeverage(subject: NormalizedProductSubject): boolean {
  const combined = `${subject.name ?? ''} ${subject.rawDescription ?? ''}`.toLowerCase()
  return BEVERAGE_KEYWORDS.some(kw => combined.includes(kw))
}

// ─── Food-type detection ──────────────────────────────────────────────────────

const FOOD_TYPE_KEYWORDS: Array<{ type: string; keywords: string[] }> = [
  { type: 'pizza',     keywords: ['pizza', 'pie', 'margarita', 'margherita', 'pepperoni', 'calzone'] },
  { type: 'pho',       keywords: ['pho', 'phở', 'pho bo', 'pho ga'] },
  { type: 'ramen',     keywords: ['ramen', 'tonkotsu', 'shoyu ramen', 'miso ramen'] },
  { type: 'noodle',    keywords: ['noodle', 'pasta', 'spaghetti', 'fettuccine', 'pad thai', 'mie', 'laksa'] },
  { type: 'soup',      keywords: ['soup', 'stew', 'bisque', 'chowder', 'broth', 'pottage'] },
  { type: 'burger',    keywords: ['burger', 'hamburger', 'cheeseburger', 'sandwich', 'sub', 'hoagie'] },
  { type: 'taco',      keywords: ['taco', 'burrito', 'enchilada', 'quesadilla', 'tostada'] },
  { type: 'bowl',      keywords: ['bowl', 'rice bowl', 'grain bowl', 'poke', 'chirashi'] },
  { type: 'salad',     keywords: ['salad', 'caesar', 'cobb'] },
  { type: 'steak',     keywords: ['steak', 'ribeye', 'filet', 'chop'] },
  { type: 'sushi',     keywords: ['sushi', 'sashimi', 'maki', 'nigiri', 'roll'] },
  { type: 'dessert',   keywords: ['cake', 'tart', 'ice cream', 'gelato', 'pudding', 'mousse', 'crepe', 'waffle', 'brownie', 'cookie', 'macaron', 'donut', 'churro'] },
]

function detectFoodType(subject: NormalizedProductSubject): string {
  const combined = `${subject.name ?? ''} ${subject.rawDescription ?? ''}`.toLowerCase()
  for (const { type, keywords } of FOOD_TYPE_KEYWORDS) {
    if (keywords.some(kw => combined.includes(kw))) return type
  }
  return 'food'
}

// ─── Planning prompt ──────────────────────────────────────────────────────────

function buildPlanningPrompt(
  subject: NormalizedProductSubject,
  config: P360GenerationConfig,
  frameCount: number,
  foodType: string,
  isFood_: boolean,
  isBeverage_: boolean,
): string {
  const name        = subject.name           ?? 'Unknown Product'
  const description = subject.rawDescription ?? ''
  const category    = subject.productCategory ?? config.categoryPreset ?? 'general'
  const lightingPreset = config.lightingPreset ?? 'warm_food_commercial'
  const bgPreset    = config.backgroundPreset  ?? 'warm_wooden_table'

  return `You are a professional 360° product photography art director.

Your task: Create ONE single, completely locked scene definition for a product spin sequence.
This scene will be photographed from EXACTLY ${frameCount} camera angles (one full rotation).
Every visual detail you specify must apply to ALL ${frameCount} frames — there is ZERO tolerance for variation.

PRODUCT TO PHOTOGRAPH:
  Name: "${name}"
  Description: "${description}"
  Category: "${category}"
  Is food: ${isFood_}
  Is beverage: ${isBeverage_}
  Food type: ${foodType}
  Lighting preset hint: ${lightingPreset}
  Background preset hint: ${bgPreset}

YOUR REQUIREMENTS:
1. Choose EXACTLY ONE version of this product. Commit fully. Zero alternatives.
2. If this is food with multiple possible variants (e.g. pizza can be cheese OR combo), pick ONE and lock it PERMANENTLY.
3. If the product description mentions specific toppings/ingredients, they MUST appear in every frame.
4. Specify exact COUNTS, COLORS, POSITIONS for every topping/ingredient visible.
5. Pick a specific vessel (plate/bowl/cup/tray) — size, material, color, shape.
6. Pick a specific table surface (material, color, texture).
7. Pick a specific background/wall (type, color, distance).
8. Pick specific lighting (direction, softness, color temperature).
9. Be EXTREMELY specific. "some pepperoni" is not acceptable. "12 round pepperoni slices, evenly distributed across pizza" is acceptable.
10. If the product description is vague (e.g. just "pizza"), pick a single version yourself (e.g. "classic cheese pizza") and lock it.
11. NEVER say "could be" or "optionally". Just pick one exact thing.

${isFood_ ? `FOOD-SPECIFIC REQUIREMENTS:
- You MUST specify the exact food subtype (e.g. "combo pizza with pepperoni, mushrooms, olives" not just "pizza")
- You MUST list every visible topping/ingredient with: name, count, placement, color
- If it is a pizza, specify: variant, crust, sauce, cheese, all toppings, cut pattern
- If it is a soup/pho/ramen, specify: broth, noodles, meat, all garnish
- If it is a burger, specify: patty, cheese, all toppings, bun type
- The forbidden changes list MUST include explicit rules for this specific food type
- For pizza: if it's cheese-only, forbid ALL meat and vegetables; if it's combo, forbid cheese-only frames` : ''}

Return ONLY a valid JSON object. No markdown, no backticks, no commentary before or after.

{
  "productVariant": "single precise sentence naming the exact version, e.g. 'combo pizza with 12 pepperoni slices, 8 mushroom slices, black olives, and green pepper strips'",
  "identity": {
    "productName": "${name}",
    "productCategory": "${category}",
    "productType": "${foodType}",
    "subType": "specific variant, e.g. 'combo pizza' or 'cheese pizza' or 'classic pho bo'",
    "visualStyle": "realistic food photography",
    "mustRemainSame": ["product variant", "all toppings", "vessel", "table", "background", "lighting"],
    "forbiddenChanges": ["list of explicit forbidden changes, each one a complete sentence"]
  },
  ${isFood_ ? `"foodDetails": {
    "foodType": "${foodType}",
    "subType": "specific sub-variant",
    "exactDescription": "one precise sentence describing what the food looks like when plated",
    "base": "describe the base (crust, noodles, rice, patty, etc.)",
    "sauceColor": "describe sauce if visible",
    "cheeseCoverage": "describe cheese if present",
    "brothOrLiquid": "describe broth/liquid if soup/beverage",
    "toppings": [
      {
        "name": "ingredient name",
        "count": "exact count or range, e.g. '12 slices' or '6-8 pieces'",
        "placement": "where exactly on the food, e.g. 'evenly distributed across pizza surface'",
        "color": "exact color description",
        "size": "small/medium/large/exact"
      }
    ],
    "toppingMapDescription": "one sentence describing the overall topping distribution pattern",
    "garnish": ["garnish item with exact position, e.g. '2 lime wedges at 4 o\\'clock'"],
    "ingredientLayout": "describe how the contents are arranged inside the vessel",
    "portionSize": "e.g. 'standard serving, plate full' or '80% full'",
    "doneness": "e.g. 'golden crust, not charred' or 'medium rare'",
    "cutPattern": "e.g. '8 even slices' or 'halved' or 'whole uncut'",
    "forbiddenFoodChanges": [
      "explicit forbidden change #1 — complete sentence",
      "explicit forbidden change #2",
      "etc."
    ]
  },` : '"foodDetails": null,'}
  ${!isFood_ ? `"productDetails": {
    "objectShape": "describe shape",
    "material": "describe material",
    "color": "exact color",
    "labelText": "exact label text if visible",
    "labelPlacement": "where label is positioned",
    "uniqueMarks": ["distinctive feature 1", "distinctive feature 2"],
    "forbiddenProductChanges": ["do not change color", "do not change label text"]
  },` : '"productDetails": null,'}
  "vessel": {
    "type": "e.g. 'round ceramic plate' or 'deep ceramic bowl' or 'pint glass'",
    "material": "e.g. 'ceramic' or 'glass' or 'wood'",
    "color": "e.g. 'matte white' or 'dark charcoal'",
    "shape": "e.g. 'round' or 'oval' or 'square'",
    "size": "e.g. 'large, ~30cm diameter' or 'medium, ~18cm'",
    "rimStyle": "e.g. 'raised edge, flat center'",
    "position": "centered on table",
    "mustRemainIdentical": true
  },
  "environment": {
    "tableSurfaceType": "e.g. 'dark walnut wood' or 'white marble'",
    "tableSurfaceColor": "e.g. 'dark espresso brown'",
    "tableTexture": "e.g. 'matte, horizontal grain' or 'polished smooth'",
    "wallOrBackgroundType": "e.g. 'solid plaster wall' or 'studio cyclorama'",
    "wallOrBackgroundColor": "e.g. 'warm off-white' or 'soft grey'",
    "backgroundDistance": "e.g. 'blurred at 2m' or 'seamless'",
    "atmosphere": "e.g. 'cozy restaurant' or 'clean studio' or 'rustic kitchen'",
    "props": [],
    "forbiddenEnvironmentChanges": [
      "Do not change the table surface",
      "Do not change the wall/background color",
      "Do not add or remove props"
    ]
  },
  "camera": {
    "focalLength": "e.g. '50mm equivalent'",
    "cameraDistance": "e.g. '80cm from center of product'",
    "cameraHeight": "e.g. 'eye level, 15 degree downward tilt'",
    "cameraPitch": "e.g. 'slight top-down'",
    "zoom": "fixed, product fills ~70-75% of frame",
    "crop": "e.g. 'square medium-close, product centered'",
    "subjectCenter": "e.g. 'center of plate at exact frame center'",
    "forbiddenCameraChanges": [
      "Do not change camera distance",
      "Do not change crop or zoom",
      "Do not change camera height"
    ]
  },
  "lighting": {
    "lightingPreset": "${lightingPreset}",
    "keyLightPosition": "e.g. 'soft box, 45 degrees front-left'",
    "fillLightPosition": "e.g. 'reflector, front-right, fill ratio 1:3'",
    "rimLightPosition": "e.g. 'subtle warm rim at rear-right, optional'",
    "shadowDirection": "e.g. 'soft shadows falling to the right'",
    "shadowSoftness": "e.g. 'soft, diffuse, no harsh edges'",
    "brightness": "e.g. 'moderate exposure, warm and inviting'",
    "colorTemperature": "e.g. '3200K warm' or '4500K neutral'",
    "reflections": "e.g. 'subtle surface reflection on table'",
    "forbiddenLightingChanges": [
      "Do not change key light direction",
      "Do not change color temperature",
      "Do not add dramatic shadows"
    ]
  },
  "composition": {
    "subjectPlacement": "e.g. 'centered, slight lower offset'",
    "framePadding": "e.g. '~15% on all sides'",
    "horizonLine": "e.g. 'horizon at 60% from top'",
    "tableVisibleAmount": "e.g. 'table visible as strip at bottom'",
    "backgroundVisibleAmount": "e.g. 'background fills top 50% of frame'",
    "propVisibility": "none",
    "forbiddenCompositionChanges": [
      "Do not reframe or zoom",
      "Do not shift subject position"
    ]
  }
}`.trim()
}

// ─── Schema normalizer ────────────────────────────────────────────────────────

type RawSceneInput = Record<string, unknown>

function normalizeRawScene(
  raw: RawSceneInput,
  subject: NormalizedProductSubject,
  config: P360GenerationConfig,
  frameCount: number,
  orbitDirection: 'clockwise' | 'counterclockwise',
): Product360LockedScene {
  const name     = subject.name           ?? 'Unknown Product'
  const category = subject.productCategory ?? config.categoryPreset ?? 'general'

  const identity = (raw.identity as RawSceneInput | null) ?? {}
  const foodRaw  = (raw.foodDetails  as RawSceneInput | null | undefined)
  const prodRaw  = (raw.productDetails as RawSceneInput | null | undefined)
  const vesselRaw  = (raw.vessel   as RawSceneInput | null) ?? {}
  const envRaw     = (raw.environment as RawSceneInput | null) ?? {}
  const camRaw     = (raw.camera   as RawSceneInput | null) ?? {}
  const lightRaw   = (raw.lighting as RawSceneInput | null) ?? {}
  const compRaw    = (raw.composition as RawSceneInput | null) ?? {}

  const angleDegrees = computeOrbitAngles(frameCount, orbitDirection)

  const foodDetails: Product360LockedScene['foodDetails'] = foodRaw
    ? {
        foodType:              String(foodRaw.foodType ?? 'food'),
        subType:               String(foodRaw.subType ?? raw.productVariant ?? name),
        exactDescription:      String(foodRaw.exactDescription ?? ''),
        base:                  String(foodRaw.base ?? ''),
        sauceColor:            foodRaw.sauceColor        ? String(foodRaw.sauceColor)        : undefined,
        cheeseCoverage:        foodRaw.cheeseCoverage    ? String(foodRaw.cheeseCoverage)    : undefined,
        brothOrLiquid:         foodRaw.brothOrLiquid     ? String(foodRaw.brothOrLiquid)     : undefined,
        toppings:              normalizeToppings(foodRaw.toppings),
        toppingMapDescription: String(foodRaw.toppingMapDescription ?? ''),
        garnish:               normalizeStringArray(foodRaw.garnish),
        ingredientLayout:      String(foodRaw.ingredientLayout ?? ''),
        portionSize:           String(foodRaw.portionSize ?? 'standard serving'),
        doneness:              foodRaw.doneness    ? String(foodRaw.doneness)    : undefined,
        cutPattern:            foodRaw.cutPattern  ? String(foodRaw.cutPattern)  : undefined,
        forbiddenFoodChanges:  normalizeStringArray(foodRaw.forbiddenFoodChanges),
      }
    : undefined

  const productDetails: Product360LockedScene['productDetails'] = prodRaw
    ? {
        objectShape:              String(prodRaw.objectShape ?? ''),
        material:                 String(prodRaw.material ?? ''),
        color:                    String(prodRaw.color ?? ''),
        labelText:                prodRaw.labelText      ? String(prodRaw.labelText)      : undefined,
        labelPlacement:           prodRaw.labelPlacement ? String(prodRaw.labelPlacement) : undefined,
        packagingDetails:         prodRaw.packagingDetails ? String(prodRaw.packagingDetails) : undefined,
        uniqueMarks:              normalizeStringArray(prodRaw.uniqueMarks),
        forbiddenProductChanges:  normalizeStringArray(prodRaw.forbiddenProductChanges),
      }
    : undefined

  return {
    productVariant: String(raw.productVariant ?? name),
    identity: {
      productName:     String(identity.productName     ?? name),
      productCategory: String(identity.productCategory ?? category),
      productType:     String(identity.productType     ?? detectFoodType(subject)),
      subType:         String(identity.subType         ?? raw.productVariant ?? name),
      visualStyle:     String(identity.visualStyle     ?? 'realistic product photography'),
      mustRemainSame:  normalizeStringArray(identity.mustRemainSame),
      forbiddenChanges: normalizeStringArray(identity.forbiddenChanges),
    },
    foodDetails,
    productDetails,
    vessel: {
      type:               String(vesselRaw.type     ?? 'plate'),
      material:           String(vesselRaw.material ?? 'ceramic'),
      color:              String(vesselRaw.color    ?? 'white'),
      shape:              String(vesselRaw.shape    ?? 'round'),
      size:               String(vesselRaw.size     ?? 'standard'),
      rimStyle:           vesselRaw.rimStyle ? String(vesselRaw.rimStyle) : undefined,
      position:           String(vesselRaw.position ?? 'centered on table'),
      mustRemainIdentical: true,
    },
    environment: {
      tableSurfaceType:          String(envRaw.tableSurfaceType  ?? 'wooden'),
      tableSurfaceColor:         String(envRaw.tableSurfaceColor ?? 'dark brown'),
      tableTexture:              String(envRaw.tableTexture      ?? 'matte'),
      wallOrBackgroundType:      String(envRaw.wallOrBackgroundType  ?? 'solid wall'),
      wallOrBackgroundColor:     String(envRaw.wallOrBackgroundColor ?? 'warm off-white'),
      backgroundDistance:        String(envRaw.backgroundDistance ?? 'blurred background'),
      atmosphere:                String(envRaw.atmosphere ?? 'clean studio'),
      props:                     normalizeProps(envRaw.props),
      forbiddenEnvironmentChanges: normalizeStringArray(envRaw.forbiddenEnvironmentChanges),
    },
    camera: {
      mode:               'locked_turntable_orbit',
      frameCount,
      focalLength:        String(camRaw.focalLength    ?? '50mm equivalent'),
      cameraDistance:     String(camRaw.cameraDistance ?? '80cm from product center'),
      cameraHeight:       String(camRaw.cameraHeight   ?? 'eye level, 15° downward tilt'),
      cameraPitch:        String(camRaw.cameraPitch    ?? 'slight top-down'),
      zoom:               String(camRaw.zoom           ?? 'fixed, product fills 70% of frame'),
      crop:               String(camRaw.crop           ?? 'square medium-close, centered'),
      subjectCenter:      String(camRaw.subjectCenter  ?? 'product center at frame center'),
      orbitDirection,
      angleDegrees,
      forbiddenCameraChanges: normalizeStringArray(camRaw.forbiddenCameraChanges),
    },
    lighting: {
      lightingPreset:      String(lightRaw.lightingPreset     ?? config.lightingPreset ?? 'warm_food_commercial'),
      keyLightPosition:    String(lightRaw.keyLightPosition   ?? 'soft box, 45° front-left'),
      fillLightPosition:   String(lightRaw.fillLightPosition  ?? 'reflector, front-right'),
      rimLightPosition:    lightRaw.rimLightPosition ? String(lightRaw.rimLightPosition) : undefined,
      shadowDirection:     String(lightRaw.shadowDirection    ?? 'soft shadows to the right'),
      shadowSoftness:      String(lightRaw.shadowSoftness     ?? 'soft, diffuse'),
      brightness:          String(lightRaw.brightness         ?? 'moderate, warm'),
      colorTemperature:    String(lightRaw.colorTemperature   ?? '3200K warm'),
      reflections:         String(lightRaw.reflections        ?? 'subtle surface reflection'),
      forbiddenLightingChanges: normalizeStringArray(lightRaw.forbiddenLightingChanges),
    },
    composition: {
      subjectPlacement:          String(compRaw.subjectPlacement         ?? 'centered'),
      framePadding:              String(compRaw.framePadding             ?? '~15% on all sides'),
      horizonLine:               compRaw.horizonLine ? String(compRaw.horizonLine) : undefined,
      tableVisibleAmount:        String(compRaw.tableVisibleAmount       ?? 'table visible as strip at bottom'),
      backgroundVisibleAmount:   String(compRaw.backgroundVisibleAmount  ?? 'background fills upper half'),
      propVisibility:            String(compRaw.propVisibility           ?? 'none'),
      forbiddenCompositionChanges: normalizeStringArray(compRaw.forbiddenCompositionChanges),
    },
    consistencyContract: DEFAULT_CONSISTENCY_CONTRACT,
    generatedAt:    new Date().toISOString(),
    analysisSource: 'gemini_text',
  }
}

function normalizeToppings(raw: unknown): Array<{ name: string; count: string; placement: string; color: string; size?: string }> {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null)
    .map(t => ({
      name:      String(t.name      ?? 'ingredient'),
      count:     String(t.count     ?? 'some'),
      placement: String(t.placement ?? 'distributed'),
      color:     String(t.color     ?? ''),
      size:      t.size ? String(t.size) : undefined,
    }))
}

function normalizeProps(raw: unknown): Product360LockedScene['environment']['props'] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
    .map(p => ({
      name:     String(p.name     ?? 'prop'),
      position: String(p.position ?? ''),
      color:    String(p.color    ?? ''),
      material: String(p.material ?? ''),
      mustRemainIdentical: true,
    }))
}

function normalizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map(s => String(s)).filter(Boolean)
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Build a locked scene contract for a 360° package using Gemini text planning.
 *
 * Called BEFORE frame 0 is generated, once per package.
 * Returns null if Gemini fails — caller should fall back to existing blueprint.
 *
 * @example
 *   const lockedScene = await buildSceneContract(subject, config, blueprint)
 *   if (lockedScene) blueprint.lockedScene = lockedScene
 */
export async function buildSceneContract(
  subject: NormalizedProductSubject,
  config: P360GenerationConfig,
  existingBlueprint?: Record<string, unknown> | null,
  frameCount = 24,
  orbitDirection: 'clockwise' | 'counterclockwise' = 'clockwise',
): Promise<Product360LockedScene | null> {
  const food     = isFood(subject, config)
  const bev      = isBeverage(subject)
  const foodType = food ? detectFoodType(subject) : 'product'

  const prompt = buildPlanningPrompt(subject, config, frameCount, foodType, food, bev)

  console.info(`[sceneContractBuilder] Planning scene contract for "${subject.name}" (food=${food}, type=${foodType})`)

  const { data, error, text } = await callGeminiText<RawSceneInput>({
    model:           PLANNER_MODEL,
    prompt,
    feature:         '360-scene-contract-builder',
    temperature:     0.1,    // near-deterministic — we want one specific answer
    maxOutputTokens: 4096,
    expectJson:      true,
  })

  if (error) {
    console.warn(`[sceneContractBuilder] Gemini error (will use fallback):`, error)
    return buildFallbackContract(subject, config, frameCount, orbitDirection, food, foodType)
  }

  if (!data || typeof data !== 'object' || !data.productVariant) {
    console.warn(`[sceneContractBuilder] Invalid JSON from Gemini (raw: ${text?.slice(0, 200)}). Using fallback.`)
    return buildFallbackContract(subject, config, frameCount, orbitDirection, food, foodType)
  }

  try {
    const scene = normalizeRawScene(data, subject, config, frameCount, orbitDirection)
    console.info(`[sceneContractBuilder] Scene contract built: "${scene.productVariant}"`)
    return scene
  } catch (err) {
    console.warn(`[sceneContractBuilder] Normalization error:`, err)
    return buildFallbackContract(subject, config, frameCount, orbitDirection, food, foodType)
  }
}

// ─── Fallback (no AI call) ────────────────────────────────────────────────────

/**
 * Build a minimal locked scene contract without a Gemini call.
 * Used when Gemini is unavailable or returns invalid JSON.
 * The resulting contract is less detailed but still provides some locking.
 */
function buildFallbackContract(
  subject: NormalizedProductSubject,
  config: P360GenerationConfig,
  frameCount: number,
  orbitDirection: 'clockwise' | 'counterclockwise',
  isFood_: boolean,
  foodType: string,
): Product360LockedScene {
  const name     = subject.name           ?? 'Product'
  const desc     = subject.rawDescription ?? ''
  const category = subject.productCategory ?? config.categoryPreset ?? 'general'
  const angles   = computeOrbitAngles(frameCount, orbitDirection)

  const variant  = desc ? `${name} — ${desc.slice(0, 80)}` : name

  const forbiddenFood: string[] = isFood_ ? [
    `Do not change to a different ${foodType} variant`,
    'Do not add toppings or ingredients not present in the original',
    'Do not remove toppings or ingredients from the original',
    'Do not change the plate, bowl, or vessel',
    'Do not change the table surface',
    'Do not change the background or wall',
  ] : []

  return {
    productVariant: variant,
    identity: {
      productName:      name,
      productCategory:  category,
      productType:      foodType,
      subType:          variant,
      visualStyle:      'realistic product photography',
      mustRemainSame:   ['product', 'vessel', 'table', 'background', 'lighting', 'crop'],
      forbiddenChanges: [
        'Do not change the product type or variant',
        'Do not add or remove components',
        'Do not change the vessel',
        'Do not change the table',
        'Do not change the background',
        'Do not change the lighting',
        'Do not change the crop or zoom',
      ],
    },
    foodDetails: isFood_ ? {
      foodType,
      subType:              variant,
      exactDescription:     desc || `${name}, freshly prepared`,
      base:                 '',
      toppings:             [],
      toppingMapDescription: desc,
      garnish:              [],
      ingredientLayout:     'arranged as described',
      portionSize:          'standard serving',
      forbiddenFoodChanges: forbiddenFood,
    } : undefined,
    productDetails: !isFood_ ? {
      objectShape:             '',
      material:                '',
      color:                   '',
      uniqueMarks:             [],
      forbiddenProductChanges: ['Do not change the product shape, color, or labeling'],
    } : undefined,
    vessel: {
      type:               subject.vessel ?? 'plate',
      material:           'ceramic',
      color:              'white',
      shape:              'round',
      size:               'standard',
      position:           'centered on table',
      mustRemainIdentical: true,
    },
    environment: {
      tableSurfaceType:          'wooden table',
      tableSurfaceColor:         'dark brown',
      tableTexture:              'matte',
      wallOrBackgroundType:      'studio background',
      wallOrBackgroundColor:     'warm off-white',
      backgroundDistance:        'blurred',
      atmosphere:                'clean studio',
      props:                     [],
      forbiddenEnvironmentChanges: [
        'Do not change the table surface',
        'Do not change the background',
      ],
    },
    camera: {
      mode:               'locked_turntable_orbit',
      frameCount,
      focalLength:        '50mm equivalent',
      cameraDistance:     '80cm from product center',
      cameraHeight:       'eye level, 15° downward tilt',
      cameraPitch:        'slight top-down',
      zoom:               'fixed, product fills ~70% of frame',
      crop:               'square medium-close, centered',
      subjectCenter:      'product center at frame center',
      orbitDirection,
      angleDegrees:       angles,
      forbiddenCameraChanges: [
        'Do not change camera distance',
        'Do not change crop or zoom',
      ],
    },
    lighting: {
      lightingPreset:      config.lightingPreset ?? 'warm_food_commercial',
      keyLightPosition:    'soft box, 45° front-left',
      fillLightPosition:   'reflector, front-right',
      shadowDirection:     'soft shadows falling to the right',
      shadowSoftness:      'soft, diffuse',
      brightness:          'moderate, warm',
      colorTemperature:    '3200K warm',
      reflections:         'subtle',
      forbiddenLightingChanges: ['Do not change lighting direction or color temperature'],
    },
    composition: {
      subjectPlacement:          'centered',
      framePadding:              '~15% on all sides',
      tableVisibleAmount:        'table visible as strip at bottom',
      backgroundVisibleAmount:   'background fills upper half',
      propVisibility:            'none',
      forbiddenCompositionChanges: ['Do not reframe or change zoom'],
    },
    consistencyContract: DEFAULT_CONSISTENCY_CONTRACT,
    generatedAt:    new Date().toISOString(),
    analysisSource: 'gemini_text',
  }
}
