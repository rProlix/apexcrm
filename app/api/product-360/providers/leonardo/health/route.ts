// app/api/product-360/providers/leonardo/health/route.ts
//
// GET — Returns Leonardo provider configuration status for owner/admin.
//
// Does NOT call Leonardo. Returns only which env vars are present (not their values).

import { NextRequest, NextResponse } from 'next/server'
import { resolveP360ApiUser }        from '@/lib/product-360/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await resolveP360ApiUser(req)
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 })
  }
  if (user.role !== 'owner' && user.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  const apiKey               = process.env.LEONARDO_API_KEY?.trim()
  const blueprintVersionId   = process.env.LEONARDO_360_BLUEPRINT_VERSION_ID?.trim()
  const referenceImageNodeId = process.env.LEONARDO_360_REFERENCE_IMAGE_NODE_ID?.trim()
  const promptNodeId         = process.env.LEONARDO_360_PROMPT_NODE_ID?.trim() ?? process.env.LEONARDO_360_TEXT_VARIABLES_NODE_ID?.trim()
  const angleNodeId          = process.env.LEONARDO_360_ANGLE_NODE_ID?.trim()
  const cameraNodeId         = process.env.LEONARDO_360_CAMERA_NODE_ID?.trim()
  const lightingNodeId       = process.env.LEONARDO_360_LIGHTING_NODE_ID?.trim()
  const backgroundNodeId     = process.env.LEONARDO_360_BACKGROUND_NODE_ID?.trim()
  const outputImageUrlPath   = process.env.LEONARDO_360_OUTPUT_IMAGE_URL_PATH?.trim()
  const textVariablesFormat  = process.env.LEONARDO_360_TEXT_VARIABLES_FORMAT?.trim().toLowerCase() === 'json' ? 'json' : 'text'
  const extraRaw             = process.env.LEONARDO_360_EXTRA_TEXT_VARIABLE_NODE_IDS?.trim() ?? ''
  const extraNodeIds         = extraRaw ? extraRaw.split(',').map(s => s.trim()).filter(Boolean) : []

  const missing: string[] = []
  if (!apiKey)               missing.push('LEONARDO_API_KEY')
  if (!blueprintVersionId)   missing.push('LEONARDO_360_BLUEPRINT_VERSION_ID')
  if (!referenceImageNodeId) missing.push('LEONARDO_360_REFERENCE_IMAGE_NODE_ID')
  if (!promptNodeId)         missing.push('LEONARDO_360_PROMPT_NODE_ID')
  if (!angleNodeId)          missing.push('LEONARDO_360_ANGLE_NODE_ID')
  if (!cameraNodeId)         missing.push('LEONARDO_360_CAMERA_NODE_ID')
  if (!lightingNodeId)       missing.push('LEONARDO_360_LIGHTING_NODE_ID')
  if (!backgroundNodeId)     missing.push('LEONARDO_360_BACKGROUND_NODE_ID')

  const configured = missing.length === 0

  const pollMaxMs   = parseInt(process.env.LEONARDO_360_MAX_POLL_MS ?? '120000', 10) || 120000
  const pollDelayMs = parseInt(process.env.LEONARDO_360_POLL_INTERVAL_MS ?? process.env.PRODUCT_360_PROVIDER_POLL_DELAY_MS  ?? '2500', 10) || 2500

  const notes: string[] = []
  if (!configured) {
    notes.push(`Missing env vars: ${missing.join(', ')}.`)
  }
  notes.push(
    'If Leonardo returns an array with keys [extensions, locations, message, path], the blueprint request was rejected by the API.',
    'Check that LEONARDO_360_BLUEPRINT_VERSION_ID matches a published blueprint.',
    'Check that all configured node IDs match the node IDs in your Leonardo blueprint.',
    'A reference image URL is required for blueprints that use an imageUrl input node.',
  )

  return NextResponse.json({
    ok: true,
    data: {
      configured,
      missing,
      apiKeyPresent:               Boolean(apiKey),
      blueprintVersionIdPresent:   Boolean(blueprintVersionId),
      referenceImageNodeIdPresent: Boolean(referenceImageNodeId),
      promptNodeIdPresent:         Boolean(promptNodeId),
      angleNodeIdPresent:          Boolean(angleNodeId),
      cameraNodeIdPresent:         Boolean(cameraNodeId),
      lightingNodeIdPresent:       Boolean(lightingNodeId),
      backgroundNodeIdPresent:     Boolean(backgroundNodeId),
      outputImageUrlPathPresent:   Boolean(outputImageUrlPath),
      extraTextVariableNodeCount:  extraNodeIds.length,
      textVariablesFormat,
      defaultProvider:             process.env.NEXT_PUBLIC_360_DEFAULT_PROVIDER ?? 'gemini',
      pollConfig:                  { maxMs: pollMaxMs, delayMs: pollDelayMs },
      notes,
    },
  })
}
