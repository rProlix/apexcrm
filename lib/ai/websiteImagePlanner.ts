// lib/ai/websiteImagePlanner.ts
// Uses the EXISTING Gemini text model to plan what images a website needs.
// The text autofill model (geminiConfig.ts) is used here for planning —
// NO image generation happens in this file.
// SERVER-ONLY.

import { getWebsiteAiGeminiModel } from '@/lib/ai/geminiConfig'
import { buildImagePlannerPrompt } from '@/lib/ai/websiteImagePrompts'
import type { ImagePlannerContext, ImagePlannerResult, ImagePlanItem } from '@/lib/ai/websiteImageTypes'

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const TIMEOUT_MS      = 60_000

export async function planWebsiteImages(
  ctx: ImagePlannerContext,
): Promise<{ result: ImagePlannerResult | null; error?: string }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return { result: null, error: 'GEMINI_API_KEY is not set. Add it to your environment variables.' }
  }

  if (!ctx.sections.length && !ctx.pages.length) {
    return {
      result: { plan_group_id: crypto.randomUUID(), plans: [], warnings: ['No pages or sections found. Run AI Autofill first to generate website content.'] },
    }
  }

  const prompt = buildImagePlannerPrompt(ctx)
  const url    = `${GEMINI_API_BASE}/${getWebsiteAiGeminiModel()}:generateContent?key=${apiKey}`
  const body   = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature:      0.3,
      maxOutputTokens:  8192,
      responseMimeType: 'application/json',
    },
  }

  const controller = new AbortController()
  const timer      = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let response: Response

  try {
    response = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  controller.signal,
    })
  } catch (err: unknown) {
    clearTimeout(timer)
    return {
      result: null,
      error:  err instanceof Error && err.name === 'AbortError'
        ? 'Image planner timed out. Try again.'
        : `Image planner request failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    let text = ''
    try { text = await response.text() } catch { /* ignore */ }
    return { result: null, error: `Gemini API error ${response.status}: ${text.slice(0, 200)}` }
  }

  let json: Record<string, unknown>
  try { json = await response.json() as Record<string, unknown> } catch {
    return { result: null, error: 'Gemini returned unreadable data.' }
  }

  const candidates = json.candidates as Array<Record<string, unknown>> | undefined
  const rawText    = extractText(candidates)
  if (!rawText) return { result: null, error: 'No image plan was generated.' }

  return parsePlannerResult(rawText)
}

function extractText(candidates?: Array<Record<string, unknown>>): string {
  if (!candidates?.length) return ''
  const first   = candidates[0]
  const content = first?.content as Record<string, unknown> | undefined
  const parts   = content?.parts as Array<Record<string, unknown>> | undefined
  if (!parts?.length) return ''
  return parts.map(p => (p?.text as string) ?? '').join('')
}

function parsePlannerResult(raw: string): { result: ImagePlannerResult | null; error?: string } {
  let cleaned = raw.trim()
  // strip markdown fences if present
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>
  } catch {
    // attempt trailing-comma repair
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
