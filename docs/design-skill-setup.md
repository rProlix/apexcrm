# Design skill setup

## Installed project skills

The premium design pass used project-scoped skills so the guidance is reproducible with the repository:

- `emil-design-eng` and `review-animations` from `emilkowalski/skill`
- `design-taste-frontend` from `Leonxlnx/taste-skill`
- Impeccable in `.cursor/skills/impeccable`, including its pre-edit hook

The exact resolved sources and hashes are recorded in `skills-lock.json`. Installation used the
repository-local Skills CLI (`npx skills add …`) and Impeccable installer. `npx skills list --json`
and `npx impeccable check` were used to verify the result.

## Runtime and discovery

- Initial Node version: `v26.3.1`
- Node version used for installation: `v26.3.1`
- No project runtime pin required a Node change.
- Agent-compatible skills are under `.agents/skills`.
- Impeccable is under `.cursor/skills` and `.cursor/hooks.json` registers its pre-edit hook.

Terminal verification confirms the files and manifests. Cursor Nightly's graphical skill-discovery
indicator cannot be proven from a headless terminal; reopen the repository in a current Cursor build
if the UI does not refresh its skill list.

## Guidance hierarchy

1. Product truth, tenant isolation, permissions, and accessibility.
2. Existing repository architecture and established design language.
3. Impeccable context, hierarchy, typesetting, layout, motion, polish, and audit guidance.
4. Emil's interaction-motion principles and animation review.
5. Taste Skill's enterprise density and visual-coherence review.

Conflicts are resolved in that order. Decorative motion never overrides clarity, performance,
reduced-motion preferences, or a safety workflow.

## Context initialization

Impeccable context initialization ran once for `app`. It found an incumbent product but no durable
product or design context, so `PRODUCT.md` and `DESIGN.md` were created from the implementation brief
and verified repository facts. They intentionally contain no secrets or private tenant data.

## Update and rollback

Review upstream changes before updating a locked skill. If a skill update degrades the workflow,
restore the previous directories and `skills-lock.json` from Git. Removing `.cursor/hooks.json`
disables the Impeccable pre-edit hook; removing a skill directory removes only design guidance, not
application runtime behavior.
