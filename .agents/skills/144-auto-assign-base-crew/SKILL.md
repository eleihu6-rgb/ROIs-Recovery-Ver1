---
name: 144-auto-assign-base-crew
description: Auto-assign open base+fleet-matched pairings to selected base crew, warning-clean, across the viewport calendar month. Use when touching the gantt roster context-menu "Auto-assign open pairings" action, the no-commit planner endpoint POST /api/roster/auto-assign/plan, the brain/hands split (backend decision trace + frontend replay), or when adapting the greedy legality-aware packer. Also the canonical note that the plan is validated by the SAME Rust engine (previewDraftLegality) the manual assign uses, so no rules are re-implemented.
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
3. Greedy earliest-first pack with CHEAP in-process checks only: `precheckAssignment`
   (division/open-slot/rank → `no-slot` skip) + `timeRangesOverlap` against existing roster AND
   already-picked pairings (`overlap` skip). Cap `maxPerCrew` (default 50).
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
- `tests/unit/auto-assign-service.test.ts` — 5 mocked cases (pack order, overlap, no-slot, 8002 sev-3
  backtrack, 7505 sev-2 skipOnSoft on/off). Real multi-segment ADD round-trip fixtures.

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
7505/7507), fleets?: string[], policy?: { skipOnSoft?: boolean=true }, maxPerCrew?: int 1..200=50 }`.
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
