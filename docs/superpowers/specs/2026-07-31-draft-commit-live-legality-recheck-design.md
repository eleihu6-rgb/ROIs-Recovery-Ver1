# Design: Draft commit triggers live legality recheck (−31 / +31)

**Status:** Approved (user: wire draft/commit to mutation recheck; change back pad from −2 to −31)

## Problem

Locked Live Save uses `POST /api/draft/commit`, which soft-deletes / mutates roster and recomputes manday, but never calls `recheckLiveRosterMutation`. Alert Center / crew bells stay stale after Save.

## Solution

1. After a successful draft commit (same place manday recompute runs), call `recheckLiveRosterMutation` with the already-collected mutated `schStrDtUtc` dates and optional `rulesetId` from the commit body (fallback = existing workset resolution).
2. Widen the mutation recheck lookback used by **all** roster mutation paths from **−2 days to −31 days** (forward stays **+31 days**) so RP-month-anchored rules (e.g. 7505 at month start) fall inside the delete/rewrite window when a late-month duty changes.

## Non-goals

- Publishing `violations.updated` WS after live-legality (separate follow-up).
- Changing manday pad (−2 / +10).
- Rebuilding stale rule-engine binaries (ops).

## Verification

- Unit: mutation window uses −31 / +31.
- Route: draft commit invokes recheck with collected dates (best-effort; failure does not fail Save).
