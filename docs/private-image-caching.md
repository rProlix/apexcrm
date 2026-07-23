# Private image caching

Inspection images and Fleet maintenance attachments share one private-media cache architecture. Both remain in private S3 objects and are resolved only through tenant-authorized API routes.

The server caches temporary signed URLs by tenant, business, resource type, resource ID, and response mode until shortly before expiry. The browser cache deduplicates simultaneous requests, reuses unexpired metadata during navigation, lazily loads visible media, and retries once with a refreshed URL after an image error.

Signed URLs are temporary and are never written to the database. Responses use private cache headers and vary by authenticated cookies. Every lookup validates the authenticated tenant and business before resolving the S3 object. An inaccessible or cross-tenant resource returns an application error rather than a storage URL.
