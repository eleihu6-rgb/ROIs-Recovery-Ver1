# Duty Swap Concept B — Twin Rail

Source: user-provided `Crew App Duty Swap.mhtml`, Concept B (B0–B3). Authorized by the user's request to add B and proceed, preserving the three existing concepts.

## Scope and flow

Add a fourth approach, Twin Rail, to the existing per-airline/per-crew approach selector. Keep Matrix as the default and retain Matrix, Market and Ticket source implementations. New presentation and selection state live under `crew-app/src/features/dutySwap/twinRail/`.

Calendar → New swap → pinned Me rail and vertically scrolling candidate rails → date-aligned review / full duty details → explicit Check legality & send. All rails use one time window. Provide 3/7/14-day zoom, pinch zoom and horizontal date navigation, preserving whole pairing identities across midnight and window boundaries. Locked duties remain visible and cannot be selected. Taking from another crew replaces the previous take selection. Large screens display the review beside/below the rails; compact screens use a separate review stage.

User refinement: two-finger pinching zooms the horizontal time scale only. Keep puck/row heights fixed at the existing geometry. Adapt the text within each 40pt puck to its width (code only → times → route/credit where space permits). Validate on Air, then Duo, then iPad, with exactly one simulator booted. Use PR crew 473006 for the live login.

Use existing portal search, options, comparison, disclaimer, records and My duties contracts. Search is a full page of grouped settings rows with section navigation. Reuse existing pure time, selection payload, KPI, comparison and rule-message utilities. Qualification warnings are hints from returned detail, never legality approval. Do not fabricate credit, rest or request counts. Review requires complete details and accepted disclaimer. Failed requests remain actionable and do not report success.

## Isolation and risks

Only selector registration, host routing and app version change outside the new concept directory. Existing preference values remain valid. Concept B uses local selection state, cleared on account change, and the existing shared fetched data. Shared source screens and services stay unchanged. Timeline clipping, overlapping short duties, narrow header width, asynchronous detail failure and account isolation need explicit coverage.

## Verification

Jest using the existing captured PR TEST fixtures: calendar, timeline geometry, zoom/navigation, locked duties, multi-duty selection, crew replacement, review tabs, payload, error/retry, discriminator compatibility and account reset. Run existing duty-swap tests, TypeScript and root UI gate. Validate actual native UI through the repository's simulator/Playwright workflow, capture versioned screenshots under `docs/assets/screenshots/crew-app/`, and inspect them. Validate PR feature and TG account isolation; no live swap submission during manual validation. Report unavailable required checks explicitly.
