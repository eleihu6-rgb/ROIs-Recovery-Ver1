# Rule 8071 Rust Legality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate legacy C++ rule 8071 into the active Rust legality engine and surface it through the existing Legality, Live/Scenario recheck, persisted violation, and Gantt display flows.

**Architecture:** Add 8071 as another param-driven Rust checker, not a Gantt client-side rule. The shared `legality-recheck-core.mjs` resolves `rule.param_json`, feeds normalized roster-property rows from Live/Scenario/seed source adapters into `check-8071`, and persists generic `rule_violation` rows that existing Gantt bell, Alert Center, tooltip, and dialog code already render.

**Tech Stack:** Rust std-only crate `rule-engine-rs`; Node ESM recheck scripts in `live-server/scripts`; Fastify/TypeScript scoped recheck service; PostgreSQL idempotent SQL migration; Playwright E2E under `e2e/tests/gantt`.

## Global Constraints

- Use source of truth C++ files: `/home/qianggong/Documents/Crew/ROCode/RO-Dev/generalro/AircrewRO/Rule/CrewRule/RuleEngine/rule8071.cpp`, `db/RuleParseParams.cpp`, `db/CrewDB.h`, and the relevant `Utility::*howMany*InRange*` helpers.
- Default F8 8071 row is exactly `*,*,*,*,*,*,*,FLY,*,*,*,*,1,CM,11,0,*`; `Flights=*` must not restrict flight number.
- 8071 parameter header is exactly 17 columns: `Bases,Ranks,Fleets,Crew Teams,Labels,Attributes,Override Duty Attributes,Assignment Groups,Qualifiers,Flights,Destinations,Positions,Period,Unit,Max Times,Min Times,Check Mode`.
- Count modes must match C++: `F` counts flights, `D` counts duties, all other values including `*` count roster/pairing-level occurrences.
- Over-max violation condition is `count > Max Times`; under-min is `count < Min Times` only outside optimizer and only when `Min Times > 0`.
- No schema change; use existing `rule.param_json`, `rule.rule_id`, `rule_set`, `rule_violation`, and `scenario.rule_violation`.
- Add rule `8071/001` with `rule_id=8071001` into worksets `103` and `433`.
- Preserve §Gantt-Unify: no Live-only or Scenario-only UI fork for violation display.
- Preserve §First-Paint: 8071 computation must stay in backend/script recheck paths and must not block Gantt initial data rendering.
- UI text defaults to English.
- Do not introduce new dependencies.
- Before editing a symbol, run GitNexus impact analysis if the GitNexus tool or CLI is available; in this environment the MCP tool is not exposed, so record that fallback in the task notes and use focused grep/context review instead.

---

## File Structure

- Create `rule-engine-rs/src/rule8071.rs`: pure Rust model, parser helpers, window enumeration, matcher, and `check_roster_properties_row`.
- Create `rule-engine-rs/src/bin/check_8071.rs`: tagged TSV CLI named `check-8071`, compatible with `runBin`.
- Modify `rule-engine-rs/src/lib.rs`: export the new 8071 types/functions.
- Modify `rule-engine-rs/Cargo.toml`: add `[[bin]] name = "check-8071"`.
- Create `rule-engine-rs/tests/rule_8071_tests.rs`: Rust unit/regression tests for parser, matching, windows, and count modes.
- Create `sql/migration/2026-07-18-rule-8071-add-f8-ruleset.sql`: idempotent catalog and ruleset insert.
- Modify `live-server/scripts/legality-recheck-core.mjs`: add `rule8071`, source accessor contract comment, and `RULES` registration.
- Modify `live-server/scripts/live-legality.mjs`: add `rosterProperties()` source accessor for live rows.
- Modify `live-server/scripts/scenario-legality.mjs`: add `rosterProperties()` source accessor for scenario rows.
- Modify `live-server/scripts/scenario-legality-source.mjs`: add `rosterProperties()` to seed source.
- Modify `live-server/src/services/rule/legality-recheck.ts`: add scoped dependency `'8071': ['8071']`.
- Modify `live-server/scripts/__tests__/legality-recheck-core.test.mjs`: add focused `rule8071` tests.
- Modify `e2e/tests/gantt/legality-param-editor.spec.ts`: add 8071 wide table/dialog coverage.
- Create `e2e/tests/gantt/rule-8071-roster-properties.spec.ts`: end-to-end proof for ruleset, recheck, persisted violations, and Alert Center display.

---

### Task 1: C++ 8071 Fidelity Notes And Rust Test Skeleton

**Files:**
- Create: `rule-engine-rs/tests/rule_8071_tests.rs`
- Read-only reference: `/home/qianggong/Documents/Crew/ROCode/RO-Dev/generalro/AircrewRO/Rule/CrewRule/RuleEngine/rule8071.cpp`
- Read-only reference: `/home/qianggong/Documents/Crew/ROCode/RO-Dev/generalro/AircrewRO/Rule/CrewRule/db/RuleParseParams.cpp`
- Read-only reference: C++ `Utility::*howMany*InRange*` definitions found by `rg -n "howManyFlightsInRange|howManyDutiesInRange|howManyRostersInRange" /home/qianggong/Documents/Crew/ROCode/RO-Dev/generalro/AircrewRO/Rule/CrewRule`

**Interfaces:**
- Consumes: none from implementation.
- Produces: tests expecting `rois_rule_engine::{check_roster_properties_row, Application, RosterPropertyActivity, Rule8071, Rule8071Mode}`.

- [ ] **Step 1: Run available impact/context fallback**

Run:

```bash
rg -n "rule8071|checkMaxRosterProperties|howManyFlightsInRange|howManyDutiesInRange|howManyRostersInRange" /home/qianggong/Documents/Crew/ROCode/RO-Dev/generalro/AircrewRO/Rule/CrewRule
```

Expected: references include `rule8071.cpp`, parser code, and utility helper implementations. Record exact helper behavior in the first comment block of `rule-engine-rs/tests/rule_8071_tests.rs`.

- [ ] **Step 2: Write the failing Rust tests**

Create `rule-engine-rs/tests/rule_8071_tests.rs` with this starting content:

```rust
use rois_rule_engine::{
    check_roster_properties_row, Application, RosterPropertyActivity, Rule8071, Rule8071Mode,
};

fn act(
    crew_id: &str,
    pairing_id: i64,
    duty_seq: i64,
    segment_id: i64,
    start_utc: i64,
    assignment_group: &str,
    flight_number: &str,
    destination: &str,
    position: &str,
) -> RosterPropertyActivity {
    RosterPropertyActivity {
        crew_id: crew_id.to_string(),
        pairing_id,
        duty_seq,
        segment_id,
        start_utc,
        end_utc: start_utc + 3600,
        bases: vec!["YYZ".to_string()],
        ranks: vec!["CA".to_string()],
        fleets: vec!["777".to_string()],
        teams: vec!["*".to_string()],
        labels: vec!["P".to_string()],
        attributes: vec!["*".to_string()],
        override_duty_attributes: vec!["*".to_string()],
        assignment_group: assignment_group.to_string(),
        qualifier: "*".to_string(),
        flight_number: flight_number.to_string(),
        destination: destination.to_string(),
        position: position.to_string(),
    }
}

fn default_rule(max_times: f64) -> Rule8071 {
    Rule8071::from_cells(&[
        "*", "*", "*", "*", "*", "*", "*", "FLY", "*", "*", "*", "*", "1", "CM",
        &max_times.to_string(), "0", "*",
    ])
    .expect("valid 8071 row")
}

#[test]
fn parser_accepts_the_17_column_f8_default_row() {
    let rule = default_rule(11.0);
    assert_eq!(rule.assignment_groups, vec!["FLY"]);
    assert_eq!(rule.flights, vec!["*"]);
    assert_eq!(rule.period, 1);
    assert_eq!(rule.unit.as_str(), "CM");
    assert_eq!(rule.max_times, 11.0);
    assert_eq!(rule.min_times, 0.0);
    assert_eq!(rule.mode, Rule8071Mode::Roster);
}

#[test]
fn flights_star_does_not_filter_out_flight_numbers() {
    let rule = default_rule(1.0);
    let rows = vec![
        act("C1", 1, 1, 1, 1_780_000_000, "FLY", "0031", "YVR", "CA"),
        act("C1", 2, 1, 2, 1_780_086_400, "FLY", "7777", "YYZ", "CA"),
    ];
    let out = check_roster_properties_row("C1", &rule, &rows, 1_779_811_200, 1_782_403_199, &[], Application::Editor);
    assert_eq!(out.len(), 1);
    assert_eq!(out[0].actual_count, 2.0);
}

#[test]
fn roster_mode_counts_distinct_pairings_and_exactly_max_is_legal() {
    let rule = default_rule(11.0);
    let rows: Vec<_> = (0..11)
        .map(|i| act("C1", 100 + i, 1, i, 1_780_000_000 + i * 86_400, "FLY", "0031", "YVR", "CA"))
        .collect();
    let out = check_roster_properties_row("C1", &rule, &rows, 1_779_811_200, 1_782_403_199, &[], Application::Editor);
    assert!(out.is_empty(), "count == Max Times is legal");
}

#[test]
fn roster_mode_emits_when_count_exceeds_max() {
    let rule = default_rule(11.0);
    let rows: Vec<_> = (0..12)
        .map(|i| act("C1", 200 + i, 1, i, 1_780_000_000 + i * 86_400, "FLY", "0031", "YVR", "CA"))
        .collect();
    let out = check_roster_properties_row("C1", &rule, &rows, 1_779_811_200, 1_782_403_199, &[], Application::Editor);
    assert_eq!(out.len(), 1);
    assert_eq!(out[0].actual_count, 12.0);
    assert!(out[0].over);
}

#[test]
fn duty_mode_counts_distinct_pairing_duty_pairs() {
    let mut rule = default_rule(2.0);
    rule.mode = Rule8071Mode::Duty;
    let rows = vec![
        act("C1", 1, 1, 1, 1_780_000_000, "FLY", "0031", "YVR", "CA"),
        act("C1", 1, 1, 2, 1_780_003_600, "FLY", "0032", "YVR", "CA"),
        act("C1", 1, 2, 3, 1_780_086_400, "FLY", "0033", "YVR", "CA"),
        act("C1", 2, 1, 4, 1_780_172_800, "FLY", "0034", "YVR", "CA"),
    ];
    let out = check_roster_properties_row("C1", &rule, &rows, 1_779_811_200, 1_782_403_199, &[], Application::Editor);
    assert_eq!(out[0].actual_count, 3.0);
}

#[test]
fn flight_mode_counts_half_sectors_like_cpp_helper() {
    let mut rule = default_rule(1.0);
    rule.mode = Rule8071Mode::Flight;
    let rows = vec![
        act("C1", 1, 1, 1, 1_780_000_000, "FLY", "0031", "YVR", "CA"),
        act("C1", 1, 1, 2, 1_780_003_600, "FLY", "0032", "YVR", "CA"),
        act("C1", 2, 1, 3, 1_780_086_400, "FLY", "0033", "YVR", "CA"),
    ];
    let out = check_roster_properties_row("C1", &rule, &rows, 1_779_811_200, 1_782_403_199, &[], Application::Editor);
    assert_eq!(out[0].actual_count, 1.5);
}

#[test]
fn under_min_fires_in_editor_but_not_optimizer() {
    let mut rule = default_rule(99.0);
    rule.min_times = 2.0;
    let rows = vec![act("C1", 1, 1, 1, 1_780_000_000, "FLY", "0031", "YVR", "CA")];
    let editor = check_roster_properties_row("C1", &rule, &rows, 1_779_811_200, 1_782_403_199, &[], Application::Editor);
    let optimizer = check_roster_properties_row("C1", &rule, &rows, 1_779_811_200, 1_782_403_199, &[], Application::Optimizer);
    assert_eq!(editor.len(), 1);
    assert!(!editor[0].over);
    assert!(optimizer.is_empty());
}
```

- [ ] **Step 3: Run tests and verify they fail because symbols do not exist**

Run:

```bash
cargo test --manifest-path rule-engine-rs/Cargo.toml --test rule_8071_tests
```

Expected: FAIL with unresolved imports for `Rule8071`, `Rule8071Mode`, `RosterPropertyActivity`, or `check_roster_properties_row`.

- [ ] **Step 4: Commit the failing test skeleton**

Run:

```bash
git add rule-engine-rs/tests/rule_8071_tests.rs
git commit -m "test: define rule 8071 Rust parity expectations" -m "Add C++-derived rule 8071 tests covering the F8 default row, Flights wildcard behavior, max/min thresholds, and roster/duty/flight count modes." -m "Co-Authored-By: Codex Opus 4.6 (1M context) <noreply@anthropic.com>"
```

Expected: commit succeeds.

---

### Task 2: Rust 8071 Kernel And `check-8071` Binary

**Files:**
- Create: `rule-engine-rs/src/rule8071.rs`
- Create: `rule-engine-rs/src/bin/check_8071.rs`
- Modify: `rule-engine-rs/src/lib.rs`
- Modify: `rule-engine-rs/Cargo.toml`
- Test: `rule-engine-rs/tests/rule_8071_tests.rs`

**Interfaces:**
- Consumes: Task 1 tests.
- Produces:
  - `pub enum Rule8071Mode { Flight, Duty, Roster }`
  - `pub struct Rule8071`
  - `pub struct RosterPropertyActivity`
  - `pub struct Rule8071Violation`
  - `pub fn check_roster_properties_row(crew_id: &str, rule: &Rule8071, activities: &[RosterPropertyActivity], checked_start_utc: i64, checked_end_utc: i64, roster_periods: &[(i64, i64)], app: Application) -> Vec<Rule8071Violation>`
  - Binary `check-8071 --emit-tsv` emitting `V\tcrew\trule_idx\tanchor_pairing_id\twindow_start\twindow_end\tactual\tmax\tmin\tmode\tover`

- [ ] **Step 1: Run impact/context fallback for exported Rust symbols**

Run:

```bash
rg -n "pub use|Application|CumUnit|enumerate_windows|check_max_cumulative_row" rule-engine-rs/src rule-engine-rs/tests
```

Expected: confirms export pattern in `src/lib.rs` and reusable calendar/window helpers in `src/rule8002.rs`.

- [ ] **Step 2: Implement `rule8071.rs`**

Create `rule-engine-rs/src/rule8071.rs`. The implementation must be std-only and should reuse public date helpers from `lib.rs`. Implement these exact members:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Rule8071Mode {
    Flight,
    Duty,
    Roster,
}

impl Rule8071Mode {
    pub fn parse(raw: &str) -> Rule8071Mode { /* F => Flight, D => Duty, everything else => Roster */ }
    pub fn as_str(self) -> &'static str { /* F/D/R */ }
}

#[derive(Debug, Clone)]
pub struct Rule8071 {
    pub bases: Vec<String>,
    pub ranks: Vec<String>,
    pub fleets: Vec<String>,
    pub teams: Vec<String>,
    pub labels: Vec<String>,
    pub attributes: Vec<String>,
    pub override_duty_attributes: Vec<String>,
    pub assignment_groups: Vec<String>,
    pub qualifiers: Vec<String>,
    pub flights: Vec<String>,
    pub destinations: Vec<String>,
    pub positions: Vec<String>,
    pub period: i64,
    pub unit: Rule8071Unit,
    pub max_times: f64,
    pub min_times: f64,
    pub mode: Rule8071Mode,
}

impl Rule8071 {
    pub fn from_cells(cells: &[&str]) -> Result<Rule8071, String> { /* parse exactly 17 cells */ }
    pub fn scope_key(&self) -> String { /* format "{period}{unit}:{flights}:{assignment_groups}:{mode}" and cap to 40 chars */ }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Rule8071Unit { Cd, Cw, Cm, Rp }

impl Rule8071Unit {
    pub fn parse(raw: &str) -> Option<Rule8071Unit> { /* CD/CW/CM/RP */ }
    pub fn as_str(self) -> &'static str { /* CD/CW/CM/RP */ }
}

#[derive(Debug, Clone)]
pub struct RosterPropertyActivity {
    pub crew_id: String,
    pub pairing_id: i64,
    pub duty_seq: i64,
    pub segment_id: i64,
    pub start_utc: i64,
    pub end_utc: i64,
    pub bases: Vec<String>,
    pub ranks: Vec<String>,
    pub fleets: Vec<String>,
    pub teams: Vec<String>,
    pub labels: Vec<String>,
    pub attributes: Vec<String>,
    pub override_duty_attributes: Vec<String>,
    pub assignment_group: String,
    pub qualifier: String,
    pub flight_number: String,
    pub destination: String,
    pub position: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Rule8071Violation {
    pub crew_id: String,
    pub anchor_pairing_id: i64,
    pub window_start_utc: i64,
    pub window_end_utc: i64,
    pub actual_count: f64,
    pub max_times: f64,
    pub min_times: f64,
    pub mode: Rule8071Mode,
    pub over: bool,
}
```

Required logic:

```rust
pub fn check_roster_properties_row(
    crew_id: &str,
    rule: &Rule8071,
    activities: &[RosterPropertyActivity],
    checked_start_utc: i64,
    checked_end_utc: i64,
    roster_periods: &[(i64, i64)],
    app: Application,
) -> Vec<Rule8071Violation>
```

Implementation details:

- `split_list(raw)` returns `vec!["*"]` for empty or `*`, otherwise pipe-split trimmed values.
- A list matches if it is wildcard or contains the target exactly.
- Vector activity fields match if any value matches the rule list.
- `Flights=*` must match any `activity.flight_number`.
- `Rule8071Unit::Rp` uses `roster_periods`; when no RP rows are provided, return no windows.
- `CD` windows are rolling N calendar-day windows anchored at each activity day in the checked range.
- `CW` windows start at Sunday 00:00 UTC for the containing week and span `period * 7` days.
- `CM` windows start at calendar month start and span `period` calendar months.
- Count:
  - Flight mode = matching segment row count divided by `2.0`.
  - Duty mode = distinct `(pairing_id, duty_seq)` count.
  - Roster mode = distinct positive `pairing_id` count, plus distinct negative/zero ground sentinels when present.
- Anchor pairing = latest positive `pairing_id` among matching rows in the violating window, or first positive pairing for that crew, or `0` if none exists.

- [ ] **Step 3: Export the module**

Modify `rule-engine-rs/src/lib.rs`:

```rust
pub mod rule8071;
pub use rule8071::{
    check_roster_properties_row, RosterPropertyActivity, Rule8071, Rule8071Mode,
    Rule8071Unit, Rule8071Violation,
};
```

- [ ] **Step 4: Add Cargo binary registration**

Modify `rule-engine-rs/Cargo.toml`:

```toml
[[bin]]
name = "check-8071"
path = "src/bin/check_8071.rs"
```

- [ ] **Step 5: Implement `check_8071.rs`**

Create `rule-engine-rs/src/bin/check_8071.rs` using tagged TSV:

```text
C <TAB> checked_start_utc <TAB> checked_end_utc
R <TAB> rule_idx <TAB> 17 rule cells...
A <TAB> crew <TAB> pairing <TAB> duty_seq <TAB> segment_id <TAB> start_utc <TAB> end_utc <TAB> bases <TAB> ranks <TAB> fleets <TAB> teams <TAB> labels <TAB> attrs <TAB> override_attrs <TAB> assignment_group <TAB> qualifier <TAB> flight <TAB> destination <TAB> position
P <TAB> rp_start_utc <TAB> rp_end_utc
```

The binary must group activities by crew, evaluate every rule for every crew, and in `--emit-tsv` print:

```text
V <TAB> crew <TAB> rule_idx <TAB> anchor_pairing_id <TAB> window_start_utc <TAB> window_end_utc <TAB> actual_count <TAB> max_times <TAB> min_times <TAB> mode <TAB> over
```

- [ ] **Step 6: Run the focused Rust tests**

Run:

```bash
cargo test --manifest-path rule-engine-rs/Cargo.toml --test rule_8071_tests
```

Expected: PASS.

- [ ] **Step 7: Build the binary**

Run:

```bash
cargo build --release --manifest-path rule-engine-rs/Cargo.toml --bin check-8071
```

Expected: PASS and `rule-engine-rs/target/release/check-8071` exists.

- [ ] **Step 8: Commit Rust implementation**

Run:

```bash
git add rule-engine-rs/Cargo.toml rule-engine-rs/src/lib.rs rule-engine-rs/src/rule8071.rs rule-engine-rs/src/bin/check_8071.rs rule-engine-rs/tests/rule_8071_tests.rs
git commit -m "feat: add Rust checker for rule 8071" -m "Port rule 8071 roster-property counting into rule-engine-rs with parser, window enumeration, count modes, and check-8071 TSV binary." -m "Co-Authored-By: Codex Opus 4.6 (1M context) <noreply@anthropic.com>"
```

Expected: commit succeeds.

---

### Task 3: F8 Rule Catalog And Ruleset Migration

**Files:**
- Create: `sql/migration/2026-07-18-rule-8071-add-f8-ruleset.sql`

**Interfaces:**
- Consumes: no runtime code from previous tasks.
- Produces: DB rows for `rule.function=8071`, `rule.instance='001'`, `rule.rule_id=8071001`, and `rule_set` membership for worksets `103` and `433`.

- [ ] **Step 1: Inspect existing rule migration conventions**

Run:

```bash
rg -n "8071001|8002|8056|rule_set|param_json|on conflict" sql/migration sql/seed
```

Expected: find existing idempotent rule/ruleset migrations to mirror column names and conflict style.

- [ ] **Step 2: Write idempotent migration**

Create `sql/migration/2026-07-18-rule-8071-add-f8-ruleset.sql` with:

```sql
begin;

insert into rule (
  rule_id,
  function,
  instance,
  description,
  detail,
  category,
  source,
  store,
  filiale,
  division,
  owner,
  locked,
  param_json,
  created_by,
  created_at,
  updated_by,
  updated_at
)
select
  8071001,
  8071,
  '001',
  'Max PTNs for 777',
  '13.1 Max number N of Standby trips within a planning period',
  coalesce((select category from rule where function = 8056 limit 1), 'RULE'),
  coalesce((select source from rule where function = 8056 limit 1), 'R'),
  coalesce((select store from rule where function = 8056 limit 1), 'Y'),
  'F8',
  'P',
  'S',
  '0',
  '{
    "tables": [
      {
        "header": [
          "Bases",
          "Ranks",
          "Fleets",
          "Crew Teams",
          "Labels",
          "Attributes",
          "Override Duty Attributes",
          "Assignment Groups",
          "Qualifiers",
          "Flights",
          "Destinations",
          "Positions",
          "Period",
          "Unit",
          "Max Times",
          "Min Times",
          "Check Mode"
        ],
        "rows": [
          ["*", "*", "*", "*", "*", "*", "*", "FLY", "*", "*", "*", "*", "1", "CM", "11", "0", "*"]
        ]
      }
    ]
  }'::jsonb,
  'migration',
  now(),
  'migration',
  now()
where not exists (
  select 1 from rule where rule_id = 8071001
);

update rule
   set function = 8071,
       instance = '001',
       description = 'Max PTNs for 777',
       detail = '13.1 Max number N of Standby trips within a planning period',
       filiale = 'F8',
       division = 'P',
       owner = 'S',
       locked = '0',
       updated_by = 'migration',
       updated_at = now()
 where rule_id = 8071001;

insert into rule_set (workset_id, rule_id, created_by, created_at, updated_by, updated_at)
select ws.workset_id, 8071001, 'migration', now(), 'migration', now()
  from (values (103::bigint), (433::bigint)) as ws(workset_id)
 where not exists (
   select 1 from rule_set rs
    where rs.workset_id = ws.workset_id
      and rs.rule_id = 8071001
 );

commit;
```

If the actual `rule` or `rule_set` column set differs, adjust only to match existing schema and keep the same data values.

- [ ] **Step 3: Verify SQL parses against schema assumptions**

Run:

```bash
rg -n "create table.*rule|create table.*rule_set|rule_id|function|param_json" sql/schema sql/migration
```

Expected: migration column names match schema and prior migrations.

- [ ] **Step 4: Commit migration**

Run:

```bash
git add sql/migration/2026-07-18-rule-8071-add-f8-ruleset.sql
git commit -m "feat: add F8 rule 8071 to legality rulesets" -m "Seed rule 8071/001 with the F8 roster-property default parameters and attach it to worksets 103 and 433." -m "Co-Authored-By: Codex Opus 4.6 (1M context) <noreply@anthropic.com>"
```

Expected: commit succeeds.

---

### Task 4: Live/Scenario Source Accessors For 8071

**Files:**
- Modify: `live-server/scripts/live-legality.mjs`
- Modify: `live-server/scripts/scenario-legality.mjs`
- Modify: `live-server/scripts/scenario-legality-source.mjs`

**Interfaces:**
- Consumes: Rust binary input shape from Task 2.
- Produces: `source.rosterProperties(filters?: { groups?: string[]; codes?: string[]; flights?: string[]; destinations?: string[]; positions?: string[] })`.

- [ ] **Step 1: Run impact/context fallback on source adapters**

Run:

```bash
rg -n "function liveSource|function scenarioSource|buildSeedSource|flyByPairing|crewQualEntries|pairingSpansByCrew" live-server/scripts
```

Expected: confirms the three source adapters that must expose identical accessor names.

- [ ] **Step 2: Add live `rosterProperties()`**

In `live-server/scripts/live-legality.mjs`, add an accessor near `flyByPairing()`:

```javascript
async rosterProperties(filters = {}) {
  const groups = filters.groups?.length ? filters.groups : []
  const flights = filters.flights?.length ? filters.flights : []
  const destinations = filters.destinations?.length ? filters.destinations : []
  const positions = filters.positions?.length ? filters.positions : []
  return (await db.query(
    `with crew_quals as (
       select crew_id, 'B' as dim, base as value from f8.crew_base where base is not null and base <> ''
       union all select crew_id, 'R', rank from f8.crew_rank where rank is not null and rank <> ''
       union all select crew_id, 'F', ac_type from f8.crew_fleet where ac_type is not null and ac_type <> ''
       union all select crew_id, 'F', fleet_grp from f8.crew_fleet where fleet_grp is not null and fleet_grp <> ''
     )
     select rf.crew_id,
            coalesce(rf.pairing_id, -rf.id)::bigint as pairing_id,
            coalesce(rf.duty_seq, 0)::bigint as duty_seq,
            coalesce(rf.flt_id, rf.id)::bigint as segment_id,
            extract(epoch from rf.sch_str_dt_utc)::bigint as start_utc,
            extract(epoch from rf.sch_end_dt_utc)::bigint as end_utc,
            coalesce(nullif(rf.label, ''), nullif(p.pairing_label, ''), rf.assignment, rf.assignment_group, '') as label,
            coalesce(nullif(rf.assignment_group, ''), p.assignment_group, '') as assignment_group,
            coalesce(nullif(rf.assignment, ''), p.assignment, '') as qualifier,
            coalesce(nullif(rf.flt_num, ''), '') as flight_number,
            coalesce(nullif(rf.arv_arp, ''), '') as destination,
            coalesce(nullif(rf.position, ''), '') as position,
            coalesce(string_agg(distinct case when q.dim = 'B' then q.value end, '|' order by case when q.dim = 'B' then q.value end), '*') as bases,
            coalesce(string_agg(distinct case when q.dim = 'R' then q.value end, '|' order by case when q.dim = 'R' then q.value end), '*') as ranks,
            coalesce(string_agg(distinct case when q.dim = 'F' then q.value end, '|' order by case when q.dim = 'F' then q.value end), '*') as fleets,
            '*' as teams,
            '*' as attributes,
            '*' as override_duty_attributes
       from roster_flight rf
       left join pairing p on p.id = rf.pairing_id
       left join crew_quals q on q.crew_id = rf.crew_id
      where ${W}
        and (cardinality($3::text[]) = 0 or rf.assignment_group = any($3))
        and (cardinality($4::text[]) = 0 or rf.flt_num = any($4))
        and (cardinality($5::text[]) = 0 or rf.arv_arp = any($5))
        and (cardinality($6::text[]) = 0 or rf.position = any($6))
      group by rf.id, rf.crew_id, rf.pairing_id, rf.duty_seq, rf.flt_id, rf.sch_str_dt_utc,
               rf.sch_end_dt_utc, rf.label, p.pairing_label, rf.assignment_group, p.assignment_group,
               rf.assignment, p.assignment, rf.flt_num, rf.arv_arp, rf.position
      order by rf.crew_id, rf.sch_str_dt_utc, rf.pairing_id nulls last, rf.duty_seq, rf.seg_seq`,
    [...P, groups, flights, destinations, positions])).rows
}
```

If `roster_flight.flt_num` is absent in the actual model/schema, use the verified flight-number column from `sql/schema/live/02-crew-roster.sql` or join `flight` by `rf.flt_id` and select `flight.flt_num`.

- [ ] **Step 3: Add scenario `rosterProperties()`**

In `live-server/scripts/scenario-legality.mjs`, add the same accessor with `scenario.roster_flight`, `scenario.pairing`, `rf.scenario_id = $1`, and parameter list `[scenarioId, groups, flights, destinations, positions]`.

- [ ] **Step 4: Add seed `rosterProperties()`**

In `live-server/scripts/scenario-legality-source.mjs`, add the accessor to `buildSeedSource()` using `livePairingRows()` or a dedicated query over `f8.roster_flight` bounded by `crewIds()` and `pairingIds()`. It must return the same columns as live/scenario and return `[]` if either list is empty.

- [ ] **Step 5: Run syntax-level checks**

Run:

```bash
node --check live-server/scripts/live-legality.mjs
node --check live-server/scripts/scenario-legality.mjs
node --check live-server/scripts/scenario-legality-source.mjs
```

Expected: all PASS.

- [ ] **Step 6: Commit source adapter changes**

Run:

```bash
git add live-server/scripts/live-legality.mjs live-server/scripts/scenario-legality.mjs live-server/scripts/scenario-legality-source.mjs
git commit -m "feat: expose roster-property source rows for rule 8071" -m "Add matching Live, Scenario, and seed legality source accessors that normalize roster properties for the Rust 8071 checker." -m "Co-Authored-By: Codex Opus 4.6 (1M context) <noreply@anthropic.com>"
```

Expected: commit succeeds.

---

### Task 5: Recheck Dispatcher And Scoped Dependency

**Files:**
- Modify: `live-server/scripts/legality-recheck-core.mjs`
- Modify: `live-server/scripts/__tests__/legality-recheck-core.test.mjs`
- Modify: `live-server/src/services/rule/legality-recheck.ts`

**Interfaces:**
- Consumes: `source.rosterProperties()` from Task 4 and `check-8071` binary from Task 2.
- Produces: `export async function rule8071(source, ctx)` and `RULE_RECHECK_DEPS['8071'] = ['8071']`.

- [ ] **Step 1: Run impact/context fallback**

Run:

```bash
rg -n "export async function rule8056|export const RULES|RULE_RECHECK_DEPS|affectedRuleCodes" live-server/scripts/legality-recheck-core.mjs live-server/src/services/rule/legality-recheck.ts
```

Expected: confirms exact insertion points.

- [ ] **Step 2: Add failing unit tests**

Modify `live-server/scripts/__tests__/legality-recheck-core.test.mjs` imports:

```javascript
import { headerIndexer, scopeKeyOf, rule8002, rule8004, rule8056, rule8071 } from '../legality-recheck-core.mjs'
```

Add tests:

```javascript
const HDR8071 = [
  'Bases', 'Ranks', 'Fleets', 'Crew Teams', 'Labels', 'Attributes', 'Override Duty Attributes',
  'Assignment Groups', 'Qualifiers', 'Flights', 'Destinations', 'Positions',
  'Period', 'Unit', 'Max Times', 'Min Times', 'Check Mode',
]

test('rule8071 maps F8 default row into persisted 8071 violations', async () => {
  const S = Math.floor(Date.UTC(2026, 5, 1, 0, 0, 0) / 1000)
  let receivedFilters = null
  const rows = Array.from({ length: 12 }, (_, i) => ({
    crew_id: 'C1',
    pairing_id: 100 + i,
    duty_seq: 1,
    segment_id: 1000 + i,
    start_utc: S + i * 86_400,
    end_utc: S + i * 86_400 + 3600,
    bases: 'YYZ',
    ranks: 'CA',
    fleets: '777',
    teams: '*',
    label: 'P',
    attributes: '*',
    override_duty_attributes: '*',
    assignment_group: 'FLY',
    qualifier: '*',
    flight_number: i % 2 === 0 ? '0031' : '9999',
    destination: 'YVR',
    position: 'CA',
  }))
  const source = {
    async rosterProperties(filters) {
      receivedFilters = filters
      return rows
    },
  }
  const ctx = {
    dateFrom: '2026-06-01',
    dateTo: '2026-06-30',
    log: () => {},
    instancesOf: (fn) => fn === 8071
      ? [{ instance: '001', header: HDR8071, rows: [['*', '*', '*', '*', '*', '*', '*', 'FLY', '*', '*', '*', '*', '1', 'CM', '11', '0', '*']] }]
      : [],
  }
  const out = await rule8071(source, ctx)
  assert.equal(receivedFilters.groups[0], 'FLY')
  assert.deepEqual(receivedFilters.flights, [], 'Flights=* must not restrict source rows')
  assert.equal(out.length, 1)
  assert.equal(out[0].rule_code, '8071')
  assert.equal(out[0].rule_instance, '001')
  assert.equal(out[0].scope_key, '1CM:*:FLY:R')
  assert.equal(out[0].actual_value, 12)
  assert.equal(out[0].limit_value, 11)
  assert.equal(out[0].unit, 'COUNT')
  assert.match(out[0].message, /matching rosters \(12\).*1CM window/)
})

test('rule8071 emits nothing and does not query source when absent from ruleset', async () => {
  const logs = []
  let called = false
  const out = await rule8071({ async rosterProperties() { called = true; return [] } }, {
    dateFrom: '2026-06-01',
    dateTo: '2026-06-30',
    log: (m) => logs.push(m),
    instancesOf: () => [],
  })
  assert.deepEqual(out, [])
  assert.equal(called, false)
  assert.ok(logs.some((m) => m.includes('no instances')))
})
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
node --test live-server/scripts/__tests__/legality-recheck-core.test.mjs
```

Expected: FAIL because `rule8071` is not exported.

- [ ] **Step 4: Implement `rule8071()`**

In `live-server/scripts/legality-recheck-core.mjs`:

- Add `rosterProperties()` to the adapter contract comment.
- Add `const rpCount = (v) => Number.isFinite(Number(v)) ? Number(v) : 0` and `const countFilterValues = filterValues` near existing helpers if useful.
- Implement:

```javascript
export async function rule8071(source, ctx) {
  const instances = ctx.instancesOf(8071)
  if (!instances.length) { ctx.log('8071: no instances in rule set — skipped'); return [] }
  const groupSet = new Set()
  const flightSet = new Set()
  const destinationSet = new Set()
  const positionSet = new Set()
  const ruleLines = []
  const meta = []
  for (const inst of instances) {
    const H = headerIndexer(inst.header)
    for (const row of inst.rows ?? []) {
      const period = parseInt(row[H('Period')], 10)
      const unit = String(row[H('Unit')] ?? '').trim().toUpperCase()
      const maxTimes = Number(row[H('Max Times')])
      const minTimes = Number(row[H('Min Times')] ?? 0)
      if (!period || !unit || Number.isNaN(maxTimes) || Number.isNaN(minTimes)) {
        ctx.log(`skip 8071/${inst.instance}: missing Period/Unit/Max Times/Min Times`)
        continue
      }
      for (const value of filterValues(row[H('Assignment Groups')])) groupSet.add(value)
      for (const value of filterValues(row[H('Flights')])) flightSet.add(value)
      for (const value of filterValues(row[H('Destinations')])) destinationSet.add(value)
      for (const value of filterValues(row[H('Positions')])) positionSet.add(value)
      const idx = meta.length
      const modeRaw = String(row[H('Check Mode')] ?? '*').trim().toUpperCase()
      const mode = modeRaw === 'F' ? 'F' : modeRaw === 'D' ? 'D' : 'R'
      const sk = `${period}${unit}:${rawOrStar(row[H('Flights')])}:${rawOrStar(row[H('Assignment Groups')])}:${mode}`.slice(0, 40)
      meta.push({ inst, row, H, sk, period, unit, maxTimes, minTimes, mode })
      ruleLines.push(['R', idx, ...HDR8071.map((name) => rawOrStar(row[H(name)]))].join('\t'))
    }
  }
  if (!ruleLines.length) return []
  const rows = await source.rosterProperties({
    groups: [...groupSet],
    flights: [...flightSet],
    destinations: [...destinationSet],
    positions: [...positionSet],
  })
  const activityLines = rows.map((r) => ['A',
    r.crew_id, r.pairing_id, r.duty_seq ?? 0, r.segment_id ?? 0,
    r.start_utc, r.end_utc,
    r.bases ?? '*', r.ranks ?? '*', r.fleets ?? '*', r.teams ?? '*',
    r.label ?? '*', r.attributes ?? '*', r.override_duty_attributes ?? '*',
    r.assignment_group ?? '', r.qualifier ?? '*', r.flight_number ?? '',
    r.destination ?? '', r.position ?? '',
  ].map((v) => String(v).replace(/[\t\n\r]/g, ' ')).join('\t'))
  const cLine = ['C', epochSec(ctx.dateFrom + 'T00:00:00Z'), epochSec(ctx.dateTo + 'T23:59:59Z')].join('\t')
  const out = []
  for (const cols of runBin('check-8071', ['--emit-tsv'], [cLine, ...ruleLines, ...activityLines].join('\n'))) {
    if (cols[0] !== 'V' || cols.length < 11) continue
    const [, crewId, idxRaw, pairingId, ws, we, actual, maxTimes, minTimes, mode, overRaw] = cols
    const m = meta[Number(idxRaw)]
    if (!m || Number(pairingId) <= 0) continue
    const over = overRaw === '1'
    out.push({
      crew_id: crewId,
      pairing_id: Number(pairingId),
      duty_seq: null,
      rule_code: '8071',
      rule_instance: m.inst.instance,
      scope_key: m.sk,
      start_dt: new Date(Number(ws) * 1000).toISOString(),
      end_dt: new Date(Number(we) * 1000).toISOString(),
      window_start_dt: new Date(Number(ws) * 1000).toISOString(),
      window_end_dt: new Date(Number(we) * 1000).toISOString(),
      severity: 2,
      actual_value: Number(actual),
      limit_value: over ? Number(maxTimes) : Number(minTimes),
      unit: 'COUNT',
      message: `The number of matching rosters (${Number(actual)}) in the ${m.period}${m.unit} window ${new Date(Number(ws) * 1000).toISOString()}..${new Date(Number(we) * 1000).toISOString()} must be <= ${maxTimes} and >= ${minTimes}. Rule parameters: attribute=${rawOrStar(m.row[m.H('Attributes')])}, assignment group=${rawOrStar(m.row[m.H('Assignment Groups')])}, label=${rawOrStar(m.row[m.H('Labels')])}, qualifier=${rawOrStar(m.row[m.H('Qualifiers')])}, destination=${rawOrStar(m.row[m.H('Destinations')])}.`,
    })
  }
  return out
}
```

Use a module-level `HDR8071` constant rather than redefining the header array inside loops.

- [ ] **Step 5: Register rule**

Modify `RULES`:

```javascript
export const RULES = [rule1001, rule8002, rule8056, rule8071, rule8030, rule8004, rule7505, rule7506, rule7501, rule7503, rule7504]
```

- [ ] **Step 6: Add scoped recheck dependency**

Modify `live-server/src/services/rule/legality-recheck.ts`:

```typescript
  '8071': ['8071'],
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
cargo build --release --manifest-path rule-engine-rs/Cargo.toml --bin check-8071
node --test live-server/scripts/__tests__/legality-recheck-core.test.mjs
npm --prefix live-server exec tsc -- --noEmit
```

Expected: all PASS.

- [ ] **Step 8: Commit dispatcher changes**

Run:

```bash
git add live-server/scripts/legality-recheck-core.mjs live-server/scripts/__tests__/legality-recheck-core.test.mjs live-server/src/services/rule/legality-recheck.ts
git commit -m "feat: wire rule 8071 into legality recheck" -m "Resolve 8071 params from the selected ruleset, feed roster-property rows to check-8071, persist generic violation rows, and enable scoped recheck." -m "Co-Authored-By: Codex Opus 4.6 (1M context) <noreply@anthropic.com>"
```

Expected: commit succeeds.

---

### Task 6: Legality UI And Gantt E2E Coverage

**Files:**
- Modify: `e2e/tests/gantt/legality-param-editor.spec.ts`
- Create: `e2e/tests/gantt/rule-8071-roster-properties.spec.ts`
- No product UI file should be modified unless the tests expose a real bug.

**Interfaces:**
- Consumes: migration from Task 3, recheck from Task 5, and existing Gantt violation display.
- Produces: Playwright proof that 8071 is editable in Legality and visible through persisted Gantt violations.

- [ ] **Step 1: Run impact/context fallback on test targets**

Run:

```bash
rg -n "8071|8056 pop-out|ParamRowDialog|violations-button|violation-list-row|alert-groupby-rule" e2e/tests/gantt gantt/src/components
```

Expected: confirms existing test IDs and generic display path.

- [ ] **Step 2: Add 8071 Legality param editor test**

In `e2e/tests/gantt/legality-param-editor.spec.ts`, add:

```typescript
  test('Legal-6033 — rule 8071 opens the 17-column roster-property ParamRowDialog', async ({ page, request }) => {
    await openLegalityAsAdmin(page, request)
    await page.getByTestId('legality-rule-edit-8071-001').click()
    await page.getByTestId('legality-params-editor-8071-001').waitFor({ state: 'visible', timeout: 5_000 })
    await page.getByTestId('legality-param-edit-8071-001-0-0').click()
    const dialog = page.getByTestId('param-row-dialog')
    await expect(dialog).toBeVisible({ timeout: 3_000 })
    await expect(dialog).toContainText('Row 1')
    await expect(dialog.locator('[data-testid^="param-row-dialog-cell-"]')).toHaveCount(17)
    await expect(page.getByTestId('param-row-dialog-cell-7')).toHaveValue('FLY')
    await expect(page.getByTestId('param-row-dialog-cell-9')).toHaveValue('*')
    await expect(page.getByTestId('param-row-dialog-cell-14')).toHaveValue('11')
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).not.toBeVisible()
  })
```

- [ ] **Step 3: Create 8071 E2E test**

Create `e2e/tests/gantt/rule-8071-roster-properties.spec.ts`:

```typescript
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { ganttApiLogin, ganttApiUrl, gotoGantt, seedGanttAuth } from '../../utils/gantt-hook'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '../../..')
const WORKSET_PBS_SOLVER = 103

test.describe('Rule 8071/001 — roster properties', () => {
  test('Rule-8071-001 — workset 103 carries F8 default 8071 params with Flights wildcard', async ({ request }) => {
    const token = await ganttApiLogin(request)
    const res = await request.get(`${ganttApiUrl}/api/legality/ruleset/${WORKSET_PBS_SOLVER}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok(), `legality ruleset fetch failed: ${res.status()}`).toBeTruthy()
    const body = (await res.json()) as {
      data: { rules: Array<{ function: number; instance: string; paramJson: { tables: Array<{ header: string[]; rows: string[][] }> } }> }
    }
    const rule8071 = body.data.rules.find((r) => Number(r.function) === 8071 && r.instance === '001')
    expect(rule8071).toBeTruthy()
    const table = rule8071!.paramJson.tables[0]
    expect(table.header).toEqual([
      'Bases', 'Ranks', 'Fleets', 'Crew Teams', 'Labels', 'Attributes', 'Override Duty Attributes',
      'Assignment Groups', 'Qualifiers', 'Flights', 'Destinations', 'Positions',
      'Period', 'Unit', 'Max Times', 'Min Times', 'Check Mode',
    ])
    expect(table.rows[0]).toEqual(['*', '*', '*', '*', '*', '*', '*', 'FLY', '*', '*', '*', '*', '1', 'CM', '11', '0', '*'])
  })

  test('Rule-8071-002 — scoped recheck persists 8071 and Alert Center shows it', async ({ page, request }) => {
    execFileSync(
      'node',
      ['scripts/live-legality.mjs', '--group', '103', '--from', '2026-06-01', '--to', '2026-07-01', '--rules', '8071'],
      { cwd: path.join(REPO, 'live-server'), encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
    )

    await seedGanttAuth(page, request)
    await gotoGantt(page)

    await expect
      .poll(
        () => page.evaluate(() => {
          const t = (window as unknown as { __ganttTest?: { liveViolations?: () => Array<{ ruleCode: string; message: string }> } }).__ganttTest
          return (t?.liveViolations?.() ?? []).filter((v) => v.ruleCode === '8071').length
        }),
        { timeout: 30_000, intervals: [500] },
      )
      .toBeGreaterThan(0)

    const rows = await page.evaluate(() => {
      const t = (window as unknown as { __ganttTest: { liveViolations: () => Array<{ pairingId: number; ruleCode: string; severity: number; message: string }> } }).__ganttTest
      return t.liveViolations().filter((v) => v.ruleCode === '8071')
    })
    expect(rows.every((v) => v.pairingId > 0)).toBe(true)
    expect(rows.some((v) => /matching rosters \(\d+\).*1CM window/.test(v.message))).toBe(true)

    await page.getByTestId('violations-button').first().click()
    const dialog = page.getByTestId('violation-list-dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByTestId('alert-groupby-rule').click()
    await expect(dialog.locator('[data-testid="alert-group-item"]', { hasText: '8071/001' })).toHaveCount(1)
    const rows8071 = dialog.locator('[data-testid="violation-list-row"][data-rule-id="8071/001"]')
    await expect.poll(() => rows8071.count(), { timeout: 15_000, intervals: [500] }).toBeGreaterThan(0)
    await expect(rows8071.first()).toContainText('8071/001')
    await expect(rows8071.first()).toContainText(/matching rosters/)
  })
})
```

If the live data set does not naturally produce 8071 violations with `Max Times=11`, keep the first ruleset-param test and replace the second test's setup with a reversible temporary PATCH lowering `Max Times` for 8071/001, run scoped recheck, assert more than zero 8071 rows, and restore the original `paramJson` in `finally`.

- [ ] **Step 4: Run focused E2E tests**

Run:

```bash
npx playwright test --config=e2e/config/playwright.config.ts --project=gantt --no-deps e2e/tests/gantt/legality-param-editor.spec.ts -g "8071" --reporter=list
npx playwright test --config=e2e/config/playwright.config.ts --project=gantt --no-deps e2e/tests/gantt/rule-8071-roster-properties.spec.ts --reporter=list
```

Expected: both PASS against a live-server with migration applied and `check-8071` built.

- [ ] **Step 5: Run UI standard check if product UI files changed**

Run only if `git diff --name-only` includes `gantt/src/**`:

```bash
npm run check:ui
```

Expected: PASS with zero hard violations.

- [ ] **Step 6: Commit E2E coverage**

Run:

```bash
git add e2e/tests/gantt/legality-param-editor.spec.ts e2e/tests/gantt/rule-8071-roster-properties.spec.ts
git commit -m "test: cover rule 8071 legality and gantt display" -m "Add Playwright coverage for 8071 parameter editing, ruleset defaults, scoped recheck persistence, and Alert Center display." -m "Co-Authored-By: Codex Opus 4.6 (1M context) <noreply@anthropic.com>"
```

Expected: commit succeeds.

---

### Task 7: Final Verification And Deployment Readiness

**Files:**
- Modify only if verification exposes a defect in files touched by Tasks 1-6.

**Interfaces:**
- Consumes: all previous task outputs.
- Produces: verified branch ready to push/deploy.

- [ ] **Step 1: Run GitNexus change detection if available**

Run one of these if available:

```bash
node .gitnexus/run.cjs detect_changes --scope compare --base_ref main
```

or use the MCP `detect_changes({scope: "compare", base_ref: "main"})`.

Expected: changes are limited to 8071 Rust legality, live-server recheck/source wiring, SQL migration, and E2E tests. If GitNexus is unavailable, record that in the final response and use `git diff --stat origin/main...HEAD` as the fallback.

- [ ] **Step 2: Run full Rust engine verification**

Run:

```bash
cargo test --manifest-path rule-engine-rs/Cargo.toml
cargo build --release --manifest-path rule-engine-rs/Cargo.toml
```

Expected: both PASS.

- [ ] **Step 3: Run live-server focused verification**

Run:

```bash
node --test live-server/scripts/__tests__/legality-recheck-core.test.mjs
npm --prefix live-server exec tsc -- --noEmit
```

Expected: both PASS.

- [ ] **Step 4: Run Gantt verification**

Run:

```bash
npx playwright test --config=e2e/config/playwright.config.ts --project=gantt --no-deps e2e/tests/gantt/legality-param-editor.spec.ts -g "8071" --reporter=list
npx playwright test --config=e2e/config/playwright.config.ts --project=gantt --no-deps e2e/tests/gantt/rule-8071-roster-properties.spec.ts --reporter=list
```

Expected: both PASS.

- [ ] **Step 5: Confirm SQL migration can be applied in the target environment**

Run the migration through the team's normal DB migration mechanism. If applying manually for verification, use remote F8 authority from environment variables and do not paste credentials into docs or commits.

Verification query:

```sql
select r.rule_id, r.function, r.instance,
       r.param_json#>>'{tables,0,rows,0,9}' as flights,
       array_agg(rs.workset_id order by rs.workset_id) as worksets
  from rule r
  join rule_set rs on rs.rule_id = r.rule_id
 where r.rule_id = 8071001
 group by r.rule_id, r.function, r.instance, r.param_json;
```

Expected: one row with `function=8071`, `instance=001`, `flights=*`, `worksets={103,433}`.

- [ ] **Step 6: Save development context**

Run:

```bash
./save-context.sh engines rule-8071-rust-legality <<'EOF'
Implemented full rule 8071 migration from C++ to Rust legality:
- Rust checker: rule-engine-rs/src/rule8071.rs and check-8071.
- F8 default params: Flights=* and Assignment Groups=FLY in 1 CM with Max Times=11.
- Live/Scenario/seed legality source adapters expose rosterProperties().
- legality-recheck-core persists rule_code 8071 rows generically for Gantt Alert Center and crew bells.
- Worksets 103 and 433 include rule_id 8071001.
- Verification commands and any remaining risks are in the final response.
EOF
```

Expected: context saved under `docs/dev-context/` and `NEXT_CONTEXT.md` updated by the script if that is its normal behavior.

- [ ] **Step 7: Final commit for context if created**

Run:

```bash
git status --short
```

If `save-context.sh` created tracked docs, commit them:

```bash
git add docs/dev-context NEXT_CONTEXT.md
git commit -m "docs: save rule 8071 migration context" -m "Record implementation context and verification notes for the full 8071 Rust legality migration." -m "Co-Authored-By: Codex Opus 4.6 (1M context) <noreply@anthropic.com>"
```

Expected: either no tracked context changes or a docs-only context commit.

---

## Self-Review

- Spec coverage: tasks cover C++ semantics, 17-column params, Rust checker/binary, F8 migration, Live/Scenario/seed source accessors, scoped recheck, Legality UI, Gantt Alert Center/crew-bell data flow, and final verification.
- Placeholder scan: this plan intentionally avoids unresolved markers and vague "add tests" instructions; every task has concrete files, commands, and expected results.
- Type consistency: produced Rust interfaces in Task 2 match imports in Task 1; `source.rosterProperties()` output columns match Task 5 TSV construction; Playwright selectors reuse existing legality and violation test IDs.
- Known execution risk: the migration snippet may need column-list adjustment if the actual `rule` or `rule_set` schema differs from existing migrations. The task requires schema/migration inspection before applying.
