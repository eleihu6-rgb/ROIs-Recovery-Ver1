# RO input crew filter parity (birthday / ranks / seniority)

## Problem

Live Gantt and `countScenarioRunScope` use live-server `crewIdSet`, which applies
`filter_params.crew` **birthday**, **ranks**, and **seniority**.

LegacyRO `inputSource: "db"` builds `ro_input` via engine-server
`F8/ro_input_builder/context.py::scenario_crew_ids`, which only applied
division + bases + fleets. Birthday set in the UI therefore narrowed Gantt/KPI
“Crew Utilized” but not the optimizer crew set (e.g. scenario 718).

## Design

Extend `scenario_crew_ids` to mirror live-server `crewIdSet` for:

- `crew.ranks` (via `crew_rank`, eff/exp window)
- `crew.seniority.min` / `max` (`seniority_num`)
- `crew.birthday.from` / `to` (`birthday::date`, non-null required when bound set)

Empty / blank range endpoints mean “no bound” (same as live `dateStringOrNull` /
`numberOrNull`).

Out of scope for this change: aligning `crew_fleet.fleet_grp` vs
`fleet_specific` (pre-existing; fleets already differ between the two paths).

## Success

- Unit test proves birthday/rank/seniority clauses are emitted with params.
- DB regression: empty-fleets expected set includes the same extra crew filters.
- Re-running a scenario with a tight birthday window yields `ro_input` crew count
  matching live `crewIdSet` / Gantt roster headcount.
