---
name: 114-scenario-rust-solver-run-report
description: Drive a full end-to-end PBS Rust-solver optimization run for a scenario through the REAL gantt UI (find scenario → kick off run → wait for DONE → open gantt to view result), monitor backend material generation, then emit a Word (.docx) summary report (scenario basics, crew/pairing scale, flying/standby/DO assignments, Rust + solver run time, coverage). Use when asked to "kick off a run for scenario N and report it", validate the scenario→engine→Rust-solver pipeline, or produce a run summary document.
---

# Scenario Rust-solver run + Word report

End-to-end, user-simulated optimization run of a scenario, plus a `.docx` summary.
This packages the flow proven on **scenario 539 ("YYZ RUST Seam Connector")**.

Pipeline exercised: gantt UI *Kick off run* → live-server `POST /api/optimize/start`
(LegacyRO, inputSource=db) → engine-server builds `ro_input` from remote PG
(`F8.ro_input_builder`) → fetches the **scenario-scoped** bid package from pbs-server
(`/api/admin/algorithm-export/scenario-package`, PAIRING_SCORE narrowed by date±7d /
base / per-crew rank) → `F8/ro_rust.sh` pbs-engine solver (`rule_engine.mode=rust`) →
in-process Rust rule connector (`rois_rule_engine_rs`, params from PG workset-103) →
`output.gz` archived to `engine-server/complete/F8/<id>_<ts>/` → scenario RUNNING→DONE.

Related: [[ui-kickoff-local-rust-solver]], [[rust-solver-connector-phase0]],
[[scenario-scoped-crew-bids]], [[solver-gantt-rule-param-parity]],
[[gantt-scenario-open-e2e]], skill `106-build-run-rust-solver-connector`.

## §No-Illusion — a run counts only with a green receipt
Do NOT claim a run "works" off the archive alone. Get all three e2e tests green
(kick-off → DONE → open-gantt), paste the PASS summary, THEN report numbers.

## 0. Preconditions (all must be up)
```sh
lsof -nP -iTCP -sTCP:LISTEN | grep -E ':3000|:3003|:3099|:5173'
curl -s -m4 http://127.0.0.1:3003/health           # engine → {"status":"healthy"}
curl -s -m4 http://127.0.0.1:3000/health           # live → 401 (= up, auth required)
curl -s -m4 http://127.0.0.1:3099/health           # pbs  → 401 (= up)
```
- **engine-server** (uvicorn, NO `--reload`) must run with PG env + the LegacyRO DSN
  and write its log somewhere greppable (here `/tmp/yvr540/engine-3003.log`). It
  must carry the scenario-scoped builder changes (lazy-imports `ro_input_builder.cli`)
  → **restart it** after any engine Python edit.
- **pbs-server :3099** is plain `tsx` (NO `--watch`) → does NOT hot-reload; **restart**
  it after any pbs-server edit so the PAIRING_SCORE narrowing is live:
  `cd pbs-server && PORT=3099 nohup node --import tsx --env-file=.env src/index.ts &`
- :3099 is the instance the engine calls (`PBS_SERVER_URL`), **not** :3002 (that's the
  other repo, ROIs-Altair — do not disturb) and not necessarily :3012.

## 1. Clean up a prior result — use the REAL "Remove result" UI button
**§Simulate-User: the spec itself clears a prior result through the product UI, not an
API reset.** Each spec's kick-off test, when the scenario is not already DRAFT, clicks
the toolbar **Remove result** (Eraser) button (`scenario-remove-result-btn`) → confirms
in `remove-result-dialog` ("Remove Result") → asserts the status badge flips to **Draft**
(prints `[cleanup] removed prior result via UI`). That button maps to
`transition(id,'DRAFT')` (gantt store `transitionStatus`), toast "Optimization result
removed"; it's **disabled when there's no result** (already DRAFT), so the step is guarded
by `if (pre !== 'DRAFT')`. Do NOT pre-reset via curl and do NOT `rm -rf` the archive by
hand — let the spec drive the real cleanup, and the fresh run rewrites `filePath`/`checksum`
via the DONE callback. (Note: "Remove result" reverts status only; the gz archive on disk
persists until the next run overwrites the pointer — the DB roster tables hold **no**
scenario rows to clean, results are file-only — see [[scenario-result-storage-is-file-only]].)

Scenario names follow `Base-Division-VerN` now (539 `YYZ-FC-Ver1`, 540 `YVR-FC-Ver1`,
541 `YVR-CC-Ver1`, 543 `Calgary-CC-Ver1`, 544 `Calgary-FD-Ver1`); **542 does not exist**
(404). `SCENARIO_NAME` must match the DB name exactly (the spec types it into the search
box) — re-check it before a run; the demo DB gets renamed.

### Fallback: orphaned RUNNING (UI button won't help)
A prior run that died mid-solve leaves the scenario stuck at RUNNING (the DONE callback was
lost) — Remove result is for DONE/PUBLISHED, not RUNNING. `RUNNING→DRAFT` is **rejected**;
go via FAILED by API:
```sh
TOKEN=$(curl -s -X POST http://127.0.0.1:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"userCode":"Ryan","password":"Our2027"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["token"])')
tr(){ curl -s -X POST http://127.0.0.1:3000/api/scenario/539/transition \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "{\"status\":\"$1\"}"; }
# if RUNNING (orphaned): tr FAILED ; tr DRAFT      # if DONE/FAILED: tr DRAFT
```
Admin creds: `Ryan / Our2027` (isAdmin=1) — see [[gantt-admin-credential]].

## 2. Run the headed Playwright spec (the user-simulated run)
Spec: `e2e/tests/gantt/scenario-539-yyz-rust-solver-run.spec.ts` — 3 tests, serial:
- **Rust-7005** find scenario in the RO list → click *Run* (real UI) → poll DRAFT→RUNNING.
- **Rust-7006** poll until DONE/FAILED (build + solve, minutes worst case).
- **Rust-7007** pre-warm `gantt-data`, click **Open** (`scenario-open-btn`), assert
  `scenario-gantt-view` mounts + crew rows > 0 (genuine "open gantt to view result").
```sh
cd e2e && GANTT_API_URL=http://127.0.0.1:3000 npx playwright test \
  --config=config/playwright.config.ts --project=gantt \
  tests/gantt/scenario-539-yyz-rust-solver-run.spec.ts --reporter=list --no-deps --headed \
  | tee /tmp/yvr540/e2e-539-run.log
```
§Simulate-User: kick-off AND open are real UI clicks — never POST `/optimize/start`
from the script to fake the run. Scenario name must match the DB exactly
(`539 = "YYZ RUST Seam Connector"`) or the row search fails. Repo lives in an iCloud
dir — if edits to the spec silently revert, re-apply before running.

## 3. Monitor backend material generation (run while step 2 polls)
Watch the engine task in the log; capture stage timings:
```sh
grep "$(grep -oE 'task_id=[0-9a-f-]+' /tmp/yvr540/engine-3003.log | tail -1 | cut -d= -f2)" \
  /tmp/yvr540/engine-3003.log | sed -E 's/.*task_manager - //'
```
Expected stages (warm remote PG ≈ 13s total; cold = minutes):
1. `generating ro_input from Postgres` → `input.gz generated (… bytes)`  — ro_input build
2. `偏好包已解压 kind=scenario(crew=N) periodCode=… files=[…PAIRING_SCORE.csv…]` — bid package
3. `执行命令: …/ro_rust.sh …` / `任务已启动 pid=…` — Rust solver started
4. `已归档到 …/complete/F8/<id>_<ts>` — archived (= solve done)
A `通知live-server失败 … Connection refused` line means **live-server crashed during
the solve** → the scenario stays RUNNING (orphaned). That's an infra crash, not a
pipeline failure: confirm the archive exists, then redo step 1 (FAILED→DRAFT) + step 2.

## 4. Generate the Word report
```sh
ARCH=$(ls -dt engine-server/complete/F8/539_* | head -1)
TASK=$(grep -B2 "$ARCH" /tmp/yvr540/engine-3003.log | grep -oE 'Task [0-9a-f-]+' | head -1 | awk '{print $2}')
python3 ~/.claude/skills/114-scenario-rust-solver-run-report/scripts/gen_report.py \
  --archive "$ARCH" --scenario-id 539 --scenario-name "YYZ RUST Seam Connector" \
  --base YYZ --period "Jun 2026" \
  --scenario-start 2026-06-01 --scenario-end 2026-06-30 \
  --engine-log /tmp/yvr540/engine-3003.log --task-id "$TASK"
# → writes <ARCH>/run-report-scenario-539.docx  (use --out to override)
```
`gen_report.py` is self-contained from the archive (`output/result.json`, the
solver log `output/logs/pbs_solver_*.log` for Rust-bind/solve timings, and
`ro_input.txt` for rule params); `--engine-log`/`--task-id` add ro_input +
bid-package build times; `--scenario-start/--scenario-end` bound the open-pairing
period filter (YYYY-MM-DD; get them from the scenario's `strDtLoc`/`endDtLoc`).
Needs **python-docx** (system `python3` has it).

Report sections: (1) Scenario basics — period/base/rule-workset/status, (2) Scale —
crew in scope, columns solved, candidate pool, unique pairings, demand slots, fixed,
(3) Assignments by task type — **Flying / Standby / Reserve / Day-off**, New(solver)
vs Total, (4) Coverage — ratio, covered slots/pairings, feasibility, (5) Run time —
ro_input / bid-package / solver (col-gen vs MIP) / Rust engine, (6) Top crew table,
**(7) Open pairings by base & rank** — Open#/credit vs Assigned#/credit per
(base, rank), period-filtered, **(8) Rule parameters (this run)** — every rule + its
Legality param grid from the run's ro_input, for record-keeping.

Classification: assigned line task type = `pairing_info[id].assignment_group`
(FLY/SBY/RES/DO). Open-pairing split is authoritative: `pinfo == assigned-roster ∪
uncovered_pairing_ids` (disjoint), so a position is **Open** iff its id ∈
`uncovered_pairing_ids` (no crew holds it), else **Assigned** (fixed or solver-covered);
credit = block hours (`blh`). In a pilot run the cabin rank positions (FA/IFD) of the
same pairings show up as Open (and vice-versa) — that's correct, not a bug.

## Reuse for another scenario
Generic except the spec's `SCENARIO_ID`/`SCENARIO_NAME` constants and the report's
`--scenario-id/--scenario-name/--base/--period`. For a new scenario: copy the spec
(rename the `Rust-70xx` test IDs to a fresh block per the e2e ID scheme), set the
two constants to the new scenario's DB id+name, then run steps 1–4 unchanged. Every
spec already carries the §1 in-UI "Remove result" cleanup block, so a re-run is just
`npx playwright test <spec> --headed --no-deps` — it self-cleans then runs.
Specs run so far (all 5 re-run 2026-06-22, 15/15 green, reports written):
539 `YYZ-FC-Ver1` pilot (Rust-7005/6/7, crew 114, cov 25.8%, 699 assigned),
540 `YVR-FC-Ver1` pilot (7008/9/10, crew 71, cov 26.2%, 345),
541 `YVR-CC-Ver1` **cabin** (7011/12/13, crew 147, cov 0.0, 0 — fixed-heavy),
543 `Calgary-CC-Ver1` **cabin** (7014/15/16, crew 57, cov 0.0, 0),
544 `Calgary-FD-Ver1` pilot (7017/18/19, crew 47, cov 94.2%, 193).
All `final_global_rule_pass=True` — `infeasible`/low-coverage is honest (demand≫supply
or nearly-all-fixed), not a failed run.

## Cabin crew vs pilots (crew division)
The solver filters crews by `problem.crew_type` (== crew division) and the deploy
experiment hardcodes **P (pilot)**. A cabin scenario (`filterParams.crew.division=C`)
would be filtered to **0 crews → run FAILS** ("Filtered crews by type 'P': 0 remaining").
Fixed (this skill's commits): `engine-server` resolves the scenario's own division
(`ro_input_cli.scenario_crew_division`) → sets `RO_CREW_TYPE` in the solver subprocess
env (`task_manager._build_subprocess_env`); `engine-server/F8/ro_rust.sh` passes
`problem.crew_type=${RO_CREW_TYPE:-P}` as a Hydra override. Default 'P' keeps pilot
runs byte-identical. **Restart engine-server after pulling this** (uvicorn, no reload).
Verify in the solver log: `crew_type: C` + `Filtered crews by type 'C': N remaining`.

> The fix is **already committed** — for a cabin run the only trap is a **stale
> engine process** that started BEFORE the division-fix edits and so still runs the
> old pilot-hardcoded code. It's NOT a code change you need to make; it's a restart.
> Before a cabin run, compare the engine process start (`ps -o lstart= -p <pid>`)
> to the mtime of `src/tasks/task_manager.py` + `F8/ro_input_builder/cli.py`; if the
> process is older, **restart engine-server** (capture its inline env via
> `ps eww -p <pid>` first — there's no `.env`; launch with **`.venv/bin/python`**,
> not system `python3`, or `prometheus_client` ImportErrors). Proven on 543 (cabin):
> `crew_type: C`, `Filtered crews by type 'C': 57 remaining`.

## Gotchas (all observed)
- **live-server crash mid-solve** → orphaned RUNNING + lost DONE callback. Engine
  archive is still valid. Reset FAILED→DRAFT and re-run; don't hand-flip status to DONE.
- **Coverage low / status `infeasible` is honest**, not a bug: demand (flight slots)
  far exceeds bid-able crew supply. Global rules still pass (`final_global_rule_pass`).
  After a pre-assignment cleanup (DO/standby removed) the demand is all flight → the
  Standby/DO rows are legitimately 0.
- **The opposite extreme is also honest: 0 coverage when nearly everything is fixed.**
  543 (YYC cabin) had **548 fixed pairings (567 slots)** and only **29 open FLY
  pairings (32 slots)**; the solver generated **0 columns** for that open demand →
  MIP `infeasible`, `coverage_ratio=0.0`, `assigned_pairing_count=0`, yet the run is
  genuinely DONE + archived + `final_global_rule_pass=True`. Not a pipeline bug —
  the open cabin demand simply had no legal column given the fixed lines. Contrast
  the same-base pilot run 544: 94.2% coverage, 193 assigned. Report the numbers
  honestly; don't treat 0-coverage as a failed run.
- **`assigned_pairing_count` (covered unique slots) ≠ summed new lines** — rank-split
  `_CA`/`_FO` variants and slot vs pairing make these differ; report shows both.
- Remote demo PG over WAN is variable; build can swing 13s↔minutes. Slow ≠ failed.
- `crews` solved (columns, ~101) ≤ crew in scope (~114): crew with no bid-able demand
  get no column.

## Restarting engine-server + pbs-server from scratch (full env — learned 2026-06-24, scenario 596)
If the running engine/pbs processes are STALE (started before a fix you must validate),
restart them — but they carry env that is NOT in any `.env`; a partial restart silently
breaks the pipeline several layers in. Capture the running env (`ps eww -p <pid>`) BEFORE
killing. The non-obvious ones (defaults are wrong and fail late):
- **engine-server** (uvicorn): launch with **`.venv/bin/uvicorn`** (system py3.14 lacks
  `prometheus_client`; the venv is py3.14.3 even if homebrew is 3.14.6). Required env:
  `JWT_SECRET=rois-dev-jwt-secret-2026` (live-server's dev default — MUST match or the
  engine decodes the JWT with the literal 13-byte string `${JWT_SECRET}` → 401 on
  `/api/optimize/start`), `PBS_ADMIN_USER=admin`, `PBS_ADMIN_PASSWORD=123456` (config
  default `900/rois` logs in but is `is_admin=0` → 403 on the scenario-package admin
  route; only `admin/123456` has `is_admin=1`), plus `PG_PASSWORD=Pier2026AIf8`,
  `RO_RULE_SOURCE=pg`, `RO_BUILD_CONCURRENCY=10`, `PBS_SERVER_URL=http://localhost:3099`,
  `LEGACY_RO_DB_URL=postgresql://f8:Pier2026AIf8@47.253.173.207:55432/rois?options=-c%20search_path%3Df8`.
  Engine reads `src/config/config.yaml` (auth enabled) when `ROIS_CONFIG_PATH` unset.
- **pbs-server** (:3099): `PORT=3099 node --import tsx --env-file=.env src/index.ts`
  (tsx, no --watch → restart after any pbs edit). pbs login = `/api/auth/session`
  `{userCode,password}`; admin = `admin/123456`.
- Verify each layer in the engine log: `JWT认证成功` (not 401) → `input.gz generated`
  → `pbs-server login success, user=admin` (not user=900) → bid package 200 (not 502).
  A 502 right after `pbs-server login success` = the scenario-package fetch failed;
  check the pbs req status (403=non-admin login, 500=a query threw).
- **Rebuild the Rust connector before validating an 8056/rule change**: the solver uses
  `pbs-engine/.../.venv/.../rois_rule_engine_rs*.so`; rebuild
  via `cd rule-engine-rs/py && source <snapshot-venv>/bin/activate && maturin develop
  --release` (~7s warm). Compare its mtime to `rule-engine-rs/src/lib.rs`.

## pbs scenario-package PG 21000 cardinality_violation (fixed 2026-06-24)
If `scenario-package` 500s with PG `21000` / `ExecScanSubPlan` ("more than one row
returned by a subquery used as an expression"): a PAIRING_SCORE bid-property condition
built a SCALAR subquery over `pairing_segment` WITHOUT an aggregate, so any multi-segment
pairing returns >1 row. Found via `property-120` ("Duty On Time"): `buildDutyOnTimeExpression`
was missing the `min()` its siblings (report/release/departure) all have. Fix = wrap the
`coalesce(...)` in `min()` (`pairing-search-time-conditions.ts`). Isolate the failing
property by temporarily logging `property.propertyCode` + the pg error in
`loadPairingScoreCsv`'s non-Lineholder rethrow. Reproduce cheaply with a direct admin
POST (no full e2e): extract the 72 crewIds from the workspace `ro_input.txt` Crew(N) block
(caret-delimited, crewId=field 1), POST `{periodCode,crewIds,scenarioStart,scenarioEnd}`.
