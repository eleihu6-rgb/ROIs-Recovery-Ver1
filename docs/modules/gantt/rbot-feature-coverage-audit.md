# R'Bot feature coverage audit — Live Gantt (2026-09-30)

Goal (spec `docs/superpowers/specs/2026-09-30-rbot-gantt-viewport-awareness-design.md` §12): R'Bot can operate
every existing Live Gantt feature as the user. This is the gap list after P3. Source: read-only audit of
context menus (`roster/context-menu.tsx`), pane toolbar (`panes/pane-condition-strip.tsx`), top toolbar
(`shell/gantt-sub-toolbar.tsx`), dialogs, draft toolbar and store actions. Line numbers were approximate at
audit time — re-verify before wiring.

## Covered (19 tools)

`filter_crew`, `filter_pairing`, `filter_flight`, `sort_roster`, `reset_filters`, `set_date_range`,
`create_crew_bids`, `prepare_pa_removal`, `auto_assign_pairings`, `build_pairings`, `move_task`, `swap_tasks`,
`unassign_task`, `add_ground_task`, P3's `save_changes` (plan card → confirmed Save) and `undo_changes`, and
`recover_violation` / `recover_open_pairing` / `best_fit_crew` (open the existing Recovery / Best-fit dialogs, scoped;
planner Applies, then Saves).
Plus View Gantt read / diff (not a tool — a button).

## Not covered — ranked by planner value

| # | Action | Reuse | Mutates | Notes |
|---|---|---|---|---|
| ~~1~~ | ✅ DONE 2026-09-30 — Recovery: fix a violation (8004 / 1001 / 3007) or staff open seats | `services/recovery-trigger.ts`, `open-pairing-recovery.ts`, `recovery-draft.buildRecoveryDraftPlan`; `recovery:open` event opens the dialog | draft | Highest value; options + preview + apply flow already exists |
| ~~2~~ | ✅ DONE 2026-09-30 — Best-fit crew for an open pairing ("who can fly X?") | `open-pairing-recovery.buildStaffingOptions`, `bestFitStore.openWith` | none → draft on apply | Natural chat question; pairs with View Gantt open-pairing list |
| 3 | Find / show crew, crew info, pairing / flight detail, Locate | `utils/find-crew.findCrewToTop`, `uiStore.openCrewInfo/openPairingInfo/openFlightDetail` | none | Cheap, read-only |
| 4 | Crew memo add / edit / delete | `crewMemoApi.save/remove` + `crewMemoStore` | server (immediate) | Needs confirm — bypasses draft |
| 5 | RES pairing create / manage | `resApi.generate/batchUpdate/batchDelete` | server (immediate) | Skills 128 / 138; needs cell-definition inputs |
| 6 | Publish roster | `rosterPublishApi.diff` → `apply` | server | Hard limit today (§16.6 import/publish) — diff-only read is safe |
| 7 | Delete pairing / delete flight from pairing | pairing-api + `pairing-store.removeItem` | server / draft `remove-pairing` | Hard limit under L2 (manual Save only) |
| 8 | Edit a task's times / details | `roster-store.updateTask` | draft | L2-savable op type `update` already allowed |
| 9 | Sort pairing pane | `pairing-store.applySort` | none | Small extension of `sort_roster` |
| 10 | Open Alert Center / a crew's violations | legality / session-violation stores | none | Read-only; complements "which crew have alerts?" |

Lower value: bulk-delete roster flights (high risk), refresh / layout / zoom / timezone, day statistics.

## Rules for adding one

- Add the action to `ai-server/src/chat/tools.py` (tool + `tool_call_to_action`) and
  `gantt/src/components/ai-chat/dispatch-ai-action.ts`, reusing the store/service the UI button calls.
- Draft-staging actions: add to `PLAN_ACTIONS` in `use-ai-chat.ts` so a plan card appears; if its draft op
  type should be L2-savable, add it to `L2_SAVABLE_OP_TYPES` in `rbot-plan.ts` (default: manual Save).
- Actions that write to the server immediately (memo, RES, publish) do not go through the draft, so they
  need their own confirm card before they may run — not built yet.
- If the action benefits from "for this view", register its fields in `VIEW_DEFAULT_FIELDS`.
