// lib/product-360/generatePrompt.ts
// Builds consistent 360° product photography prompts for AI generation.

export interface PromptParams {
  productName:        string
  productDescription: string
  angleDegrees:       number
  frameCount?:        number
  negativePrompt?:    string
  styleNotes?:        string
}

/**
 * Builds a single-angle prompt for a 360° frame.
 * All parameters except angleDegrees are constant across all frames
 * so the AI generates consistent results.
 */
export function buildFramePrompt(params: PromptParams): string {
  const {
    productName,
    productDescription,
    angleDegrees,
    styleNotes,
  } = params

  const base = `Ultra-realistic professional product photography of: "${productName}". ${productDescription}.`

  const technique = [
    'Object centered, isolated on clean premium studio background.',
    'Identical camera distance, identical scale, identical lighting, identical lens, identical framing across all frames.',
    '6K sharp detail, realistic texture, premium commercial product photo.',
    'Controlled softbox lighting with premium shadows.',
    'No text, no watermark, no extra objects, no hands.',
  ].join(' ')

  const rotation = `Rotate the product/object to exactly ${angleDegrees} degrees from front-facing 0°.`

  const consistency = [
    'Do not change the object, ingredients, colors, size, shape, labels, toppings, packaging, or background.',
    'Keep all visual details exactly identical to every other frame — only the rotation angle changes.',
    'No distortion. No morphing. No blending.',
  ].join(' ')

  const style = styleNotes
    ? `Style notes: ${styleNotes}`
    : 'Luxury e-commerce presentation, transparent or clean neutral studio background, consistent soft shadows.'

  return [base, technique, rotation, consistency, style].join('\n')
}

/**
 * Builds the master generation prompt describing the FULL sequence.
 * Used for display in the UI and for single-shot providers.
 */
export function buildMasterPrompt(params: {
  productName:        string
  productDescription: string
  frameCount?:        number
  styleNotes?:        string
}): string {
  const { productName, productDescription, frameCount = 36, styleNotes } = params
  const degreesPerFrame = Math.round(360 / frameCount)

  return [
    `Create a consistent ${frameCount}-frame 360-degree product rotation set of this exact product.`,
    `Product: "${productName}". ${productDescription}`,
    `Each frame must show the same product, same materials, same scale, same lighting, same background, same camera lens.`,
    `Rotate ${degreesPerFrame} degrees per frame around the product, completing a full 360° circle.`,
    `Ultra-realistic 6K studio product photography.`,
    `Luxury e-commerce presentation. Controlled softbox lighting. Premium shadows.`,
    `No text, no watermark, no extra objects.`,
    styleNotes ? `Style: ${styleNotes}` : '',
  ].filter(Boolean).join(' ')
}

/**
 * Returns an array of angle values in degrees for a given frame count.
 * e.g. 36 frames → [0, 10, 20, ..., 350]
 */
export function buildAngleSequence(frameCount: number): number[] {
  return Array.from({ length: frameCount }, (_, i) =>
    Math.round((360 / frameCount) * i)
  )
}
