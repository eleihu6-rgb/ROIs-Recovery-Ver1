# 7504 Warning Message — Two WOCL Duty Start Dates

Date: 2026-07-21  
Status: approved for implementation  
Approach: format in `rule7504` message builder only (same layer as 8056 / 7505)

## Problem

Rule 7504 (WOCL flight-duty spacing) warnings currently omit which duties failed:

```text
Rest between consecutive WOCL flight duties is less than 55 RH.
```

Planners cannot see the two WOCL duties’ start dates without inspecting the roster.

## Goal

Append the two violating WOCL duties’ **duty_start** calendar dates in the crew’s **base IANA timezone**:

```text
Rest between consecutive WOCL flight duties (2026-08-03, 2026-08-05) is 02:00 less than 55 RH.
```

| Token | Source |
|-------|--------|
| First date | Earlier WOCL duty `start_secs` → `localDateOf(..., zone)` |
| Second date | Later WOCL duty `start_secs` (= binary `gapEnd`) → `localDateOf(..., zone)` |
| Gap HH:MM | Binary `actualMin` via `formatMinutesHHMM` (negative gaps keep `-`) |
| Zone | `source.crewBaseTimezone()`; missing → `UTC` |

## Non-goals

- Do not change Rust `check-7504` scoring or TSV columns.
- Do not rewrite historical `rule_violation.message` rows; new text after Legality Recheck.
- Do not append times of day — **date only** (`YYYY-MM-DD`).
- Gap endpoints (duty1 end / duty2 start) remain `start_dt` / `end_dt` on the violation row; only `message` gains duty starts.

## Design

### Lookup

`check-7504` emits `gapStart` = earlier duty **end**, `gapEnd` = later duty **start**, `pairing_id` = earlier pairing.

Before the binary run, index `flyDuties(true)` as `crewId\tend_secs → start_secs`.

For each violation:

1. `duty1Start = index.get(crewId + '\t' + gapStart)`; if missing, fall back to the duty row with matching `crew_id` + `pairing_id`’s `start_secs`.
2. `duty2Start = gapEnd`.
3. Format both with existing `localDateOf` (same helper as 8056).

### Change sites

1. **Canonical:** `live-server/scripts/legality-recheck-core.mjs` → `rule7504` (Live + Scenario recheck).
2. **Legacy align:** `persist-7504-violations.mjs` — same sentence shape (date-only); may use fixed offset → local date if IANA is unavailable in that script.
3. **E2E:** update stale `minumum rest time` assertions to the new phrase when present.

### Verification

- Unit tests: YVR zone day boundary + UTC fallback.
- Playwright `rule-7504-wocl-spacing.spec.ts` if message text is asserted.

## Rejected alternatives

| Option | Why not |
|--------|---------|
| Emit dates from Rust | Binary only has fixed offset minutes, not IANA DST |
| Full datetime like 8056 | Product asked for **dates** only |
| C++ gap-endpoint message | Gap end ≠ earlier duty start; would confuse planners |
