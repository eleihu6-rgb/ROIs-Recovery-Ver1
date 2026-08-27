# 7505 Warning Message — Append RP Dates in Crew Base Timezone

Date: 2026-07-17  
Status: implemented  
Approach: **A** — format in `rule7505` message builder only

## Problem

Rule 7505 (Min # GDOs in a RP) warning messages currently end with the period/unit only, e.g.:

```text
The number of days off(3) must be at least 12 in 1 RP.
```

Planners cannot see **which** rostering period window failed without opening other UI. The check binary already emits per-violation `rpS` / `rpE` (used for `start_dt` / `end_dt`), but they are not surfaced in `message`.

## Goal

Append the violated RP window as **roster-period calendar days** (`ctx.dateFrom` / `ctx.dateTo`):

```text
The number of days off(3) must be at least 12 in 1 RP (2026-06-01, 2026-06-30).
```

Do **not** convert the UTC midnight epoch of `rpS` into the crew base timezone — that wrongly shows `2026-05-31` for a June RP in Americas zones.

## Non-goals

- Do not change Rust `check-7505` binary output or scoring logic.
- Do not rewrite historical `rule_violation.message` rows in place; new text appears after the next legality recheck / seed.
- Do not change Gantt tooltip/Alert Center rendering beyond reading the updated `message` string.
- Do not append times of day — **date only** (`YYYY-MM-DD`).

## Design

### Message shape

Keep the existing English sentence; append a parenthetical after `${period} ${unit}`:

```text
The number of days off(${daysOff}) must be at least ${minDo} in ${period} ${unit} (${rpStartLocal}, ${rpEndLocal}).
```

Where:

| Token | Source | Notes |
|-------|--------|-------|
| start label | `ctx.dateFrom` | RP calendar start (`YYYY-MM-DD`) |
| end label | `ctx.dateTo` | RP calendar end (`YYYY-MM-DD`) |

Do not format `rpS` / `rpE` through `localDateOf(..., crewZone)` — those instants are UTC midnights of the calendar labels, and Americas base zones shift the start day to the previous calendar date.

### Change site

Single builder: `live-server/scripts/legality-recheck-core.mjs` → `rule7505`.

```js
message: `The number of days off(${daysOff}) must be at least ${minDo} in ${period} ${unit} (${ctx.dateFrom}, ${ctx.dateTo}).`
```

Live and Scenario recheck paths both call this core, so both pick up the change without duplicate UI logic.

### Verification

- Unit test in `live-server/tests/unit/legality-recheck-core-param.spec.ts`:
  - Mock `check-7505` TSV; assert message ends with `(${dateFrom}, ${dateTo})`.
- Do not require Playwright unless product later wants a visible Alert Center assertion; message string unit test is sufficient for this change.

## Rejected alternatives

| Option | Why not |
|--------|---------|
| B — Rust binary emits dates | Binary has no crew IANA zone; Live still owns message assembly |
| C — Format only in Gantt | Alert Center / persisted `message` / other consumers stay stale |

## Open points (resolved)

1. Date format: **date only** (`YYYY-MM-DD`), not datetime.
2. Labels: **RP calendar days** from `ctx.dateFrom` / `ctx.dateTo` (not crew-base conversion of UTC midnights).
