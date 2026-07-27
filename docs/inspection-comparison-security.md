# Inspection Comparison and Repair Security

All new tables carry tenant IDs, use row-level security, and require the Van Damage AI module. Authenticated reads require active tenant membership. Mutations require tenant administration. Service-role policies support workers, but application queries still include explicit tenant predicates.

Cross-tenant child references are rejected by database triggers. The comparable-prior resolver also requires the same tenant and canonical van before pairing evidence.

Evidence rows reference private `van_damage_images` IDs. No signed URL, provider key, prompt, raw provider payload, or model identifier is stored in comparison/repair workflow rows or shown in tenant-facing UI. Existing signed-image endpoints authorize tenant access and provide temporary URLs.

Human review APIs do not trust a client-supplied tenant ID. They resolve user context server-side, require active module access, scope every lookup/update by the authenticated tenant, and return sanitized errors.
