# Daily calendar: folding, fixed rail and Apple Weather

> Updated acceptance after the user’s screenshot clarification: events and rail move together on vertical swipes; rail height stays constant during the gesture. The viewport-pinned rail described below is superseded. Keep the week/day stack tight, with no blank spacer. See `docs/test-cases/crew-app/2026-10-19-calendar-shared-scroll-Ver1.md`.

## Evidence and scope
Inspected Finalist on the connected iPhone for October 19–25, 2026, including list scrolling both directions and section folding. Rail position does not follow list scrolling. Sections retain collapsed state across dates, show counts when folded, and remain visible when empty. Event intervals share a center line with darker overlap portions. Weather includes daily and weekly forecasts and section conditions. Reference sometimes displays 09; user explicitly requests unpadded labels.

Improve Crew App daily agenda in month/day and standalone day modes while preserving roster/EventKit data and carrier palette. Keep calendar controls fixed, independently scroll event content, measure remaining rail viewport, make all dayparts collapsible with accessible expanded state and counts, center intervals, shade overlap segments only. Compress quiet early hours and omit their labels; retain early events and all-day rows without hiding data. This compression is an implementation choice, not a claim to know Finalist's internal algorithm.

Weather uses existing native WeatherKit at roster base coordinates. Add explicit loading/unavailable/out-of-range states, dated cache freshness and account/base isolation; show true forecast symbols, weekly outlook and hourly-derived daypart conditions when available. Never invent weather when native entitlement/network is unavailable. Preserve Apple attribution.

## Boundaries and risks
No duty-swap edits, no production data writes, no commit/push. Preserve existing dirty worktree. Personal notes/habits/focus-time editors are separate product capabilities; do not create fake controls for them. No claim of 100% pixel parity across different fonts, themes and app navigation. Simulator cannot prove signed-device WeatherKit service availability.

## Verification
Regression Jest for section folding/unfolding, counts/empty sections, scrolling boundary, rail center/overlap intervals, unpadded hours/quiet early hours, weather error/retry/stale-base isolation. TypeScript and UI standard check. Native UI capture on separate Air then available Duo/iPad with TG/PR account isolation; visually inspect screenshots. Native XCUITest is the applicable driver for this RN app; report web Playwright not applicable/unrun rather than claiming it ran. Do not stop another agent's simulator.
