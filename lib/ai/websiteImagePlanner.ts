// lib/ai/websiteImagePlanner.ts
// Uses the EXISTING Gemini text model to plan what images a website needs.
// The text autofill model (geminiConfig.ts) is used here for planning —
// NO image generation happens in this file.
//
// Fix: removed responseMimeType: 'application/json' from generationConfig.
// gemini-3-flash-preview only allows 'text/plain', so sending 'application/json'
// caused HTTP 400. The model is now prompted to return strict JSON in plain text,
// which parsePlannerResult already handles (it strips code fences).
//
// SERVER-ONLY.

import { getWebsiteAiGeminiModel } from '@/lib/ai/geminiConfig'
import { callGeminiText }          from '@/lib/ai/geminiRequest'
import { buildImagePlannerPrompt } from '@/lib/ai/websiteImagePrompts'
import type { ImagePlannerContext, ImagePlannerResult, ImagePlanItem } from '@/lib/ai/websiteImageTypes'

export async function planWebsiteImages(
  ctx: ImagePlannerContext,
): Promise<{ result: ImagePlannerResult | null; error?: string }> {
  if (!process.env.GEMINI_API_KEY) {
    return { result: null, error: 'GEMINI_API_KEY is not set. Add it to your environment variables.' }
  }

  if (!ctx.sections.length && !ctx.pages.length) {
    return {
      result: {
        plan_group_id: crypto.randomUUID(),
        plans:         [],
        warnings:      ['No pages or sections found. Run AI Autofill first to generate website content.'],
      },
    }
  }

  const prompt = buildImagePlannerPrompt(ctx)
  const model  = getWebsiteAiGeminiModel()

  const { text, error } = await callGeminiText({
    model,
    prompt,
    feature:         'image-planner',
    temperature:     0.3,
    maxOutputTokens: 8192,
    timeoutMs:       60_000,
    // expectJson is intentionally false — parsePlannerResult (below) handles
    // code fence stripping and mapping to the ImagePlanItem schema.
  })

  if (error) {
    return { result: null, error }
  }

  if (!text) {
    return { result: null, error: 'No image plan was generated.' }
  }

  return parsePlannerResult(text)
}

// ─── Response parsing ─────────────────────────────────────────────────────────

function parsePlannerResult(raw: string): { result: ImagePlannerResult | null; error?: string } {
  let cleaned = raw.trim()
  // Strip markdown code fences if Gemini wrapped the JSON
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
  // Find JSON boundaries in case there is surrounding prose
  const start = cleaned.indexOf('{')
  const end   = cleaned.lastIndexOf('}')
  if (start !== -1 && end > start) cleaned = cleaned.slice(start, end + 1)

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>
  } catch {
    // Attempt trailing-comma repair
    try {
      const repaired = cleaned.replace(/,\s*([}\]])/g, '$1')
      parsed = JSON.parse(repaired) as Record<string, unknown>
    } catch {
      return { result: null, error: 'Image planner returned invalid JSON. Try again.' }
    }
  }

  const rawPlans = Array.isArray(parsed.plans) ? parsed.plans : []
  const warnings = Array.isArray(parsed.warnings) ? (parsed.warnings as string[]) : []

  const plans: ImagePlanItem[] = rawPlans
    .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
    .map(p => ({
      placement_key:         String(p.placement_key    ?? ''),
      section_type:          String(p.section_type     ?? ''),
      image_role:            String(p.image_role        ?? 'other'),
      title:                 String(p.title             ?? 'Website Image'),
      reason:                String(p.reason            ?? ''),
      business_goal:         String(p.business_goal     ?? ''),
      image_description:     String(p.image_description ?? ''),
      visual_style:          String(p.visual_style       ?? ''),
      prompt:                String(p.prompt             ?? ''),
      negative_prompt:       String(p.negative_prompt    ?? 'text, watermark, logo, blurry, distorted'),
      aspect_ratio:          String(p.aspect_ratio       ?? '16:9'),
      width:                 typeof p.width  === 'number' ? p.width  : undefined,
      height:                typeof p.height === 'number' ? p.height : undefined,
      priority:              typeof p.priority === 'number' ? p.priority : 100,
      use_existing_if_avail: p.use_existing_if_avail === true,
    }))
    .filter(p => p.placement_key && p.prompt)

  return {
    result: {
      plan_group_id: crypto.randomUUID(),
      plans,
      warnings,
    },
  }
}
