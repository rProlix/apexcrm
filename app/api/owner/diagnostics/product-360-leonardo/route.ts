export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'

const REQUIRED_ENV = [
  'LEONARDO_API_KEY',
  'LEONARDO_360_BLUEPRINT_VERSION_ID',
  'LEONARDO_360_REFERENCE_IMAGE_NODE_ID',
  'LEONARDO_360_PROMPT_NODE_ID',
  'LEONARDO_360_ANGLE_NODE_ID',
  'LEONARDO_360_CAMERA_NODE_ID',
  'LEONARDO_360_LIGHTING_NODE_ID',
  'LEONARDO_360_BACKGROUND_NODE_ID',
] as const

const PACKAGE_COLUMNS = [
  'reference_image_url',
  'reference_storage_path',
  'reference_source',
  'blueprint_version_id',
  'generation_mode',
  'provider',
  'label',
  'master_frame_url',
  'scene_blueprint',
  'locked_generation_prompt',
  'status',
] as const

const FRAME_COLUMNS = [
  'image_url',
  'frame_index',
] as const

async function getMissingColumns(tableName: string, required: readonly string[]) {
  const supabase = getSupabaseServerClient()
  try {
    const { data, error } = await supabase
      .from('information_schema.columns' as never)
      .select('column_name')
      .eq('table_schema', 'public')
      .eq('table_name', tableName)
      .in('column_name', [...required])

    if (error) return { missing: [...required], error: error.message }

    const present = new Set((data as Array<{ column_name?: string }> | null ?? []).map(row => row.column_name).filter(Boolean))
    return { missing: required.filter(col => !present.has(col)), error: null }
  } catch (err) {
    return { missing: [...required], error: err instanceof Error ? err.message : String(err) }
  }
}

export async function GET() {
  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Owner or admin role required.' }, { status: 403 })
  }

  const supabase = getSupabaseServerClient()

  const env = Object.fromEntries(REQUIRED_ENV.map(name => [name, process.env[name] ? 'present' : 'MISSING']))
  const missingEnv = REQUIRED_ENV.filter(name => !process.env[name])
  const textVariablesFormat = process.env.LEONARDO_360_TEXT_VARIABLES_FORMAT === 'json' ? 'json' : 'text'

  let bucketCheckError: string | null = null
  let framesBucket = false
  let referencesBucket = false
  try {
    const { data, error } = await supabase.storage.listBuckets()
    if (error) {
      bucketCheckError = error.message
    } else {
      framesBucket = Boolean(data?.some(bucket => bucket.id === 'product-360-frames'))
      referencesBucket = Boolean(data?.some(bucket => bucket.id === 'product-360-references'))
    }
  } catch (err) {
    bucketCheckError = err instanceof Error ? err.message : String(err)
  }

  const [packageColumns, frameColumns] = await Promise.all([
    getMissingColumns('product_360_packages', PACKAGE_COLUMNS),
    getMissingColumns('product_360_frames', FRAME_COLUMNS),
  ])

  let leonardoReachable = false
  let leonardoStatus: number | null = null
  let leonardoError: string | null = null
  if (process.env.LEONARDO_API_KEY) {
    try {
      const res = await fetch('https://cloud.leonardo.ai/api/rest/v1/me', {
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${process.env.LEONARDO_API_KEY}`,
        },
        signal: AbortSignal.timeout(10_000),
      })
      leonardoStatus = res.status
      leonardoReachable = res.ok
      if (!res.ok) {
        let body: unknown = null
        try { body = await res.json() } catch { body = await res.text().catch(() => null) }
        leonardoError = typeof body === 'string' ? body.slice(0, 500) : JSON.stringify(body).slice(0, 500)
      }
    } catch (err) {
      leonardoError = err instanceof Error ? err.message : String(err)
    }
  } else {
    leonardoError = 'LEONARDO_API_KEY is missing.'
  }

  const examplePayload = {
    blueprintVersionId: process.env.LEONARDO_360_BLUEPRINT_VERSION_ID || 'MISSING',
    input: {
      nodeInputs: [
        {
          nodeId: process.env.LEONARDO_360_REFERENCE_IMAGE_NODE_ID || 'MISSING_LEONARDO_360_REFERENCE_IMAGE_NODE_ID',
          value: '<REFERENCE_IMAGE_URL>',
          settingName: 'imageUrl',
        },
        {
          nodeId: process.env.LEONARDO_360_PROMPT_NODE_ID || 'MISSING_LEONARDO_360_PROMPT_NODE_ID',
          value: textVariablesFormat === 'json'
            ? { frameIndex: 5, angleDegrees: 75, orbitInstruction: 'Render the same product from a 75 degree clockwise orbit angle.' }
            : 'FRAME INDEX: 5\nANGLE DEGREES: 75\nRender the same product from a 75 degree clockwise orbit angle.',
          settingName: 'prompt',
        },
        {
          nodeId: process.env.LEONARDO_360_ANGLE_NODE_ID || 'MISSING_LEONARDO_360_ANGLE_NODE_ID',
          value: '75',
          settingName: 'angleDegrees',
        },
        {
          nodeId: process.env.LEONARDO_360_CAMERA_NODE_ID || 'MISSING_LEONARDO_360_CAMERA_NODE_ID',
          value: 'Preserve camera distance, lens, crop, scale, and composition from the reference image.',
          settingName: 'camera',
        },
        {
          nodeId: process.env.LEONARDO_360_LIGHTING_NODE_ID || 'MISSING_LEONARDO_360_LIGHTING_NODE_ID',
          value: 'Preserve lighting, shadows, highlights, and atmosphere from the reference image.',
          settingName: 'lighting',
        },
        {
          nodeId: process.env.LEONARDO_360_BACKGROUND_NODE_ID || 'MISSING_LEONARDO_360_BACKGROUND_NODE_ID',
          value: 'Preserve background, table surface, wall/backdrop, props, and arrangement from the reference image.',
          settingName: 'background',
        },
      ],
      public: true,
    },
  }

  const fixes = [
    ...missingEnv.map(name => `Add ${name}=... to your server environment and restart/redeploy.`),
    ...(!framesBucket ? ['Create Supabase Storage bucket product-360-frames or run migration 074.'] : []),
    ...(!referencesBucket ? ['Create Supabase Storage bucket product-360-references or run migration 074.'] : []),
    ...(packageColumns.missing.length ? [`product_360_packages missing columns: ${packageColumns.missing.join(', ')}. Run migration 074.`] : []),
    ...(frameColumns.missing.length ? [`product_360_frames missing columns: ${frameColumns.missing.join(', ')}. Run migration 074.`] : []),
    ...(!leonardoReachable ? ['Leonardo API probe failed. Check LEONARDO_API_KEY and account access.'] : []),
  ]

  const ok = fixes.length === 0

  return NextResponse.json({
    ok,
    timestamp: new Date().toISOString(),
    env: {
      ...env,
      LEONARDO_360_OUTPUT_IMAGE_URL_PATH: process.env.LEONARDO_360_OUTPUT_IMAGE_URL_PATH ? 'present' : 'optional-not-set',
      LEONARDO_360_TEXT_VARIABLES_FORMAT: textVariablesFormat,
      LEONARDO_360_POLL_INTERVAL_MS: process.env.LEONARDO_360_POLL_INTERVAL_MS ?? '2500',
      LEONARDO_360_MAX_POLL_MS: process.env.LEONARDO_360_MAX_POLL_MS ?? '120000',
    },
    supabase: {
      buckets: {
        'product-360-frames': framesBucket,
        'product-360-references': referencesBucket,
      },
      bucketCheckError,
      columns: {
        product_360_packages: packageColumns,
        product_360_frames: frameColumns,
      },
    },
    leonardo: {
      reachable: leonardoReachable,
      status: leonardoStatus,
      error: leonardoError,
      blueprintVersionConfigured: Boolean(process.env.LEONARDO_360_BLUEPRINT_VERSION_ID),
      referenceNodeConfigured: Boolean(process.env.LEONARDO_360_REFERENCE_IMAGE_NODE_ID),
      promptNodeConfigured: Boolean(process.env.LEONARDO_360_PROMPT_NODE_ID),
      angleNodeConfigured: Boolean(process.env.LEONARDO_360_ANGLE_NODE_ID),
      cameraNodeConfigured: Boolean(process.env.LEONARDO_360_CAMERA_NODE_ID),
      lightingNodeConfigured: Boolean(process.env.LEONARDO_360_LIGHTING_NODE_ID),
      backgroundNodeConfigured: Boolean(process.env.LEONARDO_360_BACKGROUND_NODE_ID),
    },
    examplePayload,
    fixes,
  }, { status: ok ? 200 : 207 })
}
