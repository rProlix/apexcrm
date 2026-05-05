// lib/ai/360/buildLockedFramePrompt.ts
// Hyper-consistent prompt architecture for 360° product photography.
//
// PROBLEM this solves:
//   Independent per-frame text-to-image calls produce inconsistent results:
//   bowl sizes drift, ingredient counts change, zoom varies, garnish shifts.
//   This is because each Imagen call is stateless — it doesn't know what
//   any other frame looked like.
//
// SOLUTION — 3-stage locked generation:
//   Stage A: buildMasterFramePrompt  → canonical "ground truth" frame (frame 0, 0°)
//   Stage B: buildSceneBlueprint     → structured JSON spec frozen from the master
//            buildLockedGenerationPrompt → the text template stored on the package
//   Stage C: buildLockedFramePrompt  → per-frame prompt that injects the frozen spec
//            at the specific orbit angle
//
// Every Stage C prompt is ~3× longer than the old single-frame prompt, with an
// explicit, exhaustive DO-NOT-CHANGE list for every scene element. This forces
// the model to treat the canonical scene as a frozen studio setup.
//
// SERVER-ONLY. No external calls.

import type { P360GenerationConfig } from './types'
import type { NormalizedProductSubject } from './normalizeProduct'

// ─── Scene blueprint type ─────────────────────────────────────────────────────

export interface SceneBlueprint {
  subject: {
    name:         string
    vessel:       string
    ingredients:  string[]
    garnish:      string[]
    utensils:     string[]
  }
  camera: {
    heightAngle:  string
    distance:     string
    crop:         string
    orbitMode:    'yaw_only'
    focalFeel:    string
  }
  lighting: {
    style:        string
    direction:    string
    shadowStyle:  string
  }
  background: {
    style:        string
    surface:      string
  }
  consistencyRules:  string[]
  consistencyMode:   'standard' | 'strict'
  createdAt:         string
}

// ─── Preset description lookups ───────────────────────────────────────────────

const LIGHTING_LABELS: Record<string, string> = {
  luxury_softbox:           'large premium softboxes, silky wrap-around light, ultra-soft shadows',
  gold_rim_light:           'warm gold rim backlighting, golden glow on product edges',
  clean_ecommerce_white:    'bright flat white studio, minimal shadows',
  dramatic_black_studio:    'dark studio, high-contrast selective rim light',
  natural_window_light:     'soft natural daylight from one side, gentle shadows',
  neon_showcase:            'vibrant neon accent lights, colorful rim lighting',
  warm_restaurant_tabletop: 'warm golden ambient restaurant light',
  automotive_showroom:      'crisp dealership-quality studio lighting',
  jewelry_macro_shine:      'intense macro sparkle, brilliant facet highlights',
  matte_product_soft_glow:  'soft diffused warm glow, matte texture emphasis',
  studio_soft:              'soft wraparound softboxes, gentle even shadows',
  high_key_clean:           'high-key white, minimal shadows',
  luxury_dramatic:          'high-contrast luxury, deep shadows, rich highlights',
  retail_bright:            'bright commercial retail lighting',
  natural_daylight:         'soft window light, airy atmosphere',
  warm_food_commercial:     'warm golden food photography lighting',
  moody_premium:            'dark background, selective rim light',
  glossy_reflective:        'sharp specular highlights, surface sheen',
  matte_catalog:            'flat even catalog lighting, no harsh shadows',
}

const BACKGROUND_LABELS: Record<string, string> = {
  pure_white:             'pure white seamless studio background',
  soft_gray_gradient:     'soft light-grey gradient background',
  deep_black_glass:       'near-black glossy surface background',
  warm_beige_studio:      'warm beige linen studio backdrop',
  luxury_gold_accent:     'rich warm gold accent background',
  restaurant_table:       'restaurant-quality tabletop',
  marble_surface:         'white marble with natural veining',
  garage_showroom:        'clean garage floor setting',
  transparent_isolated:   'clean neutral isolated background',
  soft_gradient:          'light grey gradient background',
  dark_luxury:            'near-black dark luxury background',
  warm_beige:             'warm beige linen studio background',
  restaurant_tabletop:    'restaurant tabletop, marble or slate',
  neutral_studio:         'neutral mid-grey studio background',
}

const CAMERA_LABELS: Record<string, string> = {
  eye_level_product:     'straight-on eye-level, classic product height',
  slight_top_down:       'gently elevated (~15° down), shows top surface',
  hero_low_angle:        'low heroic angle, slightly upward looking',
  macro_detail:          'close macro framing',
  floating_catalog_view: 'slight elevated catalog angle',
}

// ─── Stage B: Scene blueprint ─────────────────────────────────────────────────

/**
 * Build a structured scene blueprint from product + config.
 * This JSON is stored on the package and referenced by every frame prompt.
 */
export function buildSceneBlueprint(
  subject: NormalizedProductSubject,
  config:  P360GenerationConfig,
): SceneBlueprint {
  const lightingStyle = config.lightingPreset
    ? (LIGHTING_LABELS[config.lightingPreset] ?? config.lightingPreset)
    : 'professional studio lighting, controlled softboxes'

  const backgroundStyle = config.backgroundPreset
    ? (BACKGROUND_LABELS[config.backgroundPreset] ?? config.backgroundPreset)
    : 'clean neutral studio background'

  const cameraHeight = config.cameraPreset
    ? (CAMERA_LABELS[config.cameraPreset] ?? config.cameraPreset)
    : 'eye-level or slight top-down angle'

  // Consistency rules — category-specific
  const consistencyRules: string[] = [
    `do not change the ${subject.vessel} size, shape, or proportions`,
    'do not zoom in or out between frames',
    'do not recompose the scene',
    'do not add or remove any objects',
    'do not change the camera distance',
    'do not change the crop or framing',
    'do not change the lighting direction or intensity',
    'do not alter the shadow style',
    'do not change the background',
    'only change the horizontal camera orbit angle',
  ]

  if (subject.ingredients.length) {
    consistencyRules.push(`do not change ingredient composition: ${subject.ingredients.join(', ')}`)
  }
  if (subject.garnish.length) {
    consistencyRules.push(`do not change garnish: same ${subject.garnish.join(', ')} placement and appearance in every frame`)
  }
  if (subject.utensils.length) {
    consistencyRules.push(`do not move utensils: ${subject.utensils.join(', ')} must stay in the same position`)
  }

  if (subject.productCategory === 'food_bowl') {
    consistencyRules.push(
      'do not change the broth/liquid fill level',
      'do not change the portion size or food density',
      'do not alter ingredient textures, colors, or shapes',
      'keep lime/citrus wedges identical in size, cut style, and placement',
    )
  }
  if (subject.productCategory === 'beverage') {
    consistencyRules.push(
      'do not change the liquid level in the container',
      'do not change the condensation pattern',
    )
  }
  if (subject.productCategory === 'packaged_product') {
    consistencyRules.push(
      'do not change label visibility or orientation relative to camera',
      'do not change reflections on the packaging',
      'do not change box or container dimensions',
    )
  }

  return {
    subject: {
      name:        subject.name,
      vessel:      subject.vessel,
      ingredients: subject.ingredients,
      garnish:     subject.garnish,
      utensils:    subject.utensils,
    },
    camera: {
      heightAngle: cameraHeight,
      distance:    config.cameraDistance != null ? `${config.cameraDistance} units fixed` : 'fixed medium distance',
      crop:        'fixed medium-close centered square crop',
      orbitMode:   'yaw_only',
      focalFeel:   '50mm-equivalent commercial product shot',
    },
    lighting: {
      style:       lightingStyle,
      direction:   'fixed directional source (does not move between frames)',
      shadowStyle: config.shadowStrength != null
        ? (config.shadowStrength < 0.3 ? 'minimal soft shadows' : config.shadowStrength > 0.7 ? 'strong dramatic shadows' : 'moderate soft shadows')
        : 'moderate soft shadows',
    },
    background: {
      style:   backgroundStyle,
      surface: config.backgroundPreset?.includes('marble') ? 'marble surface' :
               config.backgroundPreset?.includes('restaurant') ? 'restaurant tabletop' :
               config.backgroundPreset?.includes('beige') ? 'beige linen surface' : 'studio surface',
    },
    consistencyRules,
    consistencyMode: 'strict',
    createdAt:       new Date().toISOString(),
  }
}

// ─── Stage B: Locked generation prompt template ───────────────────────────────

/**
 * Build the "locked generation prompt" — the master scene description template
 * stored on the package and injected into every frame prompt.
 *
 * This text describes the exact frozen studio setup in exhaustive detail.
 */
export function buildLockedGenerationPrompt(
  subject: NormalizedProductSubject,
  config:  P360GenerationConfig,
  blueprint: SceneBlueprint,
): string {
  const lines: string[] = [
    '╔════════════════════════════════════════════════════════════════╗',
    '║  LOCKED STUDIO SCENE SPECIFICATION — DO NOT ALTER ANY ELEMENT ║',
    '╚════════════════════════════════════════════════════════════════╝',
    '',
    `PRODUCT: "${subject.name}"`,
    subject.rawDescription ? `DESCRIPTION: ${subject.rawDescription}` : '',
    '',
    '── SUBJECT (FROZEN) ────────────────────────────────────────────',
    `  Primary vessel: ${blueprint.subject.vessel} — SAME SIZE AND SHAPE IN EVERY FRAME`,
  ]

  if (subject.ingredients.length) {
    lines.push(`  Contents: ${subject.ingredients.join(', ')}`)
    lines.push('  Every ingredient must appear in exactly the same quantity, color, and arrangement.')
  }
  if (subject.garnish.length) {
    lines.push(`  Garnish: ${subject.garnish.join(', ')}`)
    lines.push('  Garnish placement, size, color, and cut style are LOCKED — identical in every frame.')
  }
  if (subject.utensils.length) {
    lines.push(`  Utensils: ${subject.utensils.join(', ')}`)
    lines.push('  Utensil position, orientation, and style are LOCKED — do not move them.')
  }

  if (subject.productCategory === 'food_bowl') {
    lines.push(
      '',
      '── FOOD-SPECIFIC LOCKS ─────────────────────────────────────────',
      '  Broth/liquid level: FROZEN — same fill height in every single frame.',
      '  Ingredient density: FROZEN — same visual density, no sparse or crowded frames.',
      '  Lime/citrus: FROZEN — same number, same cut style (halved/wedged), same placement.',
      '  Herb garnish: FROZEN — same amount, same position, same color.',
      '  Bowl geometry: FROZEN — same rim height, same diameter, same depth appearance.',
    )
  }

  lines.push(
    '',
    '── CAMERA (FROZEN) ─────────────────────────────────────────────',
    `  Height angle: ${blueprint.camera.heightAngle}`,
    `  Distance: ${blueprint.camera.distance}`,
    `  Crop: ${blueprint.camera.crop}`,
    `  Focal length feel: ${blueprint.camera.focalFeel}`,
    '  Zoom: FROZEN — do not zoom in or out between frames.',
    '  Subject scale: FROZEN — product occupies the same proportion of the frame in all shots.',
    '',
    '── LIGHTING (FROZEN) ───────────────────────────────────────────',
    `  Style: ${blueprint.lighting.style}`,
    `  Direction: ${blueprint.lighting.direction}`,
    `  Shadow: ${blueprint.lighting.shadowStyle}`,
    '',
    '── BACKGROUND (FROZEN) ─────────────────────────────────────────',
    `  Style: ${blueprint.background.style}`,
    `  Surface: ${blueprint.background.surface}`,
    '  Background appearance: FROZEN — same texture, same color, same depth.',
    '',
    '── ABSOLUTE CONSISTENCY RULES ──────────────────────────────────',
    ...blueprint.consistencyRules.map(r => `  ✕ ${r}`),
    '',
    '── QUALITY STANDARD ────────────────────────────────────────────',
    '  Ultra-realistic professional product photography, 6K sharp detail.',
    '  No text overlays, no watermarks, no extra objects, no hands, no people.',
    '  Premium commercial quality — every frame must look like a professional studio shot.',
  )

  if (config.generationNotes) {
    lines.push('', `── SPECIAL NOTES ────────────────────────────────────────────────`, `  ${config.generationNotes}`)
  }

  return lines.filter(l => l !== null).join('\n')
}

// ─── Stage A: Master frame prompt ─────────────────────────────────────────────

/**
 * Prompt for the canonical master frame (frame 0, angle 0°).
 *
 * This is the visual "ground truth" that all other frames must replicate.
 * The prompt emphasizes: establish the exact scene, perfect composition,
 * centered front view. This becomes the visual anchor for the entire package.
 */
export function buildMasterFramePrompt(
  subject:   NormalizedProductSubject,
  config:    P360GenerationConfig,
  blueprint: SceneBlueprint,
): string {
  const w = config.outputWidth  ?? 1024
  const h = config.outputHeight ?? 1024

  const lines: string[] = [
    '╔════════════════════════════════════════════════════════════════╗',
    '║  MASTER FRAME — CANONICAL REFERENCE (0° FRONT VIEW)           ║',
    '╚════════════════════════════════════════════════════════════════╝',
    '',
    'This is the MASTER REFERENCE IMAGE for a 360° product photography sequence.',
    `Every detail established in this image will be exactly replicated in all subsequent frames.`,
    `This image must be perfect — it is the immutable visual blueprint for the entire package.`,
    '',
    `PRODUCT: "${subject.name}"`,
    subject.rawDescription ? `DESCRIPTION: ${subject.rawDescription}` : '',
    '',
    `CAMERA POSITION: Front-facing, 0° horizontal orbit angle.`,
    `Camera is directly in front of the ${subject.vessel}, centered, at eye level or slight top-down angle.`,
    '',
    '── SCENE COMPOSITION ───────────────────────────────────────────',
    `  Subject: one ${subject.subjectPhrase}`,
    `  Centered in frame, medium-close distance, ${blueprint.camera.crop}`,
    `  No perspective distortion — stable commercial framing`,
  ]

  if (subject.ingredients.length) {
    lines.push(`  Contents visible: ${subject.ingredients.join(', ')}`)
  }
  if (subject.garnish.length) {
    lines.push(`  Garnish: ${subject.garnish.join(', ')} — precisely arranged, visually prominent`)
  }
  if (subject.utensils.length) {
    lines.push(`  Utensils: ${subject.utensils.join(', ')} — placed in natural food-photography position`)
  }

  lines.push(
    '',
    '── LIGHTING ─────────────────────────────────────────────────────',
    `  ${blueprint.lighting.style}`,
    `  ${blueprint.lighting.shadowStyle}`,
    '',
    '── BACKGROUND ───────────────────────────────────────────────────',
    `  ${blueprint.background.style}`,
    `  ${blueprint.background.surface}`,
    '',
    '── TECHNICAL ────────────────────────────────────────────────────',
    `  Output: ${w}×${h}px square`,
    '  Ultra-realistic professional product photography, 6K sharp detail',
    '  No text overlays, no watermarks, no extra objects, no hands, no people',
    '  Photorealistic rendering — premium commercial quality',
    '  Perfect exposure, perfect focus, perfect color balance',
  )

  if (subject.productCategory === 'food_bowl') {
    lines.push(
      '',
      '── FOOD PHOTOGRAPHY REQUIREMENTS ───────────────────────────────',
      `  ${subject.vessel} must be filled to a natural serving level — not overfull, not sparse`,
      '  All ingredients should be clearly visible and attractively arranged',
      '  Broth/liquid should be at a consistent level',
      subject.garnish.length ? `  ${subject.garnish.join(' and ')} arranged beautifully` : '',
      '  Food should look fresh, appetizing, and professionally styled',
    )
  }

  if (config.generationNotes) {
    lines.push('', `── SPECIAL NOTES ────────────────────────────────────────────────`, `  ${config.generationNotes}`)
  }

  lines.push(
    '',
    '────────────────────────────────────────────────────────────────',
    `CONSISTENCY REMINDER: This is frame 1 of ${config.frameCount}. The scene established`,
    'here must be reproduced with perfect fidelity in every subsequent frame.',
    'Do not make any compositional choices that would be hard to replicate.',
    '────────────────────────────────────────────────────────────────',
  )

  return lines.filter(l => l !== null && l !== undefined).join('\n')
}

// ─── Stage C: Locked frame prompt ─────────────────────────────────────────────

/**
 * Prompt for a non-master frame (frames 1–N).
 *
 * Instructs the model to replicate every detail of the master scene exactly,
 * changing ONLY the horizontal camera orbit angle.
 *
 * @param lockedPrompt - the stored `locked_generation_prompt` from the package
 * @param angleDeg     - the camera orbit angle for this frame (e.g. 15, 30, …)
 * @param frameIndex   - 0-based frame index
 * @param totalFrames  - total number of frames in the package
 * @param shotDirection - "front-right", "right", "rear", etc.
 */
export function buildLockedFramePrompt(
  lockedPrompt:   string,
  angleDeg:       number,
  frameIndex:     number,
  totalFrames:    number,
  shotDirection:  string,
): string {
  return [
    '╔════════════════════════════════════════════════════════════════╗',
    `║  LOCKED FRAME ${String(frameIndex + 1).padStart(3)} / ${String(totalFrames).padEnd(3)}  │  ORBIT ANGLE: ${angleDeg}°  (${shotDirection})`,
    '╚════════════════════════════════════════════════════════════════╝',
    '',
    '▶ SINGLE INSTRUCTION: Recreate the master reference scene described below',
    `  with the camera orbited EXACTLY ${angleDeg}° around the product.`,
    '  Every other element must be PIXEL-PERFECT identical to the master scene.',
    '',
    '▶ THE ONLY CHANGE IN THIS FRAME:',
    `  Camera yaw: ${angleDeg}° clockwise orbit from the front-facing 0° position`,
    `  Shot direction: ${shotDirection} view`,
    '',
    '▶ STRICT PROHIBITIONS — DO NOT:',
    '  ✕ zoom in or out',
    '  ✕ change the subject size in the frame',
    '  ✕ change the composition or crop',
    '  ✕ add, remove, or rearrange any ingredient, garnish, or prop',
    '  ✕ change any utensil position or style',
    '  ✕ alter the vessel/container size or shape',
    '  ✕ change the lighting direction or intensity',
    '  ✕ change the shadow style or placement',
    '  ✕ change the background or surface',
    '  ✕ re-interpret any ingredient appearance',
    '  ✕ change any portion sizes or fill levels',
    '',
    '═══════════════════════════════════════════════════════════════',
    'MASTER SCENE SPECIFICATION (ALL ELEMENTS ARE FROZEN):',
    '═══════════════════════════════════════════════════════════════',
    '',
    lockedPrompt,
    '',
    '═══════════════════════════════════════════════════════════════',
    'FRAME-SPECIFIC RENDERING INSTRUCTION:',
    '═══════════════════════════════════════════════════════════════',
    '',
    `Render the exact same scene as described above, viewed from ${angleDeg}° around the product.`,
    `The camera has orbited ${angleDeg}° clockwise. The product and all scene elements remain`,
    'in their exact original position — only the camera viewing angle has changed.',
    `This is frame ${frameIndex + 1} of ${totalFrames} in a smooth 360° rotation sequence.`,
    'The transition between this frame and adjacent frames must be seamless.',
  ].join('\n')
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Calculate the orbit angle for a given frame index.
 * Frame 0 is always 0° (front), subsequent frames orbit clockwise.
 */
export function getFrameAngle(frameIndex: number, totalFrames: number): number {
  return Math.round((360 / totalFrames) * frameIndex)
}

/**
 * Get the shot direction label for a given angle.
 */
export function getShotDirection(angleDeg: number): string {
  const normalized = ((angleDeg % 360) + 360) % 360
  if (normalized === 0)   return 'front'
  if (normalized < 45)    return 'front-right'
  if (normalized === 45)  return 'front-right 45°'
  if (normalized < 90)    return 'right-front'
  if (normalized === 90)  return 'right'
  if (normalized < 135)   return 'right-rear'
  if (normalized === 135) return 'rear-right 45°'
  if (normalized < 180)   return 'rear-right'
  if (normalized === 180) return 'rear'
  if (normalized < 225)   return 'rear-left'
  if (normalized < 270)   return 'left-rear'
  if (normalized === 270) return 'left'
  if (normalized < 315)   return 'left-front'
  return 'front-left'
}
