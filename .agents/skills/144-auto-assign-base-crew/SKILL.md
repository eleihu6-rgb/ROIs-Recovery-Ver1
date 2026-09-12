---
name: 144-auto-assign-base-crew
description: Add or maintain Gantt auto-assignment of open pairings to base- and fleet-matched crew. Use for the roster action or /api/roster/auto-assign/plan.
---

# Auto-assign open pairings to base crew

A shipped gantt feature ("brain + hands"). Always load **115-gantt-playbook** before gantt work;
this skill is the how-to for one feature.

## Product goal (Ryan's 7-step design)
Given one or more selected crew (top-to-bottom, crew-by-crew), fill each crew's roster with the
nearest-date **open** pairings whose **base AND fleet match the crew**, across the **current viewport
calendar month**, skipping any pairing that would overlap existing duty OR trip a legality rule — so
the result is **warning-clean** by default. The dispatcher watches the whole thing happen (filter →
pick → assign → skip-on-rule → next pick) as REAL gantt operations, then presses Save.

## Architecture — "Brain + Hands" (B + C)
- **Brain** (fast, no-commit): `POST /api/roster/auto-assign/plan` computes, per crew, a greedy
  warning-clean assignment plan + a full decision **trace**, and returns it. Persists NOTHING (the
  underlying legality preview rolls back).
- **Hands** (real UI): the gantt **replays** the plan as real assign draft ops, one per pairing, each
  scrolling the pairing pane to the target and running the same optimistic apply + live legality check
  a drag-drop does. Assignments accumulate in the draft; the user presses **Save** to commit.

This keeps the Rust engine the single source of legality truth (no rule logic duplicated) and makes the
process visible/animated instead of a black-box backend batch.

## Algorithm (backend, per crew, in display order)
1. Resolve crew **base** (`crew_base`, most-recent effDt) + **fleet quals** (request `fleets` overrides).
2. Fetch OPEN candidates: `base=`, `fleet in`, `schStrDtUtc BETWEEN start..end` (SAME window semantics
   as `pairing-service.list` / the pairing pane), coverage open/partial, sorted asc → emit `filter` step.
3. Eligibility pass (candidate order): CHEAP in-process checks only — `precheckAssignment`
   (division/open-slot/rank → `no-slot` skip) + time parse. Survivors → `eligible[]`. Then SELECT with
   one of two strategies (`distribution`, default **`'even'`**):
   - **`'even'`** (default): bucket eligible by **7-day week** from `startDate`, then greedily feed the
     currently **lightest week** (least accumulated block minutes; tie-break earliest week, earliest
     pairing within a week) → flying hours spread across the month instead of front-loading week 1.
     Week load seeded from the crew's existing roster block minutes. Uses `fetchCandidateBlockMinutes`
     (a SQL Σ-segment aggregate, NOT a per-candidate segment fetch) as the leveling metric.
   - **`'earliest'`**: legacy greedy earliest-first (candidate order).
   Both check `timeRangesOverlap` against existing roster AND already-picked pairings (`overlap` skip) at
   pick time, and cap `maxPerCrew` (default 50).
4. Expand accepted → crew×segment `PreviewRosterItem[]`, validate the ASSEMBLED roster ONCE with
   `previewDraftLegality` (full running roster incl. existing duty in `afterItems`).
5. **Backtrack-trim**: severity 3 always removed; severity 1-2 removed too when `skipOnSoft` (default
   true). Drop the latest-starting violating pairing, re-preview, cap 8 iterations → survivors become
   `assigned[]`; the trimmed ones become `skip`/`skipped` with `reason:'rule'`, `ruleCode`, `ruleName`.
   → a handful of engine calls per crew, not one-per-candidate.

## Wiring map (where to touch)
**Backend (live-server):**
- `src/services/roster/auto-assign-service.ts` — `planAutoAssign(fastify, input, deps?)` + all types.
  IO grouped behind injectable `AutoAssignDeps` (default = real impls) so Vitest can drive it with fakes.
- `src/routes/roster/roster.ts` — `POST /auto-assign/plan` (Zod-validated), registered before `assign-flight`.
- `tests/unit/auto-assign-service.test.ts` — 6 mocked cases (pack order, overlap, no-slot, 8002 sev-3
  backtrack, 7505 sev-2 skipOnSoft on/off, even-vs-earliest week spread). Real multi-segment ADD
  round-trip fixtures.

**Frontend (gantt):**
- `src/services/auto-assign-api.ts` — client + response types (mirrors the backend shape; `startDt/endDt`
  are `string | null`). Uses `rosterApi.withRuleset(...)`.
- `src/utils/assign-pairing-op.ts` — `assignPairingDraft(pairingId, crewId)`: the SHARED assign code path
  (§Gantt-Unify) extracted from `app-layout.tsx`'s `case 'assign-pairing'` (precheck → placeholder build
  → optimistic apply → `checkLiveDraftLegality` → rollback). Both the drag handler AND the driver call it.
- `src/utils/auto-assign-driver.ts` — `runAutoAssignReplay(plan, {onStep, isAborted, stepDelayMs})`:
  flattens plan to (crew, pairing) in plan order, `bringPairingIdToTop` animate + `assignPairingDraft`.
- `src/components/roster/auto-assign-dialog.tsx` — `AutoAssignDialog` (AppDialog): auto-fetches the plan on
  open, renders the per-crew trace, "Apply to gantt (N)" runs the replay, live `applied X/N` progress.
  Mounted in `components/shell/app-shell.tsx`.
- `src/stores/ui-store.ts` — `autoAssignOpen/autoAssignCrewIds/autoAssignPane` + `openAutoAssignDialog`.
- `src/components/roster/context-menu.tsx` — roster-background branch (`task.id===-1 && task.crewId`) pushes
  "Auto-assign open pairings (N crew)"; uses `getSelectedRowIds(paneType)` if the right-clicked crew is in
  the selection, else `[thisCrew]` (same selection semantics as "Pin N Selected Rows"). Icon `Wand2`.

## Key facts (verified 2026-09-10 against the running SIT app)
- **Target month = viewport calendar month**, via `resolveViewportMonthBounds()` (leftmost visible day's
  month) — NOT the toolbar date range. J4001 over Sep 2026 → 12 assigned / 795 skipped.
- **J4001** = Meseret Gebremariam, base **ADD**, fleet **7M8** (seed
  `sql/seed/2026-09-10-crew-add-j4001-j4040-add-7m8.sql`). Real engine drives backtrack on hard **1001
  "Assignment Overlap"** (sev 3) and soft **7504 "Spacing Rule - WOCL"** (sev 1, trimmed under skipOnSoft) —
  proving the two-tier design: the cheap time-overlap check misses duty-padding overlaps the engine catches.
- `previewDraftLegality` runs in a rolled-back txn → the planner is READ-ONLY/safe on shared DB. Only the
  frontend replay + Save writes (to `f8_sit_live`).
- Response is wrapped in `success()`; `api.post` unwraps to `.data`.

## API contract
Request: `{ crewIds: string[]≥1, startDate, endDate (YYYY-MM-DD), rpFrom?, rpTo? (both-or-neither, for
7505/7507), fleets?: string[], policy?: { skipOnSoft?: boolean=true }, maxPerCrew?: int 1..200=50,
distribution?: 'even'(default)|'earliest' }`.
Response: `{ crews: [{ crewId, crewName, base, fleets[], steps:(filter|consider|skip|assign)[],
assigned:[{pairingId, rosterActingRank, label, startDt, endDt, blockMinutes}], skipped:[{pairingId, label,
reason, ruleCode?, message}], summary:{assignedCount, skippedCount, blockMinutes} }],
summary:{crewCount, assignedTotal, skippedTotal} }`.

## How to test
- Backend: `cd live-server && npx vitest run tests/unit/auto-assign-service.test.ts` (5 pass, ~0.7s).
- E2E (§Simulate-User — the assign goes through the real context menu → dialog → Apply → Save, never a
  direct assign POST): `e2e/tests/gantt/auto-assign-open-pairings-j4001.spec.ts`. Run with
  `GANTT_BASE_URL` matching the vite port (dev server prints it; may be 5567, not 5173):
  `cd e2e && GANTT_BASE_URL=http://localhost:5567 GANTT_API_URL=http://localhost:3000
  GANTT_TEST_PASS=123456 npx playwright test tests/gantt/auto-assign-open-pairings-j4001.spec.ts
  --config=config/playwright.config.ts --reporter=list`. Right-click target = the name-column canvas
  `pane-header-canvas-roster-main` at `HEADER_HEIGHT(30) + ROW_HEIGHT(43)/2` for row 0.

## Even distribution is RULE-DRIVEN (Rule 7305), not a packer cap
Ryan's "first week too tight, last 3 weeks too loose" is solved by legality, not a hard cap in the
packer. **Rule 7305** "Max Consecutive Duties Limitation" (Type=Days, cap=5, scope `FLY|CRAM|CRPM|RES`,
severity 1) is a member of the LIVE pilot ruleset **workset 103**. Because step 4/5 validate the whole
assembled roster via `previewDraftLegality` and the backtrack-trim drops any pairing with severity ≥1,
7305 forces day-off gaps → the roster spreads across the month. The packer is **generic over rule code**
— no packer change needed; making a rule "initiate" during packing = add it to workset 103 (`rule_set`
row) + set severity ≥1. **No `cargo build`**: `param_json` + `rule_set` are runtime data. Users edit the
cap in **Legality → Rule Sets** (`legality-param-table-editor.tsx` → `PATCH /api/legality/rule/:id/params`).
- **7305 semantics ≠ calendar days**: it counts duty streaks with rest-gap logic (a clear day off resets),
  so faithful proof = 7305 FIRES in the plan skip trace (`ruleCode:'7305'`), NOT a naive consecutive-date
  recount (that overcounts). Test: `e2e/tests/gantt/auto-assign-7305-max-consec-j4006.spec.ts` (J4006).
- **7305 consecutive-day boundary = duty-END, NOT duty-end+rest** (fixed 2026-09-10): the D-row builder in
  `legality-recheck-core.mjs` `rule7305()` (~line 2156) feeds `row.end_secs` (duty-end) into the kernel's
  col-6 day boundary. Do NOT revert to `end_including_rest_secs`/`end_rest_secs` — the 12h rest tail spills
  into the next morning, welds a blank day off into the streak, and mis-shapes run boundaries. This shared
  function drives both the live recheck and `previewDraftLegality` (packer trim), so the fix also stops the
  packer from assigning 6 consecutive duty days. No Rust rebuild.
- **7505** "Min # GDOs in a RP" is in 103 but is **per rostering period**, NOT a rolling Y-day window;
  a true rolling days-off rule would need new Rust logic (rebuild + scope flag).

## Gotchas / open items
- **Ruleset divergence**: the planner currently validates against the DB **default** active ruleset
  (rulesetId is accepted by the client but not yet threaded into the plan → the route strips it).
  The replay's `checkLiveDraftLegality` uses the **user-selected** ruleset. If they differ, a planned
  assign can be declined on replay (rolled back, counted as "skipped on replay") — safe (no bad commit),
  but suboptimal. Thread `rulesetId` through `planAutoAssign` → `previewDraftLegality` to close this.
- The plan is warning-clean by construction, so the replay should NOT hit the rule-confirm dialog; if it
  does (state race), that one assign rolls back and the driver moves on.
- UI is token-only (`Wand2`, `Check`, `SkipForward`, `Filter`, `text-2xs`, `font-mono tabular-nums`) →
  passes `npm run check:ui`. Dialog uses the mandatory `AppDialog`.
