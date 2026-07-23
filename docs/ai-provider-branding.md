# AI provider branding

ApexCRM presents AI capabilities with provider-neutral product language. Tenant-facing pages, messages, reports, errors, and metadata use labels such as **AI Analysis**, **Damage Analysis**, and **AI image generation**. They do not expose foundation-model vendors, model IDs, API endpoints, raw provider responses, or provider stack traces.

Provider-specific SDK names, environment variables, and model identifiers remain only where they are required for server-side compatibility. Existing deployment variables continue to work; this change does not rename or rotate credentials. Those details belong in private infrastructure configuration and must never be sent to browser diagnostics or tenant-facing errors.

Application routes translate provider failures into safe guidance. A failed automated inspection remains saved and available for human review. AI findings are operational assistance, not a final safety determination; authorized personnel remain responsible for verification.

When adding an AI-backed feature:

- Use provider-neutral component names and user copy.
- Keep credentials and raw responses server-side.
- Store only the provider detail needed for private operations and audit.
- Return a safe application error to the browser.
- Verify customer-facing fixtures, notifications, exports, and documentation with a case-insensitive branding search.
