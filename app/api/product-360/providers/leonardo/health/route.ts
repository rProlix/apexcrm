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
  const textVariablesNodeId  = process.env.LEONARDO_360_TEXT_VARIABLES_NODE_ID?.trim()
  const outputImageNodeId    = process.env.LEONARDO_360_OUTPUT_IMAGE_NODE_ID?.trim()
  const textVariablesFormat  = process.env.LEONARDO_360_TEXT_VARIABLES_FORMAT?.trim().toLowerCase() === 'json' ? 'json' : 'text'
  const extraRaw             = process.env.LEONARDO_360_EXTRA_TEXT_VARIABLE_NODE_IDS?.trim() ?? ''
  const extraNodeIds         = extraRaw ? extraRaw.split(',').map(s => s.trim()).filter(Boolean) : []

  const missing: string[] = []
  if (!apiKey)               missing.push('LEONARDO_API_KEY')
  if (!blueprintVersionId)   missing.push('LEONARDO_360_BLUEPRINT_VERSION_ID')
  if (!referenceImageNodeId) missing.push('LEONARDO_360_REFERENCE_IMAGE_NODE_ID')
  if (!textVariablesNodeId)  missing.push('LEONARDO_360_TEXT_VARIABLES_NODE_ID')

  const configured = missing.length === 0

  const pollAttempts = parseInt(process.env.LEONARDO_360_MAX_POLL_ATTEMPTS ?? process.env.PRODUCT_360_PROVIDER_POLL_ATTEMPTS ?? '40', 10) || 40
  const pollDelayMs  = parseInt(process.env.LEONARDO_360_POLL_INTERVAL_MS ?? process.env.PRODUCT_360_PROVIDER_POLL_DELAY_MS  ?? '3000', 10) || 3000

  const notes: string[] = []
  if (!configured) {
    notes.push(`Missing env vars: ${missing.join(', ')}.`)
  }
  notes.push(
    'If Leonardo returns an array with keys [extensions, locations, message, path], the blueprint request was rejected by the API.',
    'Check that LEONARDO_360_BLUEPRINT_VERSION_ID matches a published blueprint.',
    'Check that LEONARDO_360_REFERENCE_IMAGE_NODE_ID and LEONARDO_360_TEXT_VARIABLES_NODE_ID match node IDs in your blueprint.',
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
      textVariablesNodeIdPresent:  Boolean(textVariablesNodeId),
      outputImageNodeIdPresent:    Boolean(outputImageNodeId),
      extraTextVariableNodeCount:  extraNodeIds.length,
      textVariablesFormat,
      defaultProvider:             process.env.NEXT_PUBLIC_360_DEFAULT_PROVIDER ?? 'gemini',
      pollConfig:                  { maxAttempts: pollAttempts, delayMs: pollDelayMs },
      notes,
    },
  })
}
