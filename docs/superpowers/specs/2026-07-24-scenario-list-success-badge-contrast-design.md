# Scenario List Success Badge Contrast Design

## Goal

Improve readability of the Scenario list success labels, especially the scenario id badge for RO scenarios and the optimized roster count label such as `272 results`, on selected or hover-highlighted rows.

## Problem

The current success treatment uses a very light emerald background with emerald text. In the Scenario list, that text is rendered over a light selected-row background, so the visual contrast is weaker than compact filled badges such as the blue `SIT` badge in the top bar.

## Selected Approach

Use a low-noise success badge with:

- Background: `#DFF7EA`
- Text: `#065F46`
- Border: none
- Weight: semibold

This keeps the Scenario list professional and dense while making the green labels easier to scan. It avoids white text on a light green background, which would reduce contrast, and it avoids a border so the badge stays visually quiet in the dense list.

## Scope

Modify only `gantt/src/components/scenario/scenario-list-item.tsx` and its focused test.

The change applies to:

- RO scenario id badge.
- Optimized roster count badge when `optimizedCount > 0`.

Zero-result rows remain visually neutral.

## Non-Goals

- No data refresh changes.
- No status logic changes.
- No layout restructuring.
- No new dependency.
- No broad color theme redesign.

## Testing

Update the existing `ScenarioListItem` test to assert the new success badge classes and the zero-result neutral behavior.

Run:

- `npm --prefix gantt run test -- src/components/scenario/__tests__/scenario-list-item.test.tsx --run`
- `npm --prefix gantt exec -- tsc -p gantt/tsconfig.json --noEmit`
- `npm run check:ui`
- `GANTT_BASE_URL=http://localhost:5566 GANTT_API_URL=https://crew-f8-usva-sit.roiscloud.com/live GANTT_TEST_USER=<user> GANTT_TEST_PASS=<pass> npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps tests/gantt/scenario-id-badge.spec.ts --reporter=list` from `e2e/`

For visual QA, open the Scenario list and confirm the selected-row `698` and `N results` labels are clearer on the light gray selected background.
