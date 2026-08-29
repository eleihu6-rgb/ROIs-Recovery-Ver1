# Handoff — R'Bot Phase 1: Live Roster core edits via chat

- **Date:** 2026-08-28
- **Area:** `gantt/src/components/ai-chat/` (frontend dispatch) + `ai-server/src/chat/` (LLM tool schemas)
- **Status:** Implemented and verified for `add_ground_task`. `move_task` / `swap_tasks` / `unassign_task` share the same code path but are only unit/pytest-covered — **no manual smoke test and no Playwright coverage yet** (see Gaps below).
- **Plan of record:** `/Users/kimi/.claude/plans/wondrous-jumping-lynx.md` (already approved before this work started — read it first, it has the full rationale).
- **Owner:** dev team (frontend gantt + ai-server).

## 1. What shipped

R'Bot could previously only filter/sort/read the board (capability audit found 0 of ~138 mutating operations reachable from chat). This phase adds 4 real Live Roster mutations, reachable by plain-English chat instruction:

| Capability | Store function reused (unmodified) | Example instruction |
|---|---|---|
| Move a duty to another crew | `roster-store.ts moveTask()` (`:473-562`) | "move crew 10234's Aug 30 pairing to crew 88812" |
| Swap two crews' duties | `roster-store.ts swapTasks()` (`:564-651`) | "swap crew 10234 and crew 88812 on Sep 1" |
| Unassign / remove a duty | `roster-store.ts removeTasksByPairingAndCrew()` / `removeTask()` | "take crew 10234 off pairing CX1234" |
| Create a ground task | `roster-store.ts addGroundTask()` (`:737-831`) | "give crew 10234 a day off on Sep 5" |

**Two scoping decisions were made with Ryan up front and hold for all future work on this feature:**

1. **"Assign pairing to crew" is deliberately NOT in this phase.** Unlike the 4 above, it only exists as ~180 lines inlined in the drag handler (`app-layout.tsx:162-323`) — extracting it into a reusable function is real work on the single most-used interaction in the app and needs its own regression pass. It's the natural next slice once this pattern is proven, not a bug.
2. **R'Bot never calls Save.** Every mutation above queues into the same draft store a manual drag-drop uses — visible immediately as a pending/dirty change — and a human must click Save (or Ctrl+S) to write to the DB. No "commit" tool is exposed to the LLM, on purpose. This is the safety net: even a misread instruction can't reach the database unattended.

## 2. Architecture / data flow

```
user types instruction
  → POST /altair/ai/chat (ai-server, port 3005)
  → SYSTEM_PROMPT + TOOLS (ai-server/src/chat/tools.py, routes.py)
  → LLM tool call → tool_call_to_action() → AiAction[] (raw, no {code,data} envelope)
  → gantt: use-ai-chat.ts — sequential `for (const action of resp.actions) { await dispatchAiAction(action) }`
  → dispatch-ai-action.ts — resolves crewId/pairingLabel/date to internal taskId/pairingId,
    calls the matching roster-store function directly (same function a drag-drop calls)
  → roster-store.ts — optimistic draft.addOp() (moveTask) or check-then-addOp (addGroundTask)
    → checkLiveDraftLegality() → POST /api/legality/preview-draft (Rust rule engine)
      → if new violation introduced: useRuleCheckStore.showConfirmDialog() → RuleConfirmDialog
        → severity < 3 (soft): "Continue Anyway" button shown, proceeding keeps the op staged
        → severity 3 (hard/blocking): no Continue button, only Cancel
  → success or failure string returned → rendered as an `ai-chat-applied` chip in the chat thread
  → draft-save-btn badge shows pending op count; human clicks Save to commit
```

Key asymmetry worth remembering: `moveTask` applies the draft op **optimistically first**, then reverts (`removeOp`) if the legality check disallows it. `addGroundTask` checks legality **first** and simply never calls `addOp` if disallowed — no revert needed. This is why `add_ground_task` was chosen as the Playwright test vehicle (see §4): it's the only one of the four with a single, deterministic legality-check call and no revert step to race.

Both `AiChatPanel` and `RuleConfirmDialog` are mounted globally in `AppShell` (`gantt/src/components/shell/app-shell.tsx`, ~line 182), not scoped to a fully-bootstrapped Live view — they work the same way across Live and Scenario tabs.

## 3. Files touched

- `gantt/src/components/ai-chat/types.ts` — added `move_task` / `swap_tasks` / `unassign_task` / `add_ground_task` to the `AiAction` union.
- `gantt/src/components/ai-chat/dispatch-ai-action.ts` — new async cases + `resolveCrewTasks` / `resolveGroundTaskAssignment` entity-resolution helpers. `dispatchAiAction` is now `async`, returns `Promise<string | null>`.
- `gantt/src/components/ai-chat/use-ai-chat.ts` — loop changed from sync `.map` to sequential `for...of` with `await`, so two dependent edits in one instruction don't race each other's lock/legality checks.
- `gantt/src/components/ai-chat/__tests__/dispatch-ai-action.test.ts` — unit coverage for the new dispatch cases (currently shows as locally modified — check `git status` before assuming it's committed).
- `ai-server/src/chat/tools.py` — new tool schemas (`move_task`, `swap_tasks`, `unassign_task`, `add_ground_task`) + `tool_call_to_action()` branches.
- `ai-server/src/chat/routes.py` — `SYSTEM_PROMPT` extended with guidance on the 4 new tools (resolve relative dates first; ask instead of guessing when a crew has multiple duties loaded and no pairingLabel/date is given).
- `ai-server/tests/test_chat_tools.py` — pytest coverage for the new tools' normalization/validation.
- `ai-server/CLAUDE.md` — routes table updated to document the new tools as staging-only.
- **New this session:** `e2e/gantt/roster/ai-chat-roster-edits.spec.ts` — Playwright coverage (see §4).

## 4. Test coverage — what's actually verified

**Playwright (new, this session).** `e2e/gantt/roster/ai-chat-roster-edits.spec.ts`, 3 tests, all built around `add_ground_task` (chosen for determinism — see §2). Drives the real UI (`ai-chat-toggle` → `ai-chat-input` → `ai-chat-send`), mocking only the LLM call (`**/altair/ai/chat`) and the two backend calls it triggers (`**/api/assignment`, `**/api/legality/preview-draft`) so it's deterministic; everything else (dispatch, store, draft, legality gate, confirm dialog) runs for real.

```
3 passed (3.7s)
✓ add_ground_task stages a pending change without saving
✓ a soft rule violation shows the confirm dialog; Continue Anyway keeps the staged change
✓ a blocking rule violation shows the confirm dialog with no Continue option; Cancel discards the change
```

Run it (note: this file lives under `e2e/gantt/`, which is **not** covered by the default `e2e/config/playwright.config.ts` — see the gotcha below):

```bash
# terminal 1: gantt dev server must be running
cd gantt && npx vite --port 5173
# terminal 2: live-server must already be running (port 3000)

cd e2e && GANTT_BASE_URL=http://localhost:5173 \
  npx playwright test --config=config/crew-validity.local.config.ts \
  roster/ai-chat-roster-edits.spec.ts --reporter=list
```

**⚠️ Config gotcha (cost real time this session):** `e2e/gantt/roster/*.spec.ts` files do NOT run under `e2e/config/playwright.config.ts` (that one's `testDir` is `e2e/tests`, matching only `tests/gantt/*.spec.ts`). They run under `e2e/config/crew-validity.local.config.ts` (`testDir: e2e/gantt`), which — unlike the main config — does **not** manage its own dev servers (`webServer: []`). You must start `gantt` (and have `live-server` already running) yourself first, or every test times out waiting for `draft-save-btn`.

**Vitest / pytest (from the prior implementation session, not re-run this session):** `gantt/src/components/ai-chat/__tests__/dispatch-ai-action.test.ts` and `ai-server/tests/test_chat_tools.py` — confirmed passing when the feature was originally implemented, but were not re-run in this session. Re-run before shipping:

```bash
cd gantt && npx vitest run src/components/ai-chat/__tests__/dispatch-ai-action.test.ts
cd ai-server && .venv/bin/python -m pytest -v
```

**`npm run check:ui`** — run this session, 0 hard violations (pre-existing warnings only, unrelated to this feature).

## 5. Gaps — not done yet

1. **No manual smoke test against the live dev stack.** The plan's verification section calls for asking R'Bot (with a real LLM) to move/swap/unassign/add-a-ground-task for a currently-loaded crew and confirming the pending change shows on the Gantt and Save commits it. Not attempted this session — the Playwright spec mocks the LLM call entirely, so it does not exercise the real `SYSTEM_PROMPT` → LLM → tool-call round trip.
2. **`move_task` / `swap_tasks` / `unassign_task` have no Playwright coverage.** They share `checkLiveDraftLegality` and the confirm-dialog path with `add_ground_task`, but `moveTask`'s optimistic-apply-then-revert behavior (see §2) is untested end-to-end through the real UI. If you pick this up: seed `useRosterStore`'s pane with `crewList`/`rosterItems` (unlike `add_ground_task`, these need a duty already loaded to move/swap/unassign) and expect **two** `/api/legality/preview-draft` calls in the violation case (a "before" and "after" baseline diff), not one.
3. **`updateTask`** (edit an existing task's fields) was called out in the plan as a zero-risk stretch item — not implemented.
4. **Pre-existing gap, explicitly not inherited but also not fixed:** `deletePairings` and `create-pairing-from-flights` push a raw `DraftOp` with no lock acquisition and no legality check at all. R'Bot doesn't expose either to chat, so this gap isn't made worse — but it's a real gap in manual drag-drop today, worth a separate fix.
5. **Assign-pairing-to-crew** — deferred by design (see §1, decision 1). Next natural phase: extract the inline drag-handler logic (`app-layout.tsx:162-323`) into a reusable store function, the same way `moveTask`/`swapTasks`/etc. already are, then wire it up the same way this phase did.

## 6. Resolved this session (no action needed)

- **RBOT menu privilege**: confirmed via direct read-only query against `f8_sit_live` (or whichever schema `live-server/.env`'s `DATABASE_URL` currently points at) that the `Administrator` profile (`profile.id=17`) already has `profile_menu_privilege` granted for `menu_code='RBOT'` (`is_hidden='N'`). The `admin` e2e test account sees `AiChatPanel` / `ai-chat-toggle` normally — no DB write, no test-seeding workaround needed.

## 7. Flagged, not investigated further (low priority)

`live-server/.env`'s `DATABASE_URL` was observed pointing at the `f8_sit_live` schema rather than `f8_dev_live`, which looks inconsistent with root `CLAUDE.md`'s prescribed local-dev schema mapping (local dev should be `f8_dev_live`). Did not affect this feature's testing (the e2e spec talks to whatever `live-server` is already running against), but worth a sanity check before trusting local writes stay out of SIT.

## 8. Keyword/trigger reference (from the live `SYSTEM_PROMPT`, `ai-server/src/chat/routes.py`)

For QA / future prompt tuning — the exact phrasing patterns R'Bot currently recognizes:

| Feature | Say something like |
|---|---|
| Move a duty | "move crew X's [pairing] to crew Y" |
| Swap two crews' duties | "swap crew X and crew Y [on date]" |
| Unassign / remove a duty | "take crew X off [pairing]" |
| Add a ground task | "give crew X a day off / training / standby on [date]" |
| Filter roster/crew/pairing/flight | "filter to base X", "show only rank CA" |
| Sort roster | "sort by rank then crew id descending" |
| Change planning date range | "show me next week" |
| Reset all filters | "reset filters" |
| Prepare PA removal (read-only memo) | "remove pre-assignment for solver" |
| Simulate crew bids to portal | "simulate crew bids for August BJS FO" |

Behavioral notes baked into the prompt: relative dates are resolved to absolute `YYYY-MM-DD` before any tool fires; if a crew has multiple duties loaded and the instruction doesn't disambiguate (no pairingLabel/date), R'Bot asks instead of guessing; missing required fields (e.g. crew-bids with no rank) also produce a clarifying question instead of a tool call.

## 9. How to resume

1. Read `/Users/kimi/.claude/plans/wondrous-jumping-lynx.md` first — full original rationale.
2. Read this file for current status.
3. Pick up at §5 Gaps — item 1 (manual smoke test) or item 2 (Playwright coverage for move/swap/unassign) are the most valuable next steps before calling Phase 1 fully done.
4. No commits have been made for this feature under `§No-Auto-Commit` — check `git status` before assuming any of the files in §3 are already committed.
