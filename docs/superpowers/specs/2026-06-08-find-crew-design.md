# Find Crew (by Pairing / by Flight) — Design Spec

> Date: 2026-06-08
> Module: gantt (frontend) + live-server (backend)
> Status: approved for planning

## 1. Goal

Let a planner, from the Gantt, quickly surface the crew assigned to a pairing or a
flight and bring those crew to the top of the corresponding Roster pane — without
disturbing the existing sort order of the other crew.

Two lookups:

- **Find Crew by Pairing** — all crew assigned to a specific pairing.
- **Find Crew by Flight** — all crew on *any* pairing covering a specific flight.
  A single flight may be covered by multiple pairings, so this can return a larger
  set than "by pairing".

## 2. User-facing behavior

### Entry points (right-click context menu)

- **Pairing pane** — right-click a flight segment. The context menu gains:
  - **Find Crew by Pairing** → crew on the whole pairing the segment belongs to.
  - **Find Crew by Flight** → crew on every pairing covering the segment's flight
    (`fltId`).
- **Flight pane** — right-click a flight. The context menu gains:
  - **Find Crew by Flight** → crew on every pairing covering that flight.

All menu labels are English (§English-UI). Items are flat (no submenu).

### Result

When a Find Crew action runs, in the **corresponding** Roster pane:

- **Pane correspondence**: source Pairing/Flight **Main → Roster Main**, source
  **Sub → Roster Sub**. A flight/pairing pane with no Sub counterpart maps to Main.
- The found crew are **moved to the top** of the roster row list.
- The found crew rows are **selected/highlighted**.
- The pane **scrolls to top** so the found crew are visible.
- **All other crew keep their existing relative sort order** (hard requirement).

### Move semantics

- **One-time move (not a persistent pin).** The found-crew-to-top ordering is held in
  transient per-pane state. A later **re-sort** (sort criteria change) or **data
  refresh/replace** clears it, returning rows to their natural order. This is distinct
  from the existing persistent **freeze/pin** mechanism (`frozenRowIds`), which we do
  not reuse here.
- **Accumulate.** Running Find Crew again (on another pairing/flight) **adds** the new
  crew to the existing top group (union, preserving first-found order), until cleared by
  a re-sort/refresh.

### Fetching missing crew

The roster crew-row list is built from the **global** `crew-store.selectedCrewIds`
(shared by Roster Main and Sub). When a found crew is not currently loaded:

- It is **fetched and added to the shared crew set** (appears as a row in both roster
  panes), and its roster bars are loaded for the current date range.
- The **move-to-top + select + scroll** is applied **only** to the corresponding pane
  (per-pane isolation of the "to-top" effect, global add of the crew row). We do **not**
  refactor to per-pane crew selection.

### Edge cases

- **No crew assigned** (empty result) → English status-bar/toast message
  (e.g. "No crew assigned"); no reorder.
- **All found crew already loaded** → no fetch; just reorder/select/scroll.
- **Draft state**: lookups use committed live roster (`roster_flight`); client-side
  draft edits are not reflected in the lookup. Acceptable known limitation.
- Found-crew assignments outside the current date range: the crew **row** is still
  added; bars render only for the current range.

## 3. Backend (live-server) — `BACKEND_VERSION` +1

### New endpoint: crew by pairing

`GET /api/pairing/:id/crew` → `{ crewIds: string[] }`

- Query `roster_flight` where `pairing_id = :id AND is_deleted = 0`, `DISTINCT crew_id`.
- Route added in `live-server/src/routes/pairing/pairing.ts`; service method in the
  pairing service following the existing `flightService.getCrewList` pattern
  (`live-server/src/services/flight/flight-service.ts`).
- Standard `success` / `fail` response envelope. Invalid id → 400. Errors → 500.
- Error/user-visible messages in English (§English-UI).

### Reuse for flight

Existing `GET /api/flight/:id/crew` (`flightService.getCrewList`) already returns every
crew with a `roster_flight` row for that `flt_id` — i.e. across all covering pairings.
The frontend extracts `crewId`s from its response. No new flight endpoint.

### Data relationships (reference)

- `roster_flight (crew_id, pairing_id, flt_id, is_deleted, ...)` — crew↔pairing and
  crew↔flight links (`sql/schema/02-crew_roster_pg.sql`). `pairing_id` NULL = ground task.
- `pairing_segment (pairing_id, flt_id, ...)` — flight↔pairing coverage (a flight maps to
  multiple pairings). Not directly needed because `roster_flight.flt_id` already yields
  the crew union for a flight.

## 4. Frontend (gantt) — `FRONTEND_VERSION` +1

### Services (`gantt/src/services/`)

- Add `pairingApi.getCrew(pairingId: number): Promise<{ crewIds: string[] }>` →
  `GET /api/pairing/:id/crew`.
- Reuse `flightApi.getCrewList(fltId)` → `GET /api/flight/:id/crew`; map to `crewId[]`.

### New per-pane state

In `pane-store` `interactiveState` (keyed by `PaneType`, alongside `sortCriteria`,
`frozenRowIds`, `selectedRowIds`):

- `foundCrewIds: string[]` — accumulated, in first-found order.
- Setter to merge (union, append order) and a clearer.
- **Cleared when**: the pane's `sortCriteria` changes (in the existing sort
  setters), and when roster data is (re)fetched/replaced for the pane.

### Orchestrator

A store action / util, e.g. `findCrewToTop({ kind: 'pairing' | 'flight', id, targetPaneKey })`
where `targetPaneKey ∈ {'main','sub'}`:

1. Fetch `crewIds` from the pairing or flight endpoint.
2. If empty → show English status/toast; return.
3. Diff vs global `crew-store.selectedCrewIds`. For missing crew: add to selection,
   load crew details (`crew-store`) and roster bars (`roster-store.appendRoster` for the
   target pane) for the current date range.
4. Merge `crewIds` into the target pane's `foundCrewIds` (union).
5. Set target pane `selectedRowIds` to the found crew; scroll target pane to top
   (`layout-store.setViewport(paneId, { scrollY: 0 })`).

### Roster-pane reorder (`gantt/src/components/panes/roster-pane.tsx`)

Insert a stage between the sort result (`sortedRows`/`sortedCrewIds`, ~line 353) and the
frozen-rows reorder (~line 438):

- Split sorted rows into `found` (those in `foundCrewIds`, ordered by `foundCrewIds`) and
  the rest (sort order preserved).
- Concatenate `found` first, then the rest.
- The existing frozen reorder then runs on this result, so final order is
  **frozen → found → rest**.

`foundCrewIds` is read for the pane via its `paneType` (`roster-main` / `roster-sub`),
derived from the existing `legacyPaneType` / `rosterPaneKey` logic.

### Context menu (`gantt/src/components/roster/context-menu.tsx`)

- Pairing section: add `Find Crew by Pairing` and `Find Crew by Flight` (flat items).
- Flight section: add `Find Crew by Flight`.
- The opening pane includes in the mock-task payload: the resolved **target roster pane
  key** (`'main' | 'sub'`) and the relevant `pairingId` / `fltId`.
  - Pairing pane (`pairing-pane.tsx`): resolves `fltId` from the right-clicked segment;
    resolves Main/Sub from its existing grid-row logic ("Pairing Main"/"Pairing Sub").
  - Flight pane (`flight-pane.tsx`): passes the flight id; Main/Sub from its grid row
    (default Main).
- The menu item `onClick` calls the orchestrator with those values.

## 5. Testing — §Playwright-Required / §No-Illusion

Playwright e2e under `e2e/tests/gantt/` (e.g. `find-crew.spec.ts`):

1. **By pairing, to-top + order preserved**: right-click a pairing segment → Find Crew by
   Pairing → assert the assigned crew rows are at the top, in expected order, AND a known
   non-found crew remains in its prior relative position (regression for "don't change
   other crew's sorting").
2. **Accumulate**: run a second Find Crew on a different pairing/flight → assert both
   groups are present at the top (union), first group still above/intact per append order.
3. **By flight (flight pane)**: right-click a flight → Find Crew by Flight → assert crew
   from multiple covering pairings all appear at top.
4. **Empty result**: a pairing with no assigned crew → assert the English "no crew"
   message and no reorder.

Run: `npx playwright test e2e/tests/gantt/find-crew.spec.ts --reporter=list`; paste the
PASS/FAIL summary into the completion message. Tests assert specific crew IDs/counts and
ordering, not mere visibility.

## 6. Help sync — §Help-Sync (at commit time)

Before committing: update the Gantt help topic covering the Pairing/Roster context-menu
controls to document the two new actions and their effect; re-shoot any affected
screenshots per the 2× DPR convention and update the screenshot count table in
`e2e/tests/gantt/help/help-screenshots.spec.ts`.

## 7. Versioning

`gantt/src/version.ts`: `BACKEND_VERSION` +1 (live-server endpoint) and
`FRONTEND_VERSION` +1 (gantt changes). `RULE_VERSION` unchanged.

## 8. Out of scope

- Per-pane crew selection refactor (rows stay globally sourced).
- Persisting found-crew ordering across re-sort/refresh (explicitly one-time).
- Submenu infrastructure for the context menu.
- Reflecting client-side draft edits in the crew lookup.
