# Design: Publish violations.updated after live legality recheck

**Status:** Approved (user: publish `violations:{schema}:{groupCode}` when recheck done)

## Problem

After `live-legality.mjs` rewrites `rule_violation`, Alert Center / bells stay stale until a hard refresh. The WS pipeline already exists; the publisher was missing.

## Solution

On successful commit in `live-legality.mjs` (after Redis status `done`):

```
PUBLISH violations:{LIVE_SCHEMA}:{GROUP}  <eventId>
```

- `LIVE_SCHEMA` = unquoted env schema (same as JWT `payload.schema`, e.g. `f8_sit_live`)
- `GROUP` = `--group` arg already used for Redis status (workset id string, e.g. `103`)
- `eventId` = monotonic-ish integer (`Date.now()`); WS plugin already `parseInt`s the payload

Existing path then: Redis pSubscribe → WS `violations.updated` → gantt `violations:updated` → `usePersistedViolations` refetch.

## Non-goals

- Scenario legality publish (separate store/path)
- Changing group join / Auth semantics

## Verification

- Unit/smoke: helper builds channel + publish called after successful main path (mock redis)
- Manual: Save/Recheck → Alert Center updates without Ctrl+Shift+R when WS is connected and `set_rule_group` matches
