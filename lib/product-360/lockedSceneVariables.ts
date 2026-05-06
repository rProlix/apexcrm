// lib/product-360/lockedSceneVariables.ts
//
// Product360LockedScene — the strict scene contract for a 360° package.
//
// Every detail in this contract is frozen for the entire package.
// The only permitted variation across frames is the camera orbit angle.
//
// Created BEFORE frame 0 via Gemini text planning (sceneContractBuilder.ts).
// Enriched AFTER frame 0 via Gemini vision analysis (masterFrameAnalyzer.ts).
// Stored in product_360_packages.scene_blueprint.lockedScene
//
// SERVER-SAFE — pure TypeScript, no external calls.

// ─── Core contract type ───────────────────────────────────────────────────────

export interface Product360LockedScene {
  /** The exact one version of this product, as a single descriptive phrase. */
  productVariant: string

  identity: {
    productName:     string
    productCategory: string
    productType:     string          // pizza / pho / burger / bottle / etc.
    subType:         string          // combo pizza / cheese pizza / pho bo / etc.
    visualStyle:     string          // realistic, studio, commercial
    mustRemainSame:  string[]        // human-readable list of locked elements
    forbiddenChanges: string[]       // human-readable list of what MUST NOT change
  }

  /** Present for all food products (bowls, soups, pizzas, burgers, etc.) */
  foodDetails?: {
    foodType:             string     // "pizza" | "pho" | "ramen" | "burger" | etc.
    subType:              string     // "combo pizza" | "pho bo" | "classic cheeseburger"
    exactDescription:     string     // one precise sentence describing exactly what this food looks like
    base:                 string     // crust / noodles / rice / patty description
    sauceColor?:          string
    cheeseCoverage?:      string
    brothOrLiquid?:       string     // for soups, beverages
    /** Every topping LOCKED with exact count, position, color, size */
    toppings: Array<{
      name:      string
      count:     string              // "12 slices" / "6-8 pieces" / "evenly distributed"
      placement: string              // "evenly distributed across pizza" / "at 12 o'clock"
      color:     string
      size?:     string
    }>
    toppingMapDescription: string    // overall topping distribution description
    garnish:              string[]   // ["2 lime wedges at 4 o'clock", "5 basil leaves center"]
    ingredientLayout:     string     // where things are inside the vessel
    portionSize:          string     // "standard serving, 80% full" / "heaping"
    doneness?:            string     // "golden crust, not charred" / "medium rare"
    cutPattern?:          string     // "8 even slices" / "halved" / "whole"
    forbiddenFoodChanges: string[]   // explicit list of what must not change
  }

  /** Present for non-food physical products */
  productDetails?: {
    objectShape:              string
    material:                 string
    color:                    string
    labelText?:               string
    labelPlacement?:          string
    packagingDetails?:        string
    uniqueMarks:              string[]
    forbiddenProductChanges:  string[]
  }

  vessel: {
    type:               string       // "round ceramic plate" / "deep bowl" / "pint glass"
    material:           string       // "ceramic" / "glass" / "wood"
    color:              string       // "matte white" / "dark charcoal"
    shape:              string       // "round" / "square" / "oval"
    size:               string       // "large, ~30cm diameter" / "medium, ~18cm"
    rimStyle?:          string
    position:           string       // "centered on table"
    mustRemainIdentical: boolean
  }

  environment: {
    tableSurfaceType:   string       // "dark walnut wood" / "marble" / "slate"
    tableSurfaceColor:  string       // "dark brown"
    tableTexture:       string       // "matte, horizontal grain"
    wallOrBackgroundType:  string    // "solid wall" / "studio cyclorama" / "gradient"
    wallOrBackgroundColor: string    // "warm off-white" / "dark charcoal"
    backgroundDistance: string       // "close" / "blurred at 2m"
    atmosphere:         string       // "cozy restaurant" / "clean studio" / "rustic kitchen"
    props: Array<{
      name:     string
      position: string
      color:    string
      material: string
      mustRemainIdentical: boolean
    }>
    forbiddenEnvironmentChanges: string[]
  }

  camera: {
    mode:               'locked_turntable_orbit'
    frameCount:         number
    focalLength:        string       // "50mm equivalent"
    cameraDistance:     string       // "80cm from center of product"
    cameraHeight:       string       // "eye level, 15° downward tilt"
    cameraPitch:        string
    zoom:               string       // "fixed, fill 70% of frame"
    crop:               string       // "medium-close square, centered"
    subjectCenter:      string       // "pizza center at frame center"
    orbitDirection:     'clockwise' | 'counterclockwise'
    angleDegrees:       number[]     // pre-computed list of all orbit angles
    forbiddenCameraChanges: string[]
  }

  lighting: {
    lightingPreset:     string
    keyLightPosition:   string       // "soft box, 45° front-left"
    fillLightPosition:  string       // "reflector, front-right"
    rimLightPosition?:  string
    shadowDirection:    string       // "soft shadows falling to the right"
    shadowSoftness:     string       // "soft, diffuse"
    brightness:         string       // "moderate exposure, slightly warm"
    colorTemperature:   string       // "3200K warm" / "5600K daylight"
    reflections:        string
    forbiddenLightingChanges: string[]
  }

  composition: {
    subjectPlacement:   string       // "centered, slight offset right"
    framePadding:       string       // "~15% padding on all sides"
    horizonLine?:       string
    tableVisibleAmount: string       // "table visible as thin strip at bottom"
    backgroundVisibleAmount: string
    propVisibility:     string
    forbiddenCompositionChanges: string[]
  }

  /** The absolute consistency contract — all values must be true */
  consistencyContract: {
    onlyAllowedChange:         'camera_orbit_angle'
    exactSameProduct:          true
    exactSameIngredients:      true
    exactSameToppingLayout:    true
    exactSameVessel:           true
    exactSameTable:            true
    exactSameWall:             true
    exactSameLighting:         true
    exactSameProps:            true
    exactSameCrop:             true
    exactSameZoom:             true
    exactSameAtmosphere:       true
    noNewIngredients:          true
    noRemovedIngredients:      true
    noSwappedProductType:      true
    noDifferentVariant:        true
    noDifferentPlateOrBowl:    true
    noDifferentBackground:     true
  }

  generatedAt:     string      // ISO timestamp
  analysisSource:  'gemini_text' | 'gemini_vision_enriched' | 'manual'
}

// ─── Consistency validation result ───────────────────────────────────────────

export interface ConsistencyValidationResult {
  score:                number       // 0.0–1.0
  passed:               boolean      // score >= threshold
  issues:               string[]     // list of detected problems
  detectedVariantDrift: boolean      // critical — product TYPE changed
  driftDetails:         string       // what exactly drifted
  shouldRegenerate:     boolean      // whether to retry this frame
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true if the blueprint has a fully-populated locked scene. */
export function hasLockedScene(blueprint: Record<string, unknown>): boolean {
  const ls = blueprint.lockedScene as Partial<Product360LockedScene> | null | undefined
  return !!(ls?.productVariant && ls.identity?.productType && ls.vessel?.type)
}

/** Returns the locked scene from a blueprint, or null if not present. */
export function getLockedScene(blueprint: Record<string, unknown>): Product360LockedScene | null {
  const ls = blueprint.lockedScene as Product360LockedScene | null | undefined
  if (!ls?.productVariant) return null
  return ls
}

/** Pre-compute all orbit angles for a given frame count and direction. */
export function computeOrbitAngles(frameCount: number, direction: 'clockwise' | 'counterclockwise' = 'clockwise'): number[] {
  const step = 360 / frameCount
  return Array.from({ length: frameCount }, (_, i) => {
    const raw = Math.round(step * i)
    return direction === 'clockwise' ? raw : (360 - raw) % 360
  })
}

// ─── Prompt serializer ────────────────────────────────────────────────────────

/**
 * Serialize the entire locked scene into a dense, prompt-ready string.
 * This is injected into EVERY frame prompt — the AI must follow it exactly.
 */
export function serializeLockedSceneToPrompt(scene: Product360LockedScene): string {
  const lines: string[] = []

  lines.push('╔══════════════════════════════════════════════════════════════════════╗')
  lines.push('║  ABSOLUTE LOCKED SCENE CONTRACT — ZERO CREATIVE REINTERPRETATION   ║')
  lines.push('╚══════════════════════════════════════════════════════════════════════╝')
  lines.push('')
  lines.push('LOCKED PRODUCT VARIANT (THE ONLY ALLOWED VERSION):')
  lines.push(`  "${scene.productVariant}"`)
  lines.push('  This is the ONLY version. Do not switch to any other variant.')
  lines.push('')

  // Food details
  if (scene.foodDetails) {
    const f = scene.foodDetails
    lines.push(`LOCKED ${f.foodType.toUpperCase()} DETAILS:`)
    lines.push(`  Type: ${f.subType}`)
    lines.push(`  Exact appearance: ${f.exactDescription}`)
    if (f.base)            lines.push(`  Base: ${f.base}`)
    if (f.sauceColor)      lines.push(`  Sauce: ${f.sauceColor}`)
    if (f.cheeseCoverage)  lines.push(`  Cheese: ${f.cheeseCoverage}`)
    if (f.brothOrLiquid)   lines.push(`  Liquid: ${f.brothOrLiquid}`)
    if (f.doneness)        lines.push(`  Doneness: ${f.doneness}`)
    if (f.cutPattern)      lines.push(`  Cut: ${f.cutPattern}`)
    if (f.toppings.length > 0) {
      lines.push('')
      lines.push(`  LOCKED TOPPINGS (every frame must have ALL of these, in the SAME positions):`)
      for (const t of f.toppings) {
        lines.push(`    • ${t.name}: ${t.count}, ${t.placement}, ${t.color}${t.size ? `, ${t.size}` : ''}`)
      }
    }
    if (f.toppingMapDescription) {
      lines.push(`  Topping map: ${f.toppingMapDescription}`)
    }
    if (f.garnish.length > 0) {
      lines.push(`  Garnish: ${f.garnish.join(' | ')}`)
    }
    if (f.ingredientLayout) {
      lines.push(`  Layout: ${f.ingredientLayout}`)
    }
    lines.push(`  Portion: ${f.portionSize}`)
    lines.push('')
    lines.push('  FORBIDDEN FOOD CHANGES (any of these = invalid frame):')
    for (const r of f.forbiddenFoodChanges) lines.push(`    ✕ ${r}`)
    lines.push('')
  }

  // Product details (non-food)
  if (scene.productDetails) {
    const p = scene.productDetails
    lines.push('LOCKED PRODUCT DETAILS:')
    lines.push(`  Shape: ${p.objectShape}`)
    lines.push(`  Material: ${p.material}`)
    lines.push(`  Color: ${p.color}`)
    if (p.labelText)      lines.push(`  Label: "${p.labelText}"`)
    if (p.labelPlacement) lines.push(`  Label placement: ${p.labelPlacement}`)
    if (p.uniqueMarks.length > 0) lines.push(`  Unique marks: ${p.uniqueMarks.join(', ')}`)
    lines.push('  FORBIDDEN CHANGES:')
    for (const r of p.forbiddenProductChanges) lines.push(`    ✕ ${r}`)
    lines.push('')
  }

  // Vessel
  lines.push('LOCKED VESSEL:')
  lines.push(`  ${scene.vessel.type} — ${scene.vessel.material}, ${scene.vessel.color}, ${scene.vessel.size}`)
  lines.push(`  Position: ${scene.vessel.position}`)
  lines.push('  Do not change this vessel in any way, ever.')
  lines.push('')

  // Environment
  lines.push('LOCKED ENVIRONMENT:')
  lines.push(`  Table surface: ${scene.environment.tableSurfaceType}, ${scene.environment.tableSurfaceColor}, ${scene.environment.tableTexture}`)
  lines.push(`  Background/wall: ${scene.environment.wallOrBackgroundType}, ${scene.environment.wallOrBackgroundColor}`)
  lines.push(`  Atmosphere: ${scene.environment.atmosphere}`)
  if (scene.environment.props.length > 0) {
    lines.push(`  Props: ${scene.environment.props.map(p => `${p.name} at ${p.position}`).join('; ')}`)
  } else {
    lines.push('  Props: none')
  }
  lines.push('  FORBIDDEN ENVIRONMENT CHANGES:')
  for (const r of scene.environment.forbiddenEnvironmentChanges) lines.push(`    ✕ ${r}`)
  lines.push('')

  // Camera
  lines.push('LOCKED CAMERA SETUP (same for EVERY frame):')
  lines.push(`  Lens: ${scene.camera.focalLength}`)
  lines.push(`  Distance: ${scene.camera.cameraDistance}`)
  lines.push(`  Height: ${scene.camera.cameraHeight}`)
  lines.push(`  Crop: ${scene.camera.crop}`)
  lines.push(`  Subject center: ${scene.camera.subjectCenter}`)
  lines.push('  FORBIDDEN CAMERA CHANGES:')
  for (const r of scene.camera.forbiddenCameraChanges) lines.push(`    ✕ ${r}`)
  lines.push('')

  // Lighting
  lines.push('LOCKED LIGHTING:')
  lines.push(`  Key: ${scene.lighting.keyLightPosition}`)
  lines.push(`  Fill: ${scene.lighting.fillLightPosition}`)
  if (scene.lighting.rimLightPosition) lines.push(`  Rim: ${scene.lighting.rimLightPosition}`)
  lines.push(`  Shadow: ${scene.lighting.shadowDirection}, ${scene.lighting.shadowSoftness}`)
  lines.push(`  Temperature: ${scene.lighting.colorTemperature}`)
  lines.push('  FORBIDDEN LIGHTING CHANGES:')
  for (const r of scene.lighting.forbiddenLightingChanges) lines.push(`    ✕ ${r}`)
  lines.push('')

  // Consistency contract
  lines.push('══════════════════════ ABSOLUTE CONSISTENCY CONTRACT ══════════════════')
  lines.push('  The ONLY allowed change between ALL frames is the camera orbit angle.')
  lines.push('  EVERY other element is physically frozen on the turntable.')
  lines.push('')
  lines.push('ABSOLUTE FORBIDDEN CHANGES (any violation = invalid frame):')
  lines.push(`  ✕ Do not change the product type (must stay: ${scene.identity.productType})`)
  lines.push(`  ✕ Do not change the product variant (must stay: ${scene.identity.subType})`)
  lines.push('  ✕ Do not add ingredients/toppings not in the locked list')
  lines.push('  ✕ Do not remove ingredients/toppings from the locked list')
  lines.push('  ✕ Do not change topping/ingredient placement or distribution')
  lines.push(`  ✕ Do not change the vessel (must stay: ${scene.vessel.type})`)
  lines.push(`  ✕ Do not change the table surface (must stay: ${scene.environment.tableSurfaceType})`)
  lines.push(`  ✕ Do not change the background (must stay: ${scene.environment.wallOrBackgroundColor})`)
  lines.push('  ✕ Do not change the lighting direction, intensity, or color temperature')
  lines.push('  ✕ Do not change the crop, zoom, or camera distance')
  lines.push('  ✕ Do not make a different version of this product')
  lines.push('  ✕ Do not reinterpret this prompt creatively')

  for (const rule of scene.identity.forbiddenChanges) {
    if (!lines.some(l => l.includes(rule.slice(0, 30)))) {
      lines.push(`  ✕ ${rule}`)
    }
  }

  return lines.join('\n')
}

/**
 * Build a very short summary of the locked scene for display in the UI.
 * Used in the diagnostics panel and error messages.
 */
export function buildLockedSceneSummary(scene: Product360LockedScene): string {
  const parts: string[] = [scene.productVariant]
  if (scene.foodDetails) {
    const f = scene.foodDetails
    if (f.toppings.length > 0) {
      const toppingNames = f.toppings.map(t => t.name).join(', ')
      parts.push(`Toppings: ${toppingNames}`)
    }
  }
  parts.push(`Vessel: ${scene.vessel.type}`)
  parts.push(`Table: ${scene.environment.tableSurfaceType}`)
  parts.push(`Background: ${scene.environment.wallOrBackgroundColor}`)
  return parts.join(' | ')
}

/**
 * Build a corrective regeneration prompt when drift was detected.
 * Used when a frame fails consistency validation.
 */
export function buildCorrectivePrompt(
  scene: Product360LockedScene,
  angleDeg: number,
  frameIndex: number,
  totalFrames: number,
  driftDetails: string,
): string {
  const shotDir = getOrbitalDirection(angleDeg)

  return [
    '╔══════════════════════════════════════════════════════════════════════╗',
    '║  CORRECTIVE REGENERATION — PREVIOUS ATTEMPT FAILED CONSISTENCY     ║',
    '╚══════════════════════════════════════════════════════════════════════╝',
    '',
    '⚠ THE PREVIOUS GENERATION ATTEMPT WAS REJECTED because:',
    `  "${driftDetails}"`,
    '',
    'You MUST fix this. The correct product is:',
    `  "${scene.productVariant}"`,
    '',
    scene.foodDetails
      ? [
          `The food is: ${scene.foodDetails.subType}`,
          `Exact appearance: ${scene.foodDetails.exactDescription}`,
          scene.foodDetails.toppings.length > 0
            ? `Required toppings (ALL must be present): ${scene.foodDetails.toppings.map(t => `${t.name} (${t.count})`).join(', ')}`
            : '',
          `Forbidden: ${scene.foodDetails.forbiddenFoodChanges.slice(0, 3).join('; ')}`,
        ].filter(Boolean).join('\n')
      : '',
    '',
    '─────────────────────────────────────────────────',
    serializeLockedSceneToPrompt(scene),
    '─────────────────────────────────────────────────',
    '',
    `FRAME: ${frameIndex + 1}/${totalFrames}`,
    `ORBIT ANGLE: ${angleDeg}° (${shotDir})`,
    '',
    'Now render this EXACT product from the corrected angle.',
    'Ultra-realistic professional product photography. No text, no watermarks.',
  ].filter(l => l !== null && l !== undefined).join('\n')
}

function getOrbitalDirection(angle: number): string {
  const n = ((angle % 360) + 360) % 360
  if (n === 0)   return 'front'
  if (n < 45)    return 'front-right'
  if (n === 45)  return 'front-right 45°'
  if (n < 90)    return 'right-front'
  if (n === 90)  return 'right'
  if (n < 135)   return 'right-rear'
  if (n === 135) return 'rear-right 45°'
  if (n < 180)   return 'rear-right'
  if (n === 180) return 'rear'
  if (n < 225)   return 'rear-left'
  if (n === 225) return 'rear-left 45°'
  if (n < 270)   return 'left-rear'
  if (n === 270) return 'left'
  if (n < 315)   return 'left-front'
  if (n === 315) return 'front-left 45°'
  return 'front-left'
}

// ─── Default locked consistency contract ─────────────────────────────────────

export const DEFAULT_CONSISTENCY_CONTRACT: Product360LockedScene['consistencyContract'] = {
  onlyAllowedChange:         'camera_orbit_angle',
  exactSameProduct:          true,
  exactSameIngredients:      true,
  exactSameToppingLayout:    true,
  exactSameVessel:           true,
  exactSameTable:            true,
  exactSameWall:             true,
  exactSameLighting:         true,
  exactSameProps:            true,
  exactSameCrop:             true,
  exactSameZoom:             true,
  exactSameAtmosphere:       true,
  noNewIngredients:          true,
  noRemovedIngredients:      true,
  noSwappedProductType:      true,
  noDifferentVariant:        true,
  noDifferentPlateOrBowl:    true,
  noDifferentBackground:     true,
}
