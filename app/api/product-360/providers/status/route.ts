// app/api/product-360/providers/status/route.ts
//
// GET — Diagnostics endpoint showing AI provider configuration status.
//
// Returns which providers are configured, which env vars are missing,
// and whether the storage bucket is accessible.
// NEVER returns secret values — only boolean status flags.
//
// Response:
//   { ok: true, data: { providers: {...}, storage: {...}, runtime: '...' } }

import { NextRequest, NextResponse }  from 'next/server'
import { resolveP360ApiUser }         from '@/lib/product-360/auth'
import { getGeminiProvider }          from '@/lib/product-360/providers/geminiProvider'
import { getLeonardoProvider }        from '@/lib/product-360/providers/leonardoProvider'
import { getSupabaseServerClient }    from '@/lib/supabase/server'

export const dynamic     = 'force-dynamic'
export const maxDuration = 15

const BUCKET = 'spin-360-assets'

async function checkBucketReachable(): Promise<boolean> {
  try {
    const supabase = getSupabaseServerClient()
    const { error } = await supabase.storage.from(BUCKET).list('', { limit: 1 })
    return !error
  } catch {
    return false
  }
}

export async function GET(req: NextRequest) {
  const user = await resolveP360ApiUser(req)
  if (!user) {
    return NextResponse.json({
      ok: false,
      error: { type: 'auth_error', title: 'Unauthorized', message: 'Authentication required.' },
    }, { status: 401 })
  }
  if (user.role !== 'owner' && user.role !== 'admin') {
    return NextResponse.json({
      ok: false,
      error: { type: 'forbidden', title: 'Forbidden', message: 'Only owners and admins can view provider status.' },
    }, { status: 403 })
  }

  const gemini   = getGeminiProvider()
  const leonardo = getLeonardoProvider()

  const geminiErrors   = gemini.configErrors()
  const leonardoErrors = leonardo.configErrors()

  // Check which Gemini sub-services are configured
  const hasGeminiKey    = !!(process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim())
  const hasImagenModel  = !!(process.env.P360_IMAGEN_MODEL?.trim())
  const hasPlannerModel = !!(process.env.P360_PLANNER_MODEL?.trim())

  // Check storage without revealing secrets
  const bucketReachable = await checkBucketReachable()

  // Determine default provider (no secret values)
  const defaultProvider = process.env.NEXT_PUBLIC_360_DEFAULT_PROVIDER ?? 'gemini'

  return NextResponse.json({
    ok: true,
    data: {
      providers: {
        gemini: {
          configured:  gemini.isAvailable(),
          errors:      geminiErrors,
          subServices: {
            geminiApiKey: hasGeminiKey,
            imagenModel:  hasImagenModel,
            plannerModel: hasPlannerModel,
          },
        },
        leonardo: {
          configured:  leonardo.isAvailable(),
          errors:      leonardoErrors,
          subServices: {
            apiKey:               !!(process.env.LEONARDO_API_KEY?.trim()),
            blueprintVersionId:   !!(process.env.LEONARDO_360_BLUEPRINT_VERSION_ID?.trim()),
            referenceImageNodeId: !!(process.env.LEONARDO_360_REFERENCE_IMAGE_NODE_ID?.trim()),
            textVariablesNodeId:  !!(process.env.LEONARDO_360_TEXT_VARIABLES_NODE_ID?.trim()),
          },
        },
      },
      storage: {
        bucket:   BUCKET,
        reachable: bucketReachable,
      },
      defaults: {
        provider: defaultProvider,
      },
      runtime: process.env.VERCEL_REGION ?? process.env.AWS_REGION ?? 'local',
      timestamp: new Date().toISOString(),
    },
  })
}
