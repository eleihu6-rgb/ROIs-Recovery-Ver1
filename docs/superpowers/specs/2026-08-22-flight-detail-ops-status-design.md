# Flight Detail STATUS (ops) redesign

**Date:** 2026-08-22  
**Module:** gantt — Flight Detail dialog  
**Status:** Approved for spec; awaiting implementation after plan

## Goal

Replace Flight Info → **Status** derivation so it reflects operational progress (cancelled / finished / in progress delay / on-time airborne / scheduled), not crew coverage.

## Non-goals

- Do not change Flight Composition coverage cards or API `crewData.status` (`full` / `partial` / `cancelled`).
- Do not change Scenario adaptation that leaves actual times null (those flights stay **Scheduled**).
- Do not introduce dictionary-driven labels or delay thresholds in this change.
- Do not change Assign / Edit footer behavior.

## Decision summary

- Approach: update the existing if/else in `LoadedDetailBody` inside `gantt/src/components/flight/flight-detail-dialog.tsx` (minimal change).
- Delay threshold for **Delayed** vs **On Time**: **15 minutes** (`ATD − STD > 15`).
- Fourth-tier label: **On Time** (same English string as before).

## Status priority (first match wins)

| # | Label | Condition | Secondary `durUnit` |
|---|--------|-----------|---------------------|
| 1 | Cancelled | `flight.isCancelled === true` | none (empty); unit color red via existing cancel styling |
| 2 | Finished | `actDepDtUtc` present **and** `actArvDtUtc` present | none |
| 3 | Delayed | `actDepDtUtc` present, `actArvDtUtc` absent, and `ATD − STD > 15` minutes | `+N min` (amber), same pattern as today |
| 4 | On Time | `actDepDtUtc` present, `actArvDtUtc` absent, and delay ≤ 15 minutes (includes early / on-time) | existing `formatDelta(depDelta)` when delta is shown today |
| 5 | Scheduled | `actDepDtUtc` absent / null | none |

Notes:

- `depDelta` remains `deltaMinutes(actDepDtUtc, schDepDtUtc)` (minutes, signed).
- Cancelled wins even if actual times exist.
- If ATA exists without ATD (data anomaly), rule 2 does not fire; with no ATD the flight falls through to **Scheduled**.
- Badge CSS class mapping stays aligned with today’s intent: cancel → `badge-cancel`, delayed → `badge-partial`, on-time → `badge-full`, scheduled/type → `badge-type`. **Finished** uses a distinct positive completed look: reuse `badge-full` (same as On Time) unless existing CSS already has a clearer finished token — do not invent new hard-coded colors.

## UI surface

Unchanged layout: Status badge + optional unit text in the duration row under Flight Info.

## Live vs Scenario (§Gantt-Unify)

Same shared dialog path. Scenario flights without actuals continue to show **Scheduled**.

## Testing

- Playwright: assert Status label for representative fixtures (Cancelled, Finished, Delayed with >15, On Time with ATD and no ATA, Scheduled with no ATD). Prefer driving the real Flight Detail UI with mocked/stubbed flight payloads where the suite already does so; otherwise extend `scenario-detail-dialogs` / a focused Live flight-detail spec.
- Run `npm run check:ui` after any style touch (expect none beyond optional badge class reuse).

## Out of scope follow-ups

- Parameterizing the 15-minute threshold via `dictionary`.
- Showing arrival delay vs STA for Finished flights.
