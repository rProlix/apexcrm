# Infrastructure Configuration access

Infrastructure Configuration is platform operational tooling, not tenant settings.
Only a user whose canonical `public.users.role` is exactly `owner` may access it.
Tenant `admin`, staff, and customer roles do not inherit platform access.

`lib/auth/platform-owner.ts` is the centralized source for page, server-action, and
API authorization. The owner page is `/owner/infrastructure`; its navigation entry is
rendered only in the server-resolved owner shell. The infrastructure health API uses
the same owner check and returns a safe `401` or `403` before reading configuration.

The browser receives only booleans, neutral labels, deployment environment, and a
check timestamp. It never receives tokens, passwords, private keys, secret values, or
signed URLs. Audit records capture access, health checks, and rejected authenticated
requests without sensitive payloads.

Tenant Slack settings remain tenant-scoped and available to users with the existing
Slack-management permission. Selecting inspection and maintenance channels is not
platform infrastructure access.
