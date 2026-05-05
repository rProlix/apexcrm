// lib/storage/storageHealth.ts
// ─────────────────────────────────────────────────────────────────────────────
// SERVER-ONLY health check for all Supabase Storage buckets.
// Used by GET /api/storage/health.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only'

import { getSupabaseServerClient } from '@/lib/supabase/server'
import { STORAGE_BUCKETS, isPublicBucket, type StorageBucket } from '@/lib/storage/buckets'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BucketHealthEntry {
  name: string
  exists: boolean
  expectedPublic: boolean
  actualPublic: boolean | null
  status: 'ok' | 'missing' | 'wrong_visibility'
}

export interface StorageHealthReport {
  ok: boolean
  checkedAt: string
  buckets: BucketHealthEntry[]
  errors: string[]
}

// ─── Expected config ─────────────────────────────────────────────────────────

const EXPECTED_BUCKETS: StorageBucket[] = [
  STORAGE_BUCKETS.WEBSITE_ASSETS,
  STORAGE_BUCKETS.PRODUCT_ASSETS,
  STORAGE_BUCKETS.SPIN_360_ASSETS,
  STORAGE_BUCKETS.BRAND_ASSETS,
  STORAGE_BUCKETS.CUSTOMER_ASSETS,
  STORAGE_BUCKETS.APPOINTMENT_ASSETS,
  STORAGE_BUCKETS.DAMAGE_ASSESSMENT_ASSETS,
  STORAGE_BUCKETS.DOCUMENT_ASSETS,
  STORAGE_BUCKETS.IMPORT_ASSETS,
  STORAGE_BUCKETS.TEMP_ASSETS,
]

// ─── Health check ─────────────────────────────────────────────────────────────

/**
 * Connects to Supabase with the service-role client and verifies that every
 * required bucket exists and has the expected public/private setting.
 *
 * Returns a structured report — never throws.
 */
export async function checkStorageHealth(): Promise<StorageHealthReport> {
  const errors: string[] = []
  const bucketResults: BucketHealthEntry[] = []

  // Verify required env vars exist (values are not logged for security).
  const requiredEnvVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ]
  for (const key of requiredEnvVars) {
    if (!process.env[key]) {
      errors.push(`Missing environment variable: ${key}`)
    }
  }

  if (errors.length) {
    return {
      ok: false,
      checkedAt: new Date().toISOString(),
      buckets: EXPECTED_BUCKETS.map(name => ({
        name,
        exists: false,
        expectedPublic: isPublicBucket(name),
        actualPublic: null,
        status: 'missing' as const,
      })),
      errors,
    }
  }

  let liveBuckets: Array<{ id: string; public: boolean }> = []

  try {
    const supabase = getSupabaseServerClient()
    const { data, error } = await supabase.storage.listBuckets()
    if (error) {
      errors.push(`listBuckets() error: ${error.message}`)
    } else {
      liveBuckets = (data ?? []).map(b => ({ id: b.id, public: b.public }))
    }
  } catch (err) {
    errors.push(`Unexpected error contacting Supabase: ${err instanceof Error ? err.message : String(err)}`)
  }

  for (const bucketName of EXPECTED_BUCKETS) {
    const live         = liveBuckets.find(b => b.id === bucketName)
    const expectedPub  = isPublicBucket(bucketName)
    const actualPub    = live ? live.public : null
    let status: BucketHealthEntry['status'] = 'ok'

    if (!live) {
      status = 'missing'
      errors.push(`Bucket "${bucketName}" does not exist — run migration 032.`)
    } else if (actualPub !== expectedPub) {
      status = 'wrong_visibility'
      errors.push(
        `Bucket "${bucketName}" has public=${actualPub} but expected public=${expectedPub}.`,
      )
    }

    bucketResults.push({
      name:           bucketName,
      exists:         !!live,
      expectedPublic: expectedPub,
      actualPublic:   actualPub,
      status,
    })
  }

  return {
    ok:          errors.length === 0,
    checkedAt:   new Date().toISOString(),
    buckets:     bucketResults,
    errors,
  }
}
