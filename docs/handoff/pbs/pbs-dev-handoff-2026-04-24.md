# PBS Dev Handoff — 2026-04-24

## Scope

This handoff captures the Playwright migration that moved PBS Portal E2E ownership from the local `pbs-portal` workspace into the shared repo-level `/e2e` system.

## What Changed

- Migrated the local PBS Portal smoke spec into the shared E2E tree:
  - `/Users/lei/Codehub/rois-ai/e2e/tests/pbs-portal/portal-smoke.spec.ts`
- Deleted the local PBS Portal Playwright setup:
  - `/Users/lei/Codehub/rois-ai/pbs-portal/playwright.config.ts`
  - `/Users/lei/Codehub/rois-ai/pbs-portal/e2e/portal-smoke.spec.ts`
- Removed local Playwright script/dependency from:
  - `/Users/lei/Codehub/rois-ai/pbs-portal/package.json`
- Updated the PBS verification flow so `--with-e2e` runs the shared smoke spec:
  - `/Users/lei/Codehub/rois-ai/scripts/verify-pbs.sh`
- Updated contributor documentation:
  - `/Users/lei/Codehub/rois-ai/pbs-portal/README.md`

## Important Operational Decisions

### Shared smoke runs with `--no-deps`

The migrated portal smoke spec currently runs through:

```bash
cd /Users/lei/Codehub/rois-ai/e2e
npm run test:pbs-portal -- --no-deps tests/pbs-portal/portal-smoke.spec.ts
```

This is intentional.

The shared `pbs-setup` auth flow under `/e2e/tests/pbs-portal/auth.setup.ts` still reflects older PBS auth assumptions (`localStorage`, old test IDs). The migrated smoke spec is self-contained and mocks `/api/auth/session`, so it should not depend on the shared auth bootstrap.

### Shared Playwright `webServer` paths were hardened

`/Users/lei/Codehub/rois-ai/e2e/config/playwright.config.ts` previously used brittle relative `cd ../gantt` / `cd ../pbs-portal` commands. These were replaced with absolute-path commands derived from `repoRoot` so repo-level Playwright works consistently regardless of invocation location.

## Validation Status

Passed:

- `cd /Users/lei/Codehub/rois-ai/pbs-portal && npm run build`
- `cd /Users/lei/Codehub/rois-ai/e2e && npm run test:pbs-portal -- --no-deps tests/pbs-portal/portal-smoke.spec.ts`
- `cd /Users/lei/Codehub/rois-ai && bash ./scripts/verify-pbs.sh --with-e2e`

## Known Follow-Up

The shared PBS E2E support layer still has older auth/page-object assumptions:

- `/Users/lei/Codehub/rois-ai/e2e/tests/pbs-portal/auth.setup.ts`
- `/Users/lei/Codehub/rois-ai/e2e/pages/pbs-portal/pbs-login-page.ts`
- `/Users/lei/Codehub/rois-ai/e2e/fixtures/pbs/auth.fixture.ts`

These are not blockers for the smoke migration because the smoke path now uses `--no-deps`, but they should be modernized before expanding shared PBS Portal E2E coverage beyond this smoke suite.
