# Cost Library Visual Parity Test Report

Date: 2026-09-10

Scope: real Gantt UI Playwright coverage for the PostgreSQL-backed Cost Library visual parity pass, including catalogue hierarchy, set/member workflows, pinned revisions, GH/standby workbench comparison charts, stale-result clearing, responsive screenshots, and cleanup of UI-created copies/sets.

## Commands

```bash
npm run build --prefix live-server
npm test --prefix live-server -- src/services/cost/cost-calculator.test.ts src/services/cost/cost-library-service.test.ts src/routes/cost/cost-library.test.ts
cd e2e && npx playwright test --config=config/cost-library.config.ts --list
cd e2e && npx playwright test --config=config/cost-library.config.ts
```

## Results

- Backend focused cost gate: PASS, 31/31 tests.
- Playwright list/compile: PASS, 3 tests discovered.
- Playwright focused cost-library suite: PASS, 3/3 tests in 14.2s after final screenshot QA adjustments.

## Visual Checks

- `cost-library-gh-compare-workbench-Ver5.png`: GH comparison shows Crew A `$712.50`, Crew B `$0.00`, cash difference `$712.50`, HH:MM before/after bars, and visible amber GH markers.
- `cost-library-standby-compare-workbench-tall-Ver2.png`: tall desktop standby comparison shows eligible standby `02:00`, standby credit `01:00`, total assignment credit `06:45`, Crew A/B bars, cash comparison, and baseline replacement row.
- `cost-library-standby-mobile-chart-Ver2.png`: mobile viewport capture frames Crew A/B standby bars and cash band after shell sidebar collapse.
- `cost-library-standby-mobile-breakdown-bottom-Ver1.png`: mobile viewport capture frames the full breakdown table bottom, including baseline standby credit replaced.

## Assertions Added

- Cost table heading, selected tree `aria-pressed`, expanded row `data-expanded`, expanded-row left-border computed color.
- GH marker computed `borderLeftColor` differs from chart background and has non-zero width.
- GH compare mode: Crew A 84 + 6.75 vs Crew B 70 + 6.75 produces `$712.50`, `$0.00`, `$712.50`, `90:45`, `76:45`, with cash assertions scoped to each crew result block.
- Edited GH floor after saving shows `GH 86:00` in the chart.
- Standby compare mode: shared 07:00-10:00, pairing 5.75, Crew A 84 vs Crew B 70 produces the same cash comparison with standby HH:MM KPIs.
- Stale-result guard: editing Crew B input clears the previous comparison result before recalculation.
- Mobile screenshots capture chart and breakdown scroll positions with page viewport screenshots, avoiding cropped oversized element captures.
