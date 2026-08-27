# Scenario Detail Success Badge Contrast Design

## Goal

Apply the same readable no-border success palette to the two Scenario detail badges circled in the screenshot:

- Basic Info `Type` badge when the scenario type is `RO`.
- Detail header status badge when the scenario status is `DONE`.

## Selected Approach

Use the already-approved success treatment:

- Background: `#DFF7EA`
- Text: `#065F46`
- Border: none
- Weight: semibold

This matches the Scenario list `RO` id and positive `N results` badges from the prior task while keeping the detail panel quiet and readable.

## Scope

Modify only the Scenario detail type/status badge styling and touched tests.

The change applies to:

- `gantt/src/components/scenario/scenario-basic-info.tsx` for `TYPE_BADGE.RO`.
- `gantt/src/components/scenario/scenario-detail-panel.tsx` for `STATUS_BADGE_CLASS.DONE`.
- Focused component tests and the existing Scenario badge Playwright coverage.

## Non-Goals

- No changes to Scenario list styling.
- No changes to status lifecycle logic.
- No changes to PO/TO/RUNNING/FAILED/PUBLISHED palette.
- No layout changes.
- No new dependencies.

## Testing

Run:

- `npm --prefix gantt run test -- src/components/scenario/__tests__/scenario-basic-info.test.tsx src/components/scenario/__tests__/scenario-detail-panel.test.tsx --run`
- `npm --prefix gantt exec -- tsc -p gantt/tsconfig.json --noEmit`
- `npm run check:ui`
- From `e2e/`: `GANTT_BASE_URL=http://localhost:5566 GANTT_API_URL=https://crew-f8-usva-sit.roiscloud.com/live GANTT_TEST_USER=<user> GANTT_TEST_PASS=<pass> npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps tests/gantt/scenario-id-badge.spec.ts --reporter=list`

For manual visual QA, open the Scenario list/detail and confirm the Basic Info `RO` badge and header `Done` badge use the same readable pale green / deep green treatment.
