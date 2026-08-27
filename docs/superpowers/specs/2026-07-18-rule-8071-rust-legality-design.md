# Rule 8071 Rust + Legality Full Migration Design

Date: 2026-07-18
Status: Approved for planning

## Goal

Migrate rule 8071 from the legacy C++ CrewRule implementation into the active Rust legality engine and connect it end-to-end through the existing Legality and Gantt flows. Rule 8071 must behave like the existing migrated rules 8002 and 8056 in every system layer: rule catalog membership, editable parameters, scoped recheck, persisted violations, Scenario legality, Live legality, and Gantt display.

The only intended difference from 8002/8056 is the 8071 parameter shape and rule logic.

## Source Of Truth

The C++ source is:

`/home/qianggong/Documents/Crew/ROCode/RO-Dev/generalro/AircrewRO/Rule/CrewRule/RuleEngine/rule8071.cpp`

Related C++ parameter parsing is:

`/home/qianggong/Documents/Crew/ROCode/RO-Dev/generalro/AircrewRO/Rule/CrewRule/db/RuleParseParams.cpp`

The relevant C++ function is `LegalityChecker::checkMaxRosterProperties`, backed by `rule8071`.

## Current State

Remote F8 currently has no `rule.function = 8071` row and no `rule_set` member for 8071. Existing F8 active RULE worksets are:

- `103` - `PBS Solver Ruleset FD`
- `433` - `F8 Full Ruleset`

Both currently contain the same 15 rule rows, including 8002 and 8056, but not 8071.

The Gantt Legality UI already renders rule parameter tables directly from `rule.param_json.tables[].header` and `rows`. It supports wide tables through the row-edit dialog, so 8071 does not require a dedicated UI component.

The Gantt violation display already consumes persisted `rule_violation` and `scenario.rule_violation` rows generically by `rule_code`, `rule_instance`, `scope_key`, severity, and message. If 8071 rows are persisted correctly, the existing crew bell, Alert Center, hover tooltip, and ViolationListDialog should display them without 8071-specific rendering.

## Rule 8071 Semantics

Rule 8071 is "minimum/maximum count by roster properties." It checks each qualified crew over generated time windows and counts matching roster activity. A violation is emitted when:

- `count > Max Times`, or
- `count < Min Times` and the application is not the optimizer and `Min Times > 0`.

The C++ rule supports three count modes:

- `Check Mode = F`: count matching flights in the window.
- `Check Mode = D`: count matching duties in the window.
- Any other value, including `P` or `*`: count matching rosters/pairings in the window.

The Rust implementation must preserve these semantics, including wildcard behavior and fractional flight counts where the C++ flight-level helper counts matching flight sectors divided by 2.

## 8071 Parameter Table

Use the current C++ parser's 17-column shape:

```text
Bases
Ranks
Fleets
Crew Teams
Labels
Attributes
Override Duty Attributes
Assignment Groups
Qualifiers
Flights
Destinations
Positions
Period
Unit
Max Times
Min Times
Check Mode
```

Default F8 row, based on the supplied screenshot but changed so F8 does not restrict flight number:

```text
*,*,*,*,*,*,*,FLY,*,*,*,*,1,CM,11,0,*
```

Meaning:

- All bases, ranks, fleets, crew teams, labels, attributes, override duty attributes, qualifiers, destinations, positions.
- `Assignment Groups = FLY`.
- `Flights = *`, no flight-number restriction.
- `Period = 1`, `Unit = CM`.
- `Max Times = 11`, `Min Times = 0`.
- `Check Mode = *`, which follows the C++ else branch and counts roster/pairing-level occurrences.

## Database Design

Add an idempotent migration under `sql/migration/` to create the 8071 rule catalog entry and ruleset links.

The migration must:

- Insert `rule` row for `function=8071`, `instance='001'`, `rule_id=8071001`.
- Set description to `Max PTNs for 777`.
- Set detail to `13.1 Max number N of Standby trips within a planning period`.
- Set category/source/store fields consistently with existing F8 roster rules.
- Set `filiale='F8'`, `division='P'`, `owner='S'`, `locked='0'`.
- Store the 17-column `param_json` with the default row above.
- Insert `rule_set` rows for worksets `103` and `433` pointing at `8071001`.
- Be safe to rerun via `ON CONFLICT` or guarded inserts.

No schema change is needed. The existing `rule.param_json`, `rule.rule_id`, `rule_set`, `rule_violation`, and `scenario.rule_violation` models are sufficient.

## Rust Engine Design

Add a dedicated 8071 Rust module and binary following the 8002/8056 pattern:

- Module: `rule-engine-rs/src/rule8071.rs` or equivalent focused module.
- Binary: `rule-engine-rs/src/bin/check_8071.rs`.
- Public structs model one rule row and one roster activity row.
- The checker accepts TSV input and emits TSV violations for `legality-recheck-core.mjs`.

The Rust kernel should implement:

- Wildcard and pipe-delimited matching for all string filters.
- Crew qualification against base/rank/fleet/position windows using the same qualification-row pattern as 8002 where practical.
- Window enumeration for supported C++ units used by 8071, including at minimum `CD`, `CW`, `CM`, `RP`, and the currently migrated common unit set where existing helpers are reusable.
- `F`, `D`, and roster/pairing count modes.
- Over-max and under-min output.
- Stable scope keys per param row, such as `1CM:*:FLY:*`, clipped to the existing `scope_key` storage convention.

The Rust output should include enough data for persistence:

- `crew_id`
- `anchor_pairing_id`
- `window_start`
- `window_end`
- `actual_count`
- `max_times`
- `min_times`
- `mode`
- source labels for message generation if available

## Live And Scenario Recheck Design

Add `rule8071(source, ctx)` to `live-server/scripts/legality-recheck-core.mjs`.

The new rule function must:

- Resolve all `ctx.instancesOf(8071)` rows from the current ruleset.
- Parse columns by header name, not index constants.
- Skip incomplete rows with a clear log message.
- Build a TSV input from a new source accessor.
- Call `runBin('check-8071', ['--emit-tsv'], input)`.
- Convert emitted rows to persisted violation objects using `rule_code='8071'`, `rule_instance`, `scope_key`, severity from the rule or the existing row convention, actual/limit values, and an English message.

Add `8071` to:

- `RULES` in `legality-recheck-core.mjs`.
- `RULE_RECHECK_DEPS` in `live-server/src/services/rule/legality-recheck.ts`, mapping `'8071'` to `['8071']`.

Add source accessors to all legality sources:

- Live source in `live-server/scripts/live-legality.mjs`.
- Scenario source in `live-server/scripts/scenario-legality.mjs`.
- Seed/live-backed source in `live-server/scripts/scenario-legality-source.mjs`.

The source accessor should return normalized roster-property activity rows with:

- crew id
- pairing id or ground sentinel
- duty seq
- segment/flight id if present
- start/end epoch seconds
- assignment group and assignment
- label
- pairing attributes if available
- duty/roster attributes if available
- qualifier-like assignment code
- flight number
- destination/arrival airport
- position
- effective crew qualification rows already available through the existing 8002 accessor where possible

The Live source must stay bounded to the requested date window plus any lead-in needed by configured 8071 windows. It must not force first paint data paths; recheck runs are backend/script paths, separate from Gantt initial render.

## Gantt And Legality UI Design

No new dedicated 8071 UI component is planned.

Legality tab behavior:

- 8071 appears in the selected rulesets once the migration inserts it into worksets `103` and `433`.
- Admin users can edit/add/copy/delete/reorder 8071 parameter rows through the existing `LegalityParamTableEditor`.
- Because the table has 17 columns, row editing uses the existing wide-table `ParamRowDialog`.
- Saving parameters calls the existing `PATCH /api/legality/rule/:ruleId/params` endpoint.
- Saving 8071 parameters triggers scoped recheck for 8071 only.

Gantt behavior:

- Live Gantt loads persisted 8071 rows through existing `/api/violations`.
- Scenario Gantt loads persisted 8071 rows through existing `/api/scenario/:id/legality`.
- Crew bell severity, Alert Center grouping, hover tooltip, and ViolationListDialog show 8071 rows generically.
- No client-side legality calculation should be added to Gantt.

## Message Design

Persisted message should mirror the C++ meaning in English:

```text
The number of rosters({actual}) must be less than {max} and more than {min}. Rule parameters(attribute={attributes}, assignment group={groups}, label={labels}, qualifier={qualifiers}, destination={destinations}).
```

For clarity, include the window:

```text
The number of matching rosters ({actual}) in the {period}{unit} window {start}..{end} must be <= {max} and >= {min}. Rule parameters: attribute={attributes}, assignment group={groups}, label={labels}, qualifier={qualifiers}, destination={destinations}.
```

Use `<= max` wording even though the C++ message says "less than" while the condition is `numberOfRoster > iMax`. This avoids a misleading strict-bound message.

## Testing Plan

Rust tests:

- Param row parsing for all 17 columns.
- `Flights=*` does not filter out rows.
- `Assignment Groups=FLY`, `1 CM`, `Max Times=11` emits when 12 matching roster-level items exist.
- `Max Times=11` does not emit when exactly 11 matching roster-level items exist.
- `Min Times > 0` emits under-min in editor/live mode but not optimizer mode if optimizer mode is modeled.
- `Check Mode=F` counts matching flight sectors as C++ does.
- `Check Mode=D` counts matching duties.
- Wildcard and pipe-delimited filters behave consistently.

live-server tests:

- `rule8071` parses the 17-column `param_json` and calls the Rust binary with the expected filters.
- `rule8071` maps Rust output to persisted `rule_violation` rows with `rule_code='8071'`.
- `affectedRuleCodes` maps function `8071` to scoped recheck `['8071']`.
- Live, Scenario, and seed sources expose the same normalized input columns.

Legality UI tests:

- 8071 appears in the ruleset after seeded/mocked API data.
- A 17-column 8071 row opens `ParamRowDialog`.
- Admin can edit/save an 8071 parameter row.
- Add/delete/copy behavior works for 8071.

Gantt E2E:

- A real or controlled persisted 8071 violation appears in Alert Center with rule code/instance and message.
- A crew row with a 8071 violation shows the crew bell and opens ViolationListDialog filtered to that crew.

Verification commands should include:

- Rust: `cargo test --manifest-path rule-engine-rs/Cargo.toml`
- Rust binary build: `cargo build --release --manifest-path rule-engine-rs/Cargo.toml`
- live-server focused tests for legality recheck.
- Gantt focused UI tests.
- `npm run check:ui` if any UI style code is touched.

## Risks And Constraints

- Full C++ fidelity depends on understanding `Utility::howManyFlightsInRange`, `howManyDutiesInRange`, and `howManyRostersInRange2`. The implementation must inspect these helpers before coding the Rust kernel.
- Some C++ filter inputs may not map cleanly to current F8 normalized tables. If a source field is absent, the implementation must document the exact fallback and add tests for it.
- `Crew Teams` support may remain limited if current F8 data lacks effective crew-team history, matching the existing 8002 limitation pattern.
- `RP` window support must reuse existing roster-period logic where available; if the first implementation cannot faithfully support RP, it must skip RP rows loudly rather than produce wrong results.
- The default row uses `Check Mode=*`, which intentionally maps to the C++ roster/pairing-level branch.
- Gantt first paint must not depend on 8071 computation. Only persisted violation fetches should surface 8071.

## Out Of Scope

- Adding a new Gantt-specific 8071 visual component.
- Rebuilding the Legality parameter editor.
- Changing 8002/8056 semantics.
- Adding hardcoded business constants outside `rule.param_json`.
- Changing `rule_violation` schema.
