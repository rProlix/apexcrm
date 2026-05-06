// lib/ai/360/masterFrameAnalyzer.ts
//
// Stage B.5 — Vision-grounded master frame analysis.
//
// After Imagen generates the master frame (frame 0), this module sends the
// image to Gemini vision and asks it to extract an exhaustive locked description
// of every visual element. That description is merged into the scene blueprint
// and injected into all subsequent frame prompts, making them MUCH more specific
// than text descriptions derived from the product name alone.
//
// Before:  "Primary vessel: bowl — SAME SIZE AND SHAPE IN EVERY FRAME"
// After:   "dark matte charcoal ceramic bowl, approximately 20cm diameter,
//           5cm depth, filled to ~80% with rich golden-brown bone broth
//           — identical in every single frame"
//
// The analysis is a best-effort call. If it fails (missing API key, timeout,
// quota), generation continues using the text-only blueprint (analysisVersion=1).
//
// SERVER-ONLY. Never import from client components.

import { callGeminiMultimodal }    from '@/lib/ai/geminiRequest'
import { safeParseGeminiJson }     from '@/lib/ai/parseGeminiJson'
import type { MasterFrameAnalysisEmbed } from './buildLockedFramePrompt'

// ─── Prompt ───────────────────────────────────────────────────────────────────

const ANALYSIS_PROMPT = `You are a professional product photography analyst preparing a 360° spin sequence.

Analyze this MASTER REFERENCE IMAGE and extract an exhaustive, locked description of every visual element.
Your description will be used to ensure every subsequent frame in the spin sequence matches this image EXACTLY.
Be extremely specific — every detail you capture becomes a hard lock for the rest of the sequence.

Respond with a JSON object matching this exact structure:

{
  "vesselExact": "exact description of the container/vessel: type, color, material, approximate size, fill level",
  "arrangementExact": "exact description of how the product contents are arranged inside/on the vessel",
  "garnishExact": "exact description of every garnish item: count, position (use clock positions), cut style, color",
  "utensilsExact": "exact description of every utensil: type, position (use clock positions), orientation",
  "surfaceExact": "exact description of the table/surface: material, color, texture, any reflections",
  "backgroundExact": "exact description of the background: color, gradient, any patterns or textures",
  "lightingExact": "exact description of the lighting: key light direction, fill light, shadows, highlights, color temperature",
  "cropExact": "exact description of how the subject is framed: what percentage of frame the subject occupies, centered/offset",
  "rawSummary": "one paragraph summary of the entire scene for cross-reference"
}

Rules:
- Be extremely specific. "dark grey ceramic bowl" is better than "bowl".
- Use clock positions for placement (12 o'clock = top, 3 o'clock = right, etc.)
- If there is no garnish, write "no garnish present"
- If there are no utensils, write "no utensils present"
- Do not add any text outside the JSON object`

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Analyze the master frame image with Gemini vision and return exact locked details.
 *
 * @param masterBase64  Base64-encoded image data (from Imagen result)
 * @param mimeType      MIME type of the image, e.g. 'image/png'
 * @param model         Gemini model to use for analysis (default: env var or flash-lite)
 * @returns             Analysis object, or null if analysis could not be completed
 */
export async function analyzeMasterFrame(
  masterBase64: string,
  mimeType:     string = 'image/png',
  model?:       string,
): Promise<MasterFrameAnalysisEmbed | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) {
    console.info('[P360] masterFrameAnalyzer: GEMINI_API_KEY not set — skipping vision analysis')
    return null
  }

  if (!masterBase64 || masterBase64.length < 100) {
    console.warn('[P360] masterFrameAnalyzer: master frame data too short — skipping')
    return null
  }

  const analysisModel = (
    model ??
    process.env.GEMINI_360_ANALYSIS_MODEL ??
    process.env.GEMINI_360_PLANNER_MODEL ??
    'gemini-2.5-flash-lite'
  ).trim()

  console.info(`[P360] masterFrameAnalyzer:start model="${analysisModel}" imageSize=${masterBase64.length}`)

  try {
    const result = await callGeminiMultimodal({
      model:       analysisModel,
      feature:     'p360-master-analysis',
      temperature: 0.05,    // very low temperature for deterministic extraction
      timeoutMs:   45_000,
      parts: [
        { inlineData: { mimeType, data: masterBase64 } },
        { text: ANALYSIS_PROMPT },
      ],
    })

    if (result.error || !result.text) {
      console.warn(`[P360] masterFrameAnalyzer: API error — ${result.error ?? 'no text returned'}`)
      return null
    }

    const { data, error: parseError } = safeParseGeminiJson<Partial<MasterFrameAnalysisEmbed>>(result.text)

    if (parseError || !data) {
      console.warn(`[P360] masterFrameAnalyzer: JSON parse error — ${parseError}`)
      return null
    }

    const safe = (v: unknown, fb: string): string =>
      (typeof v === 'string' && v.trim().length > 0) ? v.trim() : fb

    const analysis: MasterFrameAnalysisEmbed = {
      vesselExact:      safe(data.vesselExact,      'container (details from vision analysis unavailable)'),
      arrangementExact: safe(data.arrangementExact, 'product contents as arranged'),
      garnishExact:     safe(data.garnishExact,     'no garnish present'),
      utensilsExact:    safe(data.utensilsExact,    'no utensils present'),
      surfaceExact:     safe(data.surfaceExact,     'studio surface'),
      backgroundExact:  safe(data.backgroundExact,  'studio background'),
      lightingExact:    safe(data.lightingExact,    'professional studio lighting'),
      cropExact:        safe(data.cropExact,        'product centered, medium-close crop'),
      rawSummary:       safe(data.rawSummary,       result.text.slice(0, 500)),
    }

    console.info(
      `[P360] masterFrameAnalyzer:success ` +
      `vessel="${analysis.vesselExact.slice(0, 80)}" ` +
      `garnish="${analysis.garnishExact.slice(0, 60)}"`,
    )

    return analysis
  } catch (err) {
    console.warn(
      `[P360] masterFrameAnalyzer: exception — ${err instanceof Error ? err.message : String(err)}`,
    )
    return null
  }
}
