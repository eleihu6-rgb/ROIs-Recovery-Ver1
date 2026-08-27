# RES Pairing Planner — Assignment Multi-Select & Fixed Window Design

> Status: **Approved for implementation** (user confirmed 2026-07-13)  
> Scope: Live Gantt RES Pairing Planner only  
> Related: Skill 128, `docs/superpowers/specs/2026-06-23-res-pairing-creator-design.md`

## 1. Problem

Creating reserve (backup) pairings in the RES Pairing Planner currently:

- Forces a binary **AM / PM** model with hard-coded call codes (`PRAM`/`PRPM` or `CRAM`/`CRPM`).
- Does **not** let the user pick one or more concrete `assignment` codes (e.g. **PRMM** is missing).
- Does **not** read window times from the `assignment` master; defaults live only in `dictionary.RES_CALL_TYPE` and frontend constants.
- Uses numeric `assignment.fixed_str_tm` / `fixed_end_tm`, which is hard to read and maintain as wall-clock times.

Users need: multi-select of RES assignments, windows from assignment master as **local `HH:mm`**, same local wall time across bases with base-specific UTC conversion.

## 2. Goals

1. User can **multi-select** RES assignments when defining backup duties.
2. **Selectable set** is driven by `dictionary.RES_CALL_TYPE` for the current division (including new Pilot mid: **PRMM**).
3. Default start/end for each assignment come from **`assignment.fixed_str_tm` / `fixed_end_tm`** as `varchar(5)` strings `HH:mm`.
4. Each selected assignment has its **own** base × rank plan matrix.
5. Window is **editable for this generate only** (does not write back to `assignment`).
6. Different bases share the same local times; UTC differs via `airport.zone_id`.
7. Seed/upsert the five RES assignments and dictionary rows so missing codes are created and times match the business table below.

## 3. Non-Goals

- Scenario Gantt RES creation (still Live-only / `canCreateRes`).
- Writing user-edited windows back to `assignment`.
- Changing non-RES assignment business logic beyond column type + Data UI field type for the two fixed-time columns.
- Adding Cabin mid-call (`C_MM`) unless later requested.

## 4. Decisions (confirmed)

| Topic | Decision |
|---|---|
| Selection | **Multi-select** assignments |
| Option source | `RES_CALL_TYPE` (per division prefix `P_*` / `C_*`) |
| Plan matrix | **Per selected assignment** (own base × rank plans) |
| Window edit | Default from assignment fixed times; **overridable** for this run only |
| Architecture | Assignment as first-class cell key (not AM/PM binary + special-cases) |

## 5. Default business times

| assignment | fixed_str_tm | fixed_end_tm | notes |
|---|---|---|---|
| PRAM | `04:00` | `16:00` | Pilot |
| PRMM | `10:00` | `22:00` | Pilot mid (new to planner) |
| PRPM | `14:00` | `23:59` | Pilot; same calendar day (`end > start`) |
| CRAM | `03:00` | `15:00` | Cabin |
| CRPM | `10:00` | `22:00` | Cabin |

Cross-midnight rule (unchanged engine rule): if end minutes ≤ start minutes, end falls on **date + 1**. With the table above, none of the five cross midnight by that rule; PRPM ends `23:59` same day.

## 6. Data model

### 6.1 `assignment.fixed_str_tm` / `fixed_end_tm`

- Change both columns to **`varchar(5)`**.
- Values: wall-clock local time `HH:mm` (5 characters, zero-padded hour).
- Semantic: base-local when used for RES generation (converted with base airport zone).
- Migration: alter type; convert legacy numeric values only if a safe, documented mapping exists; otherwise null then seed.

### 6.2 `dictionary.RES_CALL_TYPE`

`code_value` format remains: `<callCode>|<start>|<end>|<crossesMidnight>`.

| code | name (example) | code_value |
|---|---|---|
| P_AM | Pilot Reserve AM | `PRAM\|04:00\|16:00\|0` |
| **P_MM** | Pilot Reserve Mid | `PRMM\|10:00\|22:00\|0` |
| P_PM | Pilot Reserve PM | `PRPM\|14:00\|23:59\|0` |
| C_AM | Cabin Reserve AM | `CRAM\|03:00\|15:00\|0` |
| C_PM | Cabin Reserve PM | `CRPM\|10:00\|22:00\|0` |

- Existing seed rows for P_AM / P_PM / C_AM / C_PM must be **updated** to the new windows (not only insert-if-missing).
- P_MM: insert if missing.

### 6.3 Window resolution order (backend + frontend defaults)

1. `cell.window` if provided by the client (user override for this generate).
2. Else `assignment.fixed_str_tm` / `fixed_end_tm` for that assignment code.
3. Else `RES_CALL_TYPE` start/end for the matching dictionary row.
4. Else hard-coded last-resort defaults (only to avoid hard failure).

## 7. API contract

### 7.1 Cell shape (breaking change vs AM/PM)

```ts
interface ResCell {
  date: string                      // YYYY-MM-DD (civil start date)
  base: string                      // IATA base
  assignment: string                // e.g. PRAM, PRMM, PRPM, CRAM, CRPM
  window?: { start: string; end: string }  // HH:mm override
  composition: { rank: string; plan: number }[]
}
```

- Remove `timing: 'AM' | 'PM'` from the generate contract.
- Conflict key: `date|base|assignment` (same as stored pairing identity).
- `pairing.assignment` / label / segment assignment continue to use the call code string.
- `POST /api/res-pairing/generate` body still `{ division, conflictPolicy, cells, dryRun? }`; only `cells[]` field shape changes.
- Summary grouping: by `base + rank + assignment` (replace timing with assignment code).

### 7.2 Optional config endpoint (if not already sufficient)

Frontend must load:

- `RES_CALL_TYPE` rows for the active division → multi-select options + dictionary fallback windows.
- Assignment fixed times for those codes → default windows.

Prefer extending existing list/config paths or returning them from a small RES config read used at dialog open. Avoid hardcoding PRAM/PRMM lists in the UI.

## 8. Frontend (Define / Review / Generate)

### 8.1 Define tab

1. **Assignment multi-select chips** (or equivalent): options = `RES_CALL_TYPE` codes for current division (`P_*` → PRAM/PRMM/PRPM; `C_*` → CRAM/CRPM).
2. For **each selected** assignment:
   - Default window from assignment fixed times (fallback dictionary).
   - Editable start/end for this session.
   - Independent base × rank plan matrix (same ranks as today: Pilot CA/FO; Cabin IFD/FA).
3. **Apply**: for each selected date × focus base(s) × selected assignment with non-zero plans (or always write cells with composition), upsert `ResPlannerCell` keyed by `date+base+assignment`.
4. Remove AM/PM-only dual windows as the primary model; no global single `amWindow`/`pmWindow` driving all codes.

### 8.2 Review & Generate

- Group overview by assignment (and base/rank) instead of AM/PM timing.
- Generate posts the new cell shape.
- Post-success filter chips = actually generated assignment codes (including PRMM when selected).

### 8.3 Store

- Replace `timing` / dual global windows with:
  - `selectedAssignments: string[]`
  - per-assignment window map
  - per-assignment brush/plan structure
- Cells: `{ date, base, assignment, window, composition }`.

### 8.4 Data maintenance UI

- `gantt` data-entity-registry: `fixedStrTm` / `fixedEndTm` field type **text** (not number), labels remain Fixed Start / Fixed End; document `HH:mm`.

## 9. Backend

- `buildPairingRow` / `generate`: use `cell.assignment` as the code; resolve window per §6.3.
- `loadResConfig`: list all call defs for division; load assignment fixed times for those codes; expose `windowFor(code)` and validate assignment is in the allowed set for the division.
- Reject generate cells whose `assignment` is not in `RES_CALL_TYPE` for that division (400).
- Conflict detection map key: `date|base|assignment`.
- `summarize`: group by assignment instead of timing.
- Update unit tests for PRMM, multi-assignment cells, and `HH:mm` fixed columns.

## 10. SQL / seed / migration

1. **Migration** (new file under `sql/migration/`):
   - Alter `fixed_str_tm`, `fixed_end_tm` to `varchar(5)`.
   - Update schema comment in `sql/schema/live/01-base.sql` to match (for new installs).
2. **Seed / data fix** (idempotent preferred):
   - Upsert five assignments with fixed times from §5 (create if missing; update fixed times if present).
   - Upsert `RES_CALL_TYPE` including **P_MM** and refresh windows for existing four codes.
3. Drizzle model: `fixedStrTm` / `fixedEndTm` as `varchar('fixed_str_tm', { length: 5 })` (and same for end).
4. live-server Zod / data-save paths that treat fixed times as numbers must accept strings.

## 11. Testing

| Layer | Coverage |
|---|---|
| live-server unit | window resolution order; multi-assignment generate dry path; PRMM; cross-midnight still works if end≤start |
| live-server integration (if present) | generate with two codes same day/base |
| Playwright | open planner → multi-select PRAM+PRMM → set plans → Apply → Review shows both → Generate → filter chips / labels include both; window defaults match assignment fixed times |
| Regression | update stale RES e2e that assert AM/PM-only windows (`10:00–22:00` / `20:00–05:59`) to new defaults or to assignment-driven windows |

## 12. Risks

| Risk | Mitigation |
|---|---|
| Breaking generate API for any external caller | Only gantt `res-api` + e2e use it; update both in same change |
| Legacy numeric fixed times in remote DB | Migration + seed upsert; document one-time ops if remote needs manual ALTER |
| Stale dictionary rows only insert-if-missing | Explicit UPDATE for known RES_CALL_TYPE codes’ windows |
| E2E acceptance counts still assume 2 codes/day | Adjust Live-1410 style tests if they hardcode PRAM+PRPM only |

## 13. Implementation order (guidance)

1. Schema migration + drizzle + seed/upsert assignment + dictionary.
2. Backend generate/config + unit tests.
3. Frontend store + Define multi-select + per-assignment panels.
4. Review/Generate + filter chips.
5. Data registry field type.
6. Playwright + fix stale RES tests.
7. Deploy note: run migration on F8 remote before relying on string fixed times.

## 14. Success criteria

- [ ] User multi-selects PRAM + PRMM (Pilot) and generates both for the same dates/bases.
- [ ] Default windows match §5 from assignment (or dictionary fallback).
- [ ] Edited window affects only that generate; assignment row unchanged.
- [ ] YVR vs YYZ (or YEG) same local window → different `sch_str_dt_utc` / `sch_end_dt_utc`.
- [ ] PRMM appears in options only because `P_MM` is in `RES_CALL_TYPE`.
- [ ] `fixed_str_tm` / `fixed_end_tm` are `HH:mm` strings in DB and Data UI.
- [ ] Automated tests updated and green for the touched paths.
