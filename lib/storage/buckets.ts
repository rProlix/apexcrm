// lib/storage/buckets.ts
// ─────────────────────────────────────────────────────────────────────────────
// Central registry for every Supabase Storage bucket used in the Nexora /
// ApexCRM platform.
//
// Import STORAGE_BUCKETS everywhere in the codebase instead of hardcoding
// bucket name strings.  This file is safe to import from both server and
// client code — it contains no secrets.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Bucket names ────────────────────────────────────────────────────────────

export const STORAGE_BUCKETS = {
  /** Public. Business website images, AI-generated images, hero/gallery/logo. */
  WEBSITE_ASSETS: 'website-assets',
  /** Public. E-commerce product images, galleries, thumbnails, variants. */
  PRODUCT_ASSETS: 'product-assets',
  /** Public. 360° spin frames, Midjourney frames, hotspot overlays. */
  SPIN_360_ASSETS: 'spin-360-assets',
  /** Public. Tenant logos, favicons, OG images, dark/light logo variants. */
  BRAND_ASSETS: 'brand-assets',
  /** Private. Customer avatars, order attachments, account documents. */
  CUSTOMER_ASSETS: 'customer-assets',
  /** Private. Appointment before/after photos, service images, notes. */
  APPOINTMENT_ASSETS: 'appointment-assets',
  /** Private. Damage AI photos, vehicle inspection images, before/after. */
  DAMAGE_ASSESSMENT_ASSETS: 'damage-assessment-assets',
  /** Private. Contracts, receipts, PDFs, internal business documents. */
  DOCUMENT_ASSETS: 'document-assets',
  /** Private. Website scraper imports, Yelp images, raw source media. */
  IMPORT_ASSETS: 'import-assets',
  /** Private. Draft AI images, pending uploads, processing files. */
  TEMP_ASSETS: 'temp-assets',
} as const

export type StorageBucket = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS]

// ─── Public / private classification ─────────────────────────────────────────

export const PUBLIC_BUCKETS: ReadonlySet<StorageBucket> = new Set([
  STORAGE_BUCKETS.WEBSITE_ASSETS,
  STORAGE_BUCKETS.PRODUCT_ASSETS,
  STORAGE_BUCKETS.SPIN_360_ASSETS,
  STORAGE_BUCKETS.BRAND_ASSETS,
])

export const PRIVATE_BUCKETS: ReadonlySet<StorageBucket> = new Set([
  STORAGE_BUCKETS.CUSTOMER_ASSETS,
  STORAGE_BUCKETS.APPOINTMENT_ASSETS,
  STORAGE_BUCKETS.DAMAGE_ASSESSMENT_ASSETS,
  STORAGE_BUCKETS.DOCUMENT_ASSETS,
  STORAGE_BUCKETS.IMPORT_ASSETS,
  STORAGE_BUCKETS.TEMP_ASSETS,
])

export function isPublicBucket(bucket: string): boolean {
  return PUBLIC_BUCKETS.has(bucket as StorageBucket)
}

// ─── Allowed MIME types per bucket ───────────────────────────────────────────

export const ALLOWED_MIME_TYPES: Record<StorageBucket, string[]> = {
  'website-assets':          ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'],
  'product-assets':          ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'],
  'spin-360-assets':         ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  'brand-assets':            ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/svg+xml', 'image/x-icon'],
  'customer-assets':         ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf', 'text/plain'],
  'appointment-assets':      ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'],
  'damage-assessment-assets':['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'],
  'document-assets':         ['application/pdf', 'text/plain', 'application/json', 'image/jpeg', 'image/png', 'image/webp'],
  'import-assets':           ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'text/plain', 'application/json'],
  'temp-assets':             ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'text/plain'],
}

// ─── Max file sizes per bucket (bytes) ───────────────────────────────────────

export const MAX_FILE_SIZE_BYTES: Record<StorageBucket, number> = {
  'website-assets':           10 * 1024 * 1024,   // 10 MB
  'product-assets':           15 * 1024 * 1024,   // 15 MB
  'spin-360-assets':          25 * 1024 * 1024,   // 25 MB
  'brand-assets':              5 * 1024 * 1024,   //  5 MB
  'customer-assets':          20 * 1024 * 1024,   // 20 MB
  'appointment-assets':       20 * 1024 * 1024,   // 20 MB
  'damage-assessment-assets': 30 * 1024 * 1024,   // 30 MB
  'document-assets':          25 * 1024 * 1024,   // 25 MB
  'import-assets':            30 * 1024 * 1024,   // 30 MB
  'temp-assets':              20 * 1024 * 1024,   // 20 MB
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

/**
 * Builds the canonical `tenants/{tenantId}/...rest` storage path.
 *
 * @example
 * getTenantPath('abc', ['website', 'generated', 'home', 'hero', 'image.png'])
 * // → 'tenants/abc/website/generated/home/hero/image.png'
 */
export function getTenantPath(tenantId: string, folderParts: string[]): string {
  assertSafeStoragePath(tenantId)
  folderParts.forEach(assertSafeStoragePath)
  return ['tenants', tenantId, ...folderParts].join('/')
}

/**
 * Sanitizes a filename: strips path separators, null bytes, and leading dots.
 * Replaces whitespace and special characters with underscores.
 */
export function sanitizeFileName(raw: string): string {
  return raw
    .replace(/[/\\]/g, '')           // no directory separators
    .replace(/\0/g, '')              // no null bytes
    .replace(/^\.*/, '')             // no leading dots (hidden file trick)
    .replace(/[^a-zA-Z0-9._\-]/g, '_') // only safe chars
    .slice(0, 200)                   // cap length
}

/**
 * Throws if a path segment contains traversal sequences or forbidden chars.
 */
export function assertSafeStoragePath(segment: string): void {
  if (/\.\./.test(segment)) {
    throw new Error(`Storage path segment contains traversal sequence: "${segment}"`)
  }
  if (/[\0/\\]/.test(segment)) {
    throw new Error(`Storage path segment contains forbidden character: "${segment}"`)
  }
}

/**
 * Validates that a MIME type is allowed for the given bucket.
 */
export function assertAllowedMimeType(bucket: StorageBucket, mimeType: string): void {
  const allowed = ALLOWED_MIME_TYPES[bucket]
  if (!allowed.includes(mimeType)) {
    throw new Error(
      `MIME type "${mimeType}" is not allowed in bucket "${bucket}". ` +
      `Allowed: ${allowed.join(', ')}`,
    )
  }
}

/**
 * Validates file size against the bucket limit.
 */
export function assertFileSizeWithinLimit(bucket: StorageBucket, sizeBytes: number): void {
  const limit = MAX_FILE_SIZE_BYTES[bucket]
  if (sizeBytes > limit) {
    throw new Error(
      `File size ${sizeBytes} bytes exceeds the ${limit / 1024 / 1024} MB limit for bucket "${bucket}"`,
    )
  }
}
