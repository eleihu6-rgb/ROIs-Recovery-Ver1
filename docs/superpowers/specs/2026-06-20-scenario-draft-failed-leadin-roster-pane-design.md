# Scenario DRAFT/FAILED — Lead-in / Empty Roster Pane

> Design spec · 2026-06-20
> Module: gantt (scenario) + live-server
> Status: approved for planning

## 1. Problem & goal

For a scenario in **DRAFT** or **FAILED** status that has not yet produced a roster,
opening its gantt today reads only from `scenario.roster_flight`. When that table is
empty (the normal case before a successful optimization run), the backend returns
`409 "Scenario has no loaded result"` and the `leadinLive` flag has **no effect** — no
code path reads the Live roster to show pre-occupied data.

Goal: make opening such a scenario useful by seeding the Roster Pane based on the
scenario's existing `leadinLive` flag:

- **`leadinLive = 1`** → seed the Roster Pane from the **Live** roster as **read-only,
  visually-marked pre-occupied (预占)** assignments.
- **`leadinLive = 0`** → show the scenario's **crew rows with an empty timeline** (no
  assignments).

In both cases the Flight and Pairing panes also populate from the scenario's scope so
the gantt is a coherent "work-to-assign" view.

## 2. Scope

In scope:

- **RO** scenarios only (they are the type that renders a Roster Pane).
- **DRAFT** and **FAILED** status, **only when `scenario.roster_flight` has no loaded
  rows** for the scenario.

Out of scope (behavior unchanged):

- Scenarios with loaded `scenario.roster_flight` rows (incl. FAILED with partial
  results) → today's DB path still wins.
- PO / TO scenarios, RUNNING status, DONE-without-roster → still return 409 / existing path.
- Editing or manually building the seeded roster. The seed view is **read-only**; the
  optimizer fills the roster on the next run. Manual editing is a separate, future concern.
- The `SCENARIO_GANTT_SOURCE='gz'` escape hatch — unchanged; the seed path is db-source only.

## 3. Confirmed decisions

| Question | Decision |
|---|---|
| `leadinLive=0`, what shows? | Crew rows (from scope), empty timeline — ready for optimization. |
| Precedence vs existing scenario rows | Seed/empty **only when no scenario rows**; loaded rows win. |
| `leadinLive=1` display | Read-only, visually marked as pre-occupied (existing `source:'leadin'` marker). |
| Flight/Pairing panes | Populate from scope / linked pairing scenario. |
| Scenario type | RO only. |
| Build approach | Dedicated scope-based seed builder (Approach 1). |

## 4. Architecture (Approach 1 — dedicated seed builder)

> **Build mechanism (decided 2026-06-20):** the seed builder is implemented as
> `buildGanttDataLiveRefresh` **minus the engine `output.gz` fetch and optimizer
> assignments** — it reuses `buildRoInputGz` + the existing gz parsers + the extracted
> leadin loader, and lives next to `buildGanttDataLiveRefresh` in
> `scenario-gantt-service.ts`. This was chosen over pure partition queries because the
> leadin pucks reference the crew's **live** pairing IDs, which are not in the scenario's
> candidate pairing partition; reusing the proven input-build path renders them
> correctly by construction and avoids ~150 lines of duplicated assembly. The scenario
> gantt already pays this `buildRoInputGz` cost today for every leadin DONE scenario, so
> there is no new first-paint regression (§First-Paint governs the **Live** first paint,
> not this separately-opened scenario view).

### Backend (`live-server`) — `BACKEND_VERSION` +1

1. **Extract `loadLeadinFromLive(db, crewIds)`** — pull the inline live-roster leadin
   query from `buildGanttDataLiveRefresh` (`scenario-gantt-service.ts` ~lines 579–616)
   into a local helper **in the same file** (both `buildGanttDataLiveRefresh` and the new
   seed builder consume it, so no separate module is warranted — §Minimal-First). Split
   into a pure exported `mapLeadinRows(rows)` mapper (unit-testable, no DB) plus a thin
   DB-querying `loadLeadinFromLive` wrapper, returning
   `{ assignments /* source:'leadin' */, groundItems }`. Refactor
   `buildGanttDataLiveRefresh` to call it. Pure extraction, no behavior change (§Surgical).

2. **New `buildGanttDataSeed(fastify, scenarioRow)`** in `scenario-gantt-service.ts`:
   - `inputGz` ← `buildRoInputGz(fastify, scenarioRow)` (scope-resolved crew / pairings /
     segments / flights — the same call `buildGanttDataLiveRefresh` makes).
   - `crew`, `pairings`, `pairingSegments`, `flights` ← parse `inputGz` with the existing
     `parseCrewAndPairings` / `parsePairingSegments` / `parseFlights`.
   - `leadinLive=1` → `loadLeadinFromLive(db, crewIds)` → `source:'leadin'` assignments +
     ground items; `leadinLive=0` → empty assignments / ground items.
   - **No** `output.gz` fetch, **no** optimizer assignments.
   - Returns `{ dataSource: 'seed', leadinLive, readOnly: true, ... }`.

3. **Route gating** — `GET /api/scenario/:id/gantt-data`, db branch
   (`routes/scenario/scenario.ts`):

   ```text
   hasLoadedRoster
     ? buildGanttDataFromDb                                  (unchanged)
     : (fileType === 'RO' && status ∈ {DRAFT, FAILED})
         ? buildGanttDataSeed
         : fail(reply, 409, 'Scenario has no loaded result') (unchanged)
   ```

### Frontend (`gantt`) — `FRONTEND_VERSION` +1

4. **`types/scenario-gantt.ts`** (frontend) **and the backend `ScenarioGanttData` type**
   (`scenario-gantt-service.ts`) — add `'seed'` to the `dataSource` union; add optional
   `readOnly?: boolean`.

5. **`scenario-gantt-source.ts`** — when `data.dataSource === 'seed'` (or `data.readOnly`),
   force `READ_ONLY_CAPABILITIES`; ensure `source:'leadin'` roster items render with a
   distinct pre-occupied marker (verify `build-scenario-roster-items` carries `source`
   into the puck; extend rendering if no visual marker exists yet).

6. **Roster pane** — render crew rows even with **zero** assignments (verify; the
   `leadinLive=0` empty case depends on it — must not be treated as a "no data" error).

7. **`scenario-gantt-toolbar.tsx`** — badge for the seed state, reusing the existing badge
   slot: e.g. "Live lead-in · preview" when `leadinLive`, "Empty · no lead-in" otherwise.

## 5. Data flow

```text
open DRAFT/FAILED RO scenario
  → GET /api/scenario/:id/gantt-data
    → hasLoadedRoster? ── yes ─→ buildGanttDataFromDb         (unchanged)
                       └─ no ──→ RO & DRAFT/FAILED?
                                   ├ yes → buildGanttDataSeed
                                   │        ├ crew  ← crewIdSet(scope)
                                   │        ├ pairings/flights ← scope / linked PO
                                   │        ├ leadinLive=1 → loadLeadinFromLive → source:'leadin'
                                   │        └ leadinLive=0 → [] assignments
                                   │        → { dataSource:'seed', readOnly:true }
                                   └ no  → 409 (PO/TO, RUNNING, DONE-no-roster)
  → ScenarioGanttView renders: read-only panes, crew rows always,
    leadin items marked pre-occupied
```

## 6. Error handling & edge cases

- **No crew in scope** (empty/missing filterParams) → valid payload with empty crew;
  frontend shows the normal empty-roster state, not an error.
- **`leadinLive=1` but crew have no live roster** in the window → crew rows with empty
  timeline (same visual as `leadinLive=0`). Expected.
- **Missing `pairingScenarioId`** on an RO scenario → Pairing pane empty; roster/flight
  still render; no error.
- **Status flips to RUNNING/DONE** while open → unchanged; next reload takes the normal path.
- `SCENARIO_GANTT_SOURCE='gz'` behavior unchanged.

## 7. Performance (§First-Paint)

The seed builder runs the same scope/leadin/flight queries the existing scenario gantt
load already performs; it must not regress first-paint. Reuse the existing scenario
gantt payload + virtualization. If the in-scope crew set is large, reuse the same
batching/lazy-load the live-refresh path uses rather than introducing a new full-scan.

## 8. Testing (§Playwright-Required + §No-Illusion)

**E2E (`e2e/gantt`), real backend:**

- DRAFT RO + `leadinLive=1` → roster shows specific crew rows **with** leadin
  assignments (assert count + a known crew/flight), marked read-only (drag is a no-op);
  Flight & Pairing panes non-empty.
- DRAFT RO + `leadinLive=0` → roster shows crew rows with **zero** assignments
  (`toHaveCount`); Flight/Pairing populated.
- **Regression**: a DRAFT RO scenario that previously produced the 409 error banner now
  renders the gantt (would have failed before the fix).

**Backend (Vitest):** `buildGanttDataSeed` unit/integration — crew from scope, leadin
union under flag, empty under no-flag, `dataSource:'seed'`.

Paste PASS receipts in the completion message.

## 9. Version bumping

Cross-stack change → bump **both** `BACKEND_VERSION` and `FRONTEND_VERSION` in
`gantt/src/version.ts` (+1 each).
