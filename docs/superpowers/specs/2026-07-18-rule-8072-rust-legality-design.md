# Rule 8072 Rust + Legality Full Migration Design

Date: 2026-07-18
Status: Approved for planning

## Goal

Migrate rule 8072 from the legacy C++ CrewRule implementation into the active Rust legality engine and connect it end-to-end through the same Legality, Live/Scenario recheck, persisted violation, and Gantt display flows used by 8002, 8056, and the newly migrated 8071.

The intended difference from 8071 is only the parameter shape and rule logic. The surrounding system behavior must match the existing migrated-rule pattern: rule catalog membership, editable parameter rows, scoped recheck, persisted violations, Scenario legality, Live legality, crew bells, Alert Center, hover tooltips, and ViolationListDialog.

## Source Of Truth

The C++ source is:

`/home/qianggong/Documents/Crew/ROCode/RO-Dev/generalro/AircrewRO/Rule/CrewRule/RuleEngine/rule8072.cpp`

The relevant C++ function is:

`LegalityChecker::checkGenMinQualByFleetAndRank`

The rule enum is:

`MIN_QAL_PER_FLEET_RANK = 8072` in `/home/qianggong/Documents/Crew/ROCode/RO-Dev/generalro/AircrewRO/Rule/CrewRule/GlobalDefinition/RuleEngineDef.h`.

Legacy parameter evolution confirms the current 13-column header:

```text
Flight Fleets
Flight Assignment Groups
Crew Teams
Crew Nationality
Destination Countries
Acting Ranks
Flight Compositions
Required Qualifications
Attributes
Dep
Arr
Min Limits
Max Limits
```

## Current State

Current F8 and `f8_sit_live` checks found no existing `rule.function = 8072` and no ruleset links for 8072. Rule 8072 therefore needs a new migration, like 8071.

Existing UI and Gantt infrastructure is already sufficient:

- The Legality UI renders parameter tables from `rule.param_json.tables[].header` and `rows`.
- Wide tables use the existing row-edit dialog.
- Persisted `rule_violation` and `scenario.rule_violation` rows are displayed generically by rule code, instance, severity, owner crew, pairing/segment anchor, and message.
- No custom Gantt renderer or client-side 8072 calculator is needed.

## Rule 8072 Semantics

Rule 8072 checks each relevant flight segment and counts how many crew on that segment have the required qualification set for the configured fleet/rank/filter row.

The checker applies these filters before counting:

- Flight fleet.
- Flight assignment group, expanded to assignments through the assignment-group mapping.
- Crew team, including exclusion form `!(...)`.
- Crew nationality, including exclusion form `!(...)`.
- Destination country, based on the segment arrival airport country, including exclusion form `!(...)`.
- Acting rank.
- Flight composition.
- Required qualifications.
- Pairing/flight attributes, including exclusion form `!(...)`.
- Departure airport.
- Arrival airport.

Required Qualifications must preserve C++ semantics:

- `*` means any crew qualifies.
- `A|B` means the crew may have either `A` or `B`.
- `A+B` means the crew must have both `A` and `B`.
- `A+B|C` means `(A and B) or C`.
- Qualification validity must cover the segment start/end time. Scenario/optimizer qualification-extension behavior should be preserved where the current Rust/input model can represent it; any unsupported extension fallback must be explicit in tests and implementation notes.

For each matching segment, the rule computes:

- `numberOfQualified`: crew on the segment with a valid required qualification alternative.
- `numberOfFilled`: crew on the segment matching the configured division/rank/assignment filters.
- `numberOfPlanned`: planned composition slots for the configured acting ranks, or all ranks when Acting Ranks is `*`.

A violation is emitted when:

- `numberOfQualified < Min Limits`, or
- `numberOfQualified > Max Limits`.

C++ min-underflow skip must be preserved:

- If `numberOfQualified < Min Limits` and `numberOfPlanned > 0`, skip the violation when `numberOfPlanned - numberOfFilled >= Min Limits - numberOfQualified`.
- This means no warning is shown when remaining open planned slots could still satisfy the minimum qualification count.

Optimizer-specific C++ behavior must also be preserved in the Rust kernel API where applicable:

- If PA-qualified count exceeds max and there are additional non-PA qualified crew, optimizer returns false.
- If all over-max qualified crew are PA, optimizer tolerates the issue.
- Live/Legality editor mode reports violations normally.

## 8072 Parameter Table

Use the current 13-column header:

```text
Flight Fleets
Flight Assignment Groups
Crew Teams
Crew Nationality
Destination Countries
Acting Ranks
Flight Compositions
Required Qualifications
Attributes
Dep
Arr
Min Limits
Max Limits
```

Default F8 rule row is the user-confirmed scheme A:

```text
*,FLY,*,*,*,*,*,FC-GREEN,*,*,*,0,1
```

Meaning:

- All flight fleets.
- `Flight Assignment Groups = FLY`.
- All crew teams, nationalities, destination countries, acting ranks, flight compositions, attributes, departure airports, and arrival airports.
- `Required Qualifications = FC-GREEN`.
- `Min Limits = 0`.
- `Max Limits = 1`.

## Database Design

Add an idempotent migration under `sql/migration/` to create the 8072 rule catalog entry and ruleset links.

The migration must:

- Insert or update one `rule` row for `function=8072`, `instance='001'`, `rule_id=8072001`.
- Use F8 pilot scope: `filiale='F8'`, `division='P'`, `owner='S'`, `locked='0'`.
- Reuse category/source/store/severity defaults from existing F8 roster rules where practical, following the 8071 migration pattern.
- Store the 13-column `param_json` with the default row above.
- Insert `rule_set` rows for worksets `103` and `433`.
- Be safe to rerun via guarded inserts/updates.

No schema change is planned. Existing `rule`, `rule_set`, `rule_violation`, and `scenario.rule_violation` storage is sufficient.

## Rust Engine Design

Add a dedicated 8072 Rust module and binary following the 8071 pattern:

- Module: `rule-engine-rs/src/rule8072.rs`.
- Binary: `rule-engine-rs/src/bin/check_8072.rs`.
- Cargo binary name: `check-8072`.
- Public structs model one 8072 parameter row, one segment/flight input row, one crew-on-segment row, and emitted violations.

The Rust kernel should implement:

- Header/cell parser for the 13-column parameter shape.
- Wildcard, pipe-delimited include, and `!(...)` exclusion matching.
- Required qualification OR/AND parsing with `|` and `+`.
- Segment-level aggregation by segment id, pairing id, duty sequence, flight number/date, fleet, dep/arr, assignment, composition, and times.
- Crew-on-segment filtering by division, acting rank, assignment, nationality, team, source, and valid qualifications.
- Min-underflow open-capacity skip.
- Editor vs optimizer handling for PA over-max behavior.

The Rust output must include enough data for persistence:

- segment id
- pairing id
- duty sequence
- crew id owner used for Gantt anchoring
- segment start/end UTC
- flight number/date
- flight fleet
- acting rank
- required qualification string
- qualified count
- planned count
- filled count
- min and max limits
- violation direction, under-min or over-max

## Live And Scenario Recheck Design

Add `rule8072(source, ctx)` to `live-server/scripts/legality-recheck-core.mjs`.

The new rule function must:

- Resolve all `ctx.instancesOf(8072)` rows from the selected ruleset.
- Parse parameter columns by header name, not index-only constants.
- Skip incomplete rows with a clear log message.
- Build tagged TSV input for `check-8072`.
- Call `runBin('check-8072', ['--emit-tsv'], input)`.
- Convert emitted rows to persisted violation objects with `rule_code='8072'`, `rule_instance`, `scope_key`, severity, `pairing_id`, `segment_id`, window start/end as segment times, owner crew id, and an English message.

Add `8072` to:

- `RULES` in `live-server/scripts/legality-recheck-core.mjs`.
- `RULE_RECHECK_DEPS` in `live-server/src/services/rule/legality-recheck.ts`, mapping `'8072'` to `['8072']`.

Add source accessors to all legality sources:

- Live source in `live-server/scripts/live-legality.mjs`.
- Scenario source in `live-server/scripts/scenario-legality.mjs`.
- Seed/live-backed source in `live-server/scripts/scenario-legality-source.mjs`.

The source accessor should return normalized 8072 segment qualification data, including:

- segment id, pairing id, duty sequence, and segment sequence.
- flight id, flight number/date, start/end UTC, fleet, dep/arr.
- assignment and assignment group.
- flight composition name and planned/fill counts by rank.
- pairing/segment attributes.
- destination country from arrival airport.
- all crew rostered on that segment with crew id, division, acting rank, assignment, nationality, team, source, and effective qualification rows.

The implementation must use the data-model source of truth:

- `roster_flight` is the crew x segment table.
- `pairing_segment` links pairings to flight segments.
- `flight` provides flight-level schedule/fleet/airport details where needed.
- `airport.country` provides destination country.
- `crew`, `crew_qualification`, and `crew_team` provide crew-level filters.
- `pairing_composition` and/or flight composition sources provide planned and filled counts.

The data source must remain backend/script-only and must not block Gantt first paint.

## Gantt And Legality UI Design

No custom 8072 UI component is planned.

Legality behavior:

- 8072 appears in worksets `103` and `433` after migration.
- Admin users can generate, edit, delete, copy, and reorder 8072 rows through the existing parameter table editor.
- The 13-column table should open through the existing row editor when needed.
- Saving parameters uses the existing `PATCH /api/legality/rule/:ruleId/params` endpoint.
- Saving 8072 parameters triggers scoped recheck for 8072 only.

Gantt behavior:

- Live Gantt loads persisted 8072 rows through existing `/api/violations`.
- Scenario Gantt loads persisted 8072 rows through existing `/api/scenario/:id/legality`.
- Crew bells, Alert Center, hover tooltip, and ViolationListDialog show 8072 rows through the generic persisted-violation path.
- No client-side legality calculation is added to Gantt.

## Message Design

Persisted message should mirror the C++ meaning in English:

```text
The number of crews ({qualified}) with valid qualification ({qualification}) on flight ({flight},{fleet}) and acting rank ({rank}) does not meet the requirement (min={min}, max={max}). Parameters: dep-arr={dep}-{arr}, attribute={attribute}, assignment group={groups}, composition={composition}. Current composition plan/fill={planned}/{filled}.
```

The message should include enough values for planners to understand why a segment is flagged without opening raw params.

## Testing Plan

Rust tests:

- Parse the 13-column default row.
- `Required Qualifications=FC-GREEN` counts only crew with valid FC-GREEN covering the segment window.
- `A+B|C` qualification expression behaves as `(A and B) or C`.
- `Flight Assignment Groups=FLY` filters via mapped assignments.
- Crew nationality, destination country, crew team, attribute, dep/arr, fleet, acting rank, and flight composition filters match C++ wildcard/include/exclude behavior.
- Over-max emits when qualified count exceeds Max Limits.
- Under-min emits when qualified count is below Min Limits.
- Under-min skips when open planned capacity can still satisfy Min Limits.
- Optimizer PA over-max behavior is covered if optimizer mode is modeled in the Rust API.
- CLI emits stable TSV rows for persistence.

live-server tests:

- `rule8072` parses `param_json` by header name.
- `rule8072` calls `check-8072` with the expected tagged TSV.
- `rule8072` maps Rust output to persisted `rule_violation` rows with `rule_code='8072'`, segment/pairing anchors, owner crew id, and message.
- `affectedRuleCodes` maps function `8072` to scoped recheck `['8072']`.
- Live, Scenario, and seed sources expose the same normalized columns.

Legality UI tests:

- 8072 appears in the selected ruleset after seeded/mocked API data.
- The 13-column 8072 row opens the existing parameter row editor.
- Admin can edit/save a 8072 parameter row.
- Add/delete/copy behavior works for 8072 through the generic editor.

Gantt E2E:

- A real or controlled persisted 8072 violation appears in Alert Center with rule code/instance and message.
- The owning crew row shows a bell and opens ViolationListDialog filtered to that crew.

Verification commands should include:

- `cargo test --manifest-path rule-engine-rs/Cargo.toml`
- `cargo build --release --manifest-path rule-engine-rs/Cargo.toml`
- `node --test live-server/scripts/__tests__/legality-recheck-core.test.mjs`
- `npm exec -- tsc --noEmit` from `live-server/`
- Focused Playwright tests for 8072 parameter editing and Gantt persisted violation display.
- `npm run check:ui` only if frontend style/UI files are changed.

## Risks And Constraints

- 8072 depends on accurate segment-level crew membership. The implementation must use `roster_flight` rather than inferring crew from pairing-level data.
- Flight composition and planned/fill counts may require careful reconciliation between pairing and flight composition tables. The implementation must document the chosen source and add regression tests for min-underflow capacity skip.
- Crew-team and qualification-extension history may be sparse in F8. Unsupported or missing data must be explicit rather than silently treated as a match.
- GitNexus tools are unavailable in this environment, so later implementation must use local impact analysis and report that fallback.
- Gantt first paint must not depend on 8072 computation. Only persisted violation fetches should surface 8072.

## Out Of Scope

- Creating a custom 8072 Gantt renderer.
- Adding a client-side 8072 rule calculator in Gantt.
- Supporting non-F8 airlines or generic multi-airline migration logic.
- Changing existing rule schema or violation schema unless implementation proves a hard blocker.
