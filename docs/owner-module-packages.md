# Owner module packages

The platform owner can manage reusable product bundles at `/owner/packages`.
Packages are built from the canonical `MODULE_REGISTRY`; they do not introduce a
second module catalog.

## Applying a package

Applying a package is an exact replacement operation:

- modules included in the package are enabled;
- other registered modules are disabled;
- existing per-module configuration is preserved;
- the operation is atomic;
- the previous state and applied module list are recorded in
  `tenant_module_package_applications`.

The UI always names the target business and requests confirmation before this
operation. Manual module controls remain available at `/owner/modules`.

## Package benefits

Benefits are customer-facing labels. They can describe connected experiences
such as Slack inspections, reports, or staff activity without creating fake
module keys. Access remains anchored to the real package module dependencies.

## Seed packages

The migration provides four editable starting packages:

- Fleet Starter
- Fleet Pro
- Salon Starter
- Retail Pro

Archiving a package prevents future application but does not alter businesses
that previously received it.

## Daily operational newspaper

The dashboard’s **What changed today** panel uses the tenant’s configured
timezone and only queries active module data. Fleet summaries include
inspection volume, distinct vans needing review, newly detected Level 3 damage,
maintenance changes, and active van dispatch warnings. The panel is the
authoritative foundation for a future scheduled email delivery channel.
