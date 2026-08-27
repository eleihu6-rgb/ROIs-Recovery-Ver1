# 7505 / 7507 Calendar Display Window Design

Date: 2026-08-04  
Status: approved (plan)  
Approach: Persist calendar RP bounds on `window_*`; keep crew-local UTC on `start_dt` / `end_dt`

## Problem

Live Alert Center / crew bells load violations with overlap on:

```text
coalesce(window_start_dt, start_dt) < (view_end::date + 1)
coalesce(window_end_dt, end_dt)     >= view_start::date
```

Rules **7505** / **7507** store `start_dt` / `end_dt` as the **crew-local** rostering-period window converted to UTC (`crewLocalRpWindowUtc`). For Americas bases, a July RP ends at early **2026-08-01 UTC**. With null `window_*`, that July finding overlaps an August RP view — planners see Soft 7505 about `(2026-07-01, 2026-07-31)` while viewing August.

This is display membership, not a wrong days-off score. Product intent already rejects ±1-month query padding so prior-month findings stay out of the current RP view.

## Goal

July calendar-month 7505/7507 findings must **not** appear when the official view is August (and symmetrically for other month boundaries). Message RP labels remain the source of truth for “which RP”.

## Design

| Column | Meaning |
|--------|---------|
| `start_dt` / `end_dt` | Crew-local evaluated RP in UTC (unchanged; audit / engine truth) |
| `window_start_dt` / `window_end_dt` | Calendar RP display bounds matching message `(rpFrom, rpTo)` |

Persist:

- `window_start_dt = ${rpFrom}T00:00:00.000Z`
- `window_end_dt = ${rpTo}T23:59:59.999Z`

SQL prefers `window_*`, so July calendar end does not overlap August view start.

Same emit sites: `rule7505` and `rule7507` in `live-server/scripts/legality-recheck-core.mjs`. Helper: `calendarRpDisplayWindow` in `legality-rp-window.mjs`.

## Existing rows

One-shot script: `live-server/scripts/backfill-7505-7507-display-window.mjs [--schema f8] [--dry-run]`.

For `rule_code IN ('7505','7507') AND window_* IS NULL`: parse `(YYYY-MM-DD, YYYY-MM-DD)` from `message` via `parseRpDatesFrom7505Message`, set `window_*` with `calendarRpDisplayWindow`. Display-only; no full legality recheck required.

## Non-goals

- Rust `check-7505` / `check-7507` counting
- Legality UI Recheck dateRange / default-ruleset binding
- Bulk-delete mutation recheck pad (−31/+31)

## Verification

- Unit: emit includes calendar `window_*`; crew-local `start`/`end` unchanged for Americas offset
- Overlap: July calendar window does not overlap August RP bounds; still overlaps July view
