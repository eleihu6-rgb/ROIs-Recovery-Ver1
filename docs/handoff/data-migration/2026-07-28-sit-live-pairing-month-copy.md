# SIT Live Pairing Month Copy Runbook

## Context

On 2026-07-28, `data-migration` gained a PostgreSQL live-schema utility to copy one month of pairing data into another month for optimization testing.

Tool:

- `data-migration/f8/live_pairing_month_copy.py`
- Class: `LivePairingMonthCopyTool`
- CLI module: `python -m f8.live_pairing_month_copy`

The first real run copied `f8_sit_live` pairings from `2026-08` to `2026-09`.

## Implemented Rules

- Target is a live PostgreSQL schema, for example `f8_sit_live` or `f8_uat_live`.
- Source pairings are selected by `pairing.sch_str_dt_utc` month.
- Copied tables:
  - `pairing`
  - `pairing_segment`
  - `pairing_composition`
- New `pairing.interface_id` is set to `NULL`.
- All relevant pairing and segment date/time fields are shifted by the calendar-month delta, preserving time-of-day.
- New `pairing_composition.fill` is forced to `0` because copied pairings do not have associated `roster_flight` assignments.
- `pairing_segment.flt_id` is remapped to a target-month flight.
- Flight match key:
  - `airline`
  - `flt_num`
  - `dep_arp`
  - `arv_arp`
  - shifted `pairing_segment.sch_str_dt_utc` matched to `flight.sch_dep_dt_utc`
- If no target flight matches, the tool creates a flight from the shifted segment. Created flights keep `interface_flt_id = NULL`.
- Ambiguous flight matches fail the run.
- Duplicate target pairings are checked only against pairings that existed before this run. This avoids incorrectly treating same-batch copied pairings with identical business keys as target duplicates.
- Default mode is dry-run rollback. Add `--execute` to commit.

## SIT Connection Source

SIT connection details are on the SIT server:

```bash
ssh yuan.z@10.15.12.4
/home/yuan.z/rois/sit/env/live-server.env
```

Do not copy database passwords into docs. Use the env file at execution time.

Confirmed non-sensitive connection metadata for this run:

- Host: `10.15.12.3`
- Database: `rois`
- Schema/search_path: `f8_sit_live`

## Reusable Commands

From local repo root, the SIT DSN can be read without printing it:

```bash
cd data-migration
DB_URL=$(ssh -o BatchMode=yes yuan.z@10.15.12.4 \
  "grep '^DATABASE_URL=' /home/yuan.z/rois/sit/env/live-server.env" \
  | python3 -c "import sys; line=sys.stdin.read().strip(); print(line.split('=',1)[1].strip().strip(chr(34)).strip(chr(39)))")
```

Dry-run:

```bash
LIVE_DATABASE_URL="$DB_URL" .venv/bin/python -m f8.live_pairing_month_copy \
  --schema f8_sit_live \
  --source-month 2026-08 \
  --target-month 2026-09
```

Execute:

```bash
LIVE_DATABASE_URL="$DB_URL" .venv/bin/python -m f8.live_pairing_month_copy \
  --schema f8_sit_live \
  --source-month 2026-08 \
  --target-month 2026-09 \
  --execute
```

For future months, change `--source-month` and `--target-month`. Run dry-run first every time.

## 2026-08 To 2026-09 SIT Run Result

Dry-run result:

```text
source_pairings=2046
copied_pairings=2046
copied_segments=6209
copied_compositions=3830
matched_flights=3410
created_flights=2799
duplicate_pairings=[]
ambiguous_flights=[]
ok=True
```

Execute result after duplicate-detection fix:

```text
source_pairings=2046
copied_pairings=2046
copied_segments=6209
copied_compositions=3830
matched_flights=4787
created_flights=1422
duplicate_pairings=[]
ambiguous_flights=[]
ok=True
```

The matched/created flight split differed from dry-run because execute creates flights as it goes, and later copied segments can reuse flights created earlier in the same transaction.

## Post-Run Validation

Read-only validation after execute:

```text
pairings_copied=2046
segments_for_copied=6209
compositions_for_copied=3830
composition_nonzero_fill=0
segments_missing_flight=0
created_flights_referenced_by_copied_segments=1422
created_flight_sch_dep_range=2026-09-01 05:35:00~2026-10-05 03:30:00
```

Notes:

- `composition_nonzero_fill=0` confirms copied composition fill values were reset.
- `segments_missing_flight=0` confirms all copied segments reference a valid flight.
- Created flight dates extend into October because some August source pairings cross month boundaries; shifting them to September naturally creates segments into early October.

## Verification Commands Run During Implementation

```bash
cd data-migration
.venv/bin/pytest tests/test_live_pairing_month_copy.py
.venv/bin/python -m py_compile f8/live_pairing_month_copy.py tests/test_live_pairing_month_copy.py
.venv/bin/python -c "import pg8000; import pg8000.dbapi; print(pg8000.__version__)"
```

Results:

- `pytest`: PASS, 13 tests passed.
- `py_compile`: PASS.
- `pg8000` import/version: PASS, `1.31.5`.

## Operational Cautions

- Always run dry-run before `--execute`.
- Do not run the same source/target month twice unless the target month copied rows have been intentionally cleaned up first; duplicate detection should prevent most accidental re-runs, but manual confirmation is still required.
- The tool currently copies pairing data only. It does not create or copy `roster_flight` records.
- Because created flights have no `interface_flt_id`, downstream workflows that assume external flight IDs should account for copied test data.
- Runtime DB credentials must stay in env files or secret stores, not in docs or source code.
