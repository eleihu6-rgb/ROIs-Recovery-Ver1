# Main Merge Validation

Date: 2026-09-10. Merge input: main 4fac3a6 and feature branch ca7882d.

## Scope

Merge shared agent instructions and complete Cost Library wiring: Legality navigation, view selection, menu permissions, persisted selection, API registration, and architecture references. The cost components/calculators were already present on main through 4fac3a6. Pairing Build Automation was already present through 3b1a173 / ec46357 and remains included. Auto-assignment work in the original worktree is separate and excluded.

Two add/add documentation conflicts differed only in trailing spaces; main formatting was preserved.

## Verification Commands

Working directory: isolated merge worktree. Existing dependency directories and the built compute-fdp binary were linked for validation. Secrets were loaded through the original live-server environment file without printing or copying them into Git.

From live-server:

```sh
node --env-file=/Users/kimi/DevOps/ROIs-Recovery-Ver1/live-server/.env ./node_modules/vitest/vitest.mjs run src/services/cost/cost-calculator.test.ts src/services/cost/cost-library-service.test.ts src/routes/cost/cost-library.test.ts src/__tests__/services/pairing/roundtrip-chooser.test.ts src/__tests__/services/pairing/roundtrip-build.test.ts src/__tests__/services/pairing/roundtrip-routes.test.ts src/__tests__/services/pairing/pairing-build-service.test.ts
./node_modules/.bin/tsc --noEmit
```

PASS: 68 tests in seven files; backend typecheck PASS. Initial test invocation lacked DATABASE_URL and the Rust binary in the new worktree; rerun passed after supplying those existing prerequisites.

From gantt: `./node_modules/.bin/tsc --noEmit` PASS.

From e2e:

```sh
GANTT_BASE_URL=https://cr.rois.one GANTT_API_URL=http://127.0.0.1:3000 ./node_modules/.bin/playwright test --config=config/cost-library.config.ts
GANTT_BASE_URL=https://cr.rois.one ./node_modules/.bin/playwright test --config=config/roundtrip-builder.config.ts --grep 'RT-read-only'
```

PASS: four cost tests in 32.3s; one pairing-builder read-only test in 7.6s. Browser workflows ran through the public site, navigating the actual UI. Cost-suite setup/verification/cleanup uses the existing local backend API. The public target is Ryan's personal preference, not a required team endpoint.

The isolated merged frontend was typechecked. Public-site acceptance validates the running checkout, not a newly deployed merge SHA; compared cost/roundtrip feature source has no differences between the feature and merge trees. No production deployment or database migration was performed by this merge task.

Root `npm run check:ui`: PASS, zero hard violations, 124 existing warnings. `git diff --check`: PASS after resolving the whitespace conflicts.

## Snapshot Evidence

Same-run public-site captures under docs/assets/screenshots/:

- crew-recovery/cost-library-gh-compare-workbench-Ver25.png: visually inspected; comparison cash values and credit chart visible.
- crew-recovery/cost-library-sets-mobile-Ver16.png: visually inspected; existing expanded navigation leaves the mobile content narrow, with substantial word wrapping. This remains a usability limitation.
- crew-recovery/cost-library-required-fields-desktop-Ver17.png and cost-library-required-fields-mobile-Ver17.png.
- crew-recovery/cost-library-policy-desktop-Ver15.png.
- gantt/roundtrip-builder-readonly-interior-preview-Ver8.png: visually inspected; Pairing Build Automation scope, rotation preview, rest intervals, and build controls visible.
- gantt/roundtrip-builder-readonly-complete-Ver8.png: inspected; final Live screen visible.

Earlier localhost cost validation passed two tests but failed the pinned-revision calculation result assertion; the fourth test did not run. No product/test assertions were weakened. The subsequent complete public-site run passed all four; the localhost-only failure remains unexplained and is not represented as a passing run. Earlier local captures are retained separately by version.

The pairing test deliberately reuses the ten retained acceptance pairings without replaying the write-heavy acceptance run. See roundtrip-builder-acceptance.md for the earlier build receipt and bulk-orchestration limits.
