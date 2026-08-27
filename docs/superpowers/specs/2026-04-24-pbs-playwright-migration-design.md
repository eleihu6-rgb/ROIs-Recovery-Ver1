# PBS Portal Playwright Migration Design

Date: 2026-04-24

## Goal

Move `pbs-portal` Playwright coverage fully into the shared repo-level `/e2e` test system and delete the local `pbs-portal` Playwright setup.

## Scope

- Migrate the existing `pbs-portal` smoke spec into `/e2e/tests/pbs-portal/`
- Run the smoke spec under the shared `pbs-portal` Playwright project
- Remove local `pbs-portal` Playwright config and local E2E test entrypoints
- Update operational scripts and README references to use shared `/e2e`

## Out of Scope

- Rewriting the existing shared `pbs-portal` page objects or auth fixtures
- Expanding coverage beyond the migrated smoke flow
- Changing app behavior or auth behavior

## Current State

There are two Playwright entrypoints for PBS Portal:

1. Shared repo-level Playwright in `/e2e`
2. Local `pbs-portal` Playwright config plus `pbs-portal/e2e/portal-smoke.spec.ts`

This duplicates tooling, splits ownership, and causes operational drift in scripts such as `verify-pbs.sh`.

## Decision

Use the shared `/e2e` system as the single Playwright source of truth for PBS Portal.

The migrated smoke test remains a standalone PBS Portal smoke flow, but it lives under:

- `/e2e/tests/pbs-portal/portal-smoke.spec.ts`

and runs with:

- `npm run test:pbs-portal -- --no-deps tests/pbs-portal/portal-smoke.spec.ts`

from the `/e2e` workspace.

## Migration Plan

### 1. Test migration

- Copy the local portal smoke test into the shared `/e2e/tests/pbs-portal/` tree
- Keep its current mocked auth/session behavior
- Ensure it does not inherit authenticated storage state by default

### 2. Local cleanup

- Delete:
  - `pbs-portal/playwright.config.ts`
  - `pbs-portal/e2e/portal-smoke.spec.ts`
- Remove `@playwright/test` and the local `test:e2e` script from `pbs-portal/package.json`
- Remove the empty `pbs-portal/e2e/` directory if no files remain

### 3. Operational updates

- Update `scripts/verify-pbs.sh` so `--with-e2e` runs the shared `/e2e` PBS Portal smoke spec
- Update `pbs-portal/README.md` to point contributors to the shared `/e2e` commands

## Acceptance Criteria

- `pbs-portal` no longer contains a local Playwright config or local Playwright spec
- Shared `/e2e` can run the migrated PBS Portal smoke test successfully
- `verify:pbs:e2e` uses the shared `/e2e` flow instead of the deleted local one
- Operational docs point to the shared test entrypoint

## Risks

- The shared PBS auth/page-object layer is older than the local smoke spec and may not match every current app convention
- The smoke test must stay isolated from shared authenticated storage state so guest/login flows remain deterministic

## Validation

- `cd e2e && npm run test:pbs-portal -- --no-deps tests/pbs-portal/portal-smoke.spec.ts`
- `cd pbs-portal && npm run build`
- `bash ./scripts/verify-pbs.sh --with-e2e`
