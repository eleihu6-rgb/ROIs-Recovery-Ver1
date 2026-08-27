---
name: 125-pbs-result-analyzer
description: Use when debugging a PBS / RO solver run result — a crew ended up with no flying and no RES duty (only DO / days off / blank), or any "why did the optimizer do/not do X for this crew" question on a finished scenario run. Walks a 5-step diagnostic ladder (scope → bids → eligibility → availability → assignment) over the real ro_input / *_SCORE.csv / result.json artifacts and gives a grounded verdict + suggestion. Triggers on "why no flying", "crew only has DO", "crew not assigned", "pbs result analyzer", "debug solver result", "no pairing score".
---

# PBS Result Analyzer

## Overview

When a planner says *"crew X got no flying / no RES, only DO"*, do **not** guess. Every finished RO solver run leaves complete per-crew artifacts on disk. Walk a fixed ladder against them and the cause is unambiguous.

**Core principle:** the answer is always in one of five layers — and "no flying" is frequently *correct* (the crew is on leave), not a defect. Find which layer first, then advise.

## The 5-step ladder (run top-down; stop at the first hard failure)

| # | Question | Artifact | "No flying" cause if this fails |
|---|----------|----------|----------------------------------|
| 1 | **SCOPE** — is the crew in the optimization at all? | `ro_input.txt` Crew section (line starts `<crewId>^`) | Scenario crew filter (base/division/status) excluded them |
| 2 | **BIDS** — did the crew submit bids? | `PAIRING_SCORE.csv` / `RESERVE_SCORE.csv` / `DAYSOFF.csv` (col 1 = Crew_ID) | No bids → no preference weight; deprioritized |
| 3 | **ELIGIBLE** — eligible for any pairing? | `output/crew_pairing_matrix.csv` (`eligible`, `priority_weight`) | Base / rank / qualification / date-window mismatch |
| 4 | **AVAILABLE** — pre-blocked all month? | `result.json` → `crew_info[crew].preassign_tasks`; `output/credit_hour_report.csv` (`preassign_rest_days`, `target_min`) | **On leave (MLOA/MATL/LEAVE/VAC) → no flying is CORRECT** |
| 5 | **ASSIGNED** — what did the solver give them? | `result.json` → `assignment[crew]`; `output/ro_output.txt` Roster section (field 4 = crewId) | Empty + eligible + available + bid = genuine "should-fly-but-didn't" → escalate |

## Quick start

```bash
cd <repo-root>
python3 ~/.claude/skills/125-pbs-result-analyzer/diagnose_crew.py --scenario 541 806 1227
# or point at an explicit run dir:
python3 .../diagnose_crew.py engine-server/complete/F8/541_20260622_202057 806 1227
```

The script runs all five steps per crew and prints a verdict + suggestion. Always include one **control crew that DID get flying** (e.g. `96`) so a confusing result is obvious by contrast.

## Where the artifacts live

Per-scenario solver output is **file-only** (no scenario rows in the DB — see memory `scenario-result-storage-is-file-only`). A finished local/CoreServer run writes to:

```
engine-server/complete/F8/<scenarioId>_<YYYYMMDD_HHMMSS>/
  ├── PAIRING_SCORE.csv  RESERVE_SCORE.csv  DAYSOFF.csv   # ← step 2 (bids)
  ├── ro_input.txt                                         # ← step 1 (scope) + all input sections
  ├── ro_output.txt                                        # ← step 5 (Roster: field 4 = crewId, field 11 = assignment)
  └── output/
        ├── crew_pairing_matrix.csv      # ← step 3 (crew_id,pairing_id,eligible,priority_weight)
        ├── credit_hour_report.csv       # ← step 4 (preassign_rest_days, target_min/max, credited_hours)
        └── result.json                  # ← step 4+5 (crew_info, assignment, assignment_original)
```

Timestamped dirs sort newest-last; pick the latest. The bid CSVs are produced by **pbs-server** `POST /api/admin/algorithm-export/scenario-package` (scenario-scoped crew set) — see `pbs-server/src/services/algorithm-export/pairing-score-export.ts`. A crew with zero rows there submitted no bids for that scope (cross-check the portal / skill 108).

## Worked example — scenario 541, crew 806 & 1227 (verified)

```
CREW 806:  SCOPE=True  BIDS pairing=0 reserve=0 daysoff=0  ELIGIBLE=314 (max weight 0.0)
           preassign=46× MLOA/DO span 2026-05-23..2026-07-09  preassign_rest_days=30  target_min=0
           solver assignment = []   ← no flying, no RES
VERDICT: ON LEAVE — pre-assigned MLOA (maternity leave) the whole period. No flying is CORRECT.
```

Both 806 and 1227 are in scope and eligible (314/359 pairings) but submitted no bids and are pre-assigned **MLOA/DO every day**. 11 of the 12 unassigned crew in this run are likewise on leave (MLOA/MATL/LEAVE). The "only DO" the planner sees on the gantt is the leave pre-assignment rendering as DO pucks — **not** a bidding/scoring/eligibility bug.

## Verdicts → suggestions toward "assign flying & RES to crew"

- **ON LEAVE (step 4)** → expected; the fix is in source data (correct the leave record), not the solver. Do not chase this as a bug.
- **NOT IN SCOPE (step 1)** → widen the scenario crew filter (base/division/status).
- **NO BIDS but ELIGIBLE (step 2, step 3 ok)** → add bids in the crew portal (skill 108) and re-run, or confirm the crew is reserve/standby-only.
- **NOT ELIGIBLE (step 3)** → fix base/rank/qualification/date-window vs the scenario pairings.
- **ELIGIBLE + AVAILABLE + BID but empty assignment (step 5)** → the genuine defect case: rule blocks (every eligible pairing violates a hard rule — check the Rust connector / workset 103), coverage met by senior crew, or objective left them idle. Inspect `output/logs` + `all_columns.json`. Escalate.

## Common mistakes

- **Assuming "no flying" = bug.** On a real run most unassigned crew are on leave. Check step 4 before alarming anyone.
- **Grepping the wrong field in `ro_output.txt`.** Roster crewId is field **4** (`^`-delimited): `id^scenarioId^pairingId^crewId^...`. Field 11 is `assignment` (FLY/RES/DO).
- **Confusing denominators.** `ro_input` Crew(147) ≠ crew with bids (85) ≠ crew in result.json assignment (126) ≠ crew in output roster (115). They are different sets; only the per-crew ladder is decisive.
- **Reading a stale run dir.** Always resolve the newest `<scenarioId>_*` dir; a scenario re-run leaves the old one behind.
- **`target_max` blank + `target_min=0`** is the fingerprint of a fully leave-blocked crew, alongside `preassign_rest_days` ≈ days-in-period.

## Gotcha — scenario gantt paints ⚡ "optimized" on carried-from-Live (leadin) duties

Symptom: a DONE scenario shows the ⚡ optimizer badge on duties the solver never placed (e.g. an on-leave crew's MLOA/DO days). The ⚡ renders when `source === 'CR'` (`roster-renderer.ts`); `leadin` (carried from Live) must render iconless.

Root cause chain (verified on scen 541, crew 806/1227):
- `output.gz` tags each roster row `CR` (optimizer-placed) or `leadin` (carried). Only `{CR, leadin}` exist — **never `OPT`**.
- `scenario-result-loader.ts` transcribes the gz into `scenario.roster_flight` but historically **hardcoded `source: 'OPT'`**, erasing the CR/leadin distinction.
- A finished scenario is served by the **DB path** `buildGanttDataFromDb` (`dataSource:'db'`), which maps `source === 'leadin' ? 'leadin' : 'CR'`. Since the stored value was `'OPT'` (≠ leadin), **every** row read back as `CR` → ⚡ everywhere.

Fix (shipped): loader preserves the solver's own source — `r.source === 'CR' ? 'CR' : 'leadin'` (ground) / `a.source === 'leadin' ? 'leadin' : 'CR'` (flying), mirroring the gz read path; no `OPT`. Then re-load the affected scenario (`loadResultGzIntoDb` is idempotent — deletes the scenario's rows first) so already-stored `OPT` rows get corrected. Diagnose with: `SELECT source, count(*) FROM scenario.roster_flight WHERE scenario_id=N AND pairing_id IS NULL GROUP BY source` — all `OPT` = the bug; `{leadin, CR}` = fixed.

Unrelated note: while verifying, the live `/api/scenario/*` routes 500'd with `column "rule_group_code" does not exist` — that is the **expected** `rule_group_code`→`ruleset_id` cleanup another agent was doing on `f8.scenario` (live-server code is being updated to match). It temporarily blocks the live API but is not this fix's concern; verify via the loader unit test + direct DB instead.

## Related

Pipeline: `109-ui-kickoff-local-rust-solver`, `114-scenario-rust-solver-run-report` (how a run is produced). Bids: `108-npbs-bids-portal-simulation`. Rule params the solver enforces: `solver-gantt-rule-param-parity` memory + workset 103. Manday/credit model: `124-crew-manday-rule-tool`.
