// lib/ai/360/normalizeProduct.ts
// Parses a product name + description into structured, stable components.
//
// The normalized subject is used by buildLockedFramePrompt.ts to generate
// hyper-specific prompts where every element is named and locked, preventing
// Imagen from drifting ingredients, vessel size, garnish, or utensils between frames.
//
// SERVER-ONLY. Pure TypeScript, no external calls.

// ─── Output type ──────────────────────────────────────────────────────────────

export interface NormalizedProductSubject {
  /** Original product name */
  name:             string
  /** Primary container/vessel type */
  vessel:           string
  /** Short phrase: "bowl of vegan pho" */
  subjectPhrase:    string
  /** Main food or product components */
  ingredients:      string[]
  /** Decorative / topping items that are visually prominent */
  garnish:          string[]
  /** Serving utensils visible in the scene */
  utensils:         string[]
  /** Any other locked scene details derived from the description */
  keyDetails:       string[]
  /** Broad category for category-specific locking rules */
  productCategory:  NormalizedCategory
  /** Verbatim original description, passed through unchanged */
  rawDescription:   string
}

export type NormalizedCategory =
  | 'food_bowl'
  | 'beverage'
  | 'packaged_product'
  | 'cosmetics'
  | 'electronics'
  | 'jewelry'
  | 'general'

// ─── Keyword maps ──────────────────────────────────────────────────────────────

const VESSEL_MAP: Array<[RegExp, string]> = [
  // Food vessels (check most specific first)
  [/\bbowl\b/,         'bowl'],
  [/\bplate\b/,        'plate'],
  [/\bcup\b/,          'cup'],
  [/\bmug\b/,          'mug'],
  [/\bglass\b/,        'glass'],
  [/\bbottle\b/,       'bottle'],
  [/\bjar\b/,          'jar'],
  [/\bcan\b/,          'can'],
  [/\btin\b/,          'tin can'],
  [/\bbox\b/,          'box'],
  [/\bbag\b/,          'bag'],
  [/\bpouch\b/,        'pouch'],
  [/\btray\b/,         'tray'],
  [/\btube\b/,         'tube'],
  [/\bpacket\b/,       'packet'],
  [/\bsachet\b/,       'sachet'],
  [/\bcontainer\b/,    'container'],
  [/\bcasserole\b/,    'casserole dish'],
  [/\bskillet\b/,      'skillet'],
  [/\bcup\b/,          'cup'],
  [/\bflask\b/,        'flask'],
]

// Food-specific vessel overrides based on dish name
const FOOD_VESSEL_OVERRIDES: Array<[RegExp, string]> = [
  [/\bpho\b/,          'bowl'],
  [/\bramen\b/,        'bowl'],
  [/\budon\b/,         'bowl'],
  [/\bsoup\b/,         'bowl'],
  [/\bnoodle\b/,       'bowl'],
  [/\bhotpot\b/,       'pot'],
  [/\bcurry\b/,        'bowl'],
  [/\bstew\b/,         'bowl'],
  [/\bporridge\b/,     'bowl'],
  [/\bcongee\b/,       'bowl'],
  [/\bsalad\b/,        'bowl'],
  [/\blatte\b/,        'cup'],
  [/\bcappuccino\b/,   'cup'],
  [/\bespresso\b/,     'cup'],
  [/\bcoffee\b/,       'cup'],
  [/\btea\b/,          'cup'],
  [/\bsmoothie\b/,     'glass'],
  [/\bjuice\b/,        'glass'],
  [/\bcocktail\b/,     'glass'],
  [/\bbeer\b/,         'glass'],
]

const GARNISH_WORDS = [
  'lime', 'lemon', 'orange slice', 'herb', 'cilantro', 'parsley', 'mint',
  'basil', 'green onion', 'scallion', 'chili', 'chilli', 'pepper flake',
  'sesame', 'seed', 'flower', 'microgreen', 'edible flower', 'garnish',
  'zest', 'wedge', 'sprig',
]

const UTENSIL_WORDS = [
  'chopstick', 'spoon', 'fork', 'knife', 'straw', 'skewer', 'tongs',
  'ladle', 'spatula',
]

const FOOD_HINTS = [
  'soup', 'pho', 'ramen', 'udon', 'noodle', 'salad', 'rice', 'curry',
  'stew', 'broth', 'porridge', 'congee', 'pasta', 'bowl', 'hotpot',
  'tofu', 'tempeh', 'fried', 'grilled', 'baked', 'roast',
]

const BEVERAGE_HINTS = [
  'drink', 'juice', 'coffee', 'tea', 'smoothie', 'latte', 'cappuccino',
  'milkshake', 'cocktail', 'mocktail', 'beer', 'wine', 'soda', 'kombucha',
  'shot', 'espresso', 'brew', 'infusion', 'sparkling',
]

const PACKAGED_HINTS = [
  'bag', 'box', 'can', 'packet', 'pouch', 'jar', 'bottle', 'tube',
  'sachet', 'wrap', 'container', 'sealed',
]

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Normalizes a product name + description into structured components.
 *
 * Rules:
 * - Vessel detection: first matching keyword in combined text
 * - Ingredient extraction: comma/semicolon-separated items from description
 * - Garnish detection: subset of ingredients matching garnish keyword list
 * - Utensil detection: subset of ingredients matching utensil keyword list
 * - Category: derived from preset key or keyword matching
 */
export function normalizeProductSubject(
  name:            string,
  description:     string | null | undefined,
  categoryPreset?: string | null,
): NormalizedProductSubject {
  const rawDescription = description ?? ''
  const fullText       = `${name} ${rawDescription}`.toLowerCase()

  // ── Vessel ────────────────────────────────────────────────────────────────
  // Check food-specific overrides first (highest specificity for known dishes)
  let vessel = ''
  for (const [rx, label] of FOOD_VESSEL_OVERRIDES) {
    if (rx.test(fullText)) { vessel = label; break }
  }
  // Fall back to generic vessel detection
  if (!vessel) {
    for (const [rx, label] of VESSEL_MAP) {
      if (rx.test(fullText)) { vessel = label; break }
    }
  }
  // Final fallback based on category
  if (!vessel) {
    vessel = 'container'
  }

  // ── Category ──────────────────────────────────────────────────────────────
  let productCategory: NormalizedCategory = 'general'
  if (categoryPreset) {
    if (categoryPreset.includes('food') || categoryPreset.includes('bowl')) productCategory = 'food_bowl'
    else if (categoryPreset.includes('beverage') || categoryPreset.includes('cup'))  productCategory = 'beverage'
    else if (categoryPreset === 'cosmetics')    productCategory = 'cosmetics'
    else if (categoryPreset === 'electronics')  productCategory = 'electronics'
    else if (categoryPreset === 'jewelry')      productCategory = 'jewelry'
  }
  if (productCategory === 'general') {
    if (FOOD_HINTS.some(h => fullText.includes(h)))      productCategory = 'food_bowl'
    else if (BEVERAGE_HINTS.some(h => fullText.includes(h))) productCategory = 'beverage'
    else if (PACKAGED_HINTS.some(h => fullText.includes(h))) productCategory = 'packaged_product'
  }

  // ── Parse items from description ──────────────────────────────────────────
  const ingredients: string[] = []
  const garnish:     string[] = []
  const utensils:    string[] = []

  if (rawDescription) {
    // Split on commas, semicolons, "and", newlines — then clean each fragment
    const rawItems = rawDescription
      .replace(/\.\s/g, ', ')
      .split(/[,;\n]|\band\b/i)
      .map(s => s.replace(/[^a-zA-Z\s-]/g, '').trim().toLowerCase())
      .filter(s => s.length > 1 && s.length < 50)
      .filter(s => !/^(in|with|a|an|the|of|for)$/.test(s))

    for (const item of rawItems) {
      const isGarnish  = GARNISH_WORDS.some(g => item.includes(g))
      const isUtensil  = UTENSIL_WORDS.some(u => item.includes(u))
      const isPriceLine = /\$[\d.]|\d+\s*(ml|g|kg|oz|lb)/.test(item)

      if (isPriceLine) continue

      if (isUtensil) {
        utensils.push(item.trim())
      } else if (isGarnish) {
        garnish.push(item.trim())
      } else if (item.length > 2) {
        ingredients.push(item.trim())
      }
    }
  }

  // ── Subject phrase ────────────────────────────────────────────────────────
  const subjectPhrase = rawDescription.length > 0
    ? `${vessel} of ${name.toLowerCase()}`
    : name

  return {
    name,
    vessel,
    subjectPhrase,
    ingredients: dedupe(ingredients).slice(0, 10),
    garnish:     dedupe(garnish).slice(0, 5),
    utensils:    dedupe(utensils).slice(0, 3),
    keyDetails:  [],
    productCategory,
    rawDescription,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dedupe(arr: string[]): string[] {
  return [...new Set(arr.map(s => s.trim()).filter(Boolean))]
}
