# Crew Memo + PA-removal visualization — Design

> Date: 2026-06-21
> Status: approved (design) — pending spec review
> Modules: `live-server`, `gantt`, `ai-server`, `sql` (reuse only), `e2e`

## 1. Goal

Two intertwined capabilities:

1. **Crew Memo** — planners (and the bot) can add / edit / delete a free-text memo
   attached to a crew over a **date range**. Once saved, a sticky-note icon shows on
   that crew's row for the range, positioned to avoid overlapping the existing duty.
2. **PA-removal visualization** — a bot keyword *"remove pre-assignment (PA) for
   solver"* runs a **read-only** de-assignment analysis and writes one memo per
   to-be-removed duty (`type=3`). Opening the live gantt then shows every flagged
   duty with the note icon, so the planner can **confirm what will be de-assigned
   before any real removal happens**.

## 1a. The 3-stage workflow (confirmed)

The whole story is a human-in-the-loop pipeline. Memos are the shared artifact
between the bot's proposal and the real mutation:

1. **Bot visualizes** — the bot runs the read-only de-assignment analysis and writes
   one `type=3` memo per to-be-de-assigned duty. Opening the live gantt shows the
   note icons (the proposed plan).
2. **Planner confirms or corrects** — the planner reviews the icons and adjusts the
   plan *by editing the memos*: delete a memo to keep that duty, add a memo to remove
   one the bot missed, edit text. The surviving `type=3` (`status='Y'`) memos ARE the
   approved plan.
3. **Execute on explicit order** — only when the planner gives the order does stage 3
   run the **real de-assignment**: for each approved memo it soft-deletes the matching
   `roster_flight` rows (`is_deleted=1`) via the existing roster delete endpoints. This
   clears the duties so the PBS solver can re-assign the month.

Stage 3 is **gated behind an explicit user action** — never automatic, never a side
effect of visualizing. Stages 1–2 never mutate rosters.

## 2. Data model — reuse existing `crew_memo` (NO new table)

`crew_memo` already exists in `sql/schema/live/02-crew-roster.sql` and in the live
DB (0 rows). It is range-based and soft-deletable. We add **no migration**.

| purpose | column | notes |
|---|---|---|
| crew | `crew_id varchar` | matches `roster_flight.crew_id` (employee code) |
| range start/end | `str_dt_loc`, `end_dt_loc timestamptz` | local-time range the memo covers; a memo may span many days (a multi-day pairing or a DO block) |
| body | `memo varchar(300)` | e.g. `"V4110 (10827)"` or `"DO"` |
| title | `name varchar(255)` | e.g. `"De-assign pairing"` / `"De-assign day off"` |
| kind | `type smallint` | **1** = manual note · **2** = warning · **3** = system/bot-generated (PA-removal) |
| soft delete | `status varchar(10)` | `Y` visible · `N` removed. **Delete = set `status='N'`** (physical delete not used) |
| optional link | `roster_id bigint` | link to the `roster_flight` row when known |
| audit | `created_by/at`, `updated_by/at`, `user_id`, `tmst` | per global CLAUDE.md |

Rules:
- **Multiple memos per crew** are allowed; each carries its own range.
- A bot PA-removal memo is always `type=3`; a manual user note is `type=1`. The bot
  never edits/deletes `type=1` rows — manual notes are never clobbered.
- "Re-running" PA-removal for a crew/range first sets prior `type=3` rows in that
  window to `status='N'`, then inserts the fresh plan (idempotent refresh).

## 3. De-assignment analysis rules (read-only classifier)

Input: a crew set (bases + ranks + optional crewIds) and a target month
(date range). Default crew set is **prime-base = given base(s), rank ∈ {CA, FO}**;
fully parameterized (no hard-coded airline/base/rank), per global §参数化.

Per crew, classify each duty in the target month:

| disposition | applies to |
|---|---|
| **DE-ASSIGN** | flying pairings (`FLY|FLY`) and days off (`GRD|DO`) |
| **NO-TOUCH** | `VAC`, `RES`(PRAM), `SIM`, `GRD`, `ILL`, `DHD`, and all non-FLY/DO assignments |

Exceptions that move a FLY/DO item to **NO-TOUCH**:

1. **Sim-commute pairings (3.1):** the positioning flights that ferry a crew to/from
   a simulator block. Heuristic: a flying pairing **immediately before the first SIM
   and immediately after the last SIM** of a contiguous sim block, carrying an
   **`F8####` pairing label** (airline positioning flights; single-segment). These are
   protected. Line flying (`V4xxx` / `T4xxx`, multi-segment) is never a commute.
2. **Lead-in pairing (3.2):** a pairing that **starts in the prior month and ends in
   the target month** (crosses the May→Jun boundary). Protected.
3. **Tail pairing (3.2 mirror):** a pairing that **starts in the target month and
   ends in the next month** (Jun→Jul). Default: protected (symmetric to lead-in).
   *(Confirm-via-memo: surfaced as a flagged item; planner can override.)*
4. **VAC-adjacent days off (3.3):** the **2 days off immediately before** and the
   **2 days off immediately after** each VAC block are protected (kept attached to
   the annual-leave block). Further-out DOs are de-assigned.

Ambiguities are written as memos for visual confirmation, not silently resolved:
- A high-ID flying pairing near a sim block whose label is **not** `F8####` (e.g.
  `VB8221`) defaults to **DE-ASSIGN** (it is not a positioning flight).
- Tail pairings default to **NO-TOUCH** (see #3).

### Worked examples (June 2026, YVR, CA/FO) — used as acceptance fixtures

> **Times are TRUE UTC** (read via `to_char`, not via drizzle/node-pg Date parsing,
> which shifts `timestamp`-without-tz columns by the machine offset — Vancouver −7h —
> and would fake month-boundary crossings). Verified live against the endpoint.

| Crew | DE-ASSIGN flying (count) | DE-ASSIGN days off | NO-TOUCH (key) |
|---|---|---|---|
| **113** Mammel (CA) | 6 | 21 DOs | lead-in TB7976 (crosses May→Jun), tail 61681 (Jun30→Jul1) |
| **390** Charbonneau | 8 (incl VB8221) | 16 DOs — **Jun 1 protected** (2nd DO after May VAC) | VAC, SIM, commutes F8606 / F8601 |
| **535** Camplin | 5 | 10 DOs — **4 DOs protected** (2 each side of VAC Jun22-26) | commutes F8604 / F8601, SIM×2, GRD; 98796 is all-Jun30 (NOT a tail) |
| **927** Sinclair | 1 | none (927 has no DOs) | 2 SIM blocks + 4 commutes (F8606/F8601 ×2) |

Open data questions (defaults chosen; planner may override via the visual confirm):
- Tail pairings 61681 / 98796 → default NO-TOUCH.
- 97297 (VB8221) → default DE-ASSIGN.
- Crew-set size: query yields 70 (prime-base YVR + CA/FO + has June roster) vs the
  stated 73; the gap is crew with no June duties. Final set is parameterized; planner
  may supply the exact crew list.

## 4. Icon — remaster

Source reference: flat yellow sticky note, coral push-pin (top-center), folded
bottom-right corner, 3–4 red/orange horizontal text lines.

- **Asset:** `gantt/src/assets/memo-note.svg` — used in the context menu and dialog.
- **Canvas:** new `gantt/src/components/gantt/memo-overlay.ts` exporting
  `MEMO_BADGE_SIZE`, `memoBadgePosition(...)`, and `drawMemoBadge(ctx, x, y)` — mirrors
  `violation-overlay.ts`. Draws the note shape with the canvas 2D API (no external
  image load on the hot render path).
- **Placement / overlap avoidance:** when a duty puck occupies the crew row at the
  memo's start day, the badge anchors to a **free corner** of that day cell (top-left
  by default, falling back to top-right) so it never sits on top of the puck; on an
  empty day it centers. One badge per memo, drawn at the memo's start day.

## 5. live-server CRUD — `/api/crew-memo`

| method | path | body / query | returns |
|---|---|---|---|
| GET | `/api/crew-memo` | `?crewIds=a,b&from=ISO&to=ISO` | `{code,data: Memo[]}` — `status='Y'` only, batched, loaded **after** first paint (like violations) |
| POST | `/api/crew-memo` | `{crewId, strDtLoc, endDtLoc, memo, name?, type?, rosterId?}` | upserts; returns the row |
| DELETE | `/api/crew-memo/:id` | — | sets `status='N'`; returns `{code,data:{id}}` |
| POST | `/api/crew-memo/pa-removal` | `{bases?, ranks?, crewIds?, from, to}` | **stage 1** — runs the §3 classifier, refreshes `type=3` memos, returns `{written, byCrew}` |
| POST | `/api/crew-memo/pa-removal/execute` | `{crewIds?, from, to}` | **stage 3** — for each approved (`type=3`, `status='Y'`) memo in range, soft-deletes the matching roster rows; returns `{deassigned, byCrew}` |

Stage 3 reuses the existing soft-delete paths rather than inventing new mutation
logic: a flying-pairing memo → `POST /api/roster/pairing/:pairingId/crew/:crewId/delete`
(batch-deletes the pairing's rows for that crew); a day-off memo → `POST /api/roster/:id/delete`
(by `roster_id`). All set `is_deleted=1`. Execution runs in a transaction per crew and
is idempotent (already-deleted rows are skipped). It requires an **explicit caller**
(planner action / authenticated order) — it is never triggered by the bot or by
opening the gantt.

- Zod-validated inputs; `{code,data}` envelope; service in
  `live-server/src/services/crew-memo/`, route in `live-server/src/routes/`.
- First-paint rule: memo fetch is scoped to the **loaded crew set** and never blocks
  or delays the roster/flight first frame (global §First-Paint).

## 6. Frontend story (shared roster layer → Live + Scenario)

Per §Gantt-Unify, memo rendering lives in the **shared roster layer**
(`gantt/src/components/panes/shared/`), consuming a `crew-memo-store` (Zustand);
data is wired for **Live first** via the live source adapter.

1. **Add** — right-click a crew day (or a duty puck) → context-menu **"Add memo"**.
   On a puck it prefills `memo` from the pairing label+id or assignment code, and the
   range from the duty. Opens **`AppDialog`** (blue title bar, note icon, draggable)
   with a text field (+ optional title). Save → POST → store updates → icon renders.
2. **Icon** — the remastered note badge on the crew row (§4).
3. **View / Edit** — click the icon → popover shows `name` + `memo`; **Edit** reopens
   the dialog, **Delete** calls DELETE → icon disappears on next render.
4. **PA-removal visualization** — after the bot writes `type=3` memos, the loaded
   gantt shows them all; planner scans the note icons to confirm the plan.

## 7. Bot wiring — new `/ai/chat` tool

Add a 7th tool to `ai-server/src/chat/tools.py`:

- **`prepare_pa_removal`** — description triggers on *"remove pre-assignment (PA) for
  solver"* and similar. Params: `bases[]`, `ranks[]`, `crewIds[]`, `from`, `to`.
- The chat handler emits an `AiAction` of a new kind `prepare_pa_removal` that the
  gantt dispatches: it calls `POST /api/crew-memo/pa-removal`, then refreshes the
  memo store so icons appear. (Consistent with the existing NL→AiAction[]→store flow.)
- The action is **read-only w.r.t. rosters** — it only writes `type=3` memos.

## 8. Skill + tests

- **Skill `111-pbs-solver-roster-deassign`** — Playwright headed driver that runs the
  full path: seed auth → open live gantt → trigger PA-removal (via the bot keyword or
  the API) → load crew set (e.g. YVR CA/FO, June 2026) → assert note icons on the
  flagged duties for 113/390/535/927.
- **`e2e/tests/gantt/crew-memo.spec.ts`** (content-asserting, per §No-Illusion):
  - add memo → icon present + popover shows the exact `memo` text
  - edit → text changes
  - delete → icon gone (count 0) and GET returns no `status='Y'` row
  - overlap → badge rect ≠ duty puck rect via `window.__ganttTest`
  - batch GET scoped to loaded crew; does not run before first paint
- **`e2e/tests/gantt/pa-removal.spec.ts`** — the 3-stage workflow on the 4 sample crew:
  - *stage 1* — trigger PA-removal; assert de-assign memo counts match the §3 fixtures
    (e.g. 535 → 4 flying + 10 DO), and sim-commutes / lead-in / tail / VAC±2-DO are
    **not** flagged.
  - *stage 2* — delete one memo (a correction) and confirm it drops from the plan.
  - *stage 3* — call execute; assert exactly the approved duties are now `is_deleted=1`
    and the protected/NO-TOUCH duties remain `is_deleted=0` (a guard against
    over-removal). Run against a disposable crew so the live data is restorable.

## 9. Versioning

Backend changes (live-server, ai-server) → `BACKEND_VERSION` +1; frontend changes
(gantt) → `FRONTEND_VERSION` +1 (both, per global rule), in `gantt/src/version.ts`.

## 10. Out of scope

- Kicking off the PBS solver itself (handled by the existing UI-kickoff flow); this
  feature stops at clearing the duties.
- Scenario-side memo data source (shared render layer is built now; Scenario data
  wiring deferred until needed).
- pbs_status workflow integration.
- Hard (physical) deletion of roster rows — stage 3 only soft-deletes (`is_deleted=1`),
  consistent with the existing roster delete endpoints.
