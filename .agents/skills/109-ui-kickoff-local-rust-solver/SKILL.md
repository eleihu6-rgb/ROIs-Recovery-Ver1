---
name: 109-ui-kickoff-local-rust-solver
description: Kick off a full local RO solver run from the REAL gantt UI (Playwright) that builds ro_input from PG and runs the pbs-engine solver with the in-process Rust rule connector (mode=rust), end-to-end. Use when testing the UI→ro_input→Rust-solver→roster pipeline locally, or e2e-testing a long synchronous optimizer /run.
---

# UI kick-off → local Rust solver run (end-to-end)

Drive the whole pipeline from a real "Kick off run" click:

```
gantt UI (scenario-run-btn)
  → live-server POST /api/scenario/:id/run        (type=LegacyRO, inputSource=db)
    → engine-server LegacyRO task
      → F8/ro_input_builder builds ro_input.txt/input.gz from REMOTE PG (no MySQL)
      → F8/ro_rust.sh: input.gz → pbs-engine solver (rule_engine.mode=rust) → Rust
         connector rois_rule_engine_rs → ro_output.txt → output.gz
      → scenario status DRAFT→RUNNING→DONE
```
Builds on skills [104] (run solver local), [106] (Rust connector). Pairs with the
ro_input_builder under `engine-server/F8/ro_input_builder/`.

## Engine-server env (ALL required — the run fails without them)
Restart engine-server on its **`.venv/bin/python`** (not homebrew python — needs
psycopg2) with:
```
JWT_SECRET=rois-dev-jwt-secret-2026          # else 401 on /optimize/start
PG_PASSWORD=Pier2026AIf8                      # rust connector PG-103 params
RO_RULE_SOURCE=pg                             # NO MySQL — we build ro_input ourselves
RO_BUILD_CONCURRENCY=10                       # parallel section queries
PBS_ADMIN_USER=admin PBS_ADMIN_PASSWORD=123456   # crew-bids preference pkg (needs is_admin=1)
LEGACY_RO_DB_URL=postgresql://f8:Pier2026AIf8@47.253.173.207:55432/rois?options=-c%20search_path%3Df8
```
The remote DSN comes from `live-server/.env` (never hardcode/commit it). Local f8
schema is EMPTY — everything runs against the remote demo PG.

## Local routing (per-env, NOT committed)
Route LegacyRO to the Rust pipeline on this Mac only:
- `engine-server/config.yaml` → `airlines.F8.commands.LegacyRO.linux.path: "./F8/ro_rust.sh"`
- `engine-server/F8/ro.sh` → `exec bash "$SCRIPT_DIR/ro_rust.sh" "$1" "$2"`

**Do NOT commit config.yaml / ro.sh** — on the remote CoreServer LegacyRO stays
`./F8/legacy_ro.sh` (real Java/C++ RO). `ro_rust.sh` itself IS committed (it's
env-configurable via RO_SOLVER_DIR / RO_SOLVER_PYTHON / RO_EXPERIMENT etc.).

## Solver inputs = ro_input.txt + 4 scenario-scoped bid CSVs
Apart from `ro_input.txt`/`input.gz`, the solver reads a crew-bid package from its
working dir (`pref_dir`): `PAIRING_SCORE.csv` / `DAYSOFF.csv` / `RESERVE_SCORE.csv`
/ `LINE_RULES.csv` (+ `LINE_RULES_README.md`, ignored). These come from pbs-server's
`algorithm-export`, NOT from ro_input_builder.

**Scenario-scoped at kick-off (the fix):** `_prepare_legacy_workdir` computes the
scenario crew set via `ro_input_cli.scenario_crew_ids(airline, scenario, db_url)`
(SAME set the ro_input Crew section uses) and POSTs it to pbs-server
`POST /api/admin/algorithm-export/scenario-package {periodCode, crewIds}` →
`exportScenarioPackage` builds the 4 CSVs filtered to that crew set. Falls back to
the legacy hardcoded `yeg-test-package` (YEG_14_TEST_CREW_IDS) only when there's no
scenarioId / empty scope. So the bid CSVs match the optimized roster crew.
- pbs-server: `services/algorithm-export/algorithm-export-service.ts`
  (`exportScenarioPackage` + `loadScenarioScope` + shared `buildCrewSortRank`),
  route `routes/algorithm-export.ts` (POST scenario-package, admin-gated),
  contract `packages/contracts/pbs-algorithm-export.js`.
- engine: `pbs_server_client.fetch_scenario_package`, `cli.scenario_crew_ids`.
- bid CSV crew_id is varchar — pass crew_id VERBATIM (no int-normalize) so it matches
  `pbs_bid.crew_id`.
- Heavy build: PAIRING_SCORE dominates, ~150–200s over the remote WAN PG. Give the
  client / e2e a 300s timeout.

**E2E proof (PBS-3401/3402, `tests/gantt/scenario-scoped-crew-bids.spec.ts`):** hits
the real pbs-server endpoint with scenario 537's 26-crew scope, gunzip+untar the
package in-test, asserts the crew union ⊆ scope AND contains 274/499 (in scope, have
bids, NOT in YEG-14) while the yeg-14 package excludes them. Run pbs-server (Ver4) on
a free port (e.g. 3099) and `PBS_SERVER_URL=http://127.0.0.1:3099 ... --project=gantt
... --no-deps`; the spec `test.use({storageState:{cookies:[],origins:[]}})` to skip
gantt auth. Admin login = `admin/123456` (isAdmin). Engine-wiring is unit-proven in
`engine-server/tests/test_legacy_ro_workdir_prep.py` (db-source → scenario-package,
empty scope → yeg fallback). **Gotcha:** :3002 may be owned by ANOTHER repo checkout
(ROIs-Altair-PBS-Ver1) — verify `lsof -iTCP:3002` before assuming the engine hits
your pbs-server; run yours on a separate port rather than fighting for :3002.

## Solver rule params MUST come from PG workset 103 (else solver ≠ gantt)
mode=rust legality params (8002 block bands, 8002009 DP, 8056 spacing, 7505 min-days-off,
7501/7503/7504 WOCL, 8030 age, 8004 grace…) are loaded by the connector's
`RustRuleChecker.bind_problem` → `_load_pg_params()` → `io/pg_rule_params.load_rule_params(103)`,
which pg8000-connects to the SAME remote PG (hardcoded host 47.253.173.207:55432, user f8)
and reads `rule.param_json` for workset 103 — the IDENTICAL rows the gantt Legality tab reads.
`run_solver.py` only forwards two CLI overrides (`rule_engine.rust_block_bands`,
`rust_spacing_hours`); everything else comes from PG-103.

**The bug:** `_load_pg_params()` needs `PG_PASSWORD` in the solver process env. If absent it
raises, gets silently swallowed, and the connector falls back to STALE hardcoded
`F8_8002_BH_BANDS` (8002/28d = **112h**) while the gantt enforces workset-103 (~58h). The solver
then builds rosters legal at 112h that the gantt flags as 8002 violations, and coverage is
inflated (scen-537: 293 covered @112h vs 225 @workset-103). Diagnose via the connector log:
`RustRuleChecker params source=PG-103|F8-default 8002/28d=<min>`.

**The fix (BACKEND_VERSION 146):**
- engine-server `task_manager._build_subprocess_env` injects into the solver `Popen(env=…)`:
  (a) `PG_PASSWORD` (parsed from the LegacyRO `db_url` via `_password_from_dsn`); don't override
  an operator-set value. (b) `RUST_RULE_WORKSET` = the SCENARIO's workset.
- **Per-scenario ruleset, NOT hardcoded 103.** `cli.scenario_workset_id(airline,scenario,db_url)`
  resolves the scenario's workset the SAME way the gantt /rulesets endpoint does:
  `scenario.rule_group_code` → `rule_group.name` = `workset.name` that maps ≥1 rule. Connector
  `_rule_workset()` reads `RUST_RULE_WORKSET` (default 103). Each scenario enforces its OWN
  ruleset. Caveat: `scenario.workset_id` (517/518/9006…) is an EMPTY RO copy — NOT the rules
  source; the rules resolve via `rule_group_code` (all → 103 today since all use
  `pbs_solver_ruleset`). A user creating a new ruleset (new workset+rule_group, same name) +
  pointing a scenario at it now flows to the solver.
- connector `rust_checker.py` logs `source=PG-workset-<id> 8002/28d=<min>` or a loud **WARNING**
  on fallback so a stale-band run can't pass silently. `_load_pg_params()` returns `(params, ws)`.
- Verify: `PG_PASSWORD=<f8 pw> RUST_RULE_WORKSET=103 ./run_local.sh … rule_engine.mode=rust` →
  `source=PG-workset-103 8002/28d=<min>`; switch to `=433` → `PG-workset-433`; no PG_PASSWORD →
  WARNING `source=F8-default … UNREACHABLE`.
- The two CLI overrides still win if passed (force a band:
  `+rule_engine.rust_block_bands=[[28,3480],[90,18000],[365,60000]]`).

Two separate rule stacks (don't confuse): **workset 103 / `rule.param_json`** (Rust + solver +
gantt Legality, the one that matters) vs **`ccar121_*` rule_group/rule_instance** (TS/Python
rule-engine, Rule tab, `max_ft_ccar_std` 28d=6000min=100h) which is INERT — no live consumer,
0 `rule_violation` rows.

## ro_input_builder gotchas (why a naive build is slow/wrong)
- **Flight section must be pairing-driven**: emit only flights referenced by in-scope
  pairing legs (`pairing → pairing_segment.flt_id → flight`), NOT an all-fleet window
  scan (that over-fetches ~4,809 vs ~620). There is no `pairing.flight_id`.
- **Parallelize** sections (ThreadPoolExecutor, own PG conn each, pre-warmed shared
  context) — sequential build ~583s blows the /run budget; parallel ~47s. The fast
  `buildRoInputGz` (live-server, <30s) is fast only because of `Promise.all`.
- Narrow heavy sections to the scenario: CrewCertificate drop far-expired
  (`exp_dt >= scenario start`), Airport scoped to flight airports, CrewOnFlight to the
  scenario division (drop cabin for a pilot scenario), PairingDutyNode sunset (`[]`).
- These changes affect ONLY ro_input build for the solver — live/scenario gantt
  queries are untouched.

## E2E pattern — poll status, NEVER waitForResponse(/run)
`scenarioService.run()` transitions **DRAFT→RUNNING in the DB BEFORE** the
minutes-long `engineServerClient.startRoTask()` call. The `/run` HTTP response only
returns after engine-server finishes building ro_input (minutes), and the browser's
fetch can outlive the test → `page.waitForResponse(/run/)` times out (the classic
360s failure) even though the product works.

**Fix:** click run, dismiss the run-check dialog, then poll
`GET /api/scenario/:id` status via a separate APIRequestContext:
- Rust-7001: kick off → `waitForStatus(s => s==='RUNNING'||s==='DONE', 120s)`. Reset a
  terminal scenario to DRAFT first; if already RUNNING, accept and skip (RUNNING only
  transitions to DONE/FAILED, can't reset).
- Rust-7002: `waitForStatus(s => s==='DONE'||s==='FAILED', 840s)` then assert DONE;
  best-effort gantt-data crew rows > 0.
Spec: `e2e/tests/gantt/scenario-538-rust-solver-run.spec.ts`. Also bumped the
live-server /optimize/start client timeout 30s→300s (`ENGINE_START_TIMEOUT_MS`).

## Run the e2e (live-server IPv4-only; pbs may be down → --no-deps)
```
cd e2e && GANTT_API_URL=http://127.0.0.1:3000 npx playwright test \
  --config=config/playwright.config.ts --project=gantt \
  tests/gantt/scenario-538-rust-solver-run.spec.ts --reporter=list --no-deps
```
A fresh solve is ~4–6 min. Receipt 2026-06-20: 2 passed (4.8m), scenario 538
DRAFT→RUNNING→DONE, gantt-data 26 crew rows.

## Verify the unit test against seeded data (local f8 is empty)
`test_ro_input_flight_sections.py` needs scenario 6, which exists on remote PG:
```
cd engine-server && LEGACY_RO_DB_URL="<remote DSN>" .venv/bin/python -m pytest \
  tests/test_ro_input_flight_sections.py -q
```
`db.connect` honors `LEGACY_RO_DB_URL` > per-airline default.

## Baseline comparison (Rust vs C++)
Scenario 537 (C++ `mode=hybrid`) and 538 are the same YEG/737 June data (both 24
crew, total_slots=811, fixed=77). C++ assigned 268 pairing-legs (coverage 0.3305);
Rust assigned 289 (0.3564) — Rust ~8% looser because 7501/7503/7504/7505 ports are
simplified. Strict parity needs mode=rust on the SAME baseline ro_input (skill 106).
