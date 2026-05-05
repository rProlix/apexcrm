# Nexora / ApexCRM — Supabase Storage Buckets

Complete reference for every Supabase Storage bucket in the platform.

---

## Migration

Run migration **`032_storage_buckets_and_policies.sql`** in Supabase:

```bash
# Using Supabase CLI
supabase db push

# Or apply the file directly in the Supabase SQL editor:
# Dashboard → SQL Editor → paste contents of supabase/migrations/032_storage_buckets_and_policies.sql → Run
```

The migration is **fully idempotent** — it uses `ON CONFLICT DO NOTHING / DO UPDATE` and drops policies before re-creating them. Safe to re-run.

---

## Auth model

Policies rely on JWT claims set during login:

| JWT claim | Value |
|-----------|-------|
| `tenant_id` | UUID of the tenant the user belongs to |
| `role` | `owner` \| `admin` \| `staff` \| `customer` |

Helper functions created by the migration:

| Function | Purpose |
|----------|---------|
| `public.is_owner()` | `true` when role = owner |
| `public.is_tenant_admin(tid)` | `true` for owner OR admin/staff of that tenant |
| `public.is_tenant_member(tid)` | `true` for any authenticated user of that tenant |
| `public.current_tenant_id()` | Returns user's tenant UUID from JWT |
| `public.current_customer_id()` | Returns customer row ID for the authenticated customer |

---

## Bucket summary

| Bucket | Public | Max size |
|--------|--------|----------|
| `website-assets` | ✅ Yes | 10 MB |
| `product-assets` | ✅ Yes | 15 MB |
| `spin-360-assets` | ✅ Yes | 25 MB |
| `brand-assets` | ✅ Yes | 5 MB |
| `customer-assets` | 🔒 No | 20 MB |
| `appointment-assets` | 🔒 No | 20 MB |
| `damage-assessment-assets` | 🔒 No | 30 MB |
| `document-assets` | 🔒 No | 25 MB |
| `import-assets` | 🔒 No | 30 MB |
| `temp-assets` | 🔒 No | 20 MB |

---

## 1. `website-assets`

**Public: Yes**

| Field | Value |
|-------|-------|
| Purpose | Business website images, AI Imagen-generated images, hero/gallery/logo media |
| Upload | owner, admin, staff (within their tenant) |
| Read | Anyone (public CDN URL) |
| Allowed MIME | `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/svg+xml` |
| Max size | 10 MB |

**Path format:**
```
tenants/{tenantId}/website/{category}/{pageId_or_global}/{sectionId_or_global}/{fileName}
```

**Examples:**
```
tenants/abc/website/generated/home/hero/image.png          ← AI-generated
tenants/abc/website/uploads/global/logo.png                ← manual upload
tenants/abc/website/gallery/home/gallery-001.jpg           ← section gallery
```

---

## 2. `product-assets`

**Public: Yes**

| Field | Value |
|-------|-------|
| Purpose | E-commerce product images, galleries, thumbnails, variants |
| Upload | owner, admin, staff (within their tenant) |
| Read | Anyone (public CDN URL) |
| Allowed MIME | `image/jpeg`, `image/png`, `image/webp`, `image/gif` |
| Max size | 15 MB |

**Path format:**
```
tenants/{tenantId}/products/{productId}/{fileName}
```

**Examples:**
```
tenants/abc/products/prod-123/main.png
tenants/abc/products/prod-123/gallery-001.webp
```

---

## 3. `spin-360-assets`

**Public: Yes**

**Canonical bucket for all 360° spin content** — consolidates the legacy `product-360`, `product-360-spins`, and `spin-images` buckets.

| Field | Value |
|-------|-------|
| Purpose | 360° spin frames, Midjourney frames, hotspot overlays, 3D viewer media |
| Upload | owner, admin, staff (within their tenant) |
| Read | Anyone (public CDN URL) |
| Allowed MIME | `image/jpeg`, `image/png`, `image/webp` |
| Max size | 25 MB per file |

**Path format:**
```
tenants/{tenantId}/360/{productId}/{packageId}/frames/frame_{NNN}.png
tenants/{tenantId}/360/{productId}/{packageId}/cover.webp
tenants/{tenantId}/360/{productId}/{packageId}/hotspots/{fileName}
```

**Examples:**
```
tenants/abc/360/prod-123/pkg-456/frames/frame_001.png
tenants/abc/360/prod-123/pkg-456/cover.webp
```

---

## 4. `brand-assets`

**Public: Yes**

| Field | Value |
|-------|-------|
| Purpose | Tenant logos, favicons, OG images, dark/light variants, app icons |
| Upload | owner, admin, staff (within their tenant) |
| Read | Anyone (public CDN URL) |
| Allowed MIME | `image/jpeg`, `image/png`, `image/webp`, `image/svg+xml`, `image/x-icon` |
| Max size | 5 MB |

**Path format:**
```
tenants/{tenantId}/brand/{assetType}/{fileName}
```

**Examples:**
```
tenants/abc/brand/logo/logo-dark.png
tenants/abc/brand/favicon/favicon.ico
tenants/abc/brand/social/og-image.png
```

---

## 5. `customer-assets`

**Public: No — private bucket, signed URLs required**

| Field | Value |
|-------|-------|
| Purpose | Customer avatars, order attachments, account documents |
| Upload | admin/owner for any customer in their tenant; customer for their own path |
| Read | admin/owner for tenant; customer for their own `customers/{id}/` path |
| Allowed MIME | `image/jpeg`, `image/png`, `image/webp`, `application/pdf`, `text/plain` |
| Max size | 20 MB |

**Path format:**
```
tenants/{tenantId}/customers/{customerId}/{category}/{fileName}
```

**Examples:**
```
tenants/abc/customers/cust-789/avatar/profile.png
tenants/abc/customers/cust-789/orders/ord-001/attachment.pdf
```

---

## 6. `appointment-assets`

**Public: No — private bucket, signed URLs required**

| Field | Value |
|-------|-------|
| Purpose | Appointment before/after photos, service images, notes attachments |
| Upload | owner, admin |
| Read | owner, admin (tenant); customer if appointment is linked to their account |
| Allowed MIME | `image/jpeg`, `image/png`, `image/webp`, `application/pdf` |
| Max size | 20 MB |

**Path format:**
```
tenants/{tenantId}/appointments/{appointmentId}/{fileName}
```

---

## 7. `damage-assessment-assets`

**Public: No — private bucket, signed URLs required**

| Field | Value |
|-------|-------|
| Purpose | Car rental damage AI photos, before/after vehicle inspection, damage reports |
| Upload | owner, admin |
| Read | owner, admin only (no customer read — serve via signed URL in API response) |
| Allowed MIME | `image/jpeg`, `image/png`, `image/webp`, `application/pdf` |
| Max size | 30 MB |

**Path format:**
```
tenants/{tenantId}/damage/{vehicleId_or_bookingId}/{assessmentId}/{fileName}
```

---

## 8. `document-assets`

**Public: No — private bucket, signed URLs required**

| Field | Value |
|-------|-------|
| Purpose | Contracts, receipts, PDFs, internal files, payment proof |
| Upload | owner, admin |
| Read | owner, admin (tenant only) |
| Allowed MIME | `application/pdf`, `text/plain`, `application/json`, `image/jpeg`, `image/png`, `image/webp` |
| Max size | 25 MB |

**Path format:**
```
tenants/{tenantId}/documents/{category}/{recordId_or_global}/{fileName}
```

---

## 9. `import-assets`

**Public: No — private bucket**

| Field | Value |
|-------|-------|
| Purpose | Website scraper imported images, Yelp/Google imports, raw source media for AI autofill |
| Upload | owner, admin |
| Read | owner, admin |
| Note | Files may be promoted to `website-assets` after approval |
| Allowed MIME | `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `text/plain`, `application/json` |
| Max size | 30 MB |

**Path format:**
```
tenants/{tenantId}/imports/{importJobId}/{fileName}
```

---

## 10. `temp-assets`

**Public: No — private bucket, short-lived**

| Field | Value |
|-------|-------|
| Purpose | Draft AI images, pending uploads, processing files |
| Upload | owner, admin for tenant; customer for their own `temp/{userId}/` path |
| Read | owner, admin for tenant; customer for their own path |
| Note | Files should be cleaned up after processing |
| Allowed MIME | `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `application/pdf`, `text/plain` |
| Max size | 20 MB |

**Path format:**
```
tenants/{tenantId}/temp/{userId}/{timestamp}-{fileName}
```

---

## Code usage

### Import constants

```typescript
import { STORAGE_BUCKETS } from '@/lib/storage/buckets'

// Use constants everywhere — never hardcode bucket names:
const bucket = STORAGE_BUCKETS.WEBSITE_ASSETS     // 'website-assets'
const bucket = STORAGE_BUCKETS.SPIN_360_ASSETS    // 'spin-360-assets'
const bucket = STORAGE_BUCKETS.PRODUCT_ASSETS     // 'product-assets'
```

### Server-side upload (API routes / server actions)

```typescript
import { uploadFile } from '@/lib/storage/uploadFile'
import { STORAGE_BUCKETS } from '@/lib/storage/buckets'

const result = await uploadFile({
  bucket:    STORAGE_BUCKETS.WEBSITE_ASSETS,
  tenantId:  'abc-123',
  pathParts: ['website', 'generated', 'planId'],
  fileName:  'hero.png',
  buffer:    imageBuffer,
  mimeType:  'image/png',
  upsert:    true,
})
// result.publicUrl is populated for public buckets
// result.signedUrl is populated when withSignedUrl: true for private buckets
```

### Get file URLs

```typescript
import { getPublicFileUrl, createSignedFileUrl, getFileUrl } from '@/lib/storage/getFileUrl'
import { STORAGE_BUCKETS } from '@/lib/storage/buckets'

// Public bucket
const url = getPublicFileUrl(STORAGE_BUCKETS.WEBSITE_ASSETS, 'tenants/abc/website/logo.png')

// Private bucket — signed URL
const url = await createSignedFileUrl(STORAGE_BUCKETS.CUSTOMER_ASSETS, path, 3600)

// Auto-select based on bucket type
const url = await getFileUrl(bucket, path)
```

### Delete files

```typescript
import { deleteFile, deleteFiles, deleteFilesByPrefix } from '@/lib/storage/deleteFile'

await deleteFile(STORAGE_BUCKETS.SPIN_360_ASSETS, storagePath)
await deleteFilesByPrefix(STORAGE_BUCKETS.SPIN_360_ASSETS, `tenants/${tenantId}/360/${productId}/${packageId}/`)
```

---

## Testing storage

### 1. Check all buckets exist

```bash
GET /api/storage/health
Authorization: owner session cookie
```

Response:
```json
{
  "ok": true,
  "checkedAt": "2026-05-04T00:00:00.000Z",
  "buckets": [
    { "name": "website-assets", "exists": true, "expectedPublic": true, "actualPublic": true, "status": "ok" },
    ...
  ],
  "errors": []
}
```

### 2. Test upload to a specific bucket

```bash
POST /api/storage/test-upload
Content-Type: application/json
Authorization: owner session cookie

{
  "bucket": "website-assets",
  "tenantId": "your-tenant-uuid"
}
```

Response:
```json
{
  "ok": true,
  "bucket": "website-assets",
  "path": "tenants/uuid/temp/storage-test-1234567890.txt",
  "publicUrl": "https://....supabase.co/storage/v1/object/public/website-assets/...",
  "sizeBytes": 92,
  "mimeType": "text/plain"
}
```

---

## Security notes

- `SUPABASE_SERVICE_ROLE_KEY` is **never** exposed to client code.
- All upload helpers in `lib/storage/` are marked `server-only`.
- Private bucket files are served via **signed URLs** only — never public URLs.
- Path traversal (`../`) is rejected by `assertSafeStoragePath()`.
- File names are sanitized by `sanitizeFileName()` before upload.
- MIME types and file sizes are validated before upload by `assertAllowedMimeType()` and `assertFileSizeWithinLimit()`.
