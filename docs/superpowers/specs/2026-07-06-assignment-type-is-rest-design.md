# Assignment type and is_rest design

## Goal

Update the `assignment` master table so it can distinguish rest assignments directly and so `assignment.type` uses the requested one-letter taxonomy:

- `L` - Leave
- `O` - Off
- `W` - Work
- `T` - Training
- `S` - Reserve

`assignment.is_rest` will be `1` only for assignments whose final `type` is `L` or `O`. Reserve/standby assignments (`S`) are not rest for this change.

## Current state

The live schema defines `assignment.type varchar(3) not null`, with comments and seed values using older multi-letter categories such as `FLY`, `GRD`, `LVE`, `SBY`, `TRN`, `RES`, and later placeholder `OTH` rows from the fixed-credit migration.

The main consumers are:

- `live-server/src/models/base/assignment.ts`, which maps the table through Drizzle.
- `live-server/src/routes/base/assignment.ts`, which validates Assignment CRUD payloads.
- `live-server/src/services/base/assignment-service.ts`, which lists and edits assignments.
- `live-server/src/services/data/data-save-service.ts`, which saves Assignment rows from the Data tab.
- `gantt/src/config/data-entity-registry.ts`, which exposes Assignment Type filter/options in the Data tab.
- `sql/seed/01-dictionary.sql` and `sql/seed/03-assignment.sql`, which seed dropdown values and base assignment data.

`assignment_group` and `assignment_group_map` are operational grouping tables and are not the same semantic layer as `assignment.type`; they should remain unchanged unless separately requested.

## Scope

Implementation will:

1. Add `is_rest smallint not null default 0` to the base live schema.
2. Update the `assignment.type` column comment to document the one-letter taxonomy.
3. Add an idempotent migration that adds `is_rest`, rewrites existing `assignment.type`, and backfills `is_rest`.
4. Update `sql/seed/01-dictionary.sql` `ASSIGN_TYPE` rows to `L/O/W/T/S`.
5. Update `sql/seed/03-assignment.sql` seeded assignment rows to use the new `type` values and include `is_rest`.
6. Update `sql/migration/2026-06-15-assignment-add-fixed-credit.sql` so newly inserted fixed-credit rows no longer introduce `type='OTH'`.
7. Update the Drizzle model and route validation to expose `isRest`.
8. Update the Data tab Assignment config so users can filter and edit the new values.
9. Add or update focused tests for Assignment API/model behavior and Data tab config.

Out of scope:

- Renaming or remapping `assignment_group` / `assignment_group_map`.
- Changing `roster_flight.assignment` or `roster_flight.assignment_group`.
- Reclassifying reserve/standby as rest.
- Adding DB check constraints in this pass. The migration will normalize current data first; stricter constraints can be added later after production data is audited.

## Classification Rules

The migration will classify rows by existing assignment code first, then by current type as fallback:

- Off (`O`, `is_rest=1`): day-off/off-style codes such as `DO`, `GDO`, `TGDO`, `VGDO`, `BO`, and other clear off/no-duty codes found in the fixed-credit import.
- Leave (`L`, `is_rest=1`): leave/illness/absence codes such as `AL`, `SL`, `ML`, `CL`, `PH`, `VAC`, `RVAC`, `ILL`, `LEAVE`, `MLOA`, `PATL`, `RCO`, `RSGN`, `UILL`, and current `LVE` rows unless explicitly classified as off.
- Training (`T`, `is_rest=0`): current `TRN` rows and training-like codes such as `TRN`, `SIM`, `CRE`, `TRNG`, `CBT`, `CRM`, `BMT`, `UBMT`, `FTG`, `UFTG`.
- Reserve (`S`, `is_rest=0`): current `SBY` / `RES` rows and reserve codes such as `SBY`, `ASBY`, `RES`, `PRAM`, `PRMM`, `PRPM`, `PRMOD`, `RESNQ`.
- Work (`W`, `is_rest=0`): all flight, deadhead, ground, admin, and remaining operational work-like assignments.

Any ambiguous fixed-credit import code not explicitly classified will default to `W` rather than `L/O`, because accidentally marking a work assignment as rest is higher risk than leaving a rare rest code as non-rest.

## Data Flow

The backend will continue returning Assignment rows from `/api/assignment`; the new `isRest` field will be included naturally by the Drizzle model. Data maintenance saves will persist the field through the existing generic save path. The Gantt Data tab will show/filter `type` using the new one-letter options and show/edit `isRest` as a boolean.

No first-paint Gantt path should be affected: Assignment metadata is loaded separately from viewport roster/pairing rendering, and this change does not add heavy joins or additional first-paint requests.

## Verification

Minimum verification:

- Run focused live-server tests for Assignment service/routes or the smallest touched test set available.
- Run focused Gantt/Data config tests if present; otherwise run TypeScript checks covering `gantt/src/config/data-entity-registry.ts`.
- Run `npm run check:ui` if any frontend UI/config style-sensitive files are changed.
- Run a SQL static review of the migration to ensure it is idempotent and leaves no `assignment.type` outside `L/O/W/T/S`.

Expected migration checks:

```sql
select type, is_rest, count(*) from assignment group by type, is_rest order by type, is_rest;
select count(*) from assignment where type not in ('L','O','W','T','S');
select count(*) from assignment where (type in ('L','O') and is_rest <> 1) or (type not in ('L','O') and is_rest <> 0);
```

The second and third queries should return `0`.
