# Roster Import Manday Refresh

Date: 2026-07-13

## Problem

SIT data was recently re-imported. After importing Roster interface data, `crew_manday_*` BLH/credit values are not correct.

The expected post-import behavior is:

- Roster import refreshes Manday credit/day-off/leave counters from the imported `roster_flight` rows.
- Roster import also refreshes Manday BLH from the imported roster/flight data.
- If Manday refresh fails, the import job must not look fully successful, because downstream Gantt KPIs will be stale/wrong.

Current code calls the unified Manday driver from roster, roster-ground, and manday import workers, but those calls are best-effort (`catch` + warn). A failed refresh can be hidden behind a successful import job, leaving SIT with stale/wrong BLH/credit after Roster interface import.

## Scope

Module: `live-server`

Touched code should be limited to:

- `live-server/src/services/manday/manday-tool.ts`
- `live-server/src/workers/roster-inbound-worker.ts`
- `live-server/src/workers/roster-ground-inbound-worker.ts`
- `live-server/src/workers/manday-inbound-worker.ts`
- focused tests under `live-server/src/__tests__`

Out of scope:

- Schema changes.
- Rewriting Manday arithmetic.
- Changing Gantt display logic.
- Changing connector-server queue production.

## Proposed Change

1. Keep the unified Manday driver behavior that recomputes BLH from `flight.blk_min`.
2. Change post-import Manday refresh from best-effort to required for:
   - roster import
   - roster-ground import
   - manday import
3. Log the refresh result (`crews`, `daily`, `monthly`, `yearly`) after success so SIT import logs prove the refresh ran.
4. If refresh fails, let the worker job fail after the roster/manday import write, so operations can retry or repair explicitly instead of silently accepting stale Manday values.
5. Keep the date window based on `syncRangeDt`.

## Impact / Risk

GitNexus impact on `manday-tool.ts:recompute` returned HIGH:

- 8 direct callers.
- Affected modules: Workers, Crew, Manday, Scenario.
- Affected processes include roster/draft flows.

Risk control:

- The Manday arithmetic stays unchanged.
- The Roster write transaction stays unchanged.
- The behavior change is operational: a failed Manday refresh now surfaces as a failed import job.
- Tests lock that the import worker awaits Manday refresh and does not swallow refresh failures.

## Verification

Run focused live-server tests:

```bash
npm --prefix live-server test -- src/__tests__/unit/roster-inbound-worker.test.ts
npm --prefix live-server test -- src/__tests__/unit/roster-ground-inbound-worker.test.ts
npm --prefix live-server test -- src/__tests__/unit/manday-inbound-worker.test.ts
```

## SIT Repair Note

After deploying the code change, SIT data that was already imported without a successful Manday refresh should be repaired by running the existing Manday refresh for the affected date window. This refresh should recompute both BLH and credit from the current `roster_flight`/`flight` data.
