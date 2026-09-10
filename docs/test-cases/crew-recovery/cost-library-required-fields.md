# Cost Library Required Fields Test Report

Date: 2026-09-10

Scope: real Gantt UI Playwright regression for Cost Library required-field affordances and client-side calculate blocking. No seed writes. Backend calculator math was unchanged in this bounded UI pass.

## Commands

```bash
cd e2e && npx playwright test --config=config/cost-library.config.ts --list
cd e2e && npx playwright test --config=config/cost-library.config.ts
```

## Current Result

- Playwright list/compile: PASS, 4 tests discovered in `tests/gantt/cost-library.spec.ts`.
- Focused Cost Library UI suite: PASS, 4/4 tests in 17.1s.

Earlier backend cost gate for the same Cost Library surface remains recorded in `docs/test-cases/crew-recovery/cost-library.md`: `npm run build --prefix live-server` PASS and focused live-server cost tests PASS, 31/31. It was not rerun for this final screenshot-targeting-only pass.

## Required-Fields Assertions

- Required field labels expose a Required icon/tooltip while optional inputs stay unmarked.
- Required inputs have native `required` and `aria-required="true"`; optional inputs have `aria-required="false"` and no required marker.
- Missing required fields set `aria-invalid="true"`, attach field-level error text through `aria-describedby`, show destructive red outline/error text, and focus the first invalid input.
- Blank required fields block `/api/cost-library/calculate`; zero (`0`) is accepted and clears the missing-field error before calculation.
- GH compare missing shared `Additional credit (hours)` blocks the request while Crew A/B monthly credit values remain valid.
- GH compare accepts `Additional credit (hours) = 0`, clears the missing-field error, and calculates successfully.
- GH compare blocks again when Crew B `Monthly credit before (hours)` is cleared, and marks Crew B only.
- Standby single-crew mode blocks on missing `Report (UTC)`, `Pairing departure (UTC)`, and `Pairing credit (hours)`.
- The first invalid standby field receives focus.

## Screenshot Evidence

- `docs/assets/screenshots/crew-recovery/cost-library-required-fields-desktop-Ver3.png`: desktop GH compare, shared Additional credit missing, required markers and red field-level validation visible.
- `docs/assets/screenshots/crew-recovery/cost-library-required-fields-crew-b-desktop-Ver2.png`: desktop GH compare after zero clears shared field, Crew B monthly credit missing only.
- `docs/assets/screenshots/crew-recovery/cost-library-required-fields-mobile-Ver3.png`: mobile standby workbench with invalid Report, Departure, and Pairing credit fields visible.
