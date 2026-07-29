# Image security and tenant isolation

Security rules for van damage evidence:

- tenant id is the source of truth
- business id must match tenant id when present in worker jobs
- private object keys must start with `tenants/{tenant_id}/`
- no Slack private URLs, provider tokens, API keys, or signed URLs are persisted as tenant-facing data
- signed URLs are short-lived and created only after `resolveVanDamageAccess`
- owner operations use platform-owner authorization, not tenant-admin authorization

The worker and API routes use tenant-scoped database queries before reading or issuing access to object storage.
