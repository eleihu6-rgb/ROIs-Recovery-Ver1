# RES Pairing Creator — Design Spec

> Status: **draft for review** · Date: 2026-06-23 · Module: gantt (Live) + live-server
> Mockups: `docs/mockups/res-pairing-creator/` (open `index.html`; ★ `02-define-workspace.html` is interactive)
> Related: gantt playbook `docs/modules/gantt/live-scenario-gantt-playbook.md`; data model `docs/architecture/data-model.md`

## 1. Purpose

Let a planner **define, generate, and manage reserve (RES) pairings** — morning (AM) and evening (PM)
standby coverage — by **base × rank × date**, from the **Live Gantt** UI, replacing the hand-written
`INSERT INTO pairing/pairing_segment/pairing_composition` SQL currently used.

RES pairings are **Live-only** (a documented business rule, §Gantt-Unify §10): they exist only as live
pairings, never in a scenario.

## 2. Domain facts (grounded against the live schema)

| Fact | Source |
|---|---|
| RES pairing = `pairing` row with `assignment_group='RES'`, `assignment=<call-code>` | `sql/schema/live/02-crew-roster.sql` (pairing) |
| One `pairing_segment` per RES pairing, `flt_id=NULL`, reserve window on duty/seg times | user SQL + segment schema |
| Crew demand = `pairing_composition` rows, one per rank, column **`plan`** (NOT `plan_value`), `fill`/`open` derived | `02-crew-roster.sql` pairing_composition |
| Call-codes **PRAM/PRPM** (pilot AM/PM), **CRAM/CRPM** (cabin AM/PM) are reserve call-types — **not** in the `assignment` table | `sql/seed/10-pbs-bid-property.sql:402` |
| Ranks crew actually exist in: Pilot → **CA, FO**; Cabin → **IFD, FA** | user confirmation (seed lists more, but real data is these four) |
| Base code = airport 3-letter code; timezone via `airport.zone_id` (IANA) + `airport.utc_standard_offset` | `sql/schema/live/01-base.sql` airport |
| Default AM window 10:00–22:00 (PRAM), PM window 20:00–05:59 (+1 day) (PRPM) | user SQL |
| Pairing-pane already filters by call-code via `PairingFilter.assignments[]` → `/api/pairing?assignments=` | filter-store + pairing route |

## 3. Decisions (confirm at review)

- **D1 — assignment_group = `RES`** for all generated RES pairings (semantic reserve group; the assignment
  table has a `RES` group). The user's manual PRPM block used `SBY`; we standardize on `RES`. Made a
  parameter (`dictionary`) so an airline can choose `SBY`.
- **D2 — call-code & window are dictionary-driven.** New `dictionary` group `RES_CALL_TYPE` maps
  `(division, timing) → { code, defaultStart, defaultEnd, crossesMidnight }`:
  `P/AM→PRAM 10:00–22:00`, `P/PM→PRPM 20:00–05:59+1`, `C/AM→CRAM`, `C/PM→CRPM`. No hardcoded codes/times.
- **D3 — timezone: interpret AM/PM HH:MM as BASE-LOCAL and convert to true UTC** using the base's
  `airport.zone_id` (DST-correct). This is more correct than the user's manual SQL (which stored the wall
  clock straight into `*_utc`). ⚠️ New rows will therefore sit at different UTC instants than the manually
  inserted ones for the same "10:00"; the manual rows are the ones that were wrong. **Confirm we want proper
  conversion** (recommended) vs. matching the legacy no-conversion behavior.
- **D4 — conflict policy default = `skip`.** When a date already has a RES pairing of the same
  base/division/call-code, default to skipping it; options `overwrite` (update `plan`) and `add` (duplicate).
- **D5 — default fleet** from a `dictionary` param per filiale (F8 → `737`), since `pairing.fleet` is
  `NOT NULL` and reserves are not fleet-specific. No UI field in v1.
- **D6 — ranks are data-driven** from the ranks crew actually exist in (distinct `acting_rank` for the
  division), not the full `rank` dictionary — keeps it to CA/FO + IFD/FA and stays correct per airline.

## 4. User flow (4 screens)

```
[Live Pairing pane toolbar: 🛡 RES button (Live only)]
        ↓ opens AppDialog "RES Pairing Planner"
① Define workspace      calendar (canvas+live result) ⟷ entry panel (base×rank×AM/PM + windows) → Apply
② Review & Generate     grouped overview + conflict policy → Generate
        ↓ backend writes pairing+segment+composition; pane reloads; Type=PRAM/PRPM filter auto-applied
③ (pane shows the new RES pairings, highlighted by the filter)
Manage existing          filter + multi-select existing RES → batch modify plan/times / batch delete
```

## 5. Frontend design (gantt)

### 5.1 Entry button (Live-only, §Pane-Toolbar-Home, §Gantt-Unify-compliant)
- Icon-only square button in `pane-condition-strip.tsx` action cluster (next to Filter/Sort), label in
  tooltip — matching the cluster's form (`h-5 w-5`, icon `h-3 w-3`).
- Rendered only when a **new source capability** `pairing.canCreateRes` is true. Live adapter
  (`live-gantt-source.ts`) sets it true; Scenario leaves it false → no button. **No UI fork** — the shared
  `SharedPairingPane` stays one component; the difference is a capability flag (§Gantt-Unify compliant).

### 5.2 Dialog `ResPairingPlannerDialog`
- `@rois/ui` `AppDialog` (blue title bar, calendar icon, draggable, footer-right). Header tabs:
  **① Define · ② Review & Generate · Manage existing**.
- State held in a dedicated lightweight store `res-planner-store.ts` (definition model + scope + ui).
- Reference data on open: bases (`/api/base`), ranks-in-use (`/api/base/rank` filtered to crew-present),
  call-type config (`/api/dictionary?parent=RES_CALL_TYPE`).

### 5.3 Define workspace (combines the old calendar + batch screens — see interactive mockup)
- **Scope toolbar:** Base chips (`All bases` + each base, single-focus), Division (Pilot/Cabin), Date range
  (default = gantt 2-month window).
- **Calendar (left):** month grid; All-bases shows each base per cell broken down by rank as `AM/PM`
  (e.g. `YVR CA 5/5 FO 5/5`); single base shows that base only. It is BOTH the selector (click / drag /
  day-of-week) AND the live result (Apply fills cells).
- **Entry panel (right):** selection mode (Day / Range / Day-of-week), `base × rank × AM/PM` plan matrix
  (filtered to the focused base), AM/PM window editor (always visible, defaults from `RES_CALL_TYPE`),
  **Apply** writes the brush values into the selected days.
- The definition model is a flat list of **cells**: `{ date, base, division, timing, composition:[{rank,plan}], window:{start,end} }`.

### 5.4 Review & Generate
- Grouped overview (Base/Div/Rank/Type → days, plan/day, slots) + per-date overview.
- Conflict policy chips (D4). **Generate** posts the cells to the backend.

### 5.5 Post-generate (requirement #8)
- On success: bust the pairing list cache (server does it), trigger the pairing pane to refetch, and apply
  `PairingFilter.assignments = [<generated codes>]` (e.g. `['PRAM','PRPM']`) via the existing filter-store
  so the pane surfaces and highlights the new RES pairings. Reuses the existing assignment filter — **no new
  filter mechanism**. Show a result toast + the overview.

### 5.6 Manage existing
- Filter (base/division/date/type/rank) → list via `GET /api/pairing?assignments=PRAM,PRPM&…`.
- Multi-select; batch **Modify** (`plan` per rank and/or AM/PM window) and batch **Delete** (with the
  server's 409 guard when crew is already assigned — reuse `pairing-service.remove`).

## 6. Backend design (live-server)

New `routes/res-pairing/res-pairing.ts` + `services/res-pairing/res-pairing-service.ts`, reusing
`pairing-service` for cache invalidation and delete-guard, and `airport.zone_id` for tz.

| Endpoint | Method | Body / query | Returns |
|---|---|---|---|
| Generate | POST `/api/res-pairing/generate` | `{ division, conflictPolicy, cells:[{date,base,timing,window,composition:[{rank,plan}]}], dryRun? }` | dryRun → `{ summary, conflicts }`; else `{ created, skipped, summary }` |
| Batch modify | PATCH `/api/res-pairing/batch` | `{ ids:[], plan?:[{rank,value}], window? }` | `{ updated }` |
| Batch delete | POST `/api/res-pairing/batch-delete` | `{ ids:[] }` | `{ deleted, blocked:[{id,reason}] }` (409 per blocked) |
| List existing | GET `/api/pairing` (reused) | `assignments=PRAM,PRPM&base=&division=&startDate=&endDate=` | existing pairing list |

**Generate algorithm (per cell, in one transaction):**
1. Resolve `code/window` from `RES_CALL_TYPE` (division, timing); apply per-cell window override.
2. Compute `sch_str_dt_utc / sch_end_dt_utc`: combine `date` + window in base-local tz (`airport.zone_id`)
   → UTC; PM crosses midnight → end date +1 (D3).
3. Conflict check: existing non-deleted pairing with same `base, division, pairing_dt, assignment(code)`.
   Apply D4 policy (skip / overwrite plan / add).
4. Insert `pairing` (`assignment_group=RES`, `assignment=code`, `pairing_label='<code>-<HHMM>-<HHMM>'`,
   `base`, `division`, `fleet=<default>`, computed `sch_*`, `act_*`=`sch_*`, `duration_days` computed,
   `tafb=0`, `source='MANUAL'`, audit).
5. Insert one `pairing_segment` (`duty_seq=1, seg_seq=1, flt_id=NULL`, reserve window, `seg_assignment=code`,
   `duty_assignment='SBY'`).
6. Insert `pairing_composition` per rank (`division, acting_rank, plan`).
7. Invalidate `pairing:list:*`.

Return a grouped summary (by date/base/rank/type) for the overview.

## 7. Parameterization (no hardcode — CLAUDE.md)

`dictionary` seed `sql/seed/`:
- `RES_CALL_TYPE` group: rows for `P/AM,P/PM,C/AM,C/PM` → `{ code, default_start, default_end, crosses_midnight }`.
- `RES_DEFAULTS` (or SYS_PARAM) → `assignment_group=RES`, `default_fleet=737`, `conflict_policy=skip`.
- Ranks read live (distinct crew ranks per division). Bases via `/api/base`. Tz via `airport.zone_id`.

## 8. Testing (CLAUDE.md §Playwright-Required / §Simulate-User / §No-Illusion)

- **Backend (vitest):** generate writes correct rows (pairing+segment+composition counts, `plan` values,
  `assignment_group=RES`, code per division/timing); tz conversion (YVR 10:00 local → expected UTC, PM +1
  day); conflict policy skip/overwrite/add; batch modify updates `plan`; batch delete 409 when crew assigned.
- **E2E (Playwright, real UI):** open Live → Pairing pane → click 🛡 RES button → Define (pick base, Mondays,
  set CA/FO) → Generate → assert the **pairing pane** now shows the new `PRAM`/`PRPM` rows AND the
  `Type=PRAM/PRPM` filter chips are active (drive the real UI, never call the generate API directly to fake
  it). Manage: select rows → modify plan → assert; delete → assert removal / 409 message. Test IDs `Live-1xxx`.

## 9. Out of scope (v1, §Minimal-First)

Per-base distinct AM/PM windows (one window per timing shared across bases is enough); fleet selection UI;
editing an individual RES pairing's segment geometry; ATC division; recurring/auto-regenerate schedules.

## 10. Version / gates

`gantt/src/version.ts`: `FRONTEND_VERSION +1` (UI) and `BACKEND_VERSION +1` (live-server). Run
`npm run check:ui` (0 hard violations). Update the gantt playbook + create skill `res-pairing-management`.
