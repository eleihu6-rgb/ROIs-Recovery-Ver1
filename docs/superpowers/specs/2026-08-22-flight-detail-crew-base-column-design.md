# Flight Detail — Crew Assignment Base Column

**Status:** Approved (design dialogue 2026-08-22)  
**Scope:** Gantt Flight Detail dialog (Live + Scenario shared path)

## Goal

In Flight Detail → Crew Assignment, add a **Base** column immediately after **Name**. The value is the crew member’s home base that is **effective on that flight’s Flight Date**.

## UI

Column order:

`Crew ID | Name | Base | Active Rank | Acting Rank | Source`

- Base shows the airport code (e.g. `YYZ`) in mono / tabular style consistent with Crew ID.
- Missing base → `—`.

## Data contract

Extend `FlightCrewItem` with:

```ts
base: string | null
```

Consumers: `flight-detail-dialog.tsx`, scenario helper, Live API response, e2e headers.

## Resolution rule (authoritative)

Source table: `crew_base` (not `roster_flight.base`).

As-of date = Flight Date shown in the dialog:

1. Prefer `flight.fltDt` (date-only / first 10 chars).
2. Else fall back to UTC calendar date of `schDepDtUtc`.

Effective row for a crew on that date (same pattern as Pairing Info / pairing-service):

- `eff_dt <= asOfDate`
- AND (`exp_dt` IS NULL OR `exp_dt > asOfDate`)
- If multiple rows match: pick the one with the **latest `eff_dt`** (`DISTINCT ON (crew_id) … ORDER BY crew_id, eff_dt DESC`).

Do **not** prefer `is_prime_base` for this column (explicitly declined).

## Live path

`live-server` `flightService.getCrewList`:

1. Resolve assignees as today (unchanged).
2. Batch-load effective bases for those `crewId`s on the flight’s as-of date.
3. Map into each item’s `base` field (`null` if none).

Redis cache key `flight:crew:*` already wraps the full crew payload; bumping item shape is enough (TTL expiry / natural invalidation). No separate cache version required for this small additive field.

## Scenario path

- `buildScenarioFlightCrew`: set `base` from scenario gantt `crew.base` when present, else `null`.
- `mergeScenarioAndLiveFlightCrew`: unchanged collision rule (scenario wins on `crewId`). Live-only mates keep Live-resolved `base`; scenario winners keep scenario `base` (may be the snapshot base from gantt-data).

Rationale: Scenario assignees may be out of Live `crew_base` (synthetic / filter-scoped). Live mates on the same physical flight still get date-effective Live bases.

## Out of scope

- Changing assignee / DHD / composition logic.
- Client-side history fetch of `crew_base`.
- Editing base from this dialog.

## Tests

| Layer | Coverage |
|-------|----------|
| Vitest Live | `getCrewList` returns as-of-date base; no covering row → `null` |
| Vitest gantt | Scenario helper includes `base`; merge preserves bases per winner |
| Playwright | Scen-2020 (+ Live-1073 if env allows): header includes `Base` after `Name`; assert mocked / known base text |

## Acceptance

1. Opening Flight Detail shows Base between Name and Active Rank.
2. For Live assignees, Base matches `crew_base` on Flight Date under the rule above.
3. Scenario merge still shows mates; Live-only mates show Live as-of-date Base.
4. Existing Crew ID → Crew Info click behavior unchanged.
