# Crew Schedule: selected-date KPI design options

Date: 2026-10-19. Status: three concepts for selection; production implementation is outside this design deliverable.

## Requested behavior

Add flight-time, duty-time and 90-day take-off/landing indicators to the Schedule list illustrated by the supplied iPhone and tablet screenshots. Use the active calendar date as the calculation anchor. Swiping the duty list up/down updates that date and the KPIs; tapping a calendar day updates the KPIs and moves the list. Preserve the existing carrier palette and bottom navigation.

Explicit user assumption: each operating flight contributes one take-off and one landing for flight crew. Both counters therefore equal the number of qualifying flights. Planned flights can affect projected recency; distinguish this from completed-flight recency. Exclude cancelled flights, deadheading and non-flight duties from these counters. This assumption simplifies EASA recent-experience evidence and must be labelled as a roster estimate rather than verified PF experience.

## Three layouts

1. Calendar summary (recommended). A compact card immediately below the calendar shows 28-day flight remaining, 7-day duty remaining, and both recency counts. Expand for all six limits and exact window dates. Put an explicit warning indicator on the collapsed card if ANY hidden window exceeds its limit; do not imply overall compliance from the two displayed metrics.
2. Floating summary. Put the same compact figures above the bottom dock, leaving the schedule viewport larger. Tap opens an anchored detail sheet with all windows. Closing restores the exact list position. Do not cover the last duty: bottom content inset must include both summary and navigation heights.
3. Full KPI panel. Show six slim progress bars plus recency counts beneath the calendar. On wide layouts place the panel beside the schedule; keep the calendar above both. On phones allow the panel to collapse so it cannot consume the entire duty viewport.

All options use the sample's emphasis: large remaining figure at right; period plus numeric limit at left; smaller used/maximum label; thin used/limit progress bar. Use a text status as well as visual emphasis. At a cap show “0h remaining · at limit”; above it show “Over by Xh”, never negative “available”. Recency uses minimum/deficit semantics (“2 / 3 · 1 needed”), not a maximum or available count. Calculate from integer minutes and round only for display; provide exact hours/minutes in details.

## Calculation contract

The default design is an end-of-selected-day projection, clearly labelled “Through D · base time · projected”. Set T to the exclusive start of D+1 in the operator-configured regulatory calendar zone. UI display-zone changes must not silently change regulatory boundaries. Use timezone-aware dates; seven local calendar days need not equal 168 elapsed hours across DST.

| Metric | Start, inclusive | End, exclusive | Maximum / minimum |
|---|---|---|---|
| Duty, 7 days | D minus 6 calendar days at 00:00 | T | 60h max |
| Duty, 14 days | D minus 13 calendar days at 00:00 | T | 110h max |
| Duty, 28 days | D minus 27 calendar days at 00:00 | T | 190h max |
| Block, 28 days | D minus 27 calendar days at 00:00 | T | 100h max |
| Block, calendar year | 1 January in D's year at 00:00 | T | 900h max |
| Block, 12 calendar months | First day of D's month minus 11 calendar months | T | 1,000h max |
| Take-offs / landings, 90 days | D minus 89 calendar days at 00:00 | T | 3 each min |

For 19 October 2026 the 7-day range is 13–19 October, the 14-day range is 6–19 October, the 28-day range is 22 September–19 October, and the 90-day range is 22 July–19 October. The 12-calendar-month bucket is November 2025–October 2026, evaluated only through the selected day. It is neither 365 days nor a timestamp minus twelve months.

Use actual completed records where available and planned records for not-yet-completed portions; never add both versions of the same flight. Show actual/planned contributions separately in detail. Deduplicate duty totals repeated on multiple legs. Duty time is report-to-release DP, including applicable ground duties/positioning/standby contributions according to the operator rule profile; it is not FDP or flight time. Exclude personal EventKit meetings unless they are authoritative operator duties.

For duties/flights crossing a window boundary, reuse the operator's authoritative legality allocation policy. Do not silently prorate published DP totals or reassign an entire cross-midnight duty to its departure date. A proposed interval-overlap calculation needs explicit agreement with that policy before production implementation. Handle completed, cancelled and reassigned records consistently with that source.

Remaining for each cap = cap - counted minutes. It is headroom for that particular window, not an assurance another duty is legal. Full legality still includes rest, FDP and the requirement to spread the 28-day duty total as evenly as practicable. A snapshot at day-end does not prove every earlier duty in that day was compliant: production calculation must also check each relevant duty-end checkpoint and disclose any violation.

## Date and scroll behavior

### Added review requirements

Landscape prototypes include Air 912×420, Duo 951×669 and iPad 1210×834. Open the landscape gallery in docs/assets/mockups/crew-app/schedule-kpi-landscape-gallery-Ver1.html; choose device, concept and exception state. Air's full panel scrolls to remaining rows; larger layouts keep all limits beside the duty grid.

Hours above the cap use a red bar, red “Over by Xh” text and an explicit OVER LIMIT label. At 104.5h against 100h, show “Over by 4.5h”, never “-4.5h left”. A compact alert reports breaches across all six windows, including hidden ones.

Take-offs and landings each use the same label/value/subtitle/progress-line layout as hours. A count of 2 fills two-thirds of the line in amber and shows “1 needed” with “2 / 3 minimum”. At 3, show “0”; above 3, show the surplus (4 shows “+1”, 5 shows “+2”) instead of “Minimum met”; cap the visual fill at 100% while retaining the actual count. The user explicitly requested this semantic color distinction.

The portrait and landscape HTML previews expose Within limits / Hours exceeded / TO-LDG short / Both states. Static exception example: docs/assets/mockups/crew-app/schedule-kpi-exceptions-Ver1.png. These remain design fixtures; production logic is not installed.

- Keep a single selectedDate state for calendar, active day and KPI anchor. Existing ScheduleScreen has separate active/calDay states: unify their update path for this feature.
- Calendar tap owns selection immediately. During its programmatic list scroll, ignore viewability events until scroll settles. An empty day retains its selected date even if the list positions at the nearest duty.
- User scrolling chooses the top clearly visible duty day after a brief settle; do not recalculate for every pixel. In two-column layouts use the leading visible row and a stable earliest-date tie-break.
- Use current month/list mappings in current closures; ScheduleScreen currently retains onViewable in a ref, so inspect stale mapping behavior across months when integrating.
- Cancel or ignore stale asynchronous results during fast navigation. Never show old figures under a new anchor date.
- Scrolling backward must remove later planned contributions and restore records that re-enter the window. A rest day can still have high accumulated hours or lose recency when an old flight drops out.
- If future instant scrubbing is chosen after observing LogTen, label the exact timestamp. Do not equate day-end with now or silently convert calendar-day windows into 168/336/672-hour windows.

## Data and affected modules

Read-only source inspection: crew-app/src/features/v2/ScheduleScreen.tsx provides calendar/list synchronization; dutyGroups.ts groups duties and prevents published totals repeated on legs from being summed repeatedly. travel/portalCapture.ts exposes published dpMinutes and blockMinutes; model.ts and schedView.ts provide month-level presentation. These are integration points, not a new authority.

Current month totals are insufficient for year/12-month windows. Production needs complete crew/carrier-scoped historical coverage and roster revisions. Distinguish loading, unavailable, stale and incomplete history; never display full headroom or “current” when history is missing. Take-off/landing counts follow the user's flight-count assumption; aircraft-type scope must remain visible.

The first live release should source configurable limits from the applicable rule profile, not hardcode EASA caps for TG/PR users. The mockup uses explicit EASA example constants because it is a design fixture.

## Artifacts and verification

- Consolidated review entry: docs/assets/mockups/crew-app/schedule-kpi-design-review-Ver2.html. One self-contained HTML embeds all three independent interactive previews; no sibling HTML/assets are needed. Device, portrait/landscape, and exception controls apply to all three designs. The old landscape gallery redirects here.
- Review frames render at Air 420×912 / 912×420, Duo 669×951 / 951×669, iPad 834×1210 / 1210×834. ResizeObserver fits each frame proportionally without horizontal page overflow or stretching. Portrait compares options in columns when space allows; landscape compares full-width options vertically.
- TO/LDG surplus presentation: 4 / 3 → +1; 3 / 3 → 0; 2 / 3 → 1 needed. Each counter retains its own progress line and actual/minimum subtitle.
- Browser runtime remained unavailable during this revision. HTML/script and embedded-template checks do not replace Playwright or native visual validation; these checks remain unrun.

- Interactive concept: ../../assets/mockups/crew-app/schedule-kpi-three-options-Ver1.html
- Visual comparison: ../../assets/mockups/crew-app/schedule-kpi-three-options-Ver1.svg
- Rendered comparison: ../../assets/mockups/crew-app/schedule-kpi-three-options-Ver1.png
- HTML uses labelled illustrative snapshots, not a live computation engine. Its purpose is to demonstrate selection and expansion behavior.
- No product files, production data or app version changed.
- Browser runtime returned no available browsers. Browser interaction and responsive Playwright checks are unrun; do not treat this artifact as a validated native implementation.
- SVG is rendered locally with Quick Look and visually inspected. Rendering a design board is not an application screenshot or a Playwright receipt.
- Verification receipt: `git diff --check` PASS; inline JavaScript parsed with Node `new Function(script)` PASS; artifact existence and all six caps plus recency minimum checked with Node PASS. Calendar arithmetic verified for 7/14/28/90-day starts above. `qlmanage -t -s 1440 -o /tmp docs/assets/mockups/crew-app/schedule-kpi-three-options-Ver1.svg` PASS; resulting PNG copied to the artifact folder and visually inspected. Browser interactions and native UI validation remain unrun.
- Before production delivery: minute-level boundary/rounding/deduplication tests; cross-month/year/leap/DST cases; missing history; planned-to-actual replacement; cancellation; negative headroom; hidden-window violation; recency expiry and empty-day selection. Validate real taps and scrolling in Air, Duo and iPad, both PR/TG accounts, with versioned native UI screenshots and applicable Jest/TypeScript/UI checks.

## Regulatory references

## Real LogTen observation

A delegated agent used iphone-use on the connected iPhone, navigated read-only and restored Now. The primary agent reviewed captured Plan, contributing-flight and recency images. No entries/settings changed.

The horizontal timeline moves beneath a fixed central marker. The selected UTC/local instant changes; Now returns to the current instant. Vertical scrolling reveals KPI rows while the timeline remains pinned. Row taps expand a trend chart; info opens contributing flights, with orange scheduled and black recorded time.

Observed 19 October detail total: 37.0h; after scrubbing to 17 October: 26.1h. The headline for both 100 in 672 Hours and 28 Days stayed at 90.0h available. This proves date-sensitive details, but does not establish scheduled-time treatment in headline availability. The app's 12 Months row showed 900h cap and 890h available; 365 Days showed 1,000h cap and 990h available. Those labels are not evidence of the requested EASA calendar-year/12-calendar-month rules.

Duty rows showed 168 Hours - Duty / 60h and 672 Hours - Duty / 190h; details said Total FDP, and no useful duty records existed for boundary testing. Do not copy FDP into our duty-hours calculation.

Day recency showed separate Total T/Os (3) and Total Ldgs (3), with 81 days remaining and expiry 2027-01-08 at Now; moving forward showed 79 days with the same expiry. This supports an expiry/countdown presentation, but does not prove all event-boundary handling.

Evidence: docs/assets/screenshots/crew-app/logten-plan-observation-Ver1-{672-hours,28-days,12-months,365-days,contributing-flights,recency-now,recency-future}.png. These are real-phone observation captures, not Playwright application-validation evidence.

Latest design-fixture checks: inline Node assertions PASS for remaining/at-limit/exceeded labels, clamped over-limit fill, recency deficit/fill, and alerts across hidden windows. Both HTML scripts parse PASS; git diff --check PASS. Browser/native implementation remains unvalidated.

EASA ORO.FTL.210, Easy Access Rules for Air Operations, Revision 24 (March 2026):
https://www.easa.europa.eu/en/document-library/easy-access-rules/online-publications/easy-access-rules-air-operations?erules-id=ERULES-1963177438-11941

EASA Part-FCL FCL.060 recent experience (three take-offs, approaches and landings as pilot flying for the relevant type/class; the user explicitly requests the simpler flight-count proxy here):
https://www.easa.europa.eu/en/document-library/easy-access-rules/online-publications/easy-access-rules-aircrew-regulation-eu-no?page=5

