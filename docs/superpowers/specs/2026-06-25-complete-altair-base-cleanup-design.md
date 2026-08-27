# Complete Altair Base Cleanup Design

## Goal

Finish the Gantt frontend base-path migration from `/fpqe/gantt/` to `/altair/` across active configuration, deployment snippets, and runnable scripts.

## Scope

Change active references that would navigate to or serve the Gantt app under `/fpqe/gantt/`:

- Playwright local config defaults.
- Gantt standalone E2E scripts.
- Gantt production/performance URL checks.
- Dev/UAT nginx snippet for the Gantt static frontend.

Do not change:

- Backend API prefixes: `/fpqe/live`, `/fpqe/rule`, `/fpqe/engine`, `/fpqe/ai`.
- PBS Portal base path: `/fpqe/pbs/`.
- Historical dated docs, unless they are active deploy snippets.
- Negative tests that intentionally assert `/fpqe/gantt/` is no longer a valid Gantt route.

## Verification

- Search active code/config for remaining `/fpqe/gantt`.
- Run URL sync unit tests.
- Type-check Gantt.
- Smoke public `/altair/*` routes and confirm old `/fpqe/gantt/` is not serving Gantt.
