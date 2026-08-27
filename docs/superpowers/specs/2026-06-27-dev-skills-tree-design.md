# Dev Tab Project Skills Tree Design

Date: 2026-06-27

## Context

Ryan wants the Dev tab left sidebar to include a `Skill` tree. Each project skill should appear as a sub-tree item ordered by the existing numeric convention where present. Selecting a skill should show details on the right side, including what the skill is about, what it does, how to use it, and useful supporting metadata.

## Decision

Add generated skill data to the Gantt Dev tab. A Node script reads `.agents/skills/**/SKILL.md` and writes a static TypeScript data module consumed by the frontend. This keeps browser code simple and ensures newly added project skills appear in the web app after normal dev/build generation, without manual UI edits.

## Scope

In scope:

- Add `gantt/scripts/generate-dev-skills-data.mjs`.
- Generate `gantt/src/components/dev/dev-skills-data.generated.ts`.
- Add a `Skill` tree section in `gantt/src/components/dev/dev-sidebar.tsx`.
- Add a skill detail panel in `gantt/src/components/dev/dev-view.tsx`.
- Extend `gantt/src/stores/dev-store.ts` for skill selection.
- Add/update Playwright coverage in `e2e/tests/gantt/dev-tab.spec.ts`.
- Bump `FRONTEND_VERSION`.

Out of scope:

- Runtime editing of skills from the browser.
- Server API for skill discovery.
- Changing skill file contents beyond consuming them.

## UI Behavior

- The sidebar keeps existing module enhancement navigation.
- A new `Skill` tree appears below Modules.
- Skills sort by numeric prefix first, then non-numbered names alphabetically.
- Left click or right click on a skill selects it and shows details on the right.
- Detail page includes purpose, overview, function/workflow, how to use, resources, source path, and metadata.

## Verification

- Generator command succeeds and produces valid TypeScript data.
- Playwright verifies `Skill` tree visibility and `108-npbs-bids-portal-simulation` details.
- `npm run check:ui` passes after frontend style changes.
- Relevant Gantt build/test command passes.
