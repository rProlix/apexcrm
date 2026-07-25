# Quick Peek

## Purpose

Quick Peek gives enough safe context to make the next navigation decision without discarding list
position, filters, or the surrounding workflow.

## Architecture

`QuickPeekProvider` is mounted once in `DashboardShell`. Triggers dispatch a typed request. The
provider calls `GET /api/command-center/quick-peek`, which authenticates through the Command Center
context and loads an explicit safe projection from `lib/command-center/quickPeek.ts`.

Supported types are vehicle, inspection, maintenance, customer, appointment, order, and action.
Each loader:

- asserts the required active module;
- applies the authenticated tenant ID and record ID;
- applies additional permission or staff-assignment rules;
- selects only fields required by the preview;
- creates follow-up links only for active, authorized modules.

AI provider/model details, raw responses, infrastructure data, secrets, and private image URLs are
not selected or serialized.

## Interaction

The drawer opens from the trigger's vertical position on desktop and as a bottom-origin full-width
sheet on mobile. It locks background scroll, moves focus to Close, traps Tab, closes with Escape or
backdrop, and restores focus to the trigger. Browser history receives a `peek` marker; Back closes
the preview before leaving the underlying page.

Loading uses a stable skeleton. Missing, forbidden, and temporary failures show an explicit
unavailable state and never invent data.

## Rollback

Individual triggers can be replaced with their existing full-page links while leaving the provider
mounted. If the preview API is disabled, full record routes remain authoritative.
