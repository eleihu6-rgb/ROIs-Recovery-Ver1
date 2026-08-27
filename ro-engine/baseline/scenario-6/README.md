# RO solver baseline — Scenario 6 (genuine run)

Authoritative input/output baseline for porting the PBS rostering solver
(`pbs-engine`, column-generation) to Rust.

These are the **actual files produced by the production column-gen solver**, not a
reconstruction. Pulled from CoreServer (`10.15.12.3`):

```
/home/piercrew/software/rostering_algorithm/PBS_column_based_algorithm/data/6_20260615_083508/
```

Scenario 6 = "RO-2026-06 YEG Test", workset 9006, division P (YEG, 737), status **DONE**.
Run timestamp 2026-06-15 08:35. 26 crews, 394 pairings, June 2026 roster period.

## Files

| File | Format | Role |
|---|---|---|
| `ro_input.txt`  | legacy `------Section(N):…^…` | Solver **input** (native). What the column-gen solver actually reads. |
| `ro_output.txt` | legacy `------Section(N):…^…` | Solver **output** (native). Sections: `Scenario(1)`, `Roster(299)`, `RosterFlight(915)`. |
| `result.json`   | JSON | Solver's **raw native result** — coverage_ratio, objective_value + breakdown, fairness_std, award/avoid satisfaction, solve_time, columns_in_pool. **Best ground-truth to assert a Rust port against.** |
| `input.gz`      | `## SECTION` CSV | Input converted to the new gz format (via `legacy_ro_converter.py`). Same family as `engine-server/F8/ro_input_builder/scenarios/{114,115}_input.gz`. |
| `output.gz`     | `## ASSIGNMENTS/ROSTER/KPI/RESULT_META` CSV | Output converted to gz. 283 assignments (275 `leadin` + 8 `CR`), KPI `total_pairings=394, fully_covered=181, total_crews=26`. |
| `all_columns.json` | JSON | Column pool the column-gen produced (intermediate, for stage-level verification). |
| `crew_pairing_matrix.csv` | CSV | Crew×pairing eligibility/cost matrix (intermediate). |
| `result_crew_award_satisfaction.csv` | CSV | Per-crew preference (award/avoid) satisfaction (intermediate). |

## Two format families (pick per port target)

- **Legacy `^`-delimited** (`ro_input.txt` → `ro_output.txt`): the column-gen solver's
  native I/O. Port-faithful pair.
- **`## CSV` gz** (`input.gz` → `output.gz`): the standardized form consumed by
  `ro-engine/src/` and matching the `114/115` fixtures. Produced from the legacy pair by
  `engine-server/F8/legacy_ro_converter.py`.

`result.json` sits underneath both — it is the solver's own structured result before any
text/gz formatting, so it is the most precise oracle for a reimplementation.

## Note on a DB reconstruction (superseded)

An earlier reconstruction from `scenario.roster_flight` (remote DB) yielded 229 assignments
labelled `source=OPT`; this archived run's `output.gz` shows 283 (275 `leadin` + 8 `CR`).
The DB persist and this specific archived run differ in source labelling / scope — the
**archived files here are canonical** for what the solver actually emitted.
