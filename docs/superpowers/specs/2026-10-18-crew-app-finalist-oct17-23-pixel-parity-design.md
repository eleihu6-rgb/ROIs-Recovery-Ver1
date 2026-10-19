# Crew App Finalist Oct 17-23 pixel-parity design

## Goal

Make the Crew App Schedule selected-day planner visually and behaviorally match Finalist's real iPhone Daily view for 17-23 October 2026, using the connected iPhone as the reference and iPhone Air as the Crew App target.

## Scope

- Capture all seven Finalist dates through iphone-use and retain versioned reference images.
- Capture the same dates from the native Crew App through XCUITest.
- Compare the date-matched content canvas at pixel/layout level: day identity, weather band, chronological rows, Morning/Afternoon/Evening sections, icons, typography, spacing, visible density, overlap lanes, durations, and 24-hour rail.
- Preserve Crew App navigation and carrier/account boundaries outside the selected-day content canvas.
- Keep calendar notes, locations, Teams actions, overnight clipping, and one-row/one-rail-span behavior.

## Acceptance

- A focused native test produces seven Crew App screenshots and asserts each selected date and planner/rail surface.
- A deterministic host comparison reports every date, image dimensions, normalized pixel difference, and structural/layout difference. The test fails when any date exceeds the approved tolerance.
- Human visual review confirms that a passing metric did not hide missing rows, overlaps, clipped text, or incorrect rail placement.
- Focused Jest, TypeScript, native iPhone Air UI test, UI-standard check, and diff check pass; the reference and generated screenshots are reported.

## Risks

- Finalist and Crew App have different global chrome and color ownership. Pixel comparison must crop/normalize the selected-day content canvas rather than claim whole-screen identity.
- Weather is time-sensitive. Compare layout and presence using captured reference data; do not require a live condition to remain unchanged.
- Simulator Calendar fixtures and published roster rows can duplicate duties. The existing semantic deduplication remains the source of truth and must be asserted before visual comparison.
