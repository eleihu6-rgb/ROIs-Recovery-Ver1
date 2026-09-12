# Recovery Help verification — 12 September 2026

## Delivered scope

Six Help articles, category between Live and Scenario, with the separate Cost Library introduction immediately after the workflow. Cases are 102 Standby Crew callout, 103 Swap duty and 104 Flight Delay (Partial). All 19 pushed cost types and seven calculation methods are documented, including units, defaults, formulas and worked examples.

Public UI target: https://cr.rois.one. Both new Playwright suites log in through the actual UI and start from Live. Public Help includes this source patch via the existing running development service; no commit, push, merge, deployment, tariff save or live roster Save was performed. The public recovery implementation is older than the pushed baseline studied (98f63ec9a38173128723e96440010a7423979a42).

## Commands and results

Commands ran in the isolated pushed-baseline worktree `/Users/kimi/DevOps/.worktrees/recovery-help-102-104`, in the indicated subdirectory.

| Directory | Exact command | Result |
|---|---|---|
| e2e | `GANTT_BASE_URL=https://cr.rois.one npx playwright test -c config/playwright.config.ts --project=gantt tests/gantt/help/help-recovery.spec.ts --reporter=list --no-deps` | PASS 1/1; six articles, category/topic order, search, all 19 cost rows, seven formula methods, exact image counts, loaded images ≥200px, no premature recovery image requests, horizontal overflow check; 22 scroll snapshots |
| e2e | `GANTT_BASE_URL=https://cr.rois.one npx playwright test -c config/playwright.config.ts --project=gantt tests/gantt/help/help-recovery-cost-capture.spec.ts --reporter=list --no-deps` | PASS 1/1; real catalogue, GH/standby USD 712.50 versus USD 0, standby 01:00 credit, delay USD 500, membership inspected and cancelled |
| e2e | `GANTT_BASE_URL=https://cr.rois.one npx playwright test -c config/playwright.config.ts --project=gantt tests/gantt/help/help-navigation.spec.ts --reporter=list --no-deps --workers=2` | PASS 9/9 |
| gantt | `npx tsc -b --pretty false` | PASS after final Help edits |
| gantt | `npx vitest run src/services/__tests__/recovery-candidates.test.ts src/services/__tests__/recovery-draft.test.ts src/services/__tests__/recovery-swap-duty.test.ts src/services/__tests__/recovery-flight-delay.test.ts src/services/__tests__/recovery-trigger.test.ts --reporter=dot` | PASS 66/66 |
| live-server | `npx vitest run src/services/cost/cost-calculator.test.ts --reporter=dot` | PASS 15/15 |
| root | `npm run check:ui` | PASS, zero hard violations, 124 existing warnings |
| root | `git diff --check` | PASS |
| root | `node scripts/check-help-menu-coverage.mjs` | FAIL: existing Legality submenu missing helpTopicSlug and missing System Interface Help topic; also reproduced against baseline registry |

The global menu coverage failure remains a release gate; this task does not claim a fully green repository. Full Help suite and live Save/recheck end-to-end recovery were not run. The 66 recovery tests validate pushed source, not the older public business deployment. Cases 103/104 use explicitly labelled contributor screenshots for the submitted operational UI; the fresh public screenshots below validate the new Help content, not operational execution of those cases.

## Visual review

All 22 final article scroll captures below were visually inspected: readable text, complete table coverage across scroll positions, working embedded images and no horizontal clipping. Viewport boundaries overlap to preserve continuity. Seven embedded assets total 666,376 bytes, below the 1 MB Help budget. GH and standby were recaptured at a taller viewport to include the entire workbench and formula footer; the article uses Ver3 for those two images. Earlier captures remain under docs as evidence; unused duplicate captures are excluded from public assets.

- [recovery-help-recovery-102-page-1-Ver1.png](../../assets/screenshots/gantt/recovery-help-recovery-102-page-1-Ver1.png)
- [recovery-help-recovery-102-page-2-Ver1.png](../../assets/screenshots/gantt/recovery-help-recovery-102-page-2-Ver1.png)
- [recovery-help-recovery-103-page-1-Ver1.png](../../assets/screenshots/gantt/recovery-help-recovery-103-page-1-Ver1.png)
- [recovery-help-recovery-103-page-2-Ver1.png](../../assets/screenshots/gantt/recovery-help-recovery-103-page-2-Ver1.png)
- [recovery-help-recovery-103-page-3-Ver1.png](../../assets/screenshots/gantt/recovery-help-recovery-103-page-3-Ver1.png)
- [recovery-help-recovery-104-page-1-Ver1.png](../../assets/screenshots/gantt/recovery-help-recovery-104-page-1-Ver1.png)
- [recovery-help-recovery-104-page-2-Ver1.png](../../assets/screenshots/gantt/recovery-help-recovery-104-page-2-Ver1.png)
- [recovery-help-recovery-104-page-3-Ver1.png](../../assets/screenshots/gantt/recovery-help-recovery-104-page-3-Ver1.png)
- [recovery-help-recovery-cost-library-page-1-Ver1.png](../../assets/screenshots/gantt/recovery-help-recovery-cost-library-page-1-Ver1.png)
- [recovery-help-recovery-cost-library-page-2-Ver1.png](../../assets/screenshots/gantt/recovery-help-recovery-cost-library-page-2-Ver1.png)
- [recovery-help-recovery-cost-library-page-3-Ver1.png](../../assets/screenshots/gantt/recovery-help-recovery-cost-library-page-3-Ver1.png)
- [recovery-help-recovery-cost-library-page-4-Ver1.png](../../assets/screenshots/gantt/recovery-help-recovery-cost-library-page-4-Ver1.png)
- [recovery-help-recovery-cost-library-page-5-Ver1.png](../../assets/screenshots/gantt/recovery-help-recovery-cost-library-page-5-Ver1.png)
- [recovery-help-recovery-cost-library-page-6-Ver1.png](../../assets/screenshots/gantt/recovery-help-recovery-cost-library-page-6-Ver1.png)
- [recovery-help-recovery-cost-library-page-7-Ver1.png](../../assets/screenshots/gantt/recovery-help-recovery-cost-library-page-7-Ver1.png)
- [recovery-help-recovery-cost-library-page-8-Ver1.png](../../assets/screenshots/gantt/recovery-help-recovery-cost-library-page-8-Ver1.png)
- [recovery-help-recovery-cost-library-page-9-Ver1.png](../../assets/screenshots/gantt/recovery-help-recovery-cost-library-page-9-Ver1.png)
- [recovery-help-recovery-costs-page-1-Ver1.png](../../assets/screenshots/gantt/recovery-help-recovery-costs-page-1-Ver1.png)
- [recovery-help-recovery-costs-page-2-Ver1.png](../../assets/screenshots/gantt/recovery-help-recovery-costs-page-2-Ver1.png)
- [recovery-help-recovery-overview-page-1-Ver1.png](../../assets/screenshots/gantt/recovery-help-recovery-overview-page-1-Ver1.png)
- [recovery-help-recovery-overview-page-2-Ver1.png](../../assets/screenshots/gantt/recovery-help-recovery-overview-page-2-Ver1.png)
- [recovery-help-recovery-overview-page-3-Ver1.png](../../assets/screenshots/gantt/recovery-help-recovery-overview-page-3-Ver1.png)

## Reusable record

[Study and source map](2026-09-12-cases-102-104-study-Ver1.md). The Live/Scenario playbook links the study as an extension contract for future recovery cases. The supporting gpt-5.6-sol audit covered Git attribution, Help test scaffolding and catalogue calculations; the primary agent implemented the final articles and reviewed the request adapter, tests and screenshots.
