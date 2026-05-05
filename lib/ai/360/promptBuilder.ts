// lib/ai/360/promptBuilder.ts
// Builds stable, visually-consistent prompts for 360° product photography.
// SERVER-ONLY.

import type { P360ProductDescriptor, P360GenerationConfig, P360FramePlan } from './types'
import { buildFramePlan } from './framePlanner'

// ─── Preset descriptors ───────────────────────────────────────────────────────

const LIGHTING_DESCRIPTIONS: Record<string, string> = {
  // ── New presets ──
  luxury_softbox:           'large premium softboxes providing silky wrap-around light, ultra-soft shadows, luxury feel',
  gold_rim_light:           'warm gold rim backlighting, editorial luxury look, golden glow on product edges',
  clean_ecommerce_white:    'bright flat white studio lighting, minimal shadows, clean Amazon-style product presentation',
  dramatic_black_studio:    'dark studio background with high-contrast selective rim light, dramatic shadows',
  natural_window_light:     'soft natural daylight streaming from one side, gentle realistic shadows, airy atmosphere',
  neon_showcase:            'vibrant neon accent lighting, colorful rim lights, futuristic product showcase',
  warm_restaurant_tabletop: 'warm golden ambient restaurant lighting, cozy editorial food photography style',
  automotive_showroom:      'crisp dealership-quality studio lighting, reflective industrial surfaces, sharp highlights',
  jewelry_macro_shine:      'intense macro sparkle lighting, brilliant facet highlights, gem fire and crystal clarity',
  matte_product_soft_glow:  'soft diffused warm glow, matte surface textures, subtle depth and dimension',
  // ── Legacy presets (kept for existing packages) ──
  studio_soft:              'soft wraparound studio lighting, even diffused softboxes, gentle shadows',
  high_key_clean:           'high-key clean white studio lighting, minimal shadows, bright and crisp',
  luxury_dramatic:          'dramatic high-contrast luxury lighting, deep shadows, rich highlights, editorial feel',
  retail_bright:            'bright retail-optimized lighting, clear product visibility, commercial presentation',
  natural_daylight:         'natural daylight simulation, soft window light from the side, airy atmosphere',
  warm_food_commercial:     'warm golden commercial food photography lighting, appetizing highlights',
  moody_premium:            'moody premium dark-background lighting, selective rim light, luxury feel',
  glossy_reflective:        'glossy reflective studio lighting, sharp specular highlights, reflective surface sheen',
  matte_catalog:            'flat even catalog lighting, no harsh shadows, true-to-color product rendering',
}

const BACKGROUND_DESCRIPTIONS: Record<string, string> = {
  // ── New presets ──
  pure_white:             'pure white seamless studio background, clean product isolation',
  soft_gray_gradient:     'soft light-grey gradient background, subtle depth and dimension',
  deep_black_glass:       'deep near-black glossy surface background, luxury premium atmosphere',
  warm_beige_studio:      'warm beige linen studio backdrop, lifestyle editorial feel',
  luxury_gold_accent:     'rich warm gold accent background, premium brand presentation',
  restaurant_table:       'restaurant-quality tabletop setting with warm ambient lighting',
  marble_surface:         'white marble surface with natural veining, elegant studio background',
  garage_showroom:        'clean garage or workshop floor setting, automotive or tools style',
  transparent_isolated:   'clean neutral background optimized for background removal and composite use',
  custom_prompt:          '',  // handled via generationNotes / customPrompt
  // ── Legacy presets (kept for existing packages) ──
  soft_gradient:          'soft light-grey gradient background, subtle depth',
  dark_luxury:            'deep dark luxury background, near-black with subtle vignette',
  warm_beige:             'warm beige linen studio background, lifestyle feel',
  restaurant_tabletop:    'restaurant tabletop setting, marble or slate surface with soft ambient light',
  neutral_studio:         'neutral mid-grey studio background, professional catalog look',
  transparent_style_look: 'clean neutral studio background suitable for easy background removal',
}

const CATEGORY_DESCRIPTORS: Record<string, string> = {
  food_bowl:       'food product in a bowl, consistent food styling, appetizing presentation',
  beverage_cup:    'beverage in a cup or container, condensation details if applicable, drink photography standards',
  apparel:         'apparel item laid flat or on invisible form, wrinkle-free, fashion photography standards',
  cosmetics:       'cosmetic or beauty product, luxury beauty product photography standards',
  electronics:     'consumer electronics product, tech product photography standards, clean industrial feel',
  auto_part:       'automotive part or accessory, industrial product photography standards',
  furniture:       'furniture piece, interior design photography standards, studio or lifestyle setting',
  jewelry:         'jewelry piece, luxury jewelry photography standards, macro-quality detail, sparkle',
  general_product: 'commercial product, standard e-commerce product photography',
}

const CAMERA_DESCRIPTIONS: Record<string, string> = {
  eye_level_product:     'camera at product mid-height, straight-on eye-level angle, classic e-commerce framing',
  slight_top_down:       'camera tilted gently downward ~15°, shows top surface of the product',
  hero_low_angle:        'low heroic camera angle looking slightly upward, dramatic powerful product presence',
  macro_detail:          'close macro framing, rich material texture detail, fills the frame',
  floating_catalog_view: 'slight elevated floating catalog angle, isolated product on clean background',
  // Legacy
  hero_spin_18:          'standard eye-level spin angle, 18-frame sequence',
  turntable_standard_24: 'standard turntable eye-level angle',
  detail_spin_24:        'close detail framing for 24-frame spin',
  turntable_smooth_36:   'standard eye-level smooth turntable angle',
  premium_showcase_36:   'premium slightly elevated showcase angle',
}

// ─── Core identity block ──────────────────────────────────────────────────────

function buildProductIdentityBlock(product: P360ProductDescriptor, config: P360GenerationConfig): string {
  const lines: string[] = [
    `PRODUCT IDENTITY (keep identical across ALL frames):`,
    `  Name: "${product.name}"`,
  ]
  if (product.description) lines.push(`  Description: ${product.description}`)
  if (product.category || config.categoryPreset) {
    const cat = product.category ?? config.categoryPreset ?? 'general_product'
    lines.push(`  Category: ${cat}`)
    const catDesc = CATEGORY_DESCRIPTORS[cat]
    if (catDesc) lines.push(`  Type guidance: ${catDesc}`)
  }
  if (product.attributes && Object.keys(product.attributes).length) {
    const attrs = Object.entries(product.attributes)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ')
    lines.push(`  Attributes: ${attrs}`)
  }
  lines.push(`  CRITICAL: same shape, same proportions, same materials, same colors, same labels/branding, same scale in every single frame.`)
  return lines.join('\n')
}

// ─── Style block ──────────────────────────────────────────────────────────────

function buildStyleBlock(config: P360GenerationConfig): string {
  const parts: string[] = ['SCENE STYLE:']

  const lighting = config.lightingPreset
    ? `  Lighting: ${LIGHTING_DESCRIPTIONS[config.lightingPreset] ?? config.lightingPreset}`
    : `  Lighting: professional studio lighting, controlled softboxes`
  parts.push(lighting)

  const background = config.backgroundPreset
    ? `  Background: ${BACKGROUND_DESCRIPTIONS[config.backgroundPreset] ?? config.backgroundPreset}`
    : `  Background: clean neutral studio background`
  parts.push(background)

  if (config.cameraPreset) {
    const camDesc = CAMERA_DESCRIPTIONS[config.cameraPreset]
    if (camDesc) parts.push(`  Camera: ${camDesc}`)
  }

  if (config.shadowStrength !== null) {
    const shadowDesc = config.shadowStrength < 0.3 ? 'minimal' : config.shadowStrength > 0.7 ? 'strong' : 'moderate'
    parts.push(`  Shadows: ${shadowDesc} intensity product shadow`)
  }
  if (config.reflectionIntensity !== null) {
    const refDesc = config.reflectionIntensity < 0.3 ? 'no reflection' : config.reflectionIntensity > 0.7 ? 'strong glossy reflection' : 'subtle surface reflection'
    parts.push(`  Surface: ${refDesc}`)
  }
  if (config.generationNotes) {
    parts.push(`  Additional notes: ${config.generationNotes}`)
  }

  return parts.join('\n')
}

// ─── Technical block ─────────────────────────────────────────────────────────

function buildTechnicalBlock(config: P360GenerationConfig, frameCount: number): string {
  const w = config.outputWidth  ?? 1024
  const h = config.outputHeight ?? 1024
  return [
    `TECHNICAL REQUIREMENTS:`,
    `  Ultra-realistic professional product photography, 6K sharp detail.`,
    `  Output dimensions: ${w}×${h}px, square crop.`,
    `  No text overlays, no watermarks, no extra objects, no hands, no people.`,
    `  Consistent camera angle: same focal length, same distance, same height in all ${frameCount} frames.`,
    `  Photorealistic rendering. Premium commercial quality.`,
  ].join('\n')
}

// ─── Per-frame rotation block ─────────────────────────────────────────────────

function buildRotationBlock(frame: Omit<P360FramePlan, 'prompt'>): string {
  const dir = frame.turnDirection ?? 'clockwise'
  return [
    `THIS FRAME:`,
    `  Frame ${frame.frameIndex + 1} of the 360° rotation sequence.`,
    `  Rotation angle: ${frame.angleDeg}° (${frame.shotDirection} view).`,
    `  Rotate the product ${frame.angleDeg}° ${dir} from the front-facing 0° position.`,
    `  ONLY the rotation changes — everything else is absolutely identical to all other frames.`,
  ].join('\n')
}

// ─── Main exports ─────────────────────────────────────────────────────────────

/**
 * Build a prompt for a single frame.
 */
export function buildSingleFramePrompt(
  product: P360ProductDescriptor,
  config:  P360GenerationConfig,
  frame:   Omit<P360FramePlan, 'prompt'> & { turnDirection?: string },
): string {
  if (config.customPrompt) {
    return [
      config.customPrompt,
      '',
      buildRotationBlock(frame),
      `Keep all product identity details, lighting, background, and style absolutely constant across frames.`,
    ].join('\n')
  }

  return [
    buildProductIdentityBlock(product, config),
    '',
    buildStyleBlock(config),
    '',
    buildTechnicalBlock(config, config.frameCount),
    '',
    buildRotationBlock(frame),
  ].join('\n')
}

/**
 * Build a master overview prompt (used for display in the UI and single-shot providers).
 */
export function buildMasterPrompt(
  product:    P360ProductDescriptor,
  config:     P360GenerationConfig,
): string {
  const degreesPerFrame = Math.round(360 / config.frameCount)
  return [
    `${config.frameCount}-frame 360° product rotation sequence for: "${product.name}".`,
    product.description ? `Product: ${product.description}.` : '',
    `Each frame rotates ${degreesPerFrame}° around the product (${config.turnDirection}).`,
    `Lighting: ${config.lightingPreset ?? 'studio_soft'}.`,
    `Background: ${config.backgroundPreset ?? 'neutral_studio'}.`,
    `Ultra-realistic, consistent commercial photography. All frames visually identical except rotation.`,
    config.generationNotes ? `Notes: ${config.generationNotes}` : '',
  ].filter(Boolean).join(' ')
}

/**
 * Build a complete frame plan with per-frame prompts attached.
 */
export function buildFullFramePlan(
  product: P360ProductDescriptor,
  config:  P360GenerationConfig,
): P360FramePlan[] {
  const frames = buildFramePlan(config.frameCount, config.turnDirection)
  return frames.map(f => ({
    ...f,
    turnDirection: config.turnDirection,
    prompt: buildSingleFramePrompt(product, config, { ...f, turnDirection: config.turnDirection }),
  }))
}
