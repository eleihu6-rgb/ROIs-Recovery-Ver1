# Rule 8002 Full Parameter Forwarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Rule 8002 forward and enforce all approved supported parameters across PBS solver, Live legality, and Scenario legality.

**Architecture:** Reuse the existing Rust 8002 structured contract instead of creating a new one. `check-8002-full` already consumes `U`, `Q`, `M`, and `P` rows; Live/Scenario will supply missing `Q T` team rows and `P` roster-period rows, while PyO3 will convert `crew_teams` into open-ended team qualifications.

**Tech Stack:** Node.js ESM scripts and TAP/Vitest tests in `live-server`; Rust CLI/shared legality in `rule-engine-rs`; PyO3 Engine and pytest-based PBS solver tests in `pbs-engine`.

## Global Constraints

- Scope is limited to currently supported Rust 8002 types: `BH`, `DP`, `FT`, `CH`.
- Unsupported C++ 8002 types continue to warn/drop explicitly.
- `Prorated` / `CHECK_LAST_DAY` is read intentionally but remains calculation-inert.
- `Unit=RP` must use roster-period windows in Live/Scenario the same way PBS solver already does.
- Do not change manday metric generation.
- Do not change persisted violation schema or Live/Scenario worst-window aggregation.
- Missing source context for a gated row must skip that row with a log; it must not broaden the row to wildcard.

---

### Task 1: Rust/PyO3 8002 Crew Teams

**Files:**
- Modify: `rule-engine-rs/py/src/lib.rs`
- Test: `rule-engine-rs/py/tests/test_engine_rest_wocl.py` or a new focused `rule-engine-rs/py/tests/test_engine_8002_full_params.py`
- Optional Test: `rule-engine-rs/src/bin/check_8002_full.rs` if adding `T` alias

**Interfaces:**
- Consumes: existing PyO3 `Engine(..., crew_teams: Vec<Vec<String>>, cum_rules: Vec<...>)`
- Produces: `check_8002_full()` uses `self.crew_teams[crew_idx]` as `team_q: Vec<QualEntry>`

- [ ] **Step 1: Write a failing PyO3 team-gate test**

Create a focused test with two crews and one `cum_rules` row scoped to `Crew Teams=TEAM1`.

Expected intent:

```python
def test_8002_cum_rules_use_crew_teams_scope():
    eng = Engine(
        enabled_rules=["8002"],
        application="editor",
        crew_ids=["C1", "C2"],
        crew_teams=[["TEAM1"], ["TEAM2"]],
        crew_offset_min=[0, 0],
        checked_window=(1780272000, 1782864000),
        scenario_window=(1780272000, 1782864000),
        crew_daily_metrics=[
            {20614: (3600.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)},
            {20614: (3600.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)},
        ],
        cum_rules=[
            ((["*"], ["*"], ["*"], ["TEAM1"]), (1, "CD", 3000, 0, "BH"), (-1, -1, -1, -1, -1, -1), -1, 0),
        ],
    )

    out_c1 = [v for v in eng.check_line(0, []) if v.startswith("8002")]
    out_c2 = [v for v in eng.check_line(1, []) if v.startswith("8002")]
    assert out_c1
    assert out_c2 == []
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
/home/qianggong/.venv/bin/pytest rule-engine-rs/py/tests/test_engine_8002_full_params.py -q
```

Expected before implementation: `C2` is skipped correctly only because all teams fail, but `C1` also fails because `team_q` is empty.

- [ ] **Step 3: Implement team qualification conversion**

In `check_8002_full()` replace the empty team vector:

```rust
let team_q: Vec<QualEntry> = self
    .crew_teams
    .get(crew_idx)
    .into_iter()
    .flatten()
    .map(|team| QualEntry {
        value: team.clone(),
        eff_s: i64::MIN,
        exp_s: i64::MAX,
    })
    .collect();
```

Keep `base_q`, `rank_q`, and `fleet_q` unchanged.

- [ ] **Step 4: Update stale warning**

In PyO3 construction, change the warning for non-wildcard `teams` so it only warns when `crew_teams.is_empty()`:

```rust
if !(teams.is_empty() || (teams.len() == 1 && (teams[0] == "*" || teams[0].is_empty())))
    && crew_teams.is_empty()
{
    engine_warnings.push(format!(
        "8002 row {i}: teams={teams:?} gated but no crew-team data exists — the row will never fire"
    ));
}
```

- [ ] **Step 5: Verify**

Run:

```bash
cargo check --manifest-path rule-engine-rs/py/Cargo.toml
/home/qianggong/.venv/bin/pytest rule-engine-rs/py/tests/test_engine_8002_full_params.py -q
```

Expected: both commands pass. The existing `duty_idx` warning may remain.

---

### Task 2: PBS Solver 8002 Parameter Tests

**Files:**
- Modify: `pbs-engine/tests/unit/test_rust_checker_rule_1001_params.py`
- Modify only if needed: `pbs-engine/ColumnModelSolver_python/rules/rust/rule_params.py`

**Interfaces:**
- Consumes: `extract_rule_params(sections, rp_start, rp_end)`
- Produces: `params["cum_rules"]` preserves 8002 `Crew Teams`, `RP`, and inert `Prorated`

- [ ] **Step 1: Add failing/guard tests for 8002 preservation**

Add a test near the existing 8002 tests:

```python
def test_extract_rule_params_8002_preserves_crew_teams_rp_and_prorated() -> None:
    sections = {
        "RuleParameter": RoSection(
            header=["ruleId", "paramNames", "paramValues"],
            rows=[
                {
                    "ruleId": "8002006",
                    "paramNames": "tableHeader",
                    "paramValues": (
                        "Bases,Ranks,Fleets,Crew Teams,Period,Unit,Prorated,"
                        "Max Limits,Min Limits,Type,INT OPERATION BLH,"
                        "AUG OPERATION BLH,DUTY ALOT TIME,HAS SBY OR FLY(Y/N),"
                        "REDUCTION PER DUTY"
                    ),
                },
                {
                    "ruleId": "8002006",
                    "paramNames": "tableRow1",
                    "paramValues": "YYZ,CA,320,TEAM1,1,RP,N,60:00,00:00,BH,*,*,*,Y,00:30",
                },
            ],
        )
    }

    params = extract_rule_params(sections, date(2026, 6, 1), date(2026, 6, 30))

    assert params["cum_rules"] == [
        ((["YYZ"], ["CA"], ["320"], ["TEAM1"]), (1, "RP", 3600, 0, "BH"), (-1, -1, -1, -1, -1, -1), 1, 30)
    ]
```

- [ ] **Step 2: Run the focused PBS test**

Run:

```bash
PYTHONPATH=pbs-engine /home/qianggong/.venv/bin/pytest pbs-engine/tests/unit/test_rust_checker_rule_1001_params.py -k "8002" -q
```

Expected: pass if the current parser already preserves these values; fail only if a parser gap exists.

- [ ] **Step 3: Implement only if the test fails**

If `Prorated=N` currently emits a warning but still preserves the row, keep that behavior. If any field is dropped, update `rule_params.py` so `cum_rules` keeps the existing tuple shape and values.

- [ ] **Step 4: Verify**

Run:

```bash
python3 -m py_compile pbs-engine/ColumnModelSolver_python/rules/rust/rule_params.py
PYTHONPATH=pbs-engine /home/qianggong/.venv/bin/pytest pbs-engine/tests/unit/test_rust_checker_rule_1001_params.py -k "8002" -q
```

Expected: both pass.

---

### Task 3: Live/Scenario Core 8002 Structured Context

**Files:**
- Modify: `live-server/scripts/legality-recheck-core.mjs`
- Modify: `live-server/scripts/__tests__/legality-recheck-core.test.mjs`
- Modify: `live-server/tests/unit/legality-recheck-core-param.spec.ts`

**Interfaces:**
- Consumes: optional `source.crewQualEntries()`, `source.crewTeams()`, `source.rosterPeriods()`
- Produces: `rule8002()` sends `Q T` rows for team-gated rows and `P` rows for `Unit=RP`

- [ ] **Step 1: Add a failing team-input test**

Add a TAP test:

```js
test('rule8002 emits Q T rows for Crew Teams gated rows', async () => {
  let captured = null
  const source = {
    async blockByDay() { return [{ crew_id: 'C1', day: '2026-06-10', blk: 60 * 60 }] },
    async firstPairingSpanByCrew() { return new Map([['C1', { id: 9, startIso: '2026-06-10T00:00:00.000Z', endIso: '2026-06-10T12:00:00.000Z' }]]) },
    async pairingSpansByCrew() { return new Map() },
    async crewBaseTimezone() { return new Map([['C1', 'UTC']]) },
    async crewTeams() { return new Map([['C1', ['TEAM1']]]) },
  }
  const out = await rule8002(source, {
    ...CTX_DATES,
    log: () => {},
    runBin(bin, args, input) {
      captured = { bin, args, input }
      return [['V', 'C1', '0', 'BH', '1', 'CD', '3600', '3000', '0', '1781049600', '1781135999', '1', '0']]
    },
    instancesOf: (fn) => fn === 8002
      ? [{ instance: '001', header: HDR8002, rows: [['*', '*', '*', 'TEAM1', '1', 'CD', 'Y', '50:00', '00:00', 'BH']] }]
      : [],
  })

  assert.equal(captured.bin, 'check-8002-full')
  assert.ok(captured.input.includes('U\t0\t*\t*\t*\tTEAM1\t1\tCD'), captured.input)
  assert.ok(captured.input.includes('Q\tC1\tT\tTEAM1\t-1000000\t-1'), captured.input)
  assert.equal(out.length, 1)
})
```

- [ ] **Step 2: Add a failing RP-input test**

Add a TAP test:

```js
test('rule8002 emits P rows for RP unit rows', async () => {
  let captured = null
  const source = {
    async blockByDay() { return [{ crew_id: 'C1', day: '2026-06-10', blk: 60 * 60 }] },
    async firstPairingSpanByCrew() { return new Map([['C1', { id: 9, startIso: '2026-06-10T00:00:00.000Z', endIso: '2026-06-10T12:00:00.000Z' }]]) },
    async pairingSpansByCrew() { return new Map() },
    async crewBaseTimezone() { return new Map([['C1', 'UTC']]) },
    async rosterPeriods() { return [{ start: '2026-06-01', end: '2026-06-30' }] },
  }
  await rule8002(source, {
    ...CTX_DATES,
    log: () => {},
    runBin(bin, args, input) {
      captured = { bin, args, input }
      return []
    },
    instancesOf: (fn) => fn === 8002
      ? [{ instance: '001', header: HDR8002, rows: [['*', '*', '*', '*', '1', 'RP', 'Y', '50:00', '00:00', 'BH']] }]
      : [],
  })

  assert.ok(captured.input.includes('P\t20605\t20634'), captured.input)
})
```

- [ ] **Step 3: Verify tests fail**

Run:

```bash
node live-server/scripts/__tests__/legality-recheck-core.test.mjs
```

Expected before implementation: the team test fails because `Q T` is missing; the RP test fails because `P` is missing or the row is skipped.

- [ ] **Step 4: Implement row capability detection**

In `rule8002()`, track:

```js
let needsTeamMap = false
let needsRosterPeriods = false
```

For each valid row:

```js
const teams = rawOrStar(row[H('Crew Teams')])
if (teams !== '*') {
  if (!source.crewTeams) {
    ctx.log(`skip 8002/${inst.instance} ${sk}: Crew Teams=${teams} but source has no crew-team data`)
    continue
  }
  needsTeamMap = true
}
if (unit === 'RP') {
  if (!source.rosterPeriods) {
    ctx.log(`skip 8002/${inst.instance} ${sk}: Unit=RP but source has no roster-period data`)
    continue
  }
  needsRosterPeriods = true
}
```

- [ ] **Step 5: Emit `Q T` and `P` lines**

After metrics are loaded:

```js
const teamMap = needsTeamMap ? await source.crewTeams() : null
const teamLines = []
if (teamMap) {
  for (const [crew, teams] of teamMap) {
    for (const team of teams ?? []) {
      teamLines.push(['Q', crew, 'T', team, -1000000, -1].join('\t'))
    }
  }
}
const rpRows = needsRosterPeriods ? await source.rosterPeriods() : []
const pLines = rpRows.map((rp) => ['P', dayOrd(rp.start), dayOrd(rp.end)].join('\t'))
const input = [cLine, ...uLines, ...qLines, ...teamLines, ...pLines, ...mLines].join('\n')
```

- [ ] **Step 6: Preserve read-only Prorated**

Read the column for row metadata without changing behavior:

```js
const prorated = rawOrStar(row[H('Prorated')])
meta.push({ inst, sk, type, period, unit, maxMin, minMin, prorated })
```

No calculation code consumes `prorated`.

- [ ] **Step 7: Verify**

Run:

```bash
node --check live-server/scripts/legality-recheck-core.mjs
node live-server/scripts/__tests__/legality-recheck-core.test.mjs
npm --prefix live-server test -- tests/unit/legality-recheck-core-param.spec.ts --run
```

Expected: all pass.

---

### Task 4: Live/Scenario Source Roster Period Accessors

**Files:**
- Modify: `live-server/scripts/live-legality.mjs`
- Modify: `live-server/scripts/scenario-legality.mjs`
- Modify: `live-server/scripts/scenario-legality-source.mjs`
- Optional Test: extend `live-server/scripts/__tests__/legality-recheck-core.test.mjs` if source accessor behavior can be tested without DB

**Interfaces:**
- Produces: `source.rosterPeriods(): Promise<Array<{ start: string, end: string }>>`
- Consumes: `ctx.dateFrom`, `ctx.dateTo`, and live schema `roster_period`

- [ ] **Step 1: Implement live roster period accessor**

Add to the Live source object:

```js
async rosterPeriods() {
  const rows = (await db.query(
    `select to_char(rp_start, 'YYYY-MM-DD') as start,
            to_char(rp_end, 'YYYY-MM-DD') as end
       from roster_period
      where rp_start <= $2::date + interval '400 days'
        and rp_end >= $1::date - interval '400 days'
      order by rp_start`,
    [fromIso, toIso],
  )).rows
  return rows
}
```

Use the same `fromIso` / `toIso` variables already used by the Live source.

- [ ] **Step 2: Implement scenario roster period accessor**

Add to `scenario-legality.mjs` source object:

```js
async rosterPeriods() {
  const rows = (await db.query(
    `select to_char(rp_start, 'YYYY-MM-DD') as start,
            to_char(rp_end, 'YYYY-MM-DD') as end
       from roster_period
      where rp_start <= $2::date + interval '400 days'
        and rp_end >= $1::date - interval '400 days'
      order by rp_start`,
    [ctx.dateFrom, ctx.dateTo],
  )).rows
  return rows
}
```

If the source uses explicit `f8.` qualification for master data, use
`f8.roster_period` to match neighboring queries.

- [ ] **Step 3: Implement standalone scenario source accessor**

Add the same method to `scenario-legality-source.mjs`, using its existing date
context and schema qualification style.

- [ ] **Step 4: Verify syntax**

Run:

```bash
node --check live-server/scripts/live-legality.mjs
node --check live-server/scripts/scenario-legality.mjs
node --check live-server/scripts/scenario-legality-source.mjs
```

Expected: all pass.

---

### Task 5: Final Cross-Module Verification

**Files:**
- No new source files expected
- Update docs/dev-context only after implementation completes

**Interfaces:**
- Consumes: completed Tasks 1-4
- Produces: verified implementation ready for commit/push

- [ ] **Step 1: Build Rust release binaries for live harness**

Run:

```bash
cargo build --release --manifest-path rule-engine-rs/Cargo.toml
```

Expected: exit 0.

- [ ] **Step 2: Run Rust checks**

Run:

```bash
cargo check --bin check-8002-full --manifest-path rule-engine-rs/Cargo.toml
cargo check --manifest-path rule-engine-rs/py/Cargo.toml
```

Expected: exit 0. Existing unrelated warnings may remain and must be reported.

- [ ] **Step 3: Run focused Rust/PyO3/PBS tests**

Run:

```bash
/home/qianggong/.venv/bin/pytest rule-engine-rs/py/tests/test_engine_8002_full_params.py -q
PYTHONPATH=pbs-engine /home/qianggong/.venv/bin/pytest pbs-engine/tests/unit/test_rust_checker_rule_1001_params.py -k "8002" -q
```

Expected: pass.

- [ ] **Step 4: Run live-server checks**

Run:

```bash
node live-server/scripts/__tests__/legality-recheck-core.test.mjs
npm --prefix live-server test -- tests/unit/legality-recheck-core-param.spec.ts --run
```

Expected: pass.

- [ ] **Step 5: Whitespace and status checks**

Run:

```bash
git diff --check
git status --short --branch
git -C rule-engine-rs status --short --branch
git -C pbs-engine status --short --branch
```

Expected: no whitespace errors; status shows only expected files.

- [ ] **Step 6: Save development context**

Use:

```bash
./save-context.sh engines rule-8002-full-param-forwarding <<'EOF'
Implemented Rule 8002 full parameter forwarding for supported BH/DP/FT/CH rows:
- Live/Scenario now sends Crew Teams membership as Q T rows when a row is team-gated.
- Live/Scenario now sends roster-period P rows when a row uses Unit=RP.
- PyO3 Engine now uses crew_teams for 8002 team gating.
- Prorated/CHECK_LAST_DAY remains read-only and calculation-inert.
Verification:
- List exact commands and PASS/FAIL results from this implementation run.
Known warnings:
- Preserve any existing cargo or test warnings observed during verification.
EOF
```

- [ ] **Step 7: Commit order**

If submodules changed:

```bash
git -C rule-engine-rs add py/src/lib.rs py/tests/test_engine_8002_full_params.py
git -C rule-engine-rs commit -m "feat: enforce rule 8002 crew teams"
git -C pbs-engine add ColumnModelSolver_python/rules/rust/rule_params.py tests/unit/test_rust_checker_rule_1001_params.py
git -C pbs-engine commit -m "test: cover rule 8002 parameter forwarding"
git add live-server/scripts/legality-recheck-core.mjs live-server/scripts/live-legality.mjs live-server/scripts/scenario-legality.mjs live-server/scripts/scenario-legality-source.mjs live-server/scripts/__tests__/legality-recheck-core.test.mjs live-server/tests/unit/legality-recheck-core-param.spec.ts docs/dev-context/LATEST.md docs/dev-context/2026-07-26-engines-rule-8002-full-param-forwarding.md rule-engine-rs pbs-engine
git commit -m "feat: forward rule 8002 crew teams and RP context"
```

If `pbs-engine` has tests only and no production changes, use a `test:` commit
for that submodule.

---

## Self-Review

- Spec coverage: Crew Teams, RP, Prorated read-only, unsupported types, and no manday/schema changes are covered.
- Placeholder scan: no unresolved placeholder tokens remain.
- Type consistency: Live source emits `{ start, end }`; `rule8002()` converts those with `dayOrd()` to existing `P` rows. PyO3 `team_q` uses existing `QualEntry`.
