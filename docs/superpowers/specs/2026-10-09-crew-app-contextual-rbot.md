# Crew app: R'Bot on every screen

Status: implementation design, 2026-10-09

## Scope

The signed-in crew can open R'Bot from the four tabs and every pushed app page. The current page remains visible behind a compact chat panel. One conversation follows the crew between pages and is cleared on logout. Each send identifies the page from which the panel opened; page-specific facts and available controls come only from existing app state, actual UI controls, and route parameters. This is structured page awareness, not screenshot capture. The Duty Swap panel keeps its search and selection actions but uses the same conversation.

## Data flow

Navigation owns the current route. A shared launcher opens the RBot stack route with a snapshot of the source route; the tab dock provides the active tab. Schedule publishes its current view, month and selected day because timeline, calendar and route map share one tab route. The RBot screen sends that source in `context.screen` and a bounded `context.page` object to `/ai/crew/chat`, including page controls and relevant live values; it never reports `RBot` as the source. Page controls tell R'Bot what the crew can do, not what the assistant may automatically operate—only existing action tools may do that. Duty Swap's existing panel sends its matrix snapshot and writes turns to the shared thread.

## Decisions and limits

- Use one panel over the current page: bottom on a phone, right side on a wide display. Closing it returns to the same page and state.
- Keep the existing RBot stack route and action dispatcher. Navigation actions can still open a destination page; no automatic submission is added.
- Include route/view identifiers and relevant visible facts, never passwords, tokens, or an invented roster snapshot. The server may answer questions from those facts and must ask when a fact is absent.
- Do not add a second chat session for Duty Swap. Existing swap actions stay scoped to its dedicated panel.

## Verification

Unit tests cover route-to-context mapping, payload grounding, thread continuity, and swap sharing. Native UI tests open R'Bot from a tab and a pushed page, inspect the panel and response, then switch PR/TG accounts. Capture and inspect a screenshot from the same run. Typecheck and focused backend tests cover the changed contracts.
