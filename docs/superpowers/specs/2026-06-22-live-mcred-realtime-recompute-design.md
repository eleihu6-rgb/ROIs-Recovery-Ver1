# Live Gantt — Real-time MCred Recompute (draft-aware + cross-user)

> Date: 2026-06-22
> Module: gantt (frontend) + live-server (backend)
> Status: Design — approved approach: **Hybrid** (optimistic client delta + debounced authoritative server preview)

## 1. Problem / Expectations

Today `mcred` (Month Credit, displayed in the roster-pane `MCred` column) is a **server-side
aggregate** read from `crew_manday_*_monthly.credit` via `GET /api/crew/stats`, cached per
month in `crew-store`. It only changes **after** a draft is saved (commit busts the cache) and
the async BullMQ `manday:recalc` worker rewrites the monthly table. The displayed number does
not move while the planner edits, does not revert on undo, and is not refreshed for other users.

New expectations:

1. **Per de-assignment, before save**, mcred is recalculated and updated in the UI.
2. **On undo**, mcred reverts.
3. **When user A saves**, other users are pushed the latest roster changes and their mcred updates.
4. **When user adds a duty, before save**, mcred is recalculated and updated in the UI.
5. **On undo**, mcred reverts.

## 2. Overlap audit (reuse, do not rebuild)

| Requirement | State today | Reuse |
|---|---|---|
| 1 / 4 — staging de-assign & add-duty before save | ✅ Exists | `draft-store.ts` op log (`remove`, `assign-pairing`, `move`, `swap`, `remove-pairing-from-crew`) + `applyDraftOps` replay. No new mutation plumbing. |
| 1 / 4 — per-duty credit math | ✅ Exists | `sumPairingCreditMinutes()` in `gantt/src/utils/format-credit.ts` (dedups by `dutySeq`, mirrors backend `MAX(duty_act_credited_minutes) per (pairingId,dutySeq)`); already imported by `live-gantt-source.ts`. Ground tasks carry `actCreditedMinutes`. |
| 2 / 5 — undo/redo revert | ✅ Mechanism exists | `undoOp`/`redoOp`/`clearDraft` already rewrite `operations`. If mcred is **derived** (`serverBase + draftDelta`) and recomputed from the current op list, revert is automatic. |
| 3 — cross-user push | 🟡 Partial | Server already `wsBroadcastAll({ type: 'roster-updated', crewIds })` on commit (`live-server/src/routes/draft/draft.ts:185`). Client handler (`gantt/src/stores/lock-store.ts:261`) only calls `markDirty()` — does **not** refetch roster or stats. |
| post-save cache bust | ✅ Exists | `clearCrewStatsCache()` on commit (`draft-store.ts:307`). |

**Net new work is small:** (A) derive mcred from `serverBase + draftDelta`; (B) hybrid
server-preview reconciliation; (C) make the `roster-updated` handler refetch for broadcast crews.

## 3. Design

### A. Derived mcred — optimistic client delta (req 1, 2, 4, 5)

- Add a selector in (or alongside) `draft-store.ts`:
  `draftCreditDeltaByCrew(): Map<crewId, deltaMinutes>` computed purely from
  `draft-store.operations`. Per op, signed per-crew delta:
  - `assign-pairing` / `add` → `+sumPairingCreditMinutes(segments)` (pairing) or
    `+actCreditedMinutes` (ground task) on the target crew.
  - `remove` / `remove-pairing-from-crew` → negative of the same on that crew.
  - `move` → negative on source crew, positive on target crew.
  - `swap` → both crews adjusted by the difference of swapped credit.
- `live-gantt-source.ts` (~line 525) changes the cell to
  `mcred: formatBlockMinutes(round(serverBase.mcred + delta))`.
  **No pending/estimate styling** — the number updates silently (per decision 2026-06-22).
- Because the delta is recomputed from the current `operations` array, **undo / redo / clear
  revert mcred automatically** — requirements 2 and 5 need no dedicated code.

### B. Hybrid reconciliation — authoritative server preview

- New non-persisting endpoint **`POST /api/draft/preview-stats`**
  - Body: the current draft ops (or the resulting virtual roster) + affected `crewIds` + `yearMonth`.
  - Runs the **real manday credit model** (same code the `manday:recalc` worker uses) against the
    would-be roster and returns exact `mcred` per crew. **Does not persist.**
  - Requires factoring the manday recalc credit computation into a **pure function** that both the
    worker and this endpoint call (no behavioural change to the worker).
- Client debounces (~400 ms after edits settle), calls `preview-stats`, and **replaces** the
  optimistic estimate with the authoritative value. Optimistic shows instantly; the exact value
  lands a beat later. They only differ where monthly guarantee bands / special credit rules apply
  (e.g. 8002 standalone 75/65 band, ground/leave credit) which a pure duty-delta cannot know.

### C. Cross-user push — finish the partial (req 3)

- Extend the `roster-updated` WS handler (`lock-store.ts`): for the broadcast `crewIds`,
  **refetch their roster items** and **`clearCrewStatsCache()` + refetch their crew stats** so
  user B sees the new duties **and** updated mcred live — not just a dirty flag.
- The committing user (A) already busts the cache on commit; after commit A's optimistic delta is
  zeroed (operations cleared) and the fresh server stats become the new base.

## 4. Error handling

- `preview-stats` failure → keep the optimistic estimate; do not block editing; retry on next edit.
- WS refetch failure (req 3) → fall back to the existing `markDirty()` behaviour.
- Missing `serverBase` stats for a crew (not yet loaded) → show the delta-only value once stats
  arrive; never render `NaN` (guard `serverBase ?? 0` only when a delta exists, else blank as today).

## 5. Testing (Playwright — §Playwright-Required, §No-Illusion, TDD)

All in `e2e/tests/gantt/`. **TDD discipline:** each test is written and run **red first** (it must
fail against today's code for the right reason), then made green by the implementation.

### 5.1 Single-user draft tests

1. **De-assign lowers mcred before save** — read MCred, remove a flying pairing, assert MCred
   dropped by that pairing's credit; no save performed. *Red today:* mcred is static during draft.
2. **Undo reverts mcred** — after the de-assign, click Undo, assert MCred returns to original.
3. **Add duty raises mcred before save** — drag a pairing onto a crew row, assert MCred rose.
4. **Redo / clear** — assert mcred tracks the op list.
5. **Hybrid reconcile** — after an edit, assert the authoritative value from `preview-stats` is
   reflected and matches post-save mcred for a normal flying duty.

### 5.2 TDD test case — two users A/B, live cross-user update (req 3)

**File:** `e2e/tests/gantt/mcred-cross-user-update.spec.ts`
**Intent:** User A de-assigns a duty and saves; user B — already viewing the same crew on a
**separate browser context** — sees that crew's roster **and MCred** update live, with **no manual
refresh**. This is the regression test that proves req 3, and it must be **red before** the
`roster-updated` handler is taught to refetch (today it only calls `markDirty()`).

**Setup (two isolated contexts in one test):**
- `const ctxA = await browser.newContext(); const ctxB = await browser.newContext();`
  Seed gantt auth into each via `addInitScript` (sessionStorage), using **distinct users** so the
  WS `userId` differs and A's own-change exclusion logic is exercised:
  A = `Ryan` (admin), B = `Jen` (non-admin). App base path `/fpqe/gantt/`.
- Open the Live gantt in both pages; wait for the roster pane first paint; pick a **target crew**
  that has at least one flying pairing in the current month and is visible in both viewports.
- In both pages read the target crew's `MCred` cell → `before` (assert A and B agree).

**Act (user A):**
- In page A: right-click the target crew's flying pairing → **Delete** (stages `remove` draft op),
  then **Save** (commit). Wait for the commit response and the `roster-updated` broadcast.

**Assert (user B — no manual refresh, no reload):**
- In page B, **without reloading**, `expect.poll` the same crew's `MCred` cell to change from
  `before` to the reduced value (== A's post-save MCred for that crew).
- Assert B's roster row no longer shows the removed pairing (duties refetched, not just dirty flag).
- Negative guard: a **different** crew B is viewing keeps its MCred unchanged (refetch is scoped to
  the broadcast `crewIds`, not a blanket reload).

**Red-state expectation (pre-implementation):** B's MCred stays at `before` (handler only
`markDirty()`), so `expect.poll` times out → test fails. After C is implemented (refetch roster +
stats for broadcast crewIds) the poll resolves → green.

**Run discipline:** `--workers=1` (shared remote demo DB + auth lockout sensitivity; see NPBS-bids
note), no `describe.serial` interdependence; use the `gantt-scenario-open-e2e` / live first-paint
helpers for the slow remote DB. Paste the PASS/FAIL summary into the completion message.

### 5.3 Optional: assert via store, not just the cell

To make the two-user test robust against canvas-render timing, additionally assert through
`window.__ganttTest` (B's `crew-store` stats for the crew) so the test fails on data, not pixels.

## 6. Out of scope

- Converging `quality-analysis.ts#pairingCreditMin` (scenario) with `sumPairingCreditMinutes`
  (live) into one util — a tidy follow-up, not required here.
- Scenario gantt mcred behaviour (this spec is Live-only; the credit util is already shared).
- Changing the manday credit model itself.
