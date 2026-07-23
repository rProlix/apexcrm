# Slack channel routing

Each business uses its existing Slack OAuth installation and chooses channels by immutable Slack channel ID. Channel display names are refreshed from Slack, so a rename does not change routing.

Inspection image channels use the `damage_inspection` purpose. One separately selected channel may use the `maintenance` purpose. A database uniqueness constraint, server validation, settings controls, and pre-ingestion routing prevent a channel or Slack event from entering both workflows.

Maintenance ingestion can be disabled without deleting its saved mapping. Archived or inaccessible mappings remain visible for audit, are reported as unhealthy, and cannot create new maintenance records. Administrators can select a replacement and test routing health.

Public channel discovery requires `channels:read`; accessible private channel discovery requires `groups:read`. Driver attribution requires `users:read`. Reconnect Slack to grant a missing scope. The app must be invited to any selected channel. Tokens remain encrypted server-side and are never returned to the browser.
