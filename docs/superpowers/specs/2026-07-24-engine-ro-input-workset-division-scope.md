# Engine ro_input Workset Division Scope

## Goal

`engine-server` F8 `ro_input` generation must derive scenario crew division from `scenario.workset_id -> workset.id -> workset.division`, not from `scenario.filter_params.crew.division`.

## Current Behavior

`engine-server/F8/ro_input_builder/context.py` loads `scenario.filter_params` only. These paths read division from JSON:

- `scenario_crew_ids`: filters `crew.division`
- `pairing_ids`: filters coverage pairings by `filter_params.pairing.division` or `filter_params.crew.division`
- `cof_crew_ids`: filters complement-on-flight roster rows
- `sections/crew.py::_crew_on_flight`: filters CrewOnFlight rows
- `cli.py::scenario_crew_division`: passes `RO_CREW_TYPE` to the solver wrapper

This conflicts with the workset ownership model where division is workset-owned.

## Proposed Change

- Extend `context.get_scenario` to join `workset` by `scenario.workset_id` and return `sc["division"]`.
- Add a small helper `scenario_division(conn, ctx)` so all engine-server ro_input division consumers use one source.
- Update crew, pairing coverage, COF, CrewOnFlight, and solver crew-type lookup to use the helper.
- Keep `filter_params.pairing.division` as an explicit pairing override only if present; otherwise fall back to workset division.

## Tests

- Update `engine-server/tests/test_ro_input_context.py` to compute expected crew and pairing scope from `workset.division`.
- Add/adjust a regression that finds a scenario where workset division differs from stale or absent `filter_params.crew.division`, or unit-style fake cursor coverage if remote data lacks such a row.
- Run focused pytest for `test_ro_input_context.py`.

## Risk

GitNexus impact analysis:

- `get_scenario`: MEDIUM, 5 direct context callers, ro_input_builder module only.
- `scenario_crew_ids`, `pairing_ids`, `cof_crew_ids`, `scenario_crew_division`, `_crew_on_flight`: LOW.

No HIGH/CRITICAL risk reported.
