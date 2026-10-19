# Crew Schedule KPI — Floating Summary implementation design

Date: 2026-10-19  
Audience: next implementation agent  
Decision: use **Option 02, Floating Summary**. This supersedes the earlier recommendation of Option 01.  
Deliverable for this turn: design/handoff document only; no app or mockup changes.

## 1. Selected reference and exact scope

Use the Floating Summary preview in [the consolidated review](../../assets/mockups/crew-app/schedule-kpi-design-review-Ver2.html). Select the relevant device and orientation, then inspect Option 02. The latest user screenshot shows the schedule grid with a small floating card at bottom-right and the navigation dock at bottom-center.

Implement that option. The only visual revision requested after selecting it is: **enlarge the floating KPI summary in landscape**. Interpretation: enlarge the panel and its readable contents, not the device viewport, schedule cards, calendar, navigation dock, or browser review page. Portrait keeps the selected Floating Summary appearance.

Preserve the existing schedule/calendar/duty-card interactions, theme, bottom navigation and carrier/account isolation. Do not implement the Calendar Summary or Full KPI Panel alternatives. The three-option selector belongs to the review artifact, not the product.

## 2. Landscape enlargement

The screenshot's floating panel is approximately 355 CSS pixels wide in the prototype; it is too small relative to the landscape duty grid. Replace that fixed width with responsive panel geometry based on the **usable app viewport** after safe areas and the Duo action strip.

Initial implementation targets (logical points / layout units, not screenshot pixels):

| Reference landscape | Viewport | Target panel width | Typical panel height | Value text |
|---|---|---:|---:|---:|
| Air | 912 × 420 | about 480–500 | about 150–175 | 22–24 |
| Duo | 951 × 669 | about 520–560 | about 170–195 | 24–26 |
| iPad | 1210 × 834 | about 620–660 | about 180–210 | 26–28 |

These are engineering starting targets, not new theme-token constants or hardcoded device-name branches. Reuse existing typography/spacing tokens, useLayout and safe-area utilities. Choose responsive breakpoints from available geometry. Validate on the actual layouts before finalizing dimensions.

- Anchor the larger panel at bottom-right of the content safe area, above navigation. Respect the Duo status/action strip and any hinge exclusion.
- Use roughly 18–22 internal padding, 14–20 between metric groups, and the current rounded carrier-themed surface. Increase content typography together with the panel.
- Preserve the three metric groups: 28-day flight hours, 7-day duty hours, and 90-day take-offs/landings. Keep the selected-date/projected header and “All limits” action.
- Give take-offs and landings their own labelled progress lines within the recency group. Do not combine their meaning into an unexplained “4 / 4”.
- Keep hours and recency value/label/bar treatment consistent. If a long “Over by …” value cannot fit, wrap it cleanly; never clip a value or shrink the entire panel to illegibility.
- Keep the panel compact enough that duty content remains useful. Let the full detail sheet contain the six-window breakdown.
- Size the panel from content; allow height growth for a breach banner and accessibility text. The typical heights above are not clipping limits.
- Reserve sufficient end-of-list inset so the final duty can scroll completely above the panel. Recompute this from the measured panel height plus dock/safe-area clearance; do not assume the old small-panel inset is still sufficient.
- The panel must not cover navigation, the selected-date strip, the right-side action rail, or a duty control that cannot otherwise be scrolled into view.
- Rotating preserves selected date, scroll context and any open detail state. Reflow the panel without resetting the roster.
- Use real native viewport geometry. Never stretch a portrait screenshot into landscape or scale the whole product UI to make the panel appear larger.

## 3. Visible metric behavior

Hours use counted block/DP time and available headroom. Keep exact minutes in calculation; round only for display.

| Case | Main value | Secondary text | Progress line |
|---|---|---|---|
| Flight 36h against 100h | 64.0h left | 36.0h / 100h limit | normal carrier accent, 36% |
| Flight exactly 100h | 0h · at limit | 100h / 100h limit | full |
| Flight 104.5h against 100h | Over by 4.5h | 104.5h / 100h · OVER LIMIT | red, visually capped at 100% |
| TO or LDG count 2 | 1 needed | 2 / 3 minimum | amber, two-thirds filled |
| TO or LDG count 3 | 0 | 3 / 3 minimum | normal accent, full |
| TO or LDG count 4 | +1 | 4 / 3 minimum | normal accent, full |
| TO or LDG count 5 | +2 | 5 / 3 minimum | normal accent, full |

User instruction: replace “Minimum met” with the numeric surplus. +1 means current 4 minus minimum 3. It does not mean one operation is still needed. Retain the count/minimum subtitle to make this unambiguous.

The user explicitly requested different bar colors for exceeded hours and deficient recency. Use existing semantic tokens where available; introduce only the tokens required if absent. Pair colors with text, not color alone.

Show an alert if **any of the six hour windows** is exceeded, including windows absent from the floating headline. Do not imply that all limits are satisfied merely because the visible 28-day flight and 7-day duty figures are below their caps.

Loading, missing/incomplete history and stale data must be visibly distinct from zero usage or full availability.

## 4. Date anchor and calculations

Use the calculation/data-quality contract in [the original KPI design](2026-10-19-crew-schedule-kpi-options-Ver1.md). The reference HTML uses illustrative snapshots and is **not** the production calculation engine.

The selected date is the end of a **backward-looking** window. Default to a clearly labelled end-of-selected-day projection in the configured regulatory/base calendar zone. Do not silently use the device's timezone or convert consecutive local days into fixed elapsed hours.

For a selected date of **17 October 2026**, inclusive day ranges are:

| Metric | Window | Cap/minimum |
|---|---|---|
| Duty | 11–17 October | 60h / 7 days |
| Duty | 4–17 October | 110h / 14 days |
| Duty | 20 September–17 October | 190h / 28 days |
| Block flight time | 20 September–17 October | 100h / 28 days |
| Block flight time | 1 January–17 October 2026 | 900h / calendar year |
| Block flight time | November 2025 through 17 October 2026 | 1,000h / 12 calendar months |
| TO and LDG | 20 July–17 October | minimum 3 each / 90 days |

Only count records within the selected projection horizon. Selecting 17 October excludes flights after 17 October. Preserve authoritative handling of activities crossing midnight or a window boundary; resolve allocation rules from the applicable operator profile before production implementation.

User-approved simplification for flight crew: one operating flight contributes one take-off and one landing. Exclude cancelled/deadhead/non-flight records. Keep the result labelled as a roster estimate and distinguish planned/projected from completed contributions. Never double count planned and actual versions.

Use DP/report-to-release for duty hours, not FDP. Deduplicate published duty totals repeated on flight legs. Complete annual/12-month history is required; the displayed month alone is insufficient. Use the applicable configured rule profile instead of applying hardcoded EASA constants to every airline.

## 5. Interaction contract

- Tap a top-calendar day: immediately set selectedDate, update all summary values, then position the roster at that date.
- Swipe duties up/down: once the leading visible duty day settles, update selectedDate, calendar highlight and summary together. Use a stable tie-break for multi-column rows.
- Suppress viewability feedback during a programmatic calendar-tap scroll. An empty selected day remains selected even if the list positions near another day's duty.
- Fast navigation must not show old results under a new date; ignore stale asynchronous responses.
- Tap the floating panel / All limits: open the existing-style detail sheet containing flight 28-day/year/12-month, duty 7/14/28-day and separate TO/LDG rows, exact date ranges, and data/projection state.
- Close the sheet: preserve the roster's selection and scroll position.
- Keep the selected date visible on both summary and detail sheet. No new instant scrubber is requested.

LogTen inspired the pinned reference date, expandable details and contributing-record concept. Its inspected headline availability did not consistently move with expanded scheduled totals, so copying its arithmetic or labels is not justified. Observation evidence is recorded in the original design.

## 6. Source integration guide

Inspect current source and module instructions before editing; the worktree contains substantial unrelated/concurrent changes.

| Source | Integration concern |
|---|---|
| crew-app/src/features/v2/ScheduleScreen.tsx | Floating overlay, selected date, calendar/list synchronization, viewability and scroll inset |
| crew-app/src/components/v2/useLayout.ts | Responsive geometry, dock clearance, Duo action strip |
| crew-app/src/theme/carrier.ts | Carrier palette and semantic visual tokens |
| crew-app/src/features/v2/dutyGroups.ts | Existing duty grouping and repeated published DP/block totals |
| crew-app/src/features/travel/portalCapture.ts | Published dpMinutes/blockMinutes and source provenance |
| crew-app/src/features/v2/model.ts and schedView.ts | Current roster presentation; month totals alone cannot supply long history |
| crew-app/__tests__/features/scheduleRosterViews.test.tsx | Existing schedule interaction regression entry point |

These are inspected discovery locations, not a requirement to modify every file. Preserve current architecture and source ownership. Do not add fabricated annual totals or infer missing duty history. If required history or authoritative allocation cannot be obtained, surface unavailable/incomplete state and report the exact missing contract.

The existing ScheduleScreen separates active and calDay and has a ref-held viewability callback. Check current mappings/closures across month changes when integrating; do not blindly copy the HTML scroll implementation.

## 7. Implementation and verification handoff

1. Read root/module guides, current layout tokens, source adapters and relevant tests. Preserve dirty changes. Confirm available historical coverage and operator rule definitions.
2. Implement a shared pure calculation path and view model, then the Floating Summary and its existing-style detail surface. Scope the new presentation to the selected Schedule view; do not propagate it to unrelated screens without a requirement.
3. Apply the landscape enlargement above; retain the selected portrait appearance.
4. Run focused calculation tests: all boundary dates, year/month transitions, actual/planned replacement, repeated duty totals, missing coverage, cancellation, over/at-limit and TO/LDG surplus/deficit.
5. Validate real calendar taps, vertical scrolling, open/close detail, fast navigation and rotation. Assert actual user-visible values and preserve selection/scroll state.
6. Capture/inspect screenshots at Air, Duo and iPad in both orientations, normal/exceeded/shortfall states, with account isolation for TG and PR. Follow the module's real native-driver workflow and root screenshot versioning rules. HTML browser checks do not substitute for native app validation.
7. Run focused Jest, TypeScript and required UI checks using current package scripts; bump the integer app version when product code changes, as required by the module guide.
8. Report exact commands and PASS/FAIL, screenshot paths and any unrun checks. Do not claim the mockup's illustrative data proves the live calculation.
9. Do not commit, push, deploy or change production roster data without the applicable explicit user authorization.

## 8. Completion criteria

Floating Summary is the only selected option in the product. Landscape is visibly larger and readable on all three reference devices; portrait remains aligned with the selected reference. Calendar/duty scrolling keeps all KPIs anchored to the same date. Hour excess is red and labelled “Over by”; each TO/LDG row has a progress line and a signed surplus or explicit deficit. The panel/detail/dock never prevent access to the last duty or primary controls. Verification proves live data and user behavior rather than only fixture rendering.

## 9. Current artifact status

The consolidated HTML is self-contained and includes all three review alternatives, all device/orientation combinations and normal/exception fixtures. Syntax/fixture assertions passed previously; browser automation was unavailable, and no production/native KPI feature has been implemented or validated in this session.

This document selects Floating Summary and specifies its landscape enlargement. It does not claim that enlargement is already applied to the HTML or app.

