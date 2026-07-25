# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

ApexCRM serves business owners, tenant administrators, operational staff, and customers. Owners and administrators configure modules and oversee the business. Staff process day-to-day work such as fleet inspections, maintenance, appointments, orders, payments, and customer activity. Customers use only the tenant-facing experiences their role permits.

## Product Purpose

ApexCRM is a multi-tenant CRM and operations platform. It brings business workflows, operational exceptions, records, reporting, integrations, and tenant-configured modules into one workspace so users can identify problems and take action quickly.

Success means that each user sees only the modules and records relevant to their tenant and role, understands what changed, and can complete the next safe action without hunting across disconnected tools.

## Positioning

The product combines a module-aware CRM with an operational command center. Active-module resolution, role-aware dashboards, Action Required, What Changed Today, private media, and integrated workflows turn tenant data into a prioritized operating system instead of a collection of disconnected admin pages.

## Operating Context

- Multi-tenant businesses use the product throughout the workday on desktop, tablet, and mobile.
- Fleet operators receive inspection images from Slack, run automated damage analysis, review evidence, manage vehicles, and create or complete maintenance work.
- Service businesses manage appointments, customers, staff, payments, rewards, and communications.
- Commerce businesses manage products, orders, payments, customers, rewards, and inventory.
- Owners configure tenant access through the module and package systems.
- Operational users work from dashboards, Action Required, What Changed Today, reports, notifications, notes, attachments, and detail workflows.

## Capabilities and Constraints

- Next.js, Supabase, and Vercel are established platform architecture.
- `tenant_id` is the tenant source of truth.
- Tenant-specific active modules and role permissions determine navigation, data access, search, realtime subscriptions, actions, and reporting.
- Supported product areas include Fleet, Van Damage AI, Maintenance, Appointments, Store, Payments, Customers, Rewards, Website Builder, Action Required, Smart Setup, Staff Activity, Reports, notes and attachments, notifications, AI assistants, What Changed Today, package management, and Slack integration.
- Inspection and maintenance Slack channels remain separate and may not be saved as the same channel.
- Private files stay private. The application generates short-lived media access when needed and does not persist permanent signed URLs.
- Existing Row Level Security and server authorization remain authoritative.
- Infrastructure Configuration and Inspection Metadata are platform-owner-only.
- Customer-facing AI language remains provider-neutral.
- White-label tenant branding may influence the accent and logo but may not override semantic safety colors, accessible focus, or legibility.
- Inactive modules are not queried for presentation and are absent from user-facing navigation and global discovery.

## Brand Commitments

- Product name: ApexCRM.
- Voice: direct, operational, calm, and specific.
- Experience: expensive, precise, responsive, accessible, enterprise-grade, and quietly powerful.
- The interface must feel distinctive without becoming theatrical.

## Evidence on Hand

The repository contains production application routes, shared shell components, active-module resolution, permission helpers, tenant configuration, database migrations with RLS, private-media routes, worker code, and automated tests. Product metrics and customer claims not present in tenant data must not be fabricated.

## Product Principles

1. Tenant and role boundaries are product behavior, not a presentation filter.
2. Show the current state and the next safe action before secondary detail.
3. Dense operations should feel calm through hierarchy, proximity, and progressive disclosure.
4. Automation explains its evidence and never pretends to replace human responsibility.
5. Repeated workflows become faster through consistent patterns, keyboard access, and contextual actions.

## Accessibility & Inclusion

The authenticated product must support keyboard-only use, visible focus, screen-reader names and status announcements, touch targets suitable for mobile use, zoom and narrow viewports, WCAG AA contrast, and a useful reduced-motion experience. Motion may not delay or block task completion.
