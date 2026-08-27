# Live Publish Roster Table — Source + NOC Columns

> Status: Design approved 2026-08-07
> Module: gantt (Live Publish Roster dialog) + live-server (roster publish diff)

## Problem

The Live Publish Roster Table (`RosterPublishDialog`, title "Publish Roster") shows the diff between the
live `roster_flight` rows and the published `roster_publish` snapshot. Operators need to see, per row,
**where the change came from** (`roster_flight.source` / `roster_publish.source`) and **whether it has been
pushed to NOC** (the downstream operations center), so they can tell at a glance which changes still need
NOC acknowledgment.

Add two columns at the far right of the table: **Source** and **NOC**.

## Data model

- `roster_flight.source` — `varchar(12) not null`, values `IMP` / `MA` / `CR` (Live schema constraint
  `chk_roster_flight_source_live`).
- `roster_publish.source` — `varchar(12)`, copied from `roster_flight.source` at publish time.
- `roster_publish_adjust` — one snapshot row per roster_flight per publish apply.
  - `new_roster_flight_id` → `roster_flight.id`
  - `published` smallint, constraint `between 0 and 2`:
    - `0` = pending NOC callback
    - `1` = sent to NOC (success)
    - `2` = IMP imported and excluded from NOC publish

## Value rules

### Source (per diff row)

| Row status | Source comes from |
|---|---|
| ADD / UPDATE / NO_CHANGE | `roster_flight.source` |
| DELETE | `roster_publish.source` |

- A diff row may group multiple roster rows (crew+pairing flying rows, or ground rows). Take the distinct
  source values; if uniform, show the single value; if mixed (does not occur in practice per confirmation),
  join with `,`.

### NOC (per diff row)

1. If **any** grouped roster source is `IMP` → show **Ignore** (regardless of status).
2. Else if status is **ADD or UPDATE** and source is `CR`/`MA` → look up the latest
   `roster_publish_adjust` record by `new_roster_flight_id` for each grouped roster id:
   - no adjust record for **any** grouped roster id → `-`
   - any latest `published = 0` → **Pending**
   - otherwise (all grouped roster ids have a latest record, all `published = 1`) → **Success**
   - a record with `published = 2` (should not occur for CR/MA) counts as neither pending nor success;
     if a row ends up neither Pending nor Success after this scan → `-`
3. Else (DELETE / NO_CHANGE with CR/MA source, or no source) → `-`

UI labels are English (per project UI-language rule): "待发布" → **Pending**, `success` → **Success**.

## Implementation

### live-server — `services/roster/roster-publish-service.ts`

Compute in a **separate lookup after the diff query**; do not edit the ~400-line `diffSql`.

1. After `diffSql` returns the page, collect:
   - `rosterIds` from all non-DELETE rows (ADD / UPDATE / NO_CHANGE)
   - `publishIds` from DELETE rows
2. **Source lookup** (one query):

   ```sql
   select id, source from roster_flight  where id = any($1::bigint[])
   union all
   select id, source from roster_publish where id = any($2::bigint[])
   ```

3. **NOC lookup** (one query — latest adjust per roster_flight):

   ```sql
   select distinct on (new_roster_flight_id) new_roster_flight_id, published
   from roster_publish_adjust
   where new_roster_flight_id = any($1::bigint[])
   order by new_roster_flight_id, id desc
   ```

4. Merge into `RosterPublishDiffRow`:
   - new field `source: string | null`
   - new field `noc: 'Ignore' | 'Pending' | 'Success' | null`

The apply path reuses `mapDiffRow` and ignores the new fields — untouched. No cache impact (diff is not
cached).

### gantt

- `services/roster-publish-api.ts` — add `source` and `noc` to `RosterPublishDiffRow`.
- `components/roster/roster-publish-dialog.tsx`:
  - two `<TableHead>` at the far right (after Status): **Source**, **NOC**
  - `TABLE_COLUMN_COUNT` 13 → 15
  - per-row cells:
    - Source: small muted badge (`text-2xs`)
    - NOC: colored text/badge — `Ignore` muted, `Pending` amber, `Success` green, `-` for empty

## Tests

- gantt unit `components/roster/__tests__/roster-publish-dialog.test.tsx` — extend mocked rows with
  `source`/`noc`, assert the two columns render correct values for ADD-UPDATE-CR, IMP, DELETE.
- e2e `e2e/tests/gantt/roster-publish-dialog.spec.ts` — extend mock diff rows, assert Source/NOC cell
  contents across status/source combinations.
- Run both and report results.

## Risks / notes

- `roster_publish_adjust` has **no index** on `new_roster_flight_id` → NOC lookup may seq-scan. Table is
  small (rows created only on publish apply), so acceptable for now; add an index only if profiling shows
  it matters.
- Scenario publish dialog already displays a Source column and is unchanged.
