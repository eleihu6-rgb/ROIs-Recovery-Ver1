# Scenario Add Team Division Scope

## Goal

Make the Scenario Algorithm Parameters -> Team Rules -> Add/Edit Team form use the
Scenario's single crew division as its scope. Division is owned by the Scenario
workset and must not be edited or duplicated in a Team's `crew_filter` JSON.

## Current Behavior

- `TeamRulesEditor` loads `GET /api/scenario/:id/gantt-data` and maps `data.crew`
  into preview rows.
- The preview rows are filtered by `scenarioDetail.filterParams.crew` and the
  normalized Scenario division.
- Rank, Base, and Division options in `CrewFilterPanel` are derived from the
  filtered preview rows.
- `crew_filter.division` is currently treated as an independent Team filter and
  is persisted in the `team_rules` parameter JSON.

This makes the option controls dependent on asynchronous preview rows and allows
the Team JSON division to disagree with the Scenario workset division.

## Decisions

1. `scenarioDetail.division` is the only Division source for Team Rules. It is the
   frontend representation of `workset.division`.
2. The Team filter JSON no longer contains `division`. The editor ignores the
   legacy field when reading and omits it when saving. A legacy conflicting value
   therefore cannot affect preview matching after the editor is opened.
3. The Add/Edit Team form displays Scenario Division in a read-only text input.
   It displays an empty value if the detail is anomalously empty; it does not
   apply the generic `P` fallback used by Scenario scope filtering.
4. Rank and Base candidates are sourced from Scenario scope selections first:
   `scenarioDetail.filterParams.crew.ranks` and `.bases`. When either selection
   is empty (meaning all), the existing reference-store options are used as the
   complete fallback. Rank fallback options are scoped by Scenario Division.
5. Preview matching continues to use the already Scenario-scoped `crewRows`.
   The change only makes the control candidates and Division ownership explicit;
   it does not broaden the set of crews that can be previewed.

## Data Flow

```text
ScenarioDetail.division -------------------------------> read-only Division input
ScenarioDetail.filterParams.crew.bases/ranks ---------> Team Base/Rank candidates
reference-store Base/Rank options --------------------> fallback when scope is All
GET /scenario/:id/gantt-data -> scenario-scoped crewRows -> Team preview matching
Team editor save --------------------------------------> crew_filter without division
```

The raw Scenario Division is passed through `TeamRulesEditor` to `TeamEditor` and
`CrewFilterPanel`. The normalized division remains available only for the
existing Scenario preview filter path.

## Compatibility

Existing stored `crew_filter.division` values are read as legacy data but are not
used for Team matching. They are removed from the value produced by the next Team
save. No database, API route, or schema change is required.

## Testing

- Add a focused Vitest regression for the Team Rules editor that supplies a
  conflicting legacy Team division and a different Scenario division. Assert the
  read-only value is the Scenario value and the saved Team filter omits division.
- Add a Playwright regression that opens a real Scenario's Algorithm Parameters,
  selects Team Rules, opens Add Team, and verifies the Division input is read-only
  and reflects the Scenario. The test also verifies Rank/Base candidates remain
  available when they come from Scenario scope/reference options rather than only
  preview rows.
- Run the focused Vitest test, the focused Playwright spec, `gantt` TypeScript
  validation, and the UI standard check.

## Scope

Touched implementation is limited to the Scenario parameter editor and its tests.
No backend consumer is changed because the current backend passes `team_rules`
through as JSON and does not resolve `crew_filter.division` independently.

Residual risk: existing Team Rules stored outside this editor may still contain a
legacy `division` key until they are opened and saved through the UI. The editor
will not use that key or write it back.
