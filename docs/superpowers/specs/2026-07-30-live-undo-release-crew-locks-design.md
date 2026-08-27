# Live Undo/Redo — Release & Re-acquire Crew Locks

## Problem

Live roster header shows a blue lock badge + username (e.g. `Qiang`) after the planner
assigns a duty. Undoing that assignment restores the roster but **does not release** the
crew/pairing locks acquired during the edit. With zero remaining draft ops, Save is a
no-op and there is no Discard UI entry — so the badge sticks until lock TTL (~5 min).

## Goal

- **Undo:** release locks for crews/pairings that are no longer dirty after the undo.
- **Redo:** re-acquire locks for the restored op’s `affectedCrewIds` / `affectedPairingIds`
  (same as initial assign).

## Non-goals

- Adding a Discard toolbar button
- Changing Save/commit lock release
- Changing WebSocket lock protocol or server TTL

## Behavior

### Undo (`draft-store.undoOp`)

1. Pop last op; recompute remaining dirty crew/pairing sets from `operations`.
2. If `operations.length === 0` → `releaseAllLocks()`.
3. Else, for each `crew:X` in `myLockKeys` where `X` is not in remaining dirty crews:
   call `releaseCrewLock(X, myPairingIdsNotStillDirty)` (pairing ids I hold that are
   not in remaining dirty pairings). Fire-and-forget (`void`) so `undoOp` stays sync.
4. Pairing-only orphan keys (no corresponding crew release) are acceptable until the
   next empty-ops undo / commit / discard; assign always acquires crew+pairing together.

### Redo (`draft-store.redoOp`)

1. Restore op onto `operations`.
2. `void acquireLocks(op.affectedCrewIds, op.affectedPairingIds).catch(() => {})`
   so lock failure does not block redo (matches assign paths).

## Files

- `gantt/src/stores/draft-store.ts` — undo/redo lock sync
- `gantt/src/stores/__tests__/draft-store-undo-locks.test.ts` — Vitest

## Testing

| Case | Expect |
|------|--------|
| Undo last op; ops empty | `releaseAllLocks` |
| Undo; crew A no longer dirty; other dirty crews remain | `releaseCrewLock` for A only |
| Undo; crew A still dirty via another op | no release for A |
| Redo assign op | `acquireLocks(affectedCrewIds, affectedPairingIds)` |

## Approval

User approved 2026-07-30: Undo release when no longer dirty; Redo re-acquire (option 1).
