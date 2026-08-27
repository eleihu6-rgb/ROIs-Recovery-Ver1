# Unified Collaborative Editing (Live + Scenario) — Design

> Date: 2026-06-15
> Status: Approved (brainstorming) — ready for implementation plan
> Scope: Spec 2 of 2. Consumes the persisted baseline from
> `2026-06-15-scenario-persisted-legality-design.md` (Spec 1).

## 1. Problem

Multiple planners work the same roster (live) or the same scenario at once. We need optimistic, draft-based editing where one user's in-progress changes are isolated until saved, the edited crew are locked against concurrent edits, observers are told who is editing what, and on save the committed roster / legality / manday propagate to everyone. Most of this already exists for **live**; the work is (a) tightening the lock to a **crew-month** grain, (b) the **blue/red full-month line** rendering, (c) **client-side draft MCred**, (d) **lock release on undo-to-clean**, and (e) bringing the whole model to the **scenario** context via `GanttContextProvider`.

## 2. The user story (canonical)

User A on the gantt:
1. A assigns/de-assigns a duty → change enters A's **local draft**; legality pre-checked for A; **nothing broadcast** to others.
2. First change on a crew → that crew's **whole month** is **locked** from other users; A sees a **blue** line under the crew's roster for the whole month.
3. Other users see a **full-month red** line on that crew + **A's id** (indicator that A is editing); they get **no** roster/legality update.
4. A's crew-header **MCred** updates from the draft (client-side).
5. If the action triggers a violation, a **popup** lists violations: those **directly caused** by this action get a **highlighted background**; pre-existing ones get **none**. Buttons: **Revoke** (undo) / **Accept** (stage into draft, not saved). Hard violations block → Cancel/Revoke only (current behavior).
6. A **saves** → triggers a **live legality recheck** against A's changed roster; crew legality re-checked and manday recalculated.
7. A's blue line and others' red line **disappear**.
8. The new roster / legality / manday **push to all other users** with the gantt open.

Same model applies to the **scenario** gantt (decision J).

## 3. Decisions (settled in brainstorming)

| # | Decision |
|---|---|
| A | First draft change acquires the lock **immediately, server-side**. |
| B | Editing any duty in a month locks that crew's **whole month**. |
| C | Lock **every crew the operation touches** (e.g. a swap locks source + target). A duty spanning a month boundary locks **both months** for that crew. (Not whole-roster — per-crew-month only.) |
| D | The lock **hard-rejects** other users' edit attempts. |
| E | Draft MCred is **client-side** approximate; authoritative recalc happens on save. |
| F | The popup appears **only when the action introduces a (new) violation**. |
| G/H | Popup on every violating action; the lock releases on **undo-to-clean**, **save**, or **disconnect**. |
| I | Save-time recheck + manday are **async** (commit returns; results land via WS). |
| J | **Same model for scenario** — built once over `GanttContextProvider` (contextId = `live` \| scenarioId). |
| Dialog | Keep today's gating: **hard (non-overridable) violations block** — Cancel/Revoke only; Accept available only when no new hard violation. |

## 4. What exists vs. what's new (grounded in code)

| Capability | Status | Evidence |
|---|---|---|
| Crew lock: acquire/release, hard-reject, WS broadcast, owner badge, heartbeat | **EXISTS** | `gantt/src/stores/lock-store.ts`, `live-server/src/services/lock/lock-service.ts` (Redis, 300s TTL), `live-server/src/routes/lock/lock.ts` (broadcast), `gantt/src/components/gantt/lock-overlay.ts` (badge) |
| Multi-lock acquire | **EXISTS** | `lock-store.acquireLocks()` |
| Draft + undo/redo + transactional Save | **EXISTS** | `gantt/src/stores/draft-store.ts` → `POST /api/draft/commit` (`live-server/src/routes/draft/draft.ts`, lock-verified, single txn, broadcasts `roster-updated`) |
| Pre-check popup, `isNew` highlight, popup-only-when-new, hard-block | **EXISTS** | `gantt/src/components/roster/rule-confirm-dialog.tsx`, `gantt/src/stores/rule-check-store.ts` (`preCheck`), `gantt/src/stores/roster-store.ts` (`rulePreCheck`) |
| Save-time live legality recheck (async, per-crew, writes `rule_violation`, WS push) | **EXISTS** | engine-server `violation_worker.py`; `violations:updated` event |
| MCred display + `/api/crew/stats` fetch + cache-clear on commit | **EXISTS** | `gantt/src/stores/crew-store.ts`, `gantt/src/services/crew-api.ts` |
| Roster/violation broadcast → others refetch | **EXISTS** | `roster-updated` signal (`crewIds` only) + `violations:updated` |

**New / changed work (the actual deliverable):**

1. **Crew-month lock grain.** Extend the Redis lock key from `lock:crew:{crewId}` to `lock:crew:{crewId}:{YYYYMM}`. An edit computes the set of `(crewId, month)` it touches — every involved crew × every month any touched duty spans (decisions B/C) — and acquires all of them atomically via the existing multi-acquire; reject if **any** is held by another user.
2. **Blue/red full-month line rendering.** Replace/augment the crew-header *badge* with a **full-month line** spanning the locked month(s) under the crew row: **blue** when owned by me, **red + owner id** when owned by another. New draw in `lock-overlay.ts`, reading lock-store + the month range.
3. **Client-side draft MCred.** On a draft op, recompute the affected crew's credit locally (7502/8002 model, the same arithmetic `ruletool` uses) and update the header MCred immediately — instead of today's "stale until commit + next month view." Authoritative value still refetched from `/api/crew/stats` after save.
4. **Lock release on undo-to-clean.** When undo empties the draft for a crew-month (no remaining ops touch it), release that crew-month lock (today release is only on save/disconnect).
5. **Button labels.** Surface the dialog actions as **Revoke** / **Accept** (mechanically = current Cancel / Continue-Anyway; hard-block behavior unchanged).
6. **Scenario parity (J).** Wire lock/draft/pre-check/MCred/broadcast through `GanttContextProvider` so the scenario context uses the same stores and components, keyed by `scenarioId`. Scenario save additionally triggers the Spec 1 persisted recompute.

## 5. Lock model (detail)

- **Key:** `lock:{ctx}:crew:{crewId}:{YYYYMM}` where `ctx = live | scenario:{id}` (namespacing keeps live and scenario locks disjoint).
- **Touched-set computation:** for a draft op, collect `{ (crewId, month) }` for each crew the op references (source + target on swap/move) and each calendar month any affected duty overlaps. Acquire the whole set; on partial failure, release any just-acquired and reject the edit (atomic all-or-nothing).
- **Hard reject (D):** an edit attempt on a crew-month locked by another user is refused client-side (lock-store `isLockedByOther`) and server-side (lock-service check-and-set), with a toast "Locked by {owner}".
- **Release:** on save (commit path already releases), on undo-to-clean (new), on disconnect (heartbeat stops → Redis TTL expiry). The owner id rendered on the red line comes from the lock value `{ userId }`.
- **Month definition:** calendar month of the affected duty/duties (decision B); a cross-month duty contributes both months (decision C).

## 6. Draft → save → broadcast flow

1. Op added to `draft-store`; touched crew-months locked (§5); pre-check runs (`rule-check-store.preCheck`); popup iff a new violation (F); client MCred updated (§4.3). All **local to A**.
2. `Save` → `POST /api/draft/commit` (existing): replays ops in one txn, verifies lock ownership, releases locks, broadcasts `roster-updated{crewIds}`.
3. Commit fires the **async** (I) downstream: engine-server `violation_worker` recomputes the changed crew → writes `rule_violation` (live) or the Spec 1 `scenario.rule_violation` (scenario) → publishes `violations:updated`. `/api/crew/stats` recomputes manday on next fetch.
4. Other clients receive `roster-updated` (refetch roster for `crewIds`), `lock-released` (clear red line), `violations:updated` (refetch bell), and refetch `/api/crew/stats` (MCred). Steps land progressively via WS — observers poll, not block.

## 7. Unified context (live + scenario)

`GanttContextProvider` (already landed: commits `aa2ccb69`, `3f400225`) exposes `contextId = 'live' | scenarioId`. The lock-store, draft-store, rule-check-store, and crew-stats are resolved per context via the registry, so the **same** components serve both modes; only the lock namespace, the commit endpoint (`/api/draft/commit` vs the scenario save), and the legality source (live `rule_violation` vs Spec 1 `scenario.rule_violation`) differ. No mode special-casing in shared wrappers (per the unify design).

## 8. Components & boundaries

| Unit | Change | Depends on |
|---|---|---|
| `lock-service.ts` (live-server) | key gains `:{YYYYMM}`; touched-set acquire | Redis |
| `lock-store.ts` (gantt) | track crew-month locks; release-on-undo-to-clean | lock-api, draft-store |
| `lock-overlay.ts` (gantt) | draw blue/red **full-month line** + owner id | lock-store, viewport month range |
| draft MCred calc (gantt, new util) | client 7502/8002 credit recompute on draft op | draft-store, crew-store |
| `rule-confirm-dialog.tsx` (gantt) | label Revoke/Accept (behavior unchanged) | rule-check-store |
| `GanttContextProvider` wiring | resolve the above stores per `contextId` | context registry |
| scenario save path | bump `roster_version` + enqueue Spec 1 recompute | Spec 1 |

## 9. Multi-user Playwright test plan (≥ 3 users)

### Harness
Three `browser.newContext()` instances (A, B, C), each seeded with a distinct identity via `addInitScript` → `sessionStorage['rois-auth']` (pattern: `playwright.local.config.ts:34`, `scenario-gantt-edit.spec.ts:71`). All open the same live view (or same `/scenario/:id`). Cross-context assertions: drive A, assert on B/C pages. Read lock lines / MCred / bell counts through `window.__ganttTest` (deterministic, not pixel-matching). **All async assertions poll** (`expect.toPass` / retrying matchers) — never `waitForTimeout` — because WS propagation is under test (§No-Illusion).

### Case matrix (Live-1xxx for live, Scen-2xxx for scenario)

**Lock contention & month-scoping**
| # | Action | Assert A | Assert B / C |
|---|---|---|---|
| L1 | A edits crew X (June) | blue line on X across June | red line on X across June + label "A" |
| L2 | B then edits crew X (June) | — | B hard-rejected ("Locked by A"); X unchanged on B |
| L3 | B edits crew X in July | A's June lock intact | B allowed; A sees red on X-July owned "B" |
| L4 | A edits X, B edits Y, concurrent | A blue on X | B blue on Y; C red on both X("A") and Y("B") |
| L5 | A swaps X↔Y (2-crew op) | A blue on both | B rejected on either; C red on both, owner "A" |
| L6 | A edits cross-month duty (Jun→Jul) on X | A blue on X Jun and Jul | B rejected on X both months; B allowed on X in Aug |

**Pre-check isolation (editor-only)**
| # | Action | Assert A | Assert B / C |
|---|---|---|---|
| P1 | edit introduces hard violation | popup, new = highlighted bg, Cancel/Revoke only | no roster/legality change |
| P2 | edit introduces soft violation only | popup Revoke + Accept; Accept stages draft | unaffected |
| P3 | edit introduces no new violation | no popup | unaffected |
| P4 | new + pre-existing violation present | pre-existing no bg; new highlighted | unaffected |

**Draft MCred**
| # | Action | Assert A | Assert B / C |
|---|---|---|---|
| M1 | A draft change on X | X header MCred updates immediately | MCred for X unchanged until save |

**Save → broadcast (async)**
| # | Action | Assert A | Assert B / C |
|---|---|---|---|
| S1 | A saves | blue line clears | red line + "A" clears |
| S2 | A saved roster change | committed roster | updated roster for X (WS, polled) |
| S3 | save created a persisted violation | — | bell shows new violation for X (async) |
| S4 | save changed credit | authoritative MCred | MCred for X updates (async) |

**Lock release without save**
| # | Action | Assert |
|---|---|---|
| R1 | A edits X then undoes to clean | lock releases; B/C red clears; B can acquire X |
| R2 | A edits X then disconnects (no save) | after fast-expire TTL, B/C red clears; B can acquire X |

**Concurrency race / three-way observer**
| # | Action | Assert |
|---|---|---|
| C1 | A and B lock X simultaneously | exactly one wins; loser rejected; no double-lock |
| T1 | A edits X, B edits Y, C views only | C red on both w/ owners; rejected on both; after both save, C sees both updated (roster + MCred + bell) |

**Scenario parity**
| # | Action | Assert |
|---|---|---|
| SC1 | L1/L2 + S1/S2/S3 with 3 users in same scenario | identical lock/broadcast; S3 reads persisted `scenario.rule_violation` (Spec 1) after save-time recompute |

### Test-only mechanic
**R2 disconnect** depends on the lock heartbeat/TTL (300s live). Add a **test-only fast-expire** lock TTL via env (e.g. `LOCK_TTL_SECONDS` small for the e2e run) so R2 completes in seconds rather than 5 minutes. (Decision: fast-expire for tests — confirmed.)

## 10. Additional cases folded in (from review)
- **Admin lock-stealing** and **read-only viewer role** are **out of scope** for this spec unless a role model exists; revisit if/when roles land.
- **A edits while B is mid-save** is covered structurally by C1/L2 (lock is the serialization point) — Save verifies lock ownership before committing, so a non-owner mid-save is impossible.

## 11. Version bump
Backend (lock-service key, save wiring) + frontend (overlay, MCred calc, dialog, context wiring) → bump **both** `BACKEND_VERSION` and `FRONTEND_VERSION` in `gantt/src/version.ts`.

## 12. Open items for the plan
- Exact client-side credit util reuse vs. a thin port of `ruletool`'s 7502/8002 arithmetic (prefer a shared pure helper to avoid divergence).
- `roster-updated` is signal-only today; confirm observers refetch legality + MCred on it (wiring), or add explicit `violations:updated` / stats-invalidate fan-out on commit.
- Lock-overlay month-range geometry (mapping a `YYYYMM` lock to canvas x-span) for partial-month viewports.
- Scenario save endpoint shape (does it reuse `/api/draft/commit` with a scenario context, or a distinct route?).
