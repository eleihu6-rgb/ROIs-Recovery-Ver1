# Cost Library Implementation Plan

**Goal:** Deliver the approved cost library UI backed by remote SIT PostgreSQL.
**Architecture:** Five dedicated versioned configuration tables, authenticated
live-server service/routes, existing Legality shell and server calculations.
**Tech Stack:** PostgreSQL, Fastify, Zod, React, @rois/ui, Vitest, Playwright.
**Spec:** ../specs/2026-09-10-cost-library-pg-design.md

## Global Constraints

No new dependencies, no UAT writes, no secrets in artifacts, no automatic git
commit/push. Preserve existing user work and earlier mockups. All team members
read the shared HTTP contract before implementing. Parent owns migration and
runtime coordination; backend/UI workers own disjoint modules; GPT-5.5 owns tests.

## Task 1: Schema and Repeatable Installation (root)

- [x] Add `sql/migration/2026-09-10-cost-library.sql` with spec tables/constraints.
- [x] Add `sql/seed/2026-09-10-cost-library.sql`: 17 templates and default set,
  insert only, never replace user prices. Resolve FKs by business keys.
- [x] Add `live-server/scripts/install-cost-library.mjs` reading DATABASE_URL;
  explicit apply flag, transaction, target schema checks, no credential logging.
- [x] Run on configured SIT twice; verify equal business rows and correct FKs.
- [x] Document same commands for a supplied other-environment DATABASE_URL;
  migrations synchronize structure/defaults, not destructive data replication.

## Task 2: Backend (backend worker)

- [x] Read existing Legality auth/routes and service patterns.
- [x] Implement calculator and validation in `services/cost/` with spec inputs.
- [x] Implement transactions, sequence locks, pinned revision membership,
  dependency-safe copying/deletion and stale-update protection.
- [x] Register `routes/cost/cost-library.ts` in existing server entry point.
- [x] Provide GPT-5.5 test worker exported signatures and run targeted typecheck.

## Task 3: UI (UI worker)

- [x] Read Legality guides; add API/types and `components/cost/` components.
- [x] Add sidebar keys and view dispatch; preserve rule navigation.
- [x] Build tree, sets, rows, AppDialogs and per-cost server workbenches.
- [x] Verify saved version presentation, readonly permission and stale errors.
- [x] Run UI standard gate and targeted typecheck; inform test worker readiness.

## Task 4: Regression Gates (GPT-5.5 test worker)

- [x] Unit test GH: `expect(amount).toBe(712.5)` and below-GH `0`; standby
  assignment6.75, excluded baseline, invalid dates and rounding.
- [x] Cover quantity/fixed/minimum/bands/booking/unpriced calculators.
- [x] Test API auth, 001 protection, concurrency/stale revisions and FK safety.
- [x] Playwright real login -> Cost Sets -> edit/save -> reload -> assert value;
  test templates/copies, set CRUD, members/revisions and each calculator type.
- [x] Capture same-run versioned desktop/mobile screenshots, inspect them.
- [x] Report exact commands and receipts; resolve failures with owning worker.

## Final Integration (root)

- [x] Review changes, rerun focused gates and `npm run check:ui`/`git diff --check`.
- [x] Leave usable local dev URL, deployment SQL instructions and test report.
- [x] Save developer context using project memory workflow.

## Delivery Receipt

Backend: 31 focused tests passed, including real PostgreSQL integration.
Playwright: 3 workflows passed in 13.4 seconds using GPT-5.5; scratch records
were removed and seed templates were unchanged. Desktop/mobile screenshots
were captured in the same run. The existing mobile shell leaves a narrow
working area; desktop is the primary supported planning surface.
Gantt typecheck and UI gate passed (0 hard violations; 124 existing warnings).
See `docs/test-cases/crew-recovery/cost-library.md` and
`docs/test-cases/crew-recovery/cost-library-pw.md` for exact commands.
Installation instructions: `docs/modules/crew-recovery/cost-library-database.md`.
Other environments were not deployed. No automatic recovery selection or
payroll integration is included. No commit or push was performed.
