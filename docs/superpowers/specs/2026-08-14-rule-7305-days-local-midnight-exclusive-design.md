# Design: Rule 7305 Days local-midnight exclusive span

**Date:** 2026-08-14  
**Status:** Approved (chat option A)  
**Scope:** `rule-engine-rs` rule 7305 Days counting + message last date

## Problem

Scenario 740 / crew 1877: consecutive roster days reported as 9 for local span `2026-09-15 00:00 → 2026-09-23 00:00`. Half-open occupancy is 8 days (15–22). Message showed `[2026-09-15, 2026-09-23]`.

## Fix

Same exclusive local-midnight contract as 7505 DO paint:

1. Before day math on an end instant, if `(end + offset_min * 60) % 86400 == 0`, use `end - 1`.
2. Apply in `calendar_span`, continuity gap vs previous rest end, and message **last** date (last **occupied** local day).
3. Message example: `… (8) [2026-09-15, 2026-09-22] exceeds the threshold (5).`

## Non-goals

- Changing Times (T) contribution (still 1 per duty); gap may use exclusive rest-end for continuity only.
- Changing C++ oracle files (Live deliberately matches 7505 exclusive midnight).

## Commit

Wait for explicit user commit/push.
