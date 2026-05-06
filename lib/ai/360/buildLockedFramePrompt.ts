// lib/ai/360/buildLockedFramePrompt.ts
// Hyper-consistent prompt architecture for 360° product photography.
//
// TURNTABLE MENTAL MODEL
//   The product sits on a physical studio turntable. Everything in the scene
//   is physically fixed in place. Only the camera orbit angle changes between
//   frames. This mental model is injected into every prompt so the generation
//   model never "reinvents" the scene.
//
// 4-STAGE PIPELINE
//   Stage A  buildMasterFramePrompt   → canonical 0° frame
//   Stage B  buildSceneBlueprint      → structured blueprint from product + config
//            enrichBlueprintWithAnalysis → inject vision-grounded details
//            buildLockedGenerationPrompt → stored text spec used in every frame
//   Stage C  buildLockedFramePrompt   → per-frame prompt with angle + locked spec
//   Stage D  (consistency check / auto-regen — handled by pump route)
//
// SERVER-ONLY. No external calls.

import type { P360GenerationConfig } from './types'
import type { NormalizedProductSubject } from './normalizeProduct'

// ─── Scene blueprint type ─────────────────────────────────────────────────────

/**
 * Complete blueprint describing every visual element that must remain locked
 * across all frames in a 360° package.
 *
 * Stored as JSONB on product_360_packages.scene_blueprint and read back on
 * every pump call. normalizeSceneBlueprint() handles partial / legacy formats.
 */
export interface Product360SceneBlueprint {
  // ── Subject ───────────────────────────────────────────────────────────────
  subject: {
    name:            string
    description:     string
    category:        string
    vessel:          string         // e.g. "ceramic bowl" / "glass bottle"
    vesselMaterial:  string         // e.g. "matte ceramic" / "borosilicate glass"
    vesselColor:     string         // e.g. "deep charcoal grey"
    servingSize:     string         // e.g. "standard serving, ~80% full"
    arrangement:     string         // how food/product is placed inside/on vessel
    keyIngredients:  string[]       // main contents visible
    ingredients:     string[]       // alias for keyIngredients (backward compat)
    garnish:         string[]       // garnish items
    garnishLayout:   string         // exact placement: "2 lime wedges at 4 o'clock"
    utensils:        string[]       // utensils related to subject (backward compat)
    colorNotes:      string[]       // dominant colors: ["rich brown broth", "green herbs"]
    textureNotes:    string[]       // textures: ["glossy broth", "matte ceramic rim"]
  }
  // ── Environment ───────────────────────────────────────────────────────────
  environment: {
    backgroundType:   string        // "solid" | "gradient" | "studio" | "scene"
    backgroundColor:  string        // exact color description
    surfaceType:      string        // "slate" | "marble" | "wood" | "fabric" | "none"
    surfaceColor:     string        // e.g. "dark grey slate"
    props:            string[]      // scene props with positions
    utensils:         string[]      // utensils with positions: "white spoon at 9 o'clock"
    reflections:      string        // surface reflection description
    shadows:          string        // contact shadow description
  }
  // ── Camera ────────────────────────────────────────────────────────────────
  camera: {
    orbitMode:    'turntable_orbit'
    focalLength:  string            // e.g. "70mm equivalent"
    distance:     string            // e.g. "fixed 80cm from product center"
    height:       string            // e.g. "eye level, 10° downward tilt"
    pitch:        string            // e.g. "slight top-down"
    framing:      string            // e.g. "product fills ~70% of frame height"
    zoom:         string            // "fixed — do not change"
    crop:         string            // e.g. "square, medium-close, centered"
    perspective:  string            // e.g. "premium ecommerce product photography"
    // backward compat aliases
    heightAngle:  string
    focalFeel:    string
  }
  // ── Lighting ──────────────────────────────────────────────────────────────
  lighting: {
    preset:           string
    keyLight:         string        // e.g. "large softbox 45° front-left, warm white"
    fillLight:        string        // e.g. "soft reflector front-right"
    rimLight:         string        // e.g. "subtle warm rim at rear"
    highlights:       string        // specular highlight description
    shadowSoftness:   string        // shadow character
    consistencyNotes: string
    // backward compat aliases
    style:            string
    direction:        string
    shadowStyle:      string
  }
  // ── Background (backward compat) ─────────────────────────────────────────
  background: {
    style:   string
    surface: string
  }
  // ── Composition flags ─────────────────────────────────────────────────────
  composition: {
    centerSubject:             boolean
    maintainScale:             boolean
    maintainCrop:              boolean
    maintainTablePosition:     boolean
    maintainPropPlacement:     boolean
    maintainGarnishPlacement:  boolean
    maintainUtensilPlacement:  boolean
  }
  // ── Consistency rule set ──────────────────────────────────────────────────
  /** Can be either the legacy string[] OR the new object. Both supported. */
  consistencyRules: string[] | Product360ConsistencyRuleSet
  // ── Vision-grounded exact details (set after master frame analysis) ────────
  masterFrameAnalysis?: MasterFrameAnalysisEmbed
  // ── Meta ──────────────────────────────────────────────────────────────────
  consistencyMode:  'standard' | 'strict'
  productCategory:  string
  createdAt:        string
  analysisVersion:  number    // 1=text-only, 2=vision-grounded from Gemini
}

/** Object form of the consistency rule set (new packages). */
export interface Product360ConsistencyRuleSet {
  changeOnlyAngle:          boolean
  lockSubjectIdentity:      boolean
  lockVessel:               boolean
  lockIngredients:          boolean
  lockGarnish:              boolean
  lockBackground:           boolean
  lockSurface:              boolean
  lockProps:                boolean
  lockLighting:             boolean
  lockFraming:              boolean
  lockZoom:                 boolean
  lockScale:                boolean
  prohibitNewObjects:       boolean
  prohibitMissingObjects:   boolean
}

/** Vision-grounded exact details embedded inside the blueprint. */
export interface MasterFrameAnalysisEmbed {
  vesselExact:        string
  arrangementExact:   string
  garnishExact:       string
  surfaceExact:       string
  backgroundExact:    string
  lightingExact:      string
  cropExact:          string
  utensilsExact:      string
  rawSummary:         string
}

/** Legacy alias — all old code referencing SceneBlueprint continues to compile. */
export type SceneBlueprint = Product360SceneBlueprint

// ─── Preset description lookups ───────────────────────────────────────────────

const LIGHTING_DESC: Record<string, string> = {
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

const BACKGROUND_DESC: Record<string, string> = {
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

const CAMERA_ANGLE_DESC: Record<string, string> = {
  eye_level_product:     'straight-on eye level, classic product height',
  slight_top_down:       'gently elevated (~15° down), shows top surface',
  hero_low_angle:        'low heroic angle, slightly upward looking',
  macro_detail:          'close macro framing',
  floating_catalog_view: 'slight elevated catalog angle',
}

// ─── Blueprint normalizer ─────────────────────────────────────────────────────

/**
 * Safely normalize any value stored in product_360_packages.scene_blueprint.
 *
 * Handles all real-world DB states:
 *   - null / undefined / ''     → build from scratch
 *   - '{}'  / {}                → build from scratch
 *   - legacy SceneBlueprint     → map old fields to new shape
 *   - partial / corrupt JSON    → fill missing fields with defaults
 *   - complete Product360SceneBlueprint → deep-merge, fill any gaps
 *   - stringified JSON          → parse then process
 *
 * NEVER throws. Always returns a fully populated Product360SceneBlueprint.
 */
export function normalizeSceneBlueprint(
  raw:     unknown,
  subject: NormalizedProductSubject,
  config:  P360GenerationConfig,
): Product360SceneBlueprint {
  const defaults = buildSceneBlueprint(subject, config)

  if (raw == null || raw === false || raw === '' || raw === 0) return defaults

  let parsed: Record<string, unknown> = {}
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw)
      if (p && typeof p === 'object' && !Array.isArray(p)) parsed = p as Record<string, unknown>
    } catch { return defaults }
  } else if (typeof raw === 'object' && !Array.isArray(raw)) {
    parsed = raw as Record<string, unknown>
  } else {
    return defaults
  }

  if (Object.keys(parsed).length === 0) return defaults

  const safeStr = (v: unknown, fb: string): string =>
    (typeof v === 'string' && v.trim().length > 0) ? v : fb

  const safeArr = (v: unknown, fb: string[]): string[] =>
    Array.isArray(v) ? (v as unknown[]).filter(x => typeof x === 'string') as string[] : fb

  const rawSubj  = (parsed.subject   as Record<string, unknown> | null | undefined) ?? {}
  const rawEnv   = (parsed.environment as Record<string, unknown> | null | undefined) ?? {}
  const rawCam   = (parsed.camera    as Record<string, unknown> | null | undefined) ?? {}
  const rawLit   = (parsed.lighting  as Record<string, unknown> | null | undefined) ?? {}
  const rawBg    = (parsed.background as Record<string, unknown> | null | undefined) ?? {}
  const rawComp  = (parsed.composition as Record<string, unknown> | null | undefined) ?? {}
  const rawCR    = parsed.consistencyRules

  // ── Subject ───────────────────────────────────────────────────────────────
  const keyIngredients = safeArr(rawSubj.keyIngredients, []) as string[]
  const legacyIngredients = safeArr(rawSubj.ingredients, []) as string[]
  const mergedIngredients = keyIngredients.length > 0 ? keyIngredients : legacyIngredients

  // ── Env utensils: prefer environment.utensils, fall back to subject.utensils ─
  const envUtensils = safeArr(rawEnv.utensils, [])
  const subjUtensils = safeArr(rawSubj.utensils, [])
  const mergedUtensils = envUtensils.length > 0 ? envUtensils : subjUtensils

  const consistencyRulesNorm: Product360ConsistencyRuleSet = {
    changeOnlyAngle:         true,
    lockSubjectIdentity:     true,
    lockVessel:              true,
    lockIngredients:         true,
    lockGarnish:             true,
    lockBackground:          true,
    lockSurface:             true,
    lockProps:               true,
    lockLighting:            true,
    lockFraming:             true,
    lockZoom:                true,
    lockScale:               true,
    prohibitNewObjects:      true,
    prohibitMissingObjects:  true,
  }
  // If old string[] rules exist, preserve them as-is (still used by buildLockedGenerationPrompt)
  const consistencyRules = (Array.isArray(rawCR) && rawCR.length > 0)
    ? rawCR as string[]
    : typeof rawCR === 'object' && rawCR !== null
      ? rawCR as Product360ConsistencyRuleSet
      : consistencyRulesNorm

  const rawAnalysis = parsed.masterFrameAnalysis as MasterFrameAnalysisEmbed | null | undefined

  return {
    subject: {
      name:           safeStr(rawSubj.name,           defaults.subject.name),
      description:    safeStr(rawSubj.description,    defaults.subject.description),
      category:       safeStr(rawSubj.category,       defaults.subject.category),
      vessel:         safeStr(rawSubj.vessel,         defaults.subject.vessel),
      vesselMaterial: safeStr(rawSubj.vesselMaterial, defaults.subject.vesselMaterial),
      vesselColor:    safeStr(rawSubj.vesselColor,    defaults.subject.vesselColor),
      servingSize:    safeStr(rawSubj.servingSize,    defaults.subject.servingSize),
      arrangement:    safeStr(rawSubj.arrangement,    defaults.subject.arrangement),
      keyIngredients: mergedIngredients.length > 0 ? mergedIngredients : defaults.subject.keyIngredients,
      ingredients:    mergedIngredients.length > 0 ? mergedIngredients : defaults.subject.keyIngredients,
      garnish:        safeArr(rawSubj.garnish,        defaults.subject.garnish),
      garnishLayout:  safeStr(rawSubj.garnishLayout,  defaults.subject.garnishLayout),
      utensils:       subjUtensils.length > 0 ? subjUtensils : defaults.subject.utensils,
      colorNotes:     safeArr(rawSubj.colorNotes,     defaults.subject.colorNotes),
      textureNotes:   safeArr(rawSubj.textureNotes,   defaults.subject.textureNotes),
    },
    environment: {
      backgroundType:  safeStr(rawEnv.backgroundType,  defaults.environment.backgroundType),
      backgroundColor: safeStr(rawEnv.backgroundColor, defaults.environment.backgroundColor),
      surfaceType:     safeStr(rawEnv.surfaceType,     defaults.environment.surfaceType),
      surfaceColor:    safeStr(rawEnv.surfaceColor,    defaults.environment.surfaceColor),
      props:           safeArr(rawEnv.props,           defaults.environment.props),
      utensils:        mergedUtensils.length > 0 ? mergedUtensils : defaults.environment.utensils,
      reflections:     safeStr(rawEnv.reflections,    defaults.environment.reflections),
      shadows:         safeStr(rawEnv.shadows,        defaults.environment.shadows),
    },
    camera: {
      orbitMode:   'turntable_orbit',
      focalLength: safeStr(rawCam.focalLength, defaults.camera.focalLength),
      distance:    safeStr(rawCam.distance,    defaults.camera.distance),
      height:      safeStr(rawCam.height,      defaults.camera.height),
      pitch:       safeStr(rawCam.pitch,       defaults.camera.pitch),
      framing:     safeStr(rawCam.framing,     defaults.camera.framing),
      zoom:        safeStr(rawCam.zoom,        defaults.camera.zoom),
      crop:        safeStr(rawCam.crop,        defaults.camera.crop),
      perspective: safeStr(rawCam.perspective, defaults.camera.perspective),
      heightAngle: safeStr(rawCam.heightAngle ?? rawCam.height, defaults.camera.heightAngle),
      focalFeel:   safeStr(rawCam.focalFeel ?? rawCam.focalLength, defaults.camera.focalFeel),
    },
    lighting: {
      preset:           safeStr(rawLit.preset,           defaults.lighting.preset),
      keyLight:         safeStr(rawLit.keyLight,         defaults.lighting.keyLight),
      fillLight:        safeStr(rawLit.fillLight,        defaults.lighting.fillLight),
      rimLight:         safeStr(rawLit.rimLight,         defaults.lighting.rimLight),
      highlights:       safeStr(rawLit.highlights,       defaults.lighting.highlights),
      shadowSoftness:   safeStr(rawLit.shadowSoftness,   defaults.lighting.shadowSoftness),
      consistencyNotes: safeStr(rawLit.consistencyNotes, defaults.lighting.consistencyNotes),
      style:            safeStr(rawLit.style ?? rawLit.keyLight, defaults.lighting.style),
      direction:        safeStr(rawLit.direction,        defaults.lighting.direction),
      shadowStyle:      safeStr(rawLit.shadowStyle ?? rawLit.shadowSoftness, defaults.lighting.shadowStyle),
    },
    background: {
      style:   safeStr(rawBg.style ?? rawEnv.backgroundColor, defaults.background.style),
      surface: safeStr(rawBg.surface ?? rawEnv.surfaceColor,  defaults.background.surface),
    },
    composition: {
      centerSubject:            !!(rawComp.centerSubject            ?? true),
      maintainScale:            !!(rawComp.maintainScale            ?? true),
      maintainCrop:             !!(rawComp.maintainCrop             ?? true),
      maintainTablePosition:    !!(rawComp.maintainTablePosition    ?? true),
      maintainPropPlacement:    !!(rawComp.maintainPropPlacement    ?? true),
      maintainGarnishPlacement: !!(rawComp.maintainGarnishPlacement ?? true),
      maintainUtensilPlacement: !!(rawComp.maintainUtensilPlacement ?? true),
    },
    consistencyRules,
    masterFrameAnalysis: rawAnalysis ?? undefined,
    consistencyMode: (parsed.consistencyMode === 'standard') ? 'standard' : 'strict',
    productCategory: safeStr(parsed.productCategory, defaults.productCategory),
    createdAt:       safeStr(parsed.createdAt,       defaults.createdAt),
    analysisVersion: typeof parsed.analysisVersion === 'number' ? parsed.analysisVersion : defaults.analysisVersion,
  }
}

// ─── Stage B: Build initial blueprint from product + config ──────────────────

/**
 * Build a complete scene blueprint from product subject + generation config.
 * This runs before the master frame is generated. Later, enrichBlueprintWithAnalysis()
 * improves it with vision-grounded exact details from the actual generated master frame.
 */
export function buildSceneBlueprint(
  subject: NormalizedProductSubject,
  config:  P360GenerationConfig,
): Product360SceneBlueprint {
  const lightingPreset  = config.lightingPreset ?? ''
  const bgPreset        = config.backgroundPreset ?? ''
  const cameraPreset    = config.cameraPreset ?? ''

  const lightingDesc  = LIGHTING_DESC[lightingPreset]  ?? 'professional studio lighting, controlled softboxes'
  const bgDesc        = BACKGROUND_DESC[bgPreset]      ?? 'clean neutral studio background'
  const cameraAngle   = CAMERA_ANGLE_DESC[cameraPreset] ?? 'eye level or slight top-down angle'

  const isFood     = subject.productCategory === 'food_bowl'
  const isBeverage = subject.productCategory === 'beverage'
  const isPackaged = subject.productCategory === 'packaged_product'
  const isJewelry  = subject.productCategory === 'jewelry'

  // Derive vessel specifics
  const vesselMaterial = isFood     ? 'ceramic or glazed stoneware'
                       : isBeverage ? 'glass or ceramic'
                       : 'manufacturer original material'

  const vesselColor    = 'natural product color'

  const servingSize    = isFood     ? 'standard serving portion, approximately 70-85% full'
                       : isBeverage ? 'poured to standard serving level'
                       : 'as delivered/packaged'

  const arrangement    = isFood
    ? 'ingredients naturally arranged, garnish prominently placed'
    : isBeverage
    ? 'liquid filled to serving level, any garnish placed'
    : 'product in natural display orientation'

  const garnishLayout = subject.garnish.length
    ? `${subject.garnish.join(', ')} arranged decoratively`
    : 'no garnish'

  // Surface type from background preset
  const surfaceType  = bgPreset.includes('marble')     ? 'marble'
                     : bgPreset.includes('restaurant')  ? 'restaurant tabletop'
                     : bgPreset.includes('garage')      ? 'concrete floor'
                     : bgPreset.includes('beige')       ? 'linen fabric'
                     : bgPreset.includes('dark_luxury') ? 'dark glossy surface'
                     : bgPreset.includes('white')       ? 'white surface'
                     : 'studio surface'

  const surfaceColor = bgPreset.includes('marble')     ? 'white marble with grey veining'
                     : bgPreset.includes('beige')       ? 'warm beige linen'
                     : bgPreset.includes('dark')        ? 'dark neutral'
                     : bgPreset.includes('white')       ? 'pure white'
                     : 'neutral grey'

  const bgType  = bgPreset.includes('gradient') ? 'gradient'
                : bgPreset.includes('scene')     ? 'scene'
                : bgPreset.includes('white')     ? 'solid white'
                : bgPreset.includes('dark')      ? 'solid dark'
                : 'solid studio'

  const bgColor = bgDesc

  // Camera height
  const height  = cameraPreset === 'hero_low_angle'   ? 'low angle, looking slightly up'
                : cameraPreset === 'slight_top_down'  ? 'elevated, ~15° downward'
                : cameraPreset === 'macro_detail'     ? 'eye level, close macro'
                : 'slightly above product center line, gentle downward tilt'

  // Consistency rules (as string array — converted to object later)
  const consistencyRules: string[] = [
    `do not change the ${subject.vessel} size, shape, color, or material`,
    'do not zoom in or out between frames',
    'do not recompose or reframe the scene',
    'do not add or remove any objects',
    'do not change the camera distance',
    'do not change the crop or framing',
    'do not change the lighting direction or intensity',
    'do not alter the shadow style',
    'do not change the background or surface',
    'only the horizontal camera orbit angle changes',
  ]

  if (subject.ingredients.length) {
    consistencyRules.push(`do not change ingredient composition: ${subject.ingredients.join(', ')}`)
  }
  if (subject.garnish.length) {
    consistencyRules.push(`do not change garnish: same ${subject.garnish.join(', ')} in every frame`)
  }
  if (subject.utensils.length) {
    consistencyRules.push(`do not move utensils: ${subject.utensils.join(', ')} stay fixed`)
  }

  // Food-specific rules
  if (isFood) {
    consistencyRules.push(
      'do not change the broth or liquid fill level',
      'do not change the portion size or food density',
      'do not alter ingredient textures, colors, or shapes',
      'lime/citrus wedges: identical size, cut, and placement in every frame',
    )
  }
  if (isBeverage) {
    consistencyRules.push(
      'do not change the liquid level',
      'do not change condensation or surface appearance',
    )
  }
  if (isPackaged) {
    consistencyRules.push(
      'do not change label visibility relative to camera',
      'do not change packaging dimensions or proportions',
      'do not change reflections on the packaging',
    )
  }
  if (isJewelry) {
    consistencyRules.push(
      'do not change gem/metal surface appearance',
      'do not change ring/chain/stone proportions',
      'do not change specular highlights on metal or gems',
    )
  }

  // Lighting breakdown
  const keyLight      = lightingDesc
  const fillLight     = 'soft fill reflector, maintaining shadow depth'
  const rimLight      = 'subtle warm rim light at rear, separating product from background'
  const highlights    = isJewelry ? 'brilliant specular facet highlights, gem fire' : 'controlled premium product highlights'
  const shadowSoft    = config.shadowStrength != null
    ? (config.shadowStrength < 0.3 ? 'minimal, barely-there shadows'
     : config.shadowStrength > 0.7 ? 'strong dramatic shadows' : 'moderate soft contact shadows')
    : 'soft natural contact shadows'

  return {
    subject: {
      name:           subject.name,
      description:    subject.rawDescription ?? '',
      category:       subject.productCategory,
      vessel:         subject.vessel,
      vesselMaterial,
      vesselColor,
      servingSize,
      arrangement,
      keyIngredients: subject.ingredients,
      ingredients:    subject.ingredients,
      garnish:        subject.garnish,
      garnishLayout,
      utensils:       subject.utensils,
      colorNotes:     [],
      textureNotes:   [],
    },
    environment: {
      backgroundType:  bgType,
      backgroundColor: bgColor,
      surfaceType,
      surfaceColor,
      props:      [],
      utensils:   subject.utensils,
      reflections: 'subtle controlled surface reflections',
      shadows:     shadowSoft,
    },
    camera: {
      orbitMode:   'turntable_orbit',
      focalLength: '70mm-equivalent product lens (moderate telephoto)',
      distance:    config.cameraDistance != null ? `${config.cameraDistance} units fixed` : 'fixed medium product distance',
      height,
      pitch:       cameraPreset === 'slight_top_down' ? '15° downward' : 'slight downward tilt',
      framing:     `${subject.name} fills approximately 65-75% of frame height, perfectly centered`,
      zoom:        'fixed — do not zoom in or out',
      crop:        'medium-close centered square crop',
      perspective: 'premium ecommerce product photography',
      heightAngle: height,
      focalFeel:   '70mm-equivalent commercial product shot',
    },
    lighting: {
      preset:           lightingPreset || 'studio_soft',
      keyLight,
      fillLight,
      rimLight,
      highlights,
      shadowSoftness:   shadowSoft,
      consistencyNotes: 'single dominant light direction, does NOT move between frames',
      style:            keyLight,
      direction:        'fixed — lighting direction does not move',
      shadowStyle:      shadowSoft,
    },
    background: {
      style:   bgDesc,
      surface: surfaceType,
    },
    composition: {
      centerSubject:            true,
      maintainScale:            true,
      maintainCrop:             true,
      maintainTablePosition:    true,
      maintainPropPlacement:    true,
      maintainGarnishPlacement: true,
      maintainUtensilPlacement: true,
    },
    consistencyRules,
    masterFrameAnalysis: undefined,
    consistencyMode: 'strict',
    productCategory: subject.productCategory,
    createdAt:       new Date().toISOString(),
    analysisVersion: 1,
  }
}

// ─── Enrich blueprint with vision analysis (Stage B.5) ────────────────────────

/**
 * Merge the exact visual details from Gemini's master frame analysis
 * into an existing blueprint. This upgrades it from text-only (v1) to
 * vision-grounded (v2), making subsequent frame prompts far more specific.
 *
 * Called after the master frame is generated and analyzed.
 */
export function enrichBlueprintWithAnalysis(
  blueprint: Product360SceneBlueprint,
  analysis:  MasterFrameAnalysisEmbed,
): Product360SceneBlueprint {
  return {
    ...blueprint,
    masterFrameAnalysis: analysis,
    analysisVersion:     2,
  }
}

// ─── Stage B: Locked generation prompt template ───────────────────────────────

/**
 * Build the "locked generation prompt" — stored once on the package and injected
 * into every frame prompt. Describes the exact frozen studio setup in exhaustive
 * detail so Imagen never "reinvents" the scene.
 *
 * If blueprint.masterFrameAnalysis exists (vision-grounded v2), exact details
 * from the actual generated master frame are included for maximum specificity.
 */
export function buildLockedGenerationPrompt(
  subject:   NormalizedProductSubject,
  config:    P360GenerationConfig,
  blueprint: Product360SceneBlueprint,
): string {
  const analysis = blueprint.masterFrameAnalysis
  const isFood   = blueprint.productCategory === 'food_bowl' || subject.productCategory === 'food_bowl'
  const isBev    = blueprint.productCategory === 'beverage'  || subject.productCategory === 'beverage'

  const vesselStr = analysis?.vesselExact
    ? analysis.vesselExact
    : [
        blueprint.subject.vessel,
        blueprint.subject.vesselMaterial && blueprint.subject.vesselMaterial !== 'manufacturer original material'
          ? `(${blueprint.subject.vesselMaterial})`
          : '',
        blueprint.subject.vesselColor && blueprint.subject.vesselColor !== 'natural product color'
          ? `, ${blueprint.subject.vesselColor}`
          : '',
        blueprint.subject.servingSize && !blueprint.subject.servingSize.startsWith('as ')
          ? `, ${blueprint.subject.servingSize}`
          : '',
      ].filter(Boolean).join(' ')

  const surfaceStr = analysis?.surfaceExact
    ? analysis.surfaceExact
    : `${blueprint.environment.surfaceType} — ${blueprint.environment.surfaceColor}`

  const bgStr = analysis?.backgroundExact
    ? analysis.backgroundExact
    : blueprint.environment.backgroundColor

  const lightingStr = analysis?.lightingExact
    ? analysis.lightingExact
    : [blueprint.lighting.keyLight, `fill: ${blueprint.lighting.fillLight}`, `rim: ${blueprint.lighting.rimLight}`].join('; ')

  const cropStr = analysis?.cropExact
    ? analysis.cropExact
    : `${blueprint.camera.framing}, ${blueprint.camera.crop}`

  const arrangementStr = analysis?.arrangementExact
    ? analysis.arrangementExact
    : blueprint.subject.arrangement

  const garnishStr = analysis?.garnishExact
    ? analysis.garnishExact
    : blueprint.subject.garnishLayout || blueprint.subject.garnish.join(', ')

  const utensilsStr = analysis?.utensilsExact
    ? analysis.utensilsExact
    : [...blueprint.subject.utensils, ...blueprint.environment.utensils].filter(Boolean).join(', ')

  const consistencyRules: string[] = Array.isArray(blueprint.consistencyRules)
    ? blueprint.consistencyRules as string[]
    : [
        `do not change the ${blueprint.subject.vessel}`,
        'do not zoom in or out between frames',
        'do not recompose the scene',
        'do not add or remove any objects',
        'do not change lighting, background, or surface',
        'only the horizontal camera orbit angle changes',
      ]

  const versionNote = blueprint.analysisVersion >= 2
    ? '  ✅ VISION-GROUNDED: Details below are extracted from the actual generated master frame.\n'
    : '  📝 TEXT-BASED: Details are derived from product description and presets.\n'

  const lines: string[] = [
    '╔════════════════════════════════════════════════════════════════════╗',
    '║  LOCKED STUDIO SCENE — STRICT TURNTABLE MODE — DO NOT ALTER       ║',
    '╚════════════════════════════════════════════════════════════════════╝',
    '',
    '⚠  THIS IS A TURNTABLE PHOTOGRAPHY SEQUENCE  ⚠',
    'The product is mounted on a physical studio turntable.',
    'Every element in the scene is physically locked in place.',
    'You are rendering one specific camera orbit position.',
    'THE ONLY PERMITTED CHANGE BETWEEN FRAMES IS THE CAMERA ORBIT ANGLE.',
    '',
    versionNote,
    '',
    '══════════════════════ PRODUCT IDENTITY ══════════════════════════',
    `  Name:     "${subject.name}"`,
    subject.rawDescription ? `  Desc:     ${subject.rawDescription.slice(0, 200)}` : '',
    `  Category: ${blueprint.productCategory}`,
    '',
    '══════════════════════ VESSEL / CONTAINER (LOCKED) ══════════════════',
    `  ${vesselStr}`,
    '',
    '  THIS VESSEL IS IDENTICAL IN EVERY SINGLE FRAME.',
    '  Same shape. Same exact size. Same color. Same material.',
    isFood ? '  Same fill level. Same broth height. Same rim appearance.' : '',
    isBev  ? '  Same liquid level. Same condensation. Same glass clarity.' : '',
    '',
  ]

  // Contents
  if (subject.ingredients.length || arrangementStr) {
    lines.push('══════════════════════ CONTENTS & ARRANGEMENT (LOCKED) ══════════════')
    if (arrangementStr) lines.push(`  Arrangement:  ${arrangementStr}`)
    if (subject.ingredients.length) lines.push(`  Ingredients:  ${subject.ingredients.join(', ')}`)
    lines.push('  These ingredients are physically placed and cannot change.')
    lines.push('')
  }

  // Garnish
  if (garnishStr && garnishStr !== 'no garnish') {
    lines.push('══════════════════════ GARNISH / TOPPINGS (LOCKED) ══════════════════')
    lines.push(`  ${garnishStr}`)
    lines.push('  Garnish count, placement, size, and cut style are FROZEN.')
    lines.push('  DO NOT change garnish between frames.')
    lines.push('')
  }

  // Utensils
  if (utensilsStr) {
    lines.push('══════════════════════ UTENSILS & PROPS (LOCKED) ════════════════════')
    lines.push(`  ${utensilsStr}`)
    lines.push('  Utensil positions and styles are FROZEN.')
    lines.push('')
  }

  lines.push('══════════════════════ SURFACE (LOCKED) ══════════════════════════════')
  lines.push(`  ${surfaceStr}`)
  lines.push('  DO NOT change the surface. Same material, same color, same texture.')
  lines.push('')

  lines.push('══════════════════════ BACKGROUND (LOCKED) ════════════════════════════')
  lines.push(`  ${bgStr}`)
  lines.push('  DO NOT change the background. Same style, same color, same depth.')
  lines.push('')

  lines.push('══════════════════════ CAMERA SETUP (LOCKED) ══════════════════════════')
  lines.push(`  Lens:      ${blueprint.camera.focalLength}`)
  lines.push(`  Distance:  ${blueprint.camera.distance}`)
  lines.push(`  Height:    ${blueprint.camera.height}`)
  lines.push(`  Framing:   ${cropStr}`)
  lines.push('  Zoom:      FIXED — do not zoom in or out')
  lines.push('  Scale:     FIXED — product occupies the same proportion of frame in all shots')
  lines.push('')

  lines.push('══════════════════════ LIGHTING (LOCKED) ══════════════════════════════')
  lines.push(`  ${lightingStr}`)
  lines.push('  LIGHTING IS LOCKED. Do not change direction, intensity, or character.')
  lines.push('')

  // Food-specific hard locks
  if (isFood) {
    lines.push('══════════════════════ FOOD CONSISTENCY HARD LOCKS ══════════════════')
    lines.push('  Broth/liquid level:  FROZEN — same fill height in every frame')
    lines.push('  Food portion size:   FROZEN — same visual density, same amount')
    lines.push('  Ingredient layout:   FROZEN — same noodle/protein/vegetable positions')
    lines.push('  Topping count:       FROZEN — same number of each topping')
    lines.push('  Bowl geometry:       FROZEN — same rim height, same diameter, same depth')
    lines.push('  Lime/citrus:         FROZEN — same number, same cut style, same exact position')
    lines.push('  Herb garnish:        FROZEN — same amount, same position, same color')
    lines.push('  Chopsticks/spoon:    FROZEN — same position, same style, same placement')
    lines.push('  Food freshness:      FROZEN — same styling, same appearance')
    lines.push('')
  }

  if (isBev) {
    lines.push('══════════════════════ BEVERAGE CONSISTENCY HARD LOCKS ══════════════')
    lines.push('  Liquid level:   FROZEN — same fill in every frame')
    lines.push('  Condensation:   FROZEN — same condensation pattern')
    lines.push('  Ice/bubbles:    FROZEN — same ice cubes/bubble pattern if present')
    lines.push('  Straw/garnish:  FROZEN — same straw angle and garnish placement')
    lines.push('')
  }

  lines.push('══════════════════════ ABSOLUTE DO-NOT-CHANGE LIST ══════════════════')
  lines.push(`  ✕ DO NOT change the ${blueprint.subject.vessel} (same shape, size, color, material)`)
  lines.push('  ✕ DO NOT change the amount or arrangement of contents')
  lines.push('  ✕ DO NOT change the garnish or toppings')
  lines.push('  ✕ DO NOT change utensil positions or styles')
  lines.push('  ✕ DO NOT add any new objects to the scene')
  lines.push('  ✕ DO NOT remove any existing objects from the scene')
  lines.push('  ✕ DO NOT change the table surface')
  lines.push('  ✕ DO NOT change the background')
  lines.push('  ✕ DO NOT change the lighting')
  lines.push('  ✕ DO NOT change the camera distance')
  lines.push('  ✕ DO NOT zoom in or out')
  lines.push('  ✕ DO NOT recompose or recrop the frame')
  lines.push('  ✕ DO NOT change any colors anywhere in the scene')
  lines.push('  ✕ DO NOT reinterpret or redesign any element')
  lines.push('  ✕ DO NOT change proportions of any object')

  if (consistencyRules.length) {
    lines.push('')
    lines.push('══════════════════════ ADDITIONAL CONSISTENCY RULES ══════════════════')
    for (const r of consistencyRules) lines.push(`  ✕ ${r}`)
  }

  lines.push('')
  lines.push('══════════════════════ QUALITY STANDARD ══════════════════════════════')
  lines.push('  Ultra-realistic professional product photography, 6K sharp detail.')
  lines.push('  Perfect exposure, perfect focus, accurate color. No noise or artifacts.')
  lines.push('  No text overlays, no watermarks, no hands, no people.')
  lines.push('  Premium commercial quality — every frame is a professional studio shot.')

  if (config.generationNotes) {
    lines.push('')
    lines.push('══════════════════════ SPECIAL NOTES ══════════════════════════════════')
    lines.push(`  ${config.generationNotes}`)
  }

  return lines.filter(l => l !== null && l !== undefined).join('\n')
}

// ─── Stage A: Master frame prompt ─────────────────────────────────────────────

/**
 * Prompt for the canonical master frame (frame 0, angle 0°).
 * This frame becomes the visual "ground truth" for the entire package.
 * It is the most important prompt — all other frames must match it exactly.
 */
export function buildMasterFramePrompt(
  subject:   NormalizedProductSubject,
  config:    P360GenerationConfig,
  blueprint: Product360SceneBlueprint,
): string {
  const w   = config.outputWidth  ?? 1024
  const h   = config.outputHeight ?? 1024
  const isFood = blueprint.productCategory === 'food_bowl' || subject.productCategory === 'food_bowl'
  const isBev  = blueprint.productCategory === 'beverage'  || subject.productCategory === 'beverage'

  const lines: string[] = [
    '╔════════════════════════════════════════════════════════════════════╗',
    '║  MASTER REFERENCE FRAME — 0° FRONT VIEW — VISUAL GROUND TRUTH     ║',
    '╚════════════════════════════════════════════════════════════════════╝',
    '',
    '▶ ROLE OF THIS IMAGE:',
    '  This is the MASTER REFERENCE for a 360° product photography sequence.',
    '  Every single detail you establish in this image will be exactly replicated',
    '  in all subsequent frames. Choose every element deliberately.',
    '  This image defines the canonical look of the entire spin sequence.',
    '',
    `▶ PRODUCT: "${subject.name}"`,
    subject.rawDescription ? `▶ DESCRIPTION: ${subject.rawDescription.slice(0, 250)}` : '',
    '',
    '▶ CAMERA POSITION FOR THIS FRAME:',
    `  Front-facing view, 0° horizontal orbit angle.`,
    `  Camera is directly in front of the ${subject.vessel}, centered.`,
    `  ${blueprint.camera.height}`,
    `  ${blueprint.camera.framing}`,
    '',
    '══════════════════════ SCENE TO ESTABLISH ══════════════════════════',
    '',
    `▶ VESSEL: One ${blueprint.subject.vessel}`,
    blueprint.subject.vesselMaterial !== 'manufacturer original material'
      ? `  Material: ${blueprint.subject.vesselMaterial}, ${blueprint.subject.vesselColor}`
      : '',
    `  Fill/size: ${blueprint.subject.servingSize}`,
    '',
  ]

  if (subject.ingredients.length || blueprint.subject.arrangement) {
    lines.push(`▶ ARRANGEMENT: ${blueprint.subject.arrangement || subject.ingredients.join(', ')}`)
    if (subject.ingredients.length) {
      lines.push(`  Contents: ${subject.ingredients.join(', ')}`)
    }
    lines.push('')
  }

  if (subject.garnish.length) {
    lines.push(`▶ GARNISH: ${blueprint.subject.garnishLayout || subject.garnish.join(', ')}`)
    lines.push('  Place garnish prominently and attractively.')
    lines.push('  This placement will be locked for all 360° frames — choose it carefully.')
    lines.push('')
  }

  if (subject.utensils.length || blueprint.environment.utensils.length) {
    const allUtensils = [...new Set([...subject.utensils, ...blueprint.environment.utensils])]
    lines.push(`▶ UTENSILS: ${allUtensils.join(', ')}`)
    lines.push('  Place utensils in natural food-photography position.')
    lines.push('  This placement will be locked for all 360° frames — choose it carefully.')
    lines.push('')
  }

  lines.push(`▶ SURFACE: ${blueprint.environment.surfaceType} — ${blueprint.environment.surfaceColor}`)
  lines.push(`▶ BACKGROUND: ${blueprint.environment.backgroundColor}`)
  lines.push(`▶ LIGHTING: ${blueprint.lighting.keyLight}`)
  lines.push(`  Fill: ${blueprint.lighting.fillLight}`)
  lines.push(`  Rim: ${blueprint.lighting.rimLight}`)
  lines.push(`  Shadow: ${blueprint.lighting.shadowSoftness}`)
  lines.push('')

  lines.push('══════════════════════ TECHNICAL REQUIREMENTS ══════════════════════')
  lines.push(`  Output: ${w}×${h}px square`)
  lines.push('  Ultra-realistic professional product photography, 6K sharp detail')
  lines.push('  Perfect exposure, accurate color, sharp focus on subject')
  lines.push('  No text overlays, no watermarks, no hands, no people')
  lines.push('  Photorealistic rendering — premium commercial quality')
  lines.push('')

  if (isFood) {
    lines.push('══════════════════════ FOOD PHOTOGRAPHY REQUIREMENTS ══════════════')
    lines.push(`  ${subject.vessel} must be filled to a natural, appetizing serving level`)
    lines.push('  All ingredients should be clearly visible and attractively arranged')
    if (subject.ingredients.length) {
      lines.push(`  Show texture and color of: ${subject.ingredients.slice(0, 5).join(', ')}`)
    }
    if (subject.garnish.length) {
      lines.push(`  Garnish (${subject.garnish.join(', ')}) must be clearly visible and beautiful`)
    }
    lines.push('  Food should look fresh, perfectly styled, and professionally presented')
    lines.push('  Broth/liquid should be at a consistent, photogenic level')
    lines.push('')
  }

  if (isBev) {
    lines.push('══════════════════════ BEVERAGE PHOTOGRAPHY REQUIREMENTS ══════════')
    lines.push('  Liquid should be at a natural, photogenic serving level')
    lines.push('  Show condensation, bubbles, or other detail appropriate to the drink')
    lines.push('  Any ice should be clearly visible if present')
    lines.push('')
  }

  if (config.generationNotes) {
    lines.push('══════════════════════ SPECIAL NOTES ══════════════════════════════')
    lines.push(`  ${config.generationNotes}`)
    lines.push('')
  }

  lines.push('══════════════════════ CONSISTENCY REMINDER ════════════════════════')
  lines.push(`  This is the MASTER FRAME for a ${config.frameCount}-frame 360° rotation sequence.`)
  lines.push('  Every scene element you establish here must be exactly reproducible')
  lines.push('  from all 360° angles. Avoid any compositional choices that are hard to replicate.')
  lines.push('  The simpler and more consistent the scene setup, the better the spin result.')

  return lines.filter(l => l !== null && l !== undefined).join('\n')
}

// ─── Stage C: Locked frame prompt ─────────────────────────────────────────────

/**
 * Generate the per-frame prompt for a non-master frame (frames 1–N).
 *
 * This is the most frequently-called prompt builder. It uses both the
 * stored lockedPrompt (master scene spec) AND the blueprint (for specific
 * locked element values) to produce a maximally specific prompt.
 *
 * @param lockedPrompt   The stored locked_generation_prompt from the package
 * @param blueprint      Normalized scene blueprint (includes vision analysis if v2)
 * @param angleDeg       Camera orbit angle for this frame
 * @param frameIndex     0-based index
 * @param totalFrames    Total frames in package
 * @param shotDirection  Shot direction label
 * @param retryAttempt   0 = first attempt; increment for progressively stricter prompts
 */
export function buildLockedFramePrompt(
  lockedPrompt:    string,
  blueprint:       Product360SceneBlueprint,
  angleDeg:        number,
  frameIndex:      number,
  totalFrames:     number,
  shotDirection:   string,
  retryAttempt:    number = 0,
): string {
  const isFood = blueprint.productCategory === 'food_bowl'
  const analysis = blueprint.masterFrameAnalysis

  const vesselLine = analysis?.vesselExact
    ? `  ✓ ${analysis.vesselExact}`
    : `  ✓ Same ${blueprint.subject.vessel} — same shape, size, color, material`

  const garnishLine = analysis?.garnishExact
    ? `  ✓ ${analysis.garnishExact}`
    : blueprint.subject.garnishLayout
    ? `  ✓ ${blueprint.subject.garnishLayout}`
    : blueprint.subject.garnish.length
    ? `  ✓ ${blueprint.subject.garnish.join(', ')} in same positions`
    : ''

  const utensilLine = analysis?.utensilsExact
    ? `  ✓ ${analysis.utensilsExact}`
    : blueprint.environment.utensils.length
    ? `  ✓ ${blueprint.environment.utensils.join(', ')} at same positions`
    : blueprint.subject.utensils.length
    ? `  ✓ ${blueprint.subject.utensils.join(', ')} at same positions`
    : ''

  const surfaceLine = analysis?.surfaceExact
    ? `  ✓ ${analysis.surfaceExact}`
    : `  ✓ ${blueprint.environment.surfaceType} — ${blueprint.environment.surfaceColor}`

  const bgLine = analysis?.backgroundExact
    ? `  ✓ ${analysis.backgroundExact}`
    : `  ✓ ${blueprint.environment.backgroundColor}`

  const lightingLine = analysis?.lightingExact
    ? `  ✓ ${analysis.lightingExact}`
    : `  ✓ ${blueprint.lighting.keyLight}`

  const cropLine = analysis?.cropExact
    ? `  ✓ ${analysis.cropExact}`
    : `  ✓ ${blueprint.camera.framing}`

  // Retry escalation: stronger language on second/third attempts
  const retryHeader = retryAttempt === 0 ? '' : [
    '',
    `⚠ GENERATION ATTEMPT ${retryAttempt + 1} — STRICTER ENFORCEMENT ⚠`,
    'Previous attempt may have deviated from the master scene.',
    'This attempt requires EXACT PIXEL-LEVEL FIDELITY to the locked spec below.',
    'DO NOT deviate from any element. Match the master frame exactly.',
    '',
  ].join('\n')

  const frameNumStr  = String(frameIndex + 1).padStart(2, ' ')
  const totalStr     = String(totalFrames)
  const angleStr     = String(angleDeg)
  const directionStr = shotDirection.toUpperCase()

  const lines: string[] = [
    retryHeader,
    `╔════════════════════════════════════════════════════════════════════╗`,
    `║  FRAME ${frameNumStr}/${totalStr}  │  ORBIT ANGLE: ${angleStr}°  │  ${directionStr} VIEW${' '.repeat(Math.max(0, 27 - angleStr.length - directionStr.length))}║`,
    `╚════════════════════════════════════════════════════════════════════╝`,
    '',
    '▶ TURNTABLE ROTATION INSTRUCTION:',
    '  The studio turntable has rotated exactly ' + angleDeg + '° clockwise from front position.',
    '  This places the camera at the ' + shotDirection + ' side of the product.',
    '  THE PRODUCT HAS NOT MOVED. NOTHING IN THE SCENE HAS CHANGED.',
    '  Only the camera viewing angle is different from the master frame.',
    '',
    '▶ THE ONLY CHANGE IN THIS FRAME vs ALL OTHER FRAMES:',
    `  Camera orbit: ${angleDeg}° clockwise from front-facing 0° position`,
    `  Shot direction: ${shotDirection} view`,
    '',
    '▶ WHAT IS EXACTLY THE SAME AS THE MASTER FRAME:',
    vesselLine,
    blueprint.subject.arrangement ? `  ✓ Same arrangement: ${blueprint.subject.arrangement}` : '',
    garnishLine,
    utensilLine,
    surfaceLine,
    bgLine,
    lightingLine,
    cropLine,
    '  ✓ Same camera distance — do NOT change',
    '  ✓ Same zoom level — do NOT zoom in or out',
    '  ✓ Same subject scale in frame',
    '',
    '▶ STRICT PROHIBITIONS — VIOLATION OF ANY RULE = INVALID FRAME:',
    '  ✕ DO NOT zoom in or out',
    '  ✕ DO NOT change subject size in frame',
    `  ✕ DO NOT change the ${blueprint.subject.vessel}`,
    isFood ? '  ✕ DO NOT change food amount, broth level, or ingredient arrangement' : '',
    isFood ? '  ✕ DO NOT change garnish count, cut style, or placement' : '',
    '  ✕ DO NOT add any new objects',
    '  ✕ DO NOT remove any existing objects',
    '  ✕ DO NOT change table surface or background',
    '  ✕ DO NOT change lighting direction or intensity',
    '  ✕ DO NOT recompose, reframe, or redesign anything',
    '  ✕ DO NOT reinterpret any scene element',
    '  ✕ DO NOT change any colors or materials',
    '',
    '═════════════════════════════════════════════════════════════════════',
    'MASTER SCENE SPECIFICATION — ALL ELEMENTS ARE PHYSICALLY LOCKED:',
    '═════════════════════════════════════════════════════════════════════',
    '',
    lockedPrompt,
    '',
    '═════════════════════════════════════════════════════════════════════',
    'FINAL RENDERING INSTRUCTION:',
    '═════════════════════════════════════════════════════════════════════',
    '',
    `Render the EXACT same studio scene from ${angleDeg}° around the product.`,
    `The camera has orbited ${angleDeg}° clockwise. The product remains in exactly`,
    `the same physical position. This is frame ${frameIndex + 1} of ${totalFrames}`,
    'in a smooth 360° rotation sequence.',
    `Adjacent frames at ${Math.round(angleDeg - 360/totalFrames)}° and ${Math.round(angleDeg + 360/totalFrames)}°`,
    'must transition seamlessly with no visual jumps.',
    '',
    'Ultra-realistic professional product photography, 6K sharp detail.',
    'No text, no watermarks, no people. Premium commercial quality.',
  ]

  return lines.filter(l => l !== null && l !== undefined).join('\n')
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Calculate the orbit angle for a given frame index.
 * Frame 0 is always 0° (front), subsequent frames orbit clockwise.
 * Deterministic — same totalFrames always produces the same angle sequence.
 */
export function getFrameAngle(frameIndex: number, totalFrames: number): number {
  return Math.round((360 / totalFrames) * frameIndex)
}

/**
 * Get a human-readable shot direction label for a given orbit angle.
 */
export function getShotDirection(angleDeg: number): string {
  const n = ((angleDeg % 360) + 360) % 360
  if (n === 0)    return 'front'
  if (n < 22.5)   return 'front — slight right lean'
  if (n < 45)     return 'front-right'
  if (n === 45)   return 'front-right 45°'
  if (n < 67.5)   return 'right-front'
  if (n < 90)     return 'right-front'
  if (n === 90)   return 'right'
  if (n < 112.5)  return 'right-rear'
  if (n < 135)    return 'right-rear'
  if (n === 135)  return 'rear-right 45°'
  if (n < 157.5)  return 'rear-right'
  if (n < 180)    return 'rear-right'
  if (n === 180)  return 'rear'
  if (n < 202.5)  return 'rear-left'
  if (n < 225)    return 'rear-left'
  if (n === 225)  return 'rear-left 45°'
  if (n < 247.5)  return 'left-rear'
  if (n < 270)    return 'left-rear'
  if (n === 270)  return 'left'
  if (n < 292.5)  return 'left-front'
  if (n < 315)    return 'left-front'
  if (n === 315)  return 'front-left 45°'
  if (n < 337.5)  return 'front-left'
  return 'front — slight left lean'
}
