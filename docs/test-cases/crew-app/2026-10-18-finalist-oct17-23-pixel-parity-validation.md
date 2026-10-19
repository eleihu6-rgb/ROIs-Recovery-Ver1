# Finalist Oct 17-23 pixel-parity validation

Status: failing baseline captured. App build 228 adds the seven-date native capture.

Compare the real Finalist Daily screens on the connected iPhone with the Crew App Schedule daily planner on iPhone Air for 17-23 October 2026. Validation covers duty/event content, chronological ordering, section grouping, right-side 24-hour rail geometry, typography, spacing, icons, weather placement, and visible viewport density. Store versioned screenshots for every date from both apps and use image comparison metrics plus visual inspection; structural XCUITest assertions alone are not sufficient.

Real Finalist references are under `docs/assets/screenshots/crew-app/finalist-reference-oct17-23/`. The Crew App capture is `DuoFitUITests/testFinalistOct17To23PixelParity` and writes `crew-finalist-oct<day>-air-Ver<N>.png` into the same evidence root.

Run `crew-app/scripts/compare-finalist-week.py` after the native capture. It normalizes both 420-point phone canvases, excludes unrelated status/tab chrome, and fails if either grayscale pixel MAE or structural edge difference exceeds its recorded threshold. A metric pass still requires visual inspection.

## Ver1 / Crew capture Ver5 result

- Real Finalist Oct 17-23: captured through iphone-use from `ca.poco.Finalist` on the connected 420x912-point iPhone.
- Crew App Oct 17-23: focused XCUITest PASS, 1 test / 0 failures / 143.566 seconds on iPhone Air. All seven day-detail screenshots exist and were visually inspected.
- Deterministic pixel comparison: FAIL on all seven dates. Pixel MAE range `0.1975-0.2078` exceeds the `0.18` ceiling; edge-difference range is `0.0806-0.1172`, within the `0.25` ceiling.
- Main visible gaps: Finalist's large date/weekday header, Notes block and weather forecast band are absent; date navigation sits at the top instead of Finalist's bottom carousel; the graphite/yellow visual language differs from the Crew carrier-blue canvas; Crew rows have looser typography/metadata spacing.
- Report: `docs/assets/screenshots/crew-app/finalist-oct17-23-pixel-report-Ver1.json`.

