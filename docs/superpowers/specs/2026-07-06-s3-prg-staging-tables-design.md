# S3 PRG Staging Tables Design

## Context

S3 Pairing Import currently parses `*.PRG` directly into scenario business tables:

- `scenario.pairing`
- `scenario.flight`
- `scenario.pairing_segment`
- `scenario.pairing_composition`

This works for basic import, but it makes field validation difficult. Recent checks showed that PRG record type `3` contains duty period records, while the current segment parser assigns all type `2` and type `4` segments to `dutySeq = 1`. That means pairings with multiple duty periods can be imported with incorrect duty grouping, and derived node times such as Brief/Debrief can be wrong.

The PRG document `docs/modules/connector-server/Planout.doc` defines structured record types `1`, `2`, `3`, and `4`. We need a durable staging layer so the raw S3 PRG fields are preserved in database tables before transformation into scenario business tables.

## Goals

1. Add formal staging tables for S3 PRG record types `1`, `2`, `3`, and `4`.
2. Insert a complete staging copy on every S3 Pairing Import before writing scenario business tables.
3. Preserve raw line number and raw line text for audit and field mapping investigation.
4. Support SQL inspection of duty split, Brief/Debrief conversion, pairing rest time, offline segments, and other PRG fields.
5. Use staging data as the conversion source for business table import.
6. Keep existing S3 Pairing Import UI/API behavior unchanged for users.

## Non-Goals

1. Do not change the user-facing S3 Pairing Import dialog.
2. Do not create a new UI for browsing staging rows in this change.
3. Do not change general Scenario Gantt behavior except as needed to keep PO imports working.
4. Do not infer final business meaning for every PRG field immediately; the staging tables intentionally keep fields available for later analysis.

## Table Design

All new tables live under the `scenario` schema because the data is scenario-import-specific and is not live operational data.

### `scenario.s3_prg_import_batch`

One row per uploaded PRG file import attempt.

Key columns:

- `id bigint generated always as identity primary key`
- `scenario_id bigint not null`
- `file_name varchar(255) not null`
- `file_checksum varchar(64) not null`
- `raw_line_count int not null`
- `status varchar(20) not null`
- `warning_count int not null default 0`
- `created_by varchar(50) not null`
- `created_at timestamp not null default now()`
- `updated_by varchar(50) not null`
- `updated_at timestamp not null default now()`

Indexes:

- `(scenario_id, id desc)` for finding latest imports.
- `(file_checksum)` for duplicate investigation.

### `scenario.s3_prg_pairing_record`

Record type `1`: pairing master.

Important parsed fields:

- `batch_id`
- `scenario_id`
- `raw_line_no`
- `raw_line`
- `pairing_number`
- `pairing_date`
- `effective_from_date`
- `effective_to_date`
- `frequency`
- `pairing_no_op_dates_raw`
- `report_date`
- `report_minutes`
- `pairing_end_date`
- `pairing_end_minutes`
- `first_flight_number`
- `first_departure_minutes`
- `duty_count`
- `tafb_minutes`
- `standup_overnight_indicator`
- `positions_raw`
- `rest_required_after_pairing_minutes`
- `total_block_minutes`
- `deadhead_credit_minutes`
- `language_positions_raw`

The rest-required-after-pairing field maps from `Planout.doc` positions `146-149`.

### `scenario.s3_prg_online_segment_record`

Record type `2`: online flight segment.

Important parsed fields:

- `batch_id`
- `scenario_id`
- `raw_line_no`
- `raw_line`
- `pairing_number`
- `pairing_date`
- `flight_number`
- `flight_segment_date`
- `departure_airport`
- `departure_date`
- `departure_minutes`
- `arrival_airport`
- `arrival_date`
- `arrival_minutes`
- `pairing_sequence_number`
- `deadhead_indicator`
- `leg_break_indicator`
- `far_domestic_international_indicator`
- `block_minutes`
- `block_crossover_minutes`
- `leg_credit_minutes`
- `leg_deadhead_pay_minutes`
- `far_type`
- `pilot_crew_complement`
- `departure_utc_offset_minutes`
- `arrival_utc_offset_minutes`
- `equipment_type`
- `contract_domestic_international_indicator`

### `scenario.s3_prg_duty_record`

Record type `3`: duty break / duty period.

Important parsed fields:

- `batch_id`
- `scenario_id`
- `raw_line_no`
- `raw_line`
- `pairing_number`
- `pairing_date`
- `pairing_sequence_number`
- `duty_period_number`
- `duty_start_date`
- `duty_start_minutes`
- `duty_end_date`
- `duty_end_minutes`
- `far_domestic_international_indicator`
- `scheduled_duty_minutes`
- `scheduled_layover_minutes`
- `layover_city`
- `hotel_name`
- `hotel_phone_number`
- `rest_far_type`
- `rest_far_type_number`
- `rest_far_must_begin_minutes`
- `rest_far_required_minutes`
- `duty_period_guarantee_minutes`
- `total_block_minutes`
- `total_deadhead_credit_minutes`
- `total_deadhead_pay_minutes`
- `total_duty_credit_minutes`
- `total_duty_pay_minutes`
- `duty_period_type_day_night`
- `fatigue_units_raw`

The duty period start/end fields map from `Planout.doc` positions `023-046`.

### `scenario.s3_prg_offline_segment_record`

Record type `4`: offline / transport segment.

Important parsed fields:

- `batch_id`
- `scenario_id`
- `raw_line_no`
- `raw_line`
- `pairing_number`
- `pairing_date`
- `pairing_sequence_number`
- `carrier`
- `transport_code`
- `flight_segment_date`
- `departure_airport`
- `departure_date`
- `departure_minutes`
- `arrival_airport`
- `arrival_date`
- `arrival_minutes`
- `tail_assignment`
- `assignment`

Ground transport such as `LIMO` remains inspectable in staging before normalization into business table fields.

## Data Flow

The S3 import service changes from direct parse-to-business-table to a two-stage pipeline:

1. Validate the uploaded file name and text.
2. Parse PRG lines into typed staging row objects.
3. Insert one `s3_prg_import_batch` row.
4. Insert type `1/2/3/4` rows into staging tables in the same transaction.
5. Convert staging rows into the existing in-memory pairing structure.
6. Write scenario business tables using the existing batched insert path.

If the business-table conversion fails, the transaction rolls back both staging and business rows. A future enhancement may preserve failed staging batches, but this design keeps import atomic for now.

## Duty Split Rules

Duty grouping should be derived from record type `3`, not guessed from segment order.

Conversion rules:

1. Build duty windows from `s3_prg_duty_record` using `duty_period_number`, `duty_start_date/minutes`, and `duty_end_date/minutes`.
2. Assign each type `2` or type `4` segment to the duty whose window contains the segment's scheduled departure and arrival times.
3. If more than one duty window can contain a segment, choose the smallest matching window and emit an import warning.
4. If no window contains the segment, fall back to chronological duty order using `pairing_sequence_number`, and emit an import warning.
5. Persist the resolved duty number into `pairing_segment.duty_seq`.

For the user-reported example, imported `pairing.id = 3072` has five segments and should resolve to three duties: segment 1 in duty 1, segment 2 in duty 2, and segments 3-5 in duty 3.

## Node Time Mapping

Once segments are assigned to duties, node times are derived per duty:

- `pickup_start_utc = pairing report time`
- `pickup_end_utc = duty start`
- `brief_start_utc = duty start`
- `brief_end_utc = first segment start in that duty`
- `debrief_start_utc = last segment end in that duty`
- `debrief_end_utc = duty end`
- `dropoff_start_utc = duty end`
- `dropoff_end_utc = pairing end time`

The PRG document does not expose fields literally named Brief or Debrief, so those values remain derived from duty period and segment boundaries.

## Pairing Rest Mapping

Record type `1` position `146-149` is `Rest Required after Pairing in minutes`. The parser stores it in staging as `rest_required_after_pairing_minutes`.

During business conversion, map it to the matching scenario pairing rest column after confirming the exact column name in `sql/schema/scenario/01-scenario-tables.sql` and the live-server model. If there is no semantically correct existing column, keep the value in staging only and do not overload an unrelated rest field.

## Error Handling and Warnings

Hard failures:

- Unsupported record type other than the accepted `1/2/3/4` set.
- Invalid dates or minute fields in required fields.
- Segment rows with no matching type `1` pairing master.
- Duty rows with no matching type `1` pairing master.

Warnings:

- Pairing has no type `3` duty records.
- Segment cannot be matched to a duty window exactly.
- Segment matches multiple duty windows.
- Staging contains fields that are valid but not mapped into business tables.

Warnings should continue to be returned by the import API and counted on the batch row.

## Testing

Focused tests should cover:

1. Type `1` staging extraction, including report time and rest-required-after-pairing.
2. Type `2` staging extraction, including pairing sequence number and equipment type.
3. Type `3` staging extraction, including duty period number and start/end fields.
4. Type `4` staging extraction, including carrier/transport code and normalized LIMO behavior downstream.
5. Duty assignment for a five-segment, three-duty sample.
6. Business-table node time mapping from type `3` duty windows.
7. Route/service import still returns current import summary fields.
8. `npm run build` in `live-server`.

## Operational Notes

The staging tables are intended for SQL inspection. Example investigation queries should be added to the final handoff or module docs after implementation, including:

- Latest batch rows for a scenario.
- All record type `3` duty windows for a pairing.
- Type `2/4` segments next to the resolved business `pairing_segment.duty_seq`.
- Pairing rest required values from type `1`.

## Open Decisions Resolved

The user chose formal staging tables over temporary debug tables. This means the implementation should add schema/migration code and tests, not just a one-off script.
