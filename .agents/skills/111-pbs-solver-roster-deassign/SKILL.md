---
name: 111-pbs-solver-roster-deassign
description: Visualize and execute PBS-solver pre-assignment (PA) removal — the read-only de-assignment analysis that marks each to-be-removed crew duty (flying pairings + days off) with a crew-memo note icon on the live gantt, the planner confirms/corrects, then an explicit order soft-deletes the approved rosters. Use when the user says "remove pre-assignment (PA) for solver", "mark to-be-de-assigned duties", "crew memo", "memo icon", or wants to clear crew duties to make room for the PBS solver; or when extending the crew-memo CRUD / classifier / R'Bot prepare_pa_removal tool.
---

# PBS Solver Roster De-assignment (PA removal) + Crew Memo

The 3-stage, human-in-the-loop pipeline to clear crew duties for the PBS solver.
Memos are the shared artifact between R'Bot's proposal and the real mutation.

1. **Bot visualizes** — `POST /api/crew-memo/pa-removal` runs the read-only classifier
   and writes one `type=3` memo per to-be-de-assigned duty. Opening the live gantt
   shows a yellow sticky-note icon on each affected puck.
2. **Planner confirms/corrects** — edit the memos (right-click a duty → Add/Edit/Delete
   Memo). Surviving `type=3` `status='Y'` memos ARE the approved plan.
3. **Execute (explicit order)** — `POST /api/crew-memo/pa-removal/execute` soft-deletes
   (`is_deleted=1`) the roster rows behind the approved memos. Never automatic.

## Key facts (verified)

- **Reuse the existing `crew_memo` table** (`sql/schema/live/02-crew-roster.sql`) — range
  based (`str_dt_loc`/`end_dt_loc`), `status` Y/N soft-delete, `type` 1=manual·3=bot,
  `name`(title)+`memo`(body), `roster_id` anchor. No new table, no migration.
- **Classifier** (`live-server/src/services/crew-memo/deassign-analyzer.ts`, pure):
  - DE_ASSIGN: flying pairings (`FLY`) + days off (`DO`).
  - NO_TOUCH: `VAC`/`RES`/`SIM`/`GRD`/`ILL`/… plus exceptions that pull FLY/DO back:
    sim-commute (an `F8####` positioning pairing immediately before the first SIM and
    after the last SIM of a contiguous block), lead-in (starts prior month, ends this),
    tail (starts this month, ends next), and the 2 days off each side of a VAC block.
- **⚠ Timestamp gotcha (cost hours):** `sch_str_dt_utc`/`sch_end_dt_utc` are
  `timestamp` WITHOUT tz storing UTC. Both raw `node-pg` AND drizzle parse them in the
  machine's LOCAL zone (America/Vancouver, −7h), shifting values and faking
  month-boundary crossings. The loader MUST read them as true UTC via
  `to_char(col, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')` — do NOT trust `.toISOString()` on a
  drizzle/pg Date for these columns. (This is why 98796 looked like a tail but is
  actually an all-Jun-30 pairing → de-assign.)
- **Verified plan counts (June 2026, true UTC):** crew 113 = 6 flying + 21 DO;
  535 = 5 flying + 10 DO (VAC Jun22-26 protects Jun20/21/27/28; F8604/F8601 sim-commutes
  excluded); 927 = 1 flying + 0 DO (sim-heavy); 390 = 8 flying + 16 DO.
- **Gantt rendering** (`gantt/src/components/gantt/memo-overlay.ts` +
  `renderers/roster-renderer.ts`): note badge keyed by `roster_id` (memoRosterIds set on
  `RosterRenderContext`), drawn at the puck's top-left so it never overlaps the violation
  bell. Shared roster layer → Live + Scenario. Store: `gantt/src/stores/crew-memo-store.ts`
  (fetched post-first-paint; `refreshNonce` forces a reload after R'Bot writes a plan).
- **R'Bot** (`ai-server/src/chat/tools.py` `prepare_pa_removal`) → `AiAction` dispatched in
  `gantt/src/components/ai-chat/dispatch-ai-action.ts` → calls the API, bumps the store.
  Trigger phrase: "remove pre-assignment (PA) for solver".

## Endpoints

```
GET    /api/crew-memo?crewIds=a,b&from=ISO&to=ISO     # visible (status=Y) memos
POST   /api/crew-memo   {crewId,strDtLoc,endDtLoc,memo,name?,type?,rosterId?}
DELETE /api/crew-memo/:id                             # status='N'
POST   /api/crew-memo/pa-removal   {bases?,ranks?,crewIds?,from,to}          # stage 1
POST   /api/crew-memo/pa-removal/execute   {crewIds?,from,to}                # stage 3
```

## Drive it / verify

- Headed browser pinned to a crew with memos:
  `node e2e/scripts/verify-memo-patient.mjs` (polls until roster items stream from the
  slow remote demo DB, then screenshots `e2e/scripts/memo-crew113.png`).
- E2E (run live-server :3000 + gantt :5173 first):
  `npx playwright test --config=config/playwright.config.ts --project=gantt tests/gantt/crew-memo.spec.ts tests/gantt/pa-removal.spec.ts`
  - Live-1301 CRUD · Live-1302 stage-1 counts · Live-1303 icons render (slow, waits on
    roster stream) · Live-1304 3-stage + safety gate (manual type=1 never executed).
- Unit: `cd live-server && npx vitest run src/services/crew-memo/` (classifier + loader + mapper).

## Executing the plan through the REAL gantt UI (bulk de-assign, §Simulate-User)

Stage 3 has **no Execute button** in the gantt — `executePaRemoval()` is a service fn with no
UI. The de-assign UI that DOES exist is the generic roster edit flow, and that is what a
Playwright run MUST drive (never call the delete/execute API directly — see
[[playwright-simulates-real-user]] / CLAUDE.md §Simulate-User):

> **select marked duty pucks → `Delete` key → `Save`**

- The gantt is **always in draft mode**: `Delete` only stages a local remove op; nothing
  persists until **Save** (`Ctrl+S` or the `draft-save-btn`) commits via `POST /api/draft/commit`.
- Driver script: `e2e/scripts/deassign-via-ui-delete.mjs`. Env: `BASES`, `RANKS`, `DIVISIONS`
  (default `P`), `CREW_IDS` (overrides base/rank — load exact crew by id), `FROM_DATE`
  (widen the visible window). Per crew: read type-3 marked rows via `memoBadges()` →
  `selectRosterTasks(ids)` → blur → `Delete` → click `draft-save-btn` → **wait for the
  "Changes saved successfully" toast** (the ONLY honest commit signal — local draft clears
  on Delete and lies, so confirming via local state silently under-commits).
- testids added for this: `draft-delete-btn`, `draft-save-btn`, `rule-confirm-proceed`.
- Scroll the active crew into view with `__ganttTest.scrollPaneVertically('roster', dy)` +
  `paneScrollY('roster')` — pane type is **`'roster'`**, not `'roster-main'` (that's only a
  render label; wrong prefix = no scroll). Pin the crew ~2 rows below the top.

### Gotchas that cost real time (all confirmed against the DB)

- **Delete is ignored when focus is in an `<input>`** (the keydown guard). After editing
  the date range, `document.activeElement.blur()` before pressing Delete or nothing happens.
- **Wait for the badge count to STABILIZE** before walking the list — memos stream in after
  first paint, so an early read makes the loop skip crew whose icons hadn't arrived.
- **Base filter ≠ crew_base prime base**: multi-base crew (e.g. bases `[YEG,YVR,YYC]`) file
  under another base in the gantt, so a `base=YVR` filter never loads them. Finish stragglers
  by loading them with `CREW_IDS=` (get the list from the DB query below).
- **Boundary duties** (e.g. a `DO` dated May-31 spanning into Jun-1) render before the default
  June window → set `FROM_DATE=2026-05-30` so they appear and can be selected.
- Verify remaining with (crew_memo.crew_id is varchar; cast crew.id::text when joining crew):
  `SELECT cb.base,count(*) FROM crew_memo cm JOIN roster_flight rf ON rf.id=cm.roster_id AND rf.is_deleted=0 JOIN crew_base cb ON cb.crew_id=cm.crew_id AND cb.is_prime_base=1 WHERE cm.type='3' AND cm.status='Y' GROUP BY cb.base`
- **DONE 2026-06-22**: all YYZ/YVR prime-base pilots de-assigned via this UI flow —
  YVR 2129 + YYZ 2856 marked duties soft-deleted, 0 open remaining.

## Gotchas

- The live demo DB is REMOTE + slow; roster *items* stream in well after first paint.
  Poll `window.__ganttTest.roster()` / `memoBadges()` rather than fixed waits.
- Multiple stale `tsx watch` live-server processes can serve :3000 with old code — if an
  endpoint result looks stale, `pkill -f "live-server/node_modules/.bin/tsx watch"` and
  `cd live-server && npm run dev`.
- Stage 3 is destructive (soft-delete real rosters). Tests prove the SAFETY gate
  (type=1 ignored) rather than deleting real crew data.
- Spec/plan: `docs/superpowers/specs/2026-06-21-crew-memo-pa-removal-design.md`,
  `docs/superpowers/plans/2026-06-21-crew-memo-pa-removal.md`.
