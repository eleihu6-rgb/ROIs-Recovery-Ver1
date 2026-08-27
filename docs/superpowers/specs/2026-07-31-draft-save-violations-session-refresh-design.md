# Design: Draft Save clears session violations + refreshes persisted bells

**Status:** Approved (user: 可以)  
**Related:** `2026-07-31-draft-commit-live-legality-recheck-design.md`, `2026-07-31-live-violations-refresh-ws-join-design.md`  
**Confirmed:** crew 2324 — DB already `days off(9)` after Save; hard refresh showed 9; pre-refresh UI stuck on 8.

## Problem

Locked Live Save commits roster and spawns async live legality recheck, but the gantt can keep showing the pre-Save 7505 text because:

1. **Session layer overrides persisted.** Draft legality preview (`syncPeriodGdoSessionViolations`) writes 7505 into `sessionViolations`. `mergeViolations` prefers session over `rule_violation`. Draft `commit()` never calls `clearSessionViolations`.
2. **Persisted map may not refetch.** Recheck finishes asynchronously; UI only refreshes on `violations:updated` (WS join / Legality indicator). If that event is missed, the in-memory persisted snapshot stays at 8 until hard reload.

## Approaches

| | Approach | Pros | Cons |
|---|----------|------|------|
| A | Clear session only on Save | Tiny change | Persisted store can still hold 8 |
| **B (recommended)** | Clear session + immediate `violations:updated` + one delayed refetch (~4s) | Covers session override + async recheck without waiting on Save | Extra GET `/api/violations` |
| C | Clear session + poll recheck-status until done then refetch | Precise | More code; couples draft-store to legality status API |

**Recommend B.** Minimal, matches existing `violations:updated` → `usePersistedViolations` path, no Save latency.

## Design (B)

### On successful `draft-store.commit()` (lock batch **and** unlocked fallback)

After ops are cleared and roster/manday refresh succeed:

1. `useSessionViolationStore.getState().clearSessionViolations()` then `_recompute()` (clear already triggers recompute today).
2. Dispatch `window` `CustomEvent('violations:updated', { detail: { groupCode } })` where `groupCode = useRuleCheckStore.ruleGroupCode || '103'` (same fallback as persisted fetch / WS join).
3. Schedule **one** delayed dispatch of the same event after **4000 ms** (covers typical mutation-window recheck finishing after commit returns). Cancel prior timer if a second Save starts before it fires.

### Out of scope

- Waiting for recheck inside `/api/draft/commit` (Save stays non-blocking).
- Changing preview / `syncPeriodGdoSessionViolations` writers.
- Discard path (optional later: also clear session on `discardAll`).

### Tests

- Unit: after mocked successful `commit()`, `clearSessionViolations` is called and `violations:updated` is dispatched (immediate; optionally assert delayed via fake timers).
- Manual / existing Live delete+Save: 7505 text updates to new DO without hard refresh.

## Amendment (2026-07-31 evening)

**B failed in practice:** add→Save updates (preview already wrote new DO into session); delete→Save stayed on old DO until hard refresh because mutation recheck often takes **>4s** and WS/`violations.updated` can be missed on the roster view.

**Switch to C:**
1. Parent `spawnLiveRecheck` sets Redis `:status` to `computing` before child start.
2. After draft Save: clear session + immediate refetch, then **poll** `GET /api/legality/recheck-status` until `computing→done` (or `lastCheckedAt` advances), then refetch again.

## Success criteria

Delete a duty (e.g. crew 2324 Sep 26), Save, stay on the page → crew-bell 7505 DO count updates without Ctrl+Shift+R (same as add→Save already did via preview session).

