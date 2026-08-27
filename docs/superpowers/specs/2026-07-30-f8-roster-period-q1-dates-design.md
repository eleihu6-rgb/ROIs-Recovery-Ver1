# F8 Roster Period Q1 Date Correction

## Problem

F8 roster periods for Jan–Mar are not calendar months:

| RP | Correct range |
|----|---------------|
| RP1 | Jan 01 – Jan 30 |
| RP2 | Jan 31 – Mar 01 |
| RP3 | Mar 02 – Mar 31 |
| RP4–RP12 | Calendar month |

Seed and live `roster_period` rows used Jan 01–Jan 31 for RP1 and Feb 01–Mar 01 for RP2. RP3 was already correct. Scenario Basic Info RP Date fields are read-only mirrors of these rows.

## Change

1. Correct `sql/seed/roster-period-2026-2036.sql` for every year: RP1 end → Jan 30; RP2 start → Jan 31.
2. Add idempotent migration updating existing `roster_period` rows for all years matching `*RP01` / `*RP02`.
3. Apply migration against remote `f8_sit_live` (authoritative demo DB).

## Non-goals

- Changing Scenario UI to edit dates inline
- Regenerating scenario `str_dt_loc` / `end_dt_loc` already saved on scenarios (planner re-selects RP to refresh, or a follow-up backfill if needed)
- Changing PBS period tables

## Approval

User approved 2026-07-30 (“改”).
