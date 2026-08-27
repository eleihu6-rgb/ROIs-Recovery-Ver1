# RO Scenario Pairing Source Scope And Pairing Scenario Selector

Date: 2026-07-23

## Problem 1: RO Pairing Source Scope

On SIT, an S3-imported PO pairing scenario is expected to provide the pairing universe for an RO scenario.
The PO Gantt shows the intended pairing set, but the RO Scenario Gantt currently shows extra pairings, including
reserve/standby PRAM-style data that is not referenced by the displayed roster.

The expected RO Pairing pane range is:

- If the RO scenario references Live pairings (`pairing_scenario_id` is `0` or null): load Live pairings by
  the RO scenario period plus Pairing Filter conditions (`Base`, `Fleets`, and the scenario division), then
  merge in pairings referenced by the roster.
- If the RO scenario references a PO scenario (`pairing_scenario_id` is non-zero): load the PO scenario's pairing
  universe from `scenario.pairing` / `scenario.pairing_segment` / `scenario.pairing_composition`, plus only the
  Live roster pre-occupied pairings required to render roster context.

Pairing-less ground duties such as SBY/PRAM must not expand the Pairing pane's global universe unless they can be
matched to a pairing that is already in the selected Live/PO pairing source or is an explicit Live pre-occupied
pairing needed by the roster.

## Evidence 1

Relevant code path:

- `GET /api/scenario/:id/gantt-data`
- `live-server/src/routes/scenario/scenario.ts`
- `live-server/src/services/scenario/scenario-gantt-db-service.ts`
- `live-server/src/services/scenario/scenario-partition.ts`
- `live-server/src/services/scenario/scenario-gantt-service.ts`

Current DB-backed Gantt behavior:

- `resolvePartitions()` correctly maps `pairing_scenario_id = 0` to Live pairing tables and non-zero ids to
  scenario pairing tables.
- `buildGanttDataFromDb()` currently derives `referencedPairingIds` from `scenario.roster_flight` assignments,
  then adds SBY pairing ids by matching SBY ground-item time windows.
- This SBY backfill was originally introduced so true SBY roster rows render as PRAM/PRPM rather than generic
  SBY, but it can also pull reserve pairings into the RO Pairing pane even when those pairings are not part of
  the selected pairing source's intended visible range.
- The seed/live-refresh paths already model the right shape more closely: the source pairing universe comes
  from RO input scope, then `mergeLeadinPairingGeometry()` appends only Live roster pre-occupied pairing geometry
  that is missing from the RO window payload.

SIT read-only check on 2026-07-23:

- `scenario 696` currently reads as `file_type = RO`, `status = DRAFT`, `leadin_live = 1`.
- After legacy workset-id compatibility, its current DB/API pointer is `pairing_scenario_id = 692`.
- `scenario 696` has RO pairing filters `bases=["YVR"]` and `fleets=["737"]`.
- `scenario 692` is `file_type = PO`, `status = DRAFT`, and its PO pairing universe contains multiple bases.
  On SIT, `GET /api/scenario/692/gantt-data` returned `YYZ/YVR/YOW/YEG/YYC/YUL` pairings, and
  `GET /api/scenario/696/gantt-data` showed the same non-YVR PO source pairings in the RO seed view.
  This proves PO-backed RO Gantt loading must apply the RO scenario's pairing filter to the referenced PO
  geometry before merging Live roster pre-occupied pairings.

## Design 1

Use `pairing_scenario_id` as the source-of-truth switch for RO Pairing source:

1. Preserve `resolvePartitions()` semantics:
   - `0` or null means Live pairing source.
   - non-zero means PO/scenario pairing source.

2. In DB-backed `buildGanttDataFromDb()`:
   - For PO (`fileType === 'PO'`): keep the existing pairing-only behavior: load all pairings from the PO
     scenario partition.
   - For RO with non-zero `pairing_scenario_id`: load the PO scenario pairings from the resolved pairing
     partition as the Pairing pane universe.
   - For RO with Live pairing source: load Live pairings by the RO official scenario period plus Pairing
     Filter `bases` / `fleets` and scenario division. This is the same business scope as the exporter
     `pairingIdSet()` for RO.
   - Separately collect explicit roster-linked pairing ids from `scenario.roster_flight`; if any of those ids
     are missing from the source pairing universe, append only those ids' geometry. This handles Live roster
     pre-occupied pairings without broadening the pairing source by unrelated ground duties.

3. Restrict SBY injection:
   - `injectSbyAssignments()` may convert a pairing-less SBY ground item into a synthetic assignment only when
     the matching SBY pairing exists in the already-loaded source universe or in the explicit PA geometry set.
   - Do not run a broad SBY time-window lookup that adds unrelated PRAM/PRPM pairings to `referencedPairingIds`.

4. Keep downstream shape unchanged:
   - `ScenarioGanttData.pairings`, `pairingSegments`, `flights`, `assignments`, `groundItems`, and capabilities
     remain the same DTO contract.
   - Frontend Gantt code should not need changes.

## Tests

Backend Vitest:

- Add a focused fake-DB test in `scenario-gantt-db-service.test.ts` for a PO-backed RO:
  - source PO contains two pairings;
  - roster contains one assigned pairing and one SBY ground item whose time matches an unrelated reserve pairing;
  - result pairings equal source PO pairings plus explicit roster-linked missing geometry only;
  - unrelated SBY/PRAM pairings are not loaded.

- Add/adjust a regression for Live-backed RO SBY behavior:
  - true SBY roster rows still convert to PRAM/PRPM when their matching pairing belongs to the selected source
    or explicit PA geometry.

Manual/SIT verification:

- Confirm the actual `pairing_scenario_id` for RO scenario 696 and whether 721 is the imported PO copy of 692.
- Confirm `pairing_scenario_id` for RO scenario 696 resolves to PO scenario id 692, not workset id 721.
- Open the PO scenario Gantt and record Pairing pane base distribution.
- Open the RO scenario Gantt and verify Pairing pane contains:
  - PO source pairings;
  - Live PA/pre-occupied pairings that are actually referenced by roster context;
  - no unreferenced PRAM/backup pairings.

## Risks

- Existing scenario 6 SBY regression coverage expects PRAM/PRPM rows to render for actual SBY roster duties.
  The implementation must preserve that behavior for matched in-scope SBY duties.
- DRAFT RO scenarios use the seed path (`buildGanttDataSeed()`), while DONE/loaded RO scenarios use
  `buildGanttDataFromDb()`. The implementation must keep both paths aligned.
- SIT metadata currently does not exactly match the reported 692 -> 696 pointer, so data-specific assertions
  should be confirmed before hardcoding scenario ids in automated tests.

## Problem 3: Pairing Identity Must Include Source

When an RO scenario references a PO scenario, the final Scenario Gantt Pairing universe may need to display
Pairings from both:

- `scenario.pairing`: the referenced PO scenario's imported / scenario-owned Pairings.
- `f8.pairing`: Live Pairings needed for Live pre-occupied roster context or Live Pairing source scope.

These two tables do not share a guaranteed global identity space. A row with `id = 300` in
`scenario.pairing` may not represent the same duty / segments as a row with `id = 300` in `f8.pairing`.
Therefore the Gantt payload cannot simply union both tables by numeric `pairing_id`, nor can it discard one
side when ids collide.

The UI also needs to tell planners where each visible Pairing came from:

- Scenario PO source.
- Live pre-assignment / Live source.

## Design 3

Introduce explicit Pairing source identity in the Scenario Gantt payload and use a display-safe internal id.

Backend DTO additions:

- `ScenarioGanttPairing.pairingSource: 'scenario' | 'live'`
- `ScenarioGanttPairing.sourcePairingId: number`
- `ScenarioGanttPairing.pairingId: number`
- `ScenarioGanttAssignment.pairingSource?: 'scenario' | 'live'`
- `ScenarioGanttAssignment.sourcePairingId?: number`

Field meanings:

- `sourcePairingId` is the real database id in that source table.
- `pairingSource` identifies which table / source owns that id.
- `pairingId` becomes the Scenario Gantt internal display id, unique within the payload. All existing
  in-memory joins continue to use `pairingId`.

Identity rules:

1. When loading from `scenario.pairing`, set:
   - `pairingSource = 'scenario'`
   - `sourcePairingId = scenario.pairing.id`
   - `pairingId = display id`
2. When loading from `f8.pairing`, set:
   - `pairingSource = 'live'`
   - `sourcePairingId = f8.pairing.id`
   - `pairingId = display id`
3. If a Live id does not collide with any Scenario display id, the display id may stay equal to the source id.
4. If the same numeric id appears in both sources, assign the Live row a deterministic non-colliding display id.
   A negative display id is preferred for minimal frontend blast radius, for example:
   - scenario source `300` -> `pairingId = 300`, `sourcePairingId = 300`
   - live source `300` -> `pairingId = -300`, `sourcePairingId = 300`
5. `pairingSegments.pairingId` and `assignments.pairingId` must be rewritten to the display id of their owning
   Pairing source. This is mandatory so segment maps, coverage maps, assignment maps, selection, hover, and
   status text do not cross-link unrelated Pairings.
6. Source-aware mapping must be created in one backend helper and applied consistently in:
   - seed / draft path (`buildGanttDataSeed`)
   - DB-backed path (`buildGanttDataFromDb`)
   - snapshot / live-refresh path only where Live geometry is appended to scenario geometry

The original database id must remain visible for diagnostics and future write-back. Any future operation that
persists or fetches source-specific detail must use `(pairingSource, sourcePairingId)`, not display `pairingId`.

Assignment source identity:

- Live pre-assignment roster rows (`source = 'PA'`) reference Live Pairings. Their assignments must carry
  `pairingSource = 'live'` and `sourcePairingId = live.roster_flight.pairing_id` before display-id remapping.
- Scenario/optimizer-owned assignments keep the current resolved pairing partition source, normally
  `pairingSource = 'scenario'` for PO-backed RO and `pairingSource = 'live'` for Live-backed RO.
- In the DB-backed path, live PA ids must not be added to the scenario partition `WHERE id IN (...)` detail
  query. They are appended through the Live geometry merge. This prevents a live PA id such as `300` from
  accidentally loading an unrelated `scenario.pairing.id = 300`.

## UI Design 3

Pairing pane visual treatment:

- Scenario PO Pairings: normal Scenario Pairing styling, with a subtle source tint if useful.
- Live Pairings: a restrained amber / yellow source tint, applied as a background or left rail on the Pairing
  block. The tint must be lightweight so it does not conflict with selection, coverage, violation, or hover
  states.

Status Bar:

- On Pairing hover, append source text to the existing hover status line.
- Display labels:
  - `Source: Scenario PO`
  - `Source: Live pre-assignment`
- The internal values remain `scenario` / `live`; only display text is user-friendly.

Pairing labels / ids:

- UI filtering and internal row identity use display `pairingId`.
- Visible diagnostics can show the original source id where needed:
  - `Pairing 300 | Source: Scenario PO`
  - `Pairing 300 | Source: Live pre-assignment`
- If both rows have source id `300`, they must still render as two separate Pairing rows / canvas blocks.

## Tests 3

Backend:

- Add a collision regression where `scenario.pairing.id = 300` and `f8.pairing.id = 300` represent different
  segments. The result must include two Pairings with different display `pairingId` values and the same
  `sourcePairingId = 300`.
- Assert scenario segments attach only to the scenario display id.
- Assert Live segments and Live roster assignments attach only to the Live display id.

Frontend:

- Scenario Pairing adapter preserves `pairingSource` and `sourcePairingId` on `PairingItem.pairing`.
- Pairing canvas / row styling can distinguish Live vs Scenario source.
- Hovering a Scenario-sourced Pairing shows `Source: Scenario PO` in the Scenario status bar.
- Hovering a Live-sourced Pairing shows `Source: Live pre-assignment` in the Scenario status bar.

## Problem 2: Pairing Sc. Selector Displays The Wrong Id

Correction after product clarification: the Scenario list should keep displaying `scenario.id`, and all
scenario-owned tables (`roster_flight`, `pairing`, `pairing_segment`, `flight`, manday tables, legality tables)
should keep storing `scenario_id = scenario.id`.

The specific bug is in the Scenario detail page's `Pairing Sc.` field. The dropdown should display the PO
scenario's `scenario.id + workset.name`, so the id matches what users see in the PO scenario list. When saving
the RO scenario, the value written to `scenario.pairing_scenario_id` must be that same referenced PO row's
`scenario.id`.

Current frontend `Pairing Sc.` options come from `/api/workset`, so the dropdown shows and stores
`workset.id`. That is wrong because users compare the value against the PO scenario list, which displays
`scenario.id`, and because `pairing_scenario_id` is consumed as a scenario partition pointer and must point to
`scenario.id`.

## Evidence 2

Current backend / frontend:

- `resolvePartitions()` treats non-zero `pairingScenarioId` as the physical scenario partition id.
- `buildGanttDataFromDb()` reads scenario pairing tables using `WHERE scenario_id = pairingScenarioId`.
- `Scenario Basic Info` currently lists Pairing Sc. options from `scenarioApi.listWorksets('PO')`, whose
  `id` is `workset.id`.
- The dropdown label currently renders `{w.id} - {w.name}` and `onValueChange` writes that same value into
  `detail.pairingScenarioId`.

## Design 2

1. Keep current scenario identity model:
   - Scenario list continues displaying `scenario.id`.
   - API route params continue using `scenario.id`.
   - Scenario partition tables continue using `scenario_id = scenario.id`.
   - `scenario.pairing_scenario_id` continues storing the referenced PO scenario's `scenario.id`.

2. Add a focused PO scenario selector API or adjust an existing endpoint for the `Pairing Sc.` field:
   - Return options with both ids:
     - `id`: referenced PO `scenario.id` to save into `pairingScenarioId`.
     - `worksetId`: referenced PO `scenario.workset_id` for diagnostics/future use.
     - `name`: `workset.name`.
     - status/date fields if useful.
   - Label in the dropdown should be `scenario.id - workset.name`.
   - The `Live` option remains `0 - Live` and saves `0`.

3. Frontend:
   - Replace `scenarioApi.listWorksets('PO')` usage for `Pairing Sc.` with the PO scenario selector endpoint.
   - Dropdown option value must be `scenario.id`.
   - Dropdown label must show `scenario.id + workset.name`.
   - Existing saved `pairingScenarioId` should resolve correctly because it is already a `scenario.id`.

## Tests 2

Backend:

- PO selector endpoint returns `{ id: scenario.id, worksetId: scenario.workset_id, name }`.
- Only PO scenarios are returned.

Frontend:

- `ScenarioBasicInfo` displays `scenario.id - workset.name` for Pairing Sc. options.
- Selecting a PO option patches `pairingScenarioId` with that option's `scenario.id`, not `workset.id`.
- Existing Scenario list ID tests remain unchanged and continue expecting `scenario.id`.
