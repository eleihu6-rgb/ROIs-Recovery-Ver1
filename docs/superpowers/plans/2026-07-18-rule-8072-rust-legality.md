# Rule 8072 Rust Legality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate legacy C++ rule 8072 into the active Rust legality engine and surface it through the existing Legality, Live/Scenario recheck, persisted violation, and Gantt display flows.

**Architecture:** Add 8072 as a segment-level, param-driven Rust checker, not a Gantt client-side rule. The shared `legality-recheck-core.mjs` resolves `rule.param_json`, feeds normalized crew-on-flight segment rows from Live/Scenario/seed adapters into `check-8072`, and persists generic `rule_violation` rows that existing Gantt bells, Alert Center, tooltip, and dialog already render.

**Tech Stack:** Rust std-only crate `rule-engine-rs`; Node ESM recheck scripts in `live-server/scripts`; Fastify/TypeScript scoped recheck service; PostgreSQL idempotent SQL migration; Playwright E2E under `e2e/tests/gantt`.

## Global Constraints

- Use source of truth C++ file: `/home/qianggong/Documents/Crew/ROCode/RO-Dev/generalro/AircrewRO/Rule/CrewRule/RuleEngine/rule8072.cpp`.
- Rule enum source: `MIN_QAL_PER_FLEET_RANK = 8072` in `/home/qianggong/Documents/Crew/ROCode/RO-Dev/generalro/AircrewRO/Rule/CrewRule/GlobalDefinition/RuleEngineDef.h`.
- 8072 parameter header is exactly 13 columns: `Flight Fleets,Flight Assignment Groups,Crew Teams,Crew Nationality,Destination Countries,Acting Ranks,Flight Compositions,Required Qualifications,Attributes,Dep,Arr,Min Limits,Max Limits`.
- Default F8 8072 row is exactly `*,FLY,*,*,*,*,*,FC-GREEN,*,*,*,0,1`.
- Required Qualifications semantics are C++ compatible: `*` means any; `A|B` means OR; `A+B` means AND; `A+B|C` means `(A and B) or C`.
- Min violation condition is `qualified < Min Limits`; max violation condition is `qualified > Max Limits`.
- Preserve the C++ min-underflow skip: when remaining open planned capacity can still satisfy the minimum, do not emit the warning.
- Preserve optimizer PA over-max behavior in the Rust API even if Live uses editor mode.
- No schema change; use existing `rule.param_json`, `rule.rule_id`, `rule_set`, `rule_violation`, and `scenario.rule_violation`.
- Add rule `8072/001` with `rule_id=8072001` into worksets `103` and `433`.
- Preserve §Gantt-Unify: no Live-only or Scenario-only UI fork for violation display.
- Preserve §First-Paint: 8072 computation must stay in backend/script recheck paths and must not block Gantt initial data rendering.
- UI text defaults to English.
- Do not introduce new dependencies.
- Before editing a symbol, run GitNexus impact analysis if the GitNexus tool or CLI is available. In this environment GitNexus tooling is unavailable, so use focused local context review and record the fallback in final delivery.

---

## File Structure

- Create `rule-engine-rs/src/rule8072.rs`: pure Rust model, parser helpers, filter matching, required-qualification expression matcher, segment aggregation, and `check_min_qual_by_fleet_rank`.
- Create `rule-engine-rs/src/bin/check_8072.rs`: tagged TSV CLI named `check-8072`, compatible with `runBin`.
- Modify `rule-engine-rs/src/lib.rs`: export the new 8072 types/functions.
- Modify `rule-engine-rs/Cargo.toml`: add `[[bin]] name = "check-8072"`.
- Create `rule-engine-rs/tests/rule_8072_tests.rs`: Rust unit/regression tests for parser, filters, qualification matching, min/max, capacity skip, and CLI output.
- Create `sql/migration/2026-07-18-rule-8072-add-f8-ruleset.sql`: idempotent catalog and ruleset insert.
- Modify `live-server/scripts/legality-recheck-core.mjs`: add `rule8072`, source accessor contract comment, and `RULES` registration.
- Modify `live-server/scripts/live-legality.mjs`: add `qualificationFlightSegments()` source accessor for live rows.
- Modify `live-server/scripts/scenario-legality.mjs`: add `qualificationFlightSegments()` source accessor for scenario rows.
- Modify `live-server/scripts/scenario-legality-source.mjs`: add `qualificationFlightSegments()` to seed/live-backed source.
- Modify `live-server/src/services/rule/legality-recheck.ts`: add scoped dependency `'8072': ['8072']`.
- Modify `live-server/scripts/__tests__/legality-recheck-core.test.mjs`: add focused `rule8072` tests.
- Modify `e2e/tests/gantt/legality-param-editor.spec.ts`: add 8072 parameter-row coverage.
- Create `e2e/tests/gantt/rule-8072-flight-qualification.spec.ts`: end-to-end proof for ruleset, recheck, persisted violations, and Alert Center display.

---

### Task 1: C++ 8072 Fidelity Notes And Rust Test Skeleton

**Files:**
- Create: `rule-engine-rs/tests/rule_8072_tests.rs`
- Read-only reference: `/home/qianggong/Documents/Crew/ROCode/RO-Dev/generalro/AircrewRO/Rule/CrewRule/RuleEngine/rule8072.cpp`
- Read-only reference: `/home/qianggong/Documents/Crew/ROCode/RO-Dev/generalro/AircrewRO/Rule/CrewRule/doc/rule_change_mysql.sql`

**Interfaces:**
- Consumes: none from implementation.
- Produces: tests expecting `rois_rule_engine::{check_min_qual_by_fleet_rank, Application, Rule8072, Rule8072Crew, Rule8072Segment, Rule8072Violation}`.

- [ ] **Step 1: Run local impact/context fallback**

Run:

```bash
rg -n "rule8072|checkGenMinQualByFleetAndRank|MIN_QAL_PER_FLEET_RANK|Flight Compositions|Destination Countries" /home/qianggong/Documents/Crew/ROCode/RO-Dev/generalro/AircrewRO/Rule/CrewRule
```

Expected: references include `RuleEngine/rule8072.cpp`, `GlobalDefinition/RuleEngineDef.h`, and `doc/rule_change_mysql.sql`. Add a short top comment in the test file noting that GitNexus was unavailable and local source tracing was used.

- [ ] **Step 2: Write the failing Rust tests**

Create `rule-engine-rs/tests/rule_8072_tests.rs`:

```rust
//! Rule 8072 C++ fidelity expectations.
//!
//! C++ source:
//! - rule8072.cpp::LegalityChecker::checkGenMinQualByFleetAndRank
//! - RuleEngineDef.h::MIN_QAL_PER_FLEET_RANK = 8072
//! Local impact fallback used because GitNexus tooling is unavailable in this environment.

use rois_rule_engine::{
    check_min_qual_by_fleet_rank, Application, Rule8072, Rule8072Crew, Rule8072Segment,
};

fn default_rule(max_limits: i32) -> Rule8072 {
    Rule8072::from_cells(&[
        "*", "FLY", "*", "*", "*", "*", "*", "FC-GREEN", "*", "*", "*", "0",
        &max_limits.to_string(),
    ])
    .expect("valid 8072 default row")
}

fn crew(id: &str, rank: &str, quals: &[&str], source: &str) -> Rule8072Crew {
    Rule8072Crew {
        crew_id: id.to_string(),
        division: "P".to_string(),
        acting_rank: rank.to_string(),
        assignment: "FLY".to_string(),
        assignment_group: "FLY".to_string(),
        nationality: "CA".to_string(),
        teams: vec!["A".to_string()],
        source: source.to_string(),
        qualifications: quals.iter().map(|q| q.to_string()).collect(),
    }
}

fn segment(crews: Vec<Rule8072Crew>) -> Rule8072Segment {
    Rule8072Segment {
        segment_id: 9001,
        pairing_id: 7001,
        duty_seq: 1,
        seg_seq: 1,
        flight_id: 3001,
        flight_number: "F8001".to_string(),
        flight_date: "2026-06-01".to_string(),
        start_utc: 1_780_000_000,
        end_utc: 1_780_007_200,
        fleet: "737".to_string(),
        dep: "YYZ".to_string(),
        arr: "YVR".to_string(),
        assignment: "FLY".to_string(),
        assignment_group: "FLY".to_string(),
        composition: "STD".to_string(),
        attributes: vec!["LONG".to_string()],
        destination_country: "CA".to_string(),
        planned_by_rank: vec![("CA".to_string(), 1), ("FO".to_string(), 1)],
        filled_by_rank: vec![("CA".to_string(), 1), ("FO".to_string(), 1)],
        crews,
    }
}

#[test]
fn parser_accepts_the_13_column_f8_default_row() {
    let rule = default_rule(1);
    assert_eq!(rule.flight_assignment_groups, vec!["FLY"]);
    assert_eq!(rule.required_qualifications, "FC-GREEN");
    assert_eq!(rule.min_limits, 0);
    assert_eq!(rule.max_limits, 1);
}

#[test]
fn max_violation_emits_when_too_many_qualified_crew_are_on_segment() {
    let rule = default_rule(1);
    let seg = segment(vec![
        crew("C1", "CA", &["FC-GREEN"], "CR"),
        crew("C2", "FO", &["FC-GREEN"], "CR"),
    ]);
    let out = check_min_qual_by_fleet_rank(&rule, &[seg], Application::Editor);
    assert_eq!(out.len(), 1);
    assert_eq!(out[0].qualified_count, 2);
    assert_eq!(out[0].max_limits, 1);
    assert!(out[0].over_max);
}

#[test]
fn required_qualification_supports_or_and_plus_expressions() {
    let mut rule = default_rule(9);
    rule.required_qualifications = "A+B|C".to_string();
    let seg = segment(vec![
        crew("C1", "CA", &["A", "B"], "CR"),
        crew("C2", "FO", &["C"], "CR"),
        crew("C3", "FO", &["A"], "CR"),
    ]);
    let out = check_min_qual_by_fleet_rank(&rule, &[seg], Application::Editor);
    assert!(out.is_empty(), "two qualified crew is within max 9");
    let eval = rule.count_qualified(&segment(vec![
        crew("C1", "CA", &["A", "B"], "CR"),
        crew("C2", "FO", &["C"], "CR"),
        crew("C3", "FO", &["A"], "CR"),
    ]));
    assert_eq!(eval.qualified_count, 2);
}

#[test]
fn min_violation_skips_when_open_planned_capacity_can_still_satisfy_min() {
    let mut rule = default_rule(9);
    rule.min_limits = 2;
    let mut seg = segment(vec![crew("C1", "CA", &["FC-GREEN"], "CR")]);
    seg.planned_by_rank = vec![("CA".to_string(), 3)];
    seg.filled_by_rank = vec![("CA".to_string(), 1)];
    let out = check_min_qual_by_fleet_rank(&rule, &[seg], Application::Editor);
    assert!(out.is_empty(), "open planned slots can satisfy the missing qualified count");
}

#[test]
fn min_violation_emits_when_no_open_capacity_can_satisfy_min() {
    let mut rule = default_rule(9);
    rule.min_limits = 2;
    let mut seg = segment(vec![crew("C1", "CA", &["FC-GREEN"], "CR")]);
    seg.planned_by_rank = vec![("CA".to_string(), 1)];
    seg.filled_by_rank = vec![("CA".to_string(), 1)];
    let out = check_min_qual_by_fleet_rank(&rule, &[seg], Application::Editor);
    assert_eq!(out.len(), 1);
    assert_eq!(out[0].qualified_count, 1);
    assert!(!out[0].over_max);
}

#[test]
fn include_and_exclude_filters_match_cpp_forms() {
    let mut rule = default_rule(9);
    rule.crew_nationality = "!(US|GB)".to_string();
    rule.destination_countries = "CA|MX".to_string();
    rule.crew_teams = "A|B".to_string();
    let out = check_min_qual_by_fleet_rank(&rule, &[segment(vec![
        crew("C1", "CA", &["FC-GREEN"], "CR"),
    ])], Application::Editor);
    assert!(out.is_empty());
}

#[test]
fn optimizer_tolerates_over_max_when_all_qualified_crew_are_pa() {
    let rule = default_rule(1);
    let out = check_min_qual_by_fleet_rank(&rule, &[segment(vec![
        crew("C1", "CA", &["FC-GREEN"], "PA"),
        crew("C2", "FO", &["FC-GREEN"], "PA"),
    ])], Application::Optimizer);
    assert!(out.is_empty());
}
```

- [ ] **Step 3: Run tests and verify they fail because symbols do not exist**

Run:

```bash
cargo test --manifest-path rule-engine-rs/Cargo.toml --test rule_8072_tests
```

Expected: FAIL with unresolved imports for `Rule8072`, `Rule8072Crew`, `Rule8072Segment`, or `check_min_qual_by_fleet_rank`.

- [ ] **Step 4: Commit the failing test skeleton**

Run:

```bash
git add rule-engine-rs/tests/rule_8072_tests.rs
git commit -m "test: define rule 8072 Rust parity expectations" -m "Add C++-derived rule 8072 tests for F8 default params, required-qualification expressions, min/max limits, open-capacity skip, include/exclude filters, and PA optimizer behavior." -m "Co-Authored-By: Codex Opus 4.6 (1M context) <noreply@anthropic.com>"
```

Expected: commit succeeds.

---

### Task 2: Rust 8072 Kernel And `check-8072` Binary

**Files:**
- Create: `rule-engine-rs/src/rule8072.rs`
- Create: `rule-engine-rs/src/bin/check_8072.rs`
- Modify: `rule-engine-rs/src/lib.rs`
- Modify: `rule-engine-rs/Cargo.toml`
- Test: `rule-engine-rs/tests/rule_8072_tests.rs`

**Interfaces:**
- Consumes: Task 1 tests.
- Produces:
  - `pub struct Rule8072`
  - `pub struct Rule8072Crew`
  - `pub struct Rule8072Segment`
  - `pub struct Rule8072Evaluation`
  - `pub struct Rule8072Violation`
  - `pub fn check_min_qual_by_fleet_rank(rule: &Rule8072, segments: &[Rule8072Segment], app: Application) -> Vec<Rule8072Violation>`
  - Binary `check-8072 --emit-tsv` emitting `V\tidx\tcrew_id\tpairing_id\tsegment_id\tduty_seq\tstart_utc\tend_utc\tflight_number\tfleet\tacting_rank\tqualified\tplanned\tfilled\tmin\tmax\tover`

- [ ] **Step 1: Run impact/context fallback for Rust exports**

Run:

```bash
rg -n "pub mod rule8071|check_roster_properties_row|Application|\\[\\[bin\\]\\]|check-8071" rule-engine-rs/src rule-engine-rs/Cargo.toml rule-engine-rs/tests
```

Expected: confirms the export and binary patterns to mirror for 8072.

- [ ] **Step 2: Implement `rule8072.rs`**

Create `rule-engine-rs/src/rule8072.rs` with these public shapes and behavior:

```rust
use crate::Application;
use std::collections::BTreeSet;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rule8072 {
    pub flight_fleets: Vec<String>,
    pub flight_assignment_groups: Vec<String>,
    pub crew_teams: String,
    pub crew_nationality: String,
    pub destination_countries: String,
    pub acting_ranks: Vec<String>,
    pub flight_compositions: Vec<String>,
    pub required_qualifications: String,
    pub attributes: String,
    pub dep: Vec<String>,
    pub arr: Vec<String>,
    pub min_limits: i32,
    pub max_limits: i32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rule8072Crew {
    pub crew_id: String,
    pub division: String,
    pub acting_rank: String,
    pub assignment: String,
    pub assignment_group: String,
    pub nationality: String,
    pub teams: Vec<String>,
    pub source: String,
    pub qualifications: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rule8072Segment {
    pub segment_id: i64,
    pub pairing_id: i64,
    pub duty_seq: i64,
    pub seg_seq: i64,
    pub flight_id: i64,
    pub flight_number: String,
    pub flight_date: String,
    pub start_utc: i64,
    pub end_utc: i64,
    pub fleet: String,
    pub dep: String,
    pub arr: String,
    pub assignment: String,
    pub assignment_group: String,
    pub composition: String,
    pub attributes: Vec<String>,
    pub destination_country: String,
    pub planned_by_rank: Vec<(String, i32)>,
    pub filled_by_rank: Vec<(String, i32)>,
    pub crews: Vec<Rule8072Crew>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rule8072Evaluation {
    pub qualified_count: i32,
    pub planned_count: i32,
    pub filled_count: i32,
    pub owner_crew_id: String,
    pub acting_rank_label: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rule8072Violation {
    pub crew_id: String,
    pub pairing_id: i64,
    pub segment_id: i64,
    pub duty_seq: i64,
    pub start_utc: i64,
    pub end_utc: i64,
    pub flight_number: String,
    pub fleet: String,
    pub acting_rank: String,
    pub required_qualifications: String,
    pub qualified_count: i32,
    pub planned_count: i32,
    pub filled_count: i32,
    pub min_limits: i32,
    pub max_limits: i32,
    pub over_max: bool,
}
```

Implement these exact methods/functions:

```rust
impl Rule8072 {
    pub fn from_cells(cells: &[&str]) -> Result<Rule8072, String>;
    pub fn count_qualified(&self, segment: &Rule8072Segment) -> Rule8072Evaluation;
}

pub fn check_min_qual_by_fleet_rank(
    rule: &Rule8072,
    segments: &[Rule8072Segment],
    app: Application,
) -> Vec<Rule8072Violation>;
```

Implementation requirements:

- `from_cells` rejects any row not exactly 13 cells.
- Empty and `*` list filters normalize to `vec!["*".to_string()]`.
- `matches_list(values, actual)` treats `*` as match-all and otherwise uses exact case-sensitive match, mirroring C++ string compare.
- `matches_expr(raw, actual_values)` supports include and exclude forms:
  - raw `*` or empty means match.
  - raw `A|B` means any actual value equals `A` or `B`.
  - raw `!(A|B)` means no actual value equals `A` or `B`.
- `crew_has_required_qualifications("A+B|C", quals)` returns true when all `+` terms in any `|` alternative are present.
- `count_qualified` filters segment-level dimensions first, then crew-level dimensions.
- `planned_count` sums `planned_by_rank` for configured acting ranks, or all planned ranks when `acting_ranks` is `*`.
- `filled_count` sums matching crew rows by rank/group filters, matching the C++ intent.
- For Live/editor mode, emit max and min violations normally.
- For optimizer mode, when over max and every qualified crew source is `PA`, emit no violation.
- For min-underflow, skip when `planned_count > 0` and `planned_count - filled_count >= min_limits - qualified_count`.

- [ ] **Step 3: Export 8072 from `lib.rs`**

Modify `rule-engine-rs/src/lib.rs`:

```rust
pub mod rule8072;
pub use rule8072::{
    check_min_qual_by_fleet_rank, Rule8072, Rule8072Crew, Rule8072Evaluation, Rule8072Segment,
    Rule8072Violation,
};
```

Keep the existing 8071 exports intact.

- [ ] **Step 4: Add Cargo binary registration**

Modify `rule-engine-rs/Cargo.toml` after the `check-8071` binary block:

```toml
# Live check CLI for rule 8072 MIN_QAL_PER_FLEET_RANK: reads tagged TSV
# (R rule rows, S segment rows, C crew-on-segment rows), counts qualified crew
# by segment and emits violation TSV. Dependency-free.
[[bin]]
name = "check-8072"
path = "src/bin/check_8072.rs"
```

- [ ] **Step 5: Implement `check_8072.rs`**

Create `rule-engine-rs/src/bin/check_8072.rs` with tagged TSV support:

```rust
//! Live check for rule 8072 segment qualification counts.
//!
//! Input:
//! R <idx> <13 param cells>
//! S <segment fields>
//! C <segment_id> <crew fields>
//! Output:
//! V <idx> <crew_id> <pairing_id> <segment_id> <duty_seq> <start_utc> <end_utc>
//!   <flight_number> <fleet> <acting_rank> <qualified> <planned> <filled> <min> <max> <over>

use rois_rule_engine::{check_min_qual_by_fleet_rank, Application, Rule8072, Rule8072Crew, Rule8072Segment};
use std::collections::{BTreeMap, BTreeSet};
use std::io::{self, Read};

fn split_list(raw: &str) -> Vec<String> {
    raw.split('|').map(str::trim).filter(|s| !s.is_empty()).map(ToOwned::to_owned).collect()
}

fn main() {
    let emit_tsv = std::env::args().any(|a| a == "--emit-tsv");
    if !emit_tsv {
        eprintln!("usage: check-8072 --emit-tsv");
        std::process::exit(2);
    }
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).expect("read stdin");

    let mut rules: BTreeMap<usize, Rule8072> = BTreeMap::new();
    let mut segments: BTreeMap<i64, Rule8072Segment> = BTreeMap::new();
    let mut segment_rule_idx: BTreeMap<i64, BTreeSet<usize>> = BTreeMap::new();

    for raw in input.lines() {
        let line = raw.strip_suffix('\r').unwrap_or(raw);
        if line.is_empty() {
            continue;
        }
        let cols: Vec<&str> = line.split('\t').collect();
        match cols.first().copied() {
            Some("R") if cols.len() >= 15 => {
                let idx: usize = cols[1].parse().expect("rule idx");
                let rule = Rule8072::from_cells(&cols[2..15]).expect("rule row");
                rules.insert(idx, rule);
            }
            Some("S") if cols.len() >= 22 => {
                let segment_id: i64 = cols[1].parse().expect("segment id");
                let planned_by_rank = cols[19].split('|').filter_map(|p| {
                    let (rank, value) = p.split_once(':')?;
                    Some((rank.to_string(), value.parse::<i32>().ok()?))
                }).collect();
                let filled_by_rank = cols[20].split('|').filter_map(|p| {
                    let (rank, value) = p.split_once(':')?;
                    Some((rank.to_string(), value.parse::<i32>().ok()?))
                }).collect();
                segments.insert(segment_id, Rule8072Segment {
                    segment_id,
                    pairing_id: cols[2].parse().unwrap_or(0),
                    duty_seq: cols[3].parse().unwrap_or(0),
                    seg_seq: cols[4].parse().unwrap_or(0),
                    flight_id: cols[5].parse().unwrap_or(0),
                    flight_number: cols[6].to_string(),
                    flight_date: cols[7].to_string(),
                    start_utc: cols[8].parse().unwrap_or(0),
                    end_utc: cols[9].parse().unwrap_or(0),
                    fleet: cols[10].to_string(),
                    dep: cols[11].to_string(),
                    arr: cols[12].to_string(),
                    assignment: cols[13].to_string(),
                    assignment_group: cols[14].to_string(),
                    composition: cols[15].to_string(),
                    attributes: split_list(cols[16]),
                    destination_country: cols[17].to_string(),
                    planned_by_rank,
                    filled_by_rank,
                    crews: Vec::new(),
                });
                for idx in split_list(cols[21]).into_iter().filter_map(|v| v.parse::<usize>().ok()) {
                    segment_rule_idx.entry(segment_id).or_default().insert(idx);
                }
            }
            Some("C") if cols.len() >= 11 => {
                let segment_id: i64 = cols[1].parse().expect("crew segment id");
                if let Some(seg) = segments.get_mut(&segment_id) {
                    seg.crews.push(Rule8072Crew {
                        crew_id: cols[2].to_string(),
                        division: cols[3].to_string(),
                        acting_rank: cols[4].to_string(),
                        assignment: cols[5].to_string(),
                        assignment_group: cols[6].to_string(),
                        nationality: cols[7].to_string(),
                        teams: split_list(cols[8]),
                        source: cols[9].to_string(),
                        qualifications: split_list(cols[10]),
                    });
                }
            }
            _ => {}
        }
    }

    let segment_values: Vec<Rule8072Segment> = segments.values().cloned().collect();
    for (idx, rule) in rules {
        let filtered: Vec<Rule8072Segment> = segment_values.iter()
            .filter(|s| segment_rule_idx.get(&s.segment_id).map_or(true, |set| set.contains(&idx)))
            .cloned()
            .collect();
        for v in check_min_qual_by_fleet_rank(&rule, &filtered, Application::Editor) {
            println!(
                "V\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}",
                idx, v.crew_id, v.pairing_id, v.segment_id, v.duty_seq, v.start_utc, v.end_utc,
                v.flight_number, v.fleet, v.acting_rank, v.qualified_count, v.planned_count,
                v.filled_count, v.min_limits, v.max_limits, if v.over_max { 1 } else { 0 }
            );
        }
    }
}
```

- [ ] **Step 6: Run Rust tests**

Run:

```bash
cargo test --manifest-path rule-engine-rs/Cargo.toml --test rule_8072_tests
```

Expected: PASS.

- [ ] **Step 7: Build the binary**

Run:

```bash
cargo build --release --manifest-path rule-engine-rs/Cargo.toml --bin check-8072
```

Expected: PASS and `rule-engine-rs/target/release/check-8072` exists.

- [ ] **Step 8: Commit Rust implementation**

Run:

```bash
git add rule-engine-rs/Cargo.toml rule-engine-rs/src/lib.rs rule-engine-rs/src/rule8072.rs rule-engine-rs/src/bin/check_8072.rs rule-engine-rs/tests/rule_8072_tests.rs
git commit -m "feat: add Rust checker for rule 8072" -m "Port rule 8072 segment qualification counting into rule-engine-rs with parser, qualification expressions, min/max limits, open-capacity skip, and check-8072 TSV binary." -m "Co-Authored-By: Codex Opus 4.6 (1M context) <noreply@anthropic.com>"
```

Expected: commit succeeds.

---

### Task 3: F8 Rule Catalog Migration

**Files:**
- Create: `sql/migration/2026-07-18-rule-8072-add-f8-ruleset.sql`

**Interfaces:**
- Consumes: approved default row `*,FLY,*,*,*,*,*,FC-GREEN,*,*,*,0,1`.
- Produces: DB rows for `rule.function=8072`, `rule.instance='001'`, `rule.rule_id=8072001`, and `rule_set` membership for worksets `103` and `433`.

- [ ] **Step 1: Review 8071 migration pattern**

Run:

```bash
sed -n '1,220p' sql/migration/2026-07-18-rule-8071-add-f8-ruleset.sql
```

Expected: confirms idempotent insert/update style and fields to mirror.

- [ ] **Step 2: Create idempotent 8072 migration**

Create `sql/migration/2026-07-18-rule-8072-add-f8-ruleset.sql`:

```sql
-- =============================================================================
-- 2026-07-18 rule 8072 Min/max qualified crew per flight/fleet/rank
-- Adds the F8 pilot rule and enables it in default worksets.
-- =============================================================================

set search_path = f8;

begin;

insert into rule (
    created_by, created_at, updated_by, updated_at,
    function, instance, class, description, reference, category, store_structure,
    source, detail, overridability, severity, filiale, division, owner, locked,
    exception_code, rule_id, param_json
)
select
    'migration', now(), 'migration', now(),
    8072, '001',
    coalesce((select class from rule where function = 8071 limit 1), 'R'),
    'Min/max qualified crew per flight/fleet/rank',
    coalesce((select reference from rule where function = 8071 limit 1), 'F8'),
    coalesce((select category from rule where function = 8071 limit 1), 'RULE'),
    coalesce((select store_structure from rule where function = 8071 limit 1), 'Table'),
    coalesce((select source from rule where function = 8071 limit 1), 'R'),
    'Minimum/maximum number of crew with valid qualifications by flight, fleet, and acting rank',
    coalesce((select overridability from rule where function = 8071 limit 1), 'S'),
    coalesce((select severity from rule where function = 8071 limit 1), 1),
    'F8', 'P', 'S', '0', '', 8072001,
    '{
      "tables": [
        {
          "header": [
            "Flight Fleets",
            "Flight Assignment Groups",
            "Crew Teams",
            "Crew Nationality",
            "Destination Countries",
            "Acting Ranks",
            "Flight Compositions",
            "Required Qualifications",
            "Attributes",
            "Dep",
            "Arr",
            "Min Limits",
            "Max Limits"
          ],
          "rows": [
            ["*", "FLY", "*", "*", "*", "*", "*", "FC-GREEN", "*", "*", "*", "0", "1"]
          ]
        }
      ]
    }'::jsonb
where not exists (
    select 1 from rule where rule_id = 8072001
);

update rule
   set function = 8072,
       instance = '001',
       class = coalesce((select class from rule where function = 8071 limit 1), class, 'R'),
       description = 'Min/max qualified crew per flight/fleet/rank',
       reference = coalesce((select reference from rule where function = 8071 limit 1), reference, 'F8'),
       category = coalesce((select category from rule where function = 8071 limit 1), category, 'RULE'),
       store_structure = coalesce((select store_structure from rule where function = 8071 limit 1), store_structure, 'Table'),
       source = coalesce((select source from rule where function = 8071 limit 1), source, 'R'),
       detail = 'Minimum/maximum number of crew with valid qualifications by flight, fleet, and acting rank',
       overridability = coalesce((select overridability from rule where function = 8071 limit 1), overridability, 'S'),
       severity = coalesce((select severity from rule where function = 8071 limit 1), severity, 1),
       filiale = 'F8',
       division = 'P',
       owner = 'S',
       locked = '0',
       exception_code = coalesce(exception_code, ''),
       param_json = case
         when param_json is null or not (param_json ? 'tables') then '{
           "tables": [
             {
               "header": [
                 "Flight Fleets",
                 "Flight Assignment Groups",
                 "Crew Teams",
                 "Crew Nationality",
                 "Destination Countries",
                 "Acting Ranks",
                 "Flight Compositions",
                 "Required Qualifications",
                 "Attributes",
                 "Dep",
                 "Arr",
                 "Min Limits",
                 "Max Limits"
               ],
               "rows": [
                 ["*", "FLY", "*", "*", "*", "*", "*", "FC-GREEN", "*", "*", "*", "0", "1"]
               ]
             }
           ]
         }'::jsonb
         else param_json
       end,
       updated_by = 'migration',
       updated_at = now()
 where rule_id = 8072001;

insert into rule_set (created_by, created_at, updated_by, updated_at, workset_id, rule_id)
select 'migration', now(), 'migration', now(), ws.workset_id, 8072001
  from (values (103::bigint), (433::bigint)) as ws(workset_id)
 where exists (select 1 from workset where id = ws.workset_id)
   and not exists (
     select 1 from rule_set rs
      where rs.workset_id = ws.workset_id
        and rs.rule_id = 8072001
   );

commit;
```

- [ ] **Step 3: Defer migration execution until a target DB is authorized**

Do not run the migration as a syntax check against a real remote DB. The migration contains `begin`/`commit`, so executing the file writes data. Defer execution to Task 7 after the target DB is explicitly authorized, and record "not applied in Task 3" in task notes.

- [ ] **Step 4: Verify row shape after applying to a target DB**

Run:

```sql
select r.rule_id, r.function, r.instance,
       r.param_json#>>'{tables,0,header,7}' as qual_header,
       r.param_json#>>'{tables,0,rows,0,7}' as qual_value,
       array_agg(rs.workset_id order by rs.workset_id) as worksets
  from rule r
  left join rule_set rs on rs.rule_id = r.rule_id
 where r.rule_id = 8072001
 group by r.rule_id, r.function, r.instance, r.param_json;
```

Expected: one row with `function=8072`, `instance=001`, `qual_header=Required Qualifications`, `qual_value=FC-GREEN`, `worksets={103,433}`.

- [ ] **Step 5: Commit migration**

Run:

```bash
git add sql/migration/2026-07-18-rule-8072-add-f8-ruleset.sql
git commit -m "feat: add F8 rule 8072 catalog migration" -m "Add idempotent SQL migration for rule 8072/001 with the F8 pilot default parameter row and ruleset membership for worksets 103 and 433." -m "Co-Authored-By: Codex Opus 4.6 (1M context) <noreply@anthropic.com>"
```

Expected: commit succeeds.

---

### Task 4: Live-Server Recheck Core And Focused Node Tests

**Files:**
- Modify: `live-server/scripts/legality-recheck-core.mjs`
- Modify: `live-server/src/services/rule/legality-recheck.ts`
- Modify: `live-server/scripts/__tests__/legality-recheck-core.test.mjs`

**Interfaces:**
- Consumes: `check-8072 --emit-tsv` from Task 2.
- Produces:
  - `export async function rule8072(source, ctx)`
  - `RULES` includes `rule8072`
  - `RULE_RECHECK_DEPS['8072'] = ['8072']`
  - `source.qualificationFlightSegments(filters)` contract used by Task 5.

- [ ] **Step 1: Run local impact/context fallback**

Run:

```bash
rg -n "rule8071|RULES|RULE_RECHECK_DEPS|instancesOf\\(8071\\)|rosterProperties|runBin\\('check-8071'" live-server/scripts live-server/src/services/rule
```

Expected: shows all 8071 integration points to mirror.

- [ ] **Step 2: Add test import and 8072 header fixture**

Modify `live-server/scripts/__tests__/legality-recheck-core.test.mjs` import:

```js
import { headerIndexer, scopeKeyOf, rule8002, rule8004, rule8056, rule8071, rule8072 } from '../legality-recheck-core.mjs'
```

Add fixture near `HDR8071`:

```js
const HDR8072 = [
  'Flight Fleets', 'Flight Assignment Groups', 'Crew Teams', 'Crew Nationality',
  'Destination Countries', 'Acting Ranks', 'Flight Compositions', 'Required Qualifications',
  'Attributes', 'Dep', 'Arr', 'Min Limits', 'Max Limits',
]
```

- [ ] **Step 3: Add focused failing Node tests**

Append tests to `live-server/scripts/__tests__/legality-recheck-core.test.mjs`:

```js
test('rule8072 maps F8 default row into persisted 8072 violations', async () => {
  const source = {
    async qualificationFlightSegments() {
      return [{
        segment_id: 9001, pairing_id: 7001, duty_seq: 1, seg_seq: 1, flight_id: 3001,
        flight_number: 'F8001', flight_date: '2026-06-01',
        start_utc: 1780000000, end_utc: 1780007200,
        fleet: '737', dep: 'YYZ', arr: 'YVR',
        assignment: 'FLY', assignment_group: 'FLY',
        composition: 'STD', attributes: 'LONG', destination_country: 'CA',
        planned_by_rank: 'CA:1|FO:1', filled_by_rank: 'CA:1|FO:1',
        crews: [
          { crew_id: 'C1', division: 'P', acting_rank: 'CA', assignment: 'FLY', assignment_group: 'FLY', nationality: 'CA', teams: 'A', source: 'CR', qualifications: 'FC-GREEN' },
          { crew_id: 'C2', division: 'P', acting_rank: 'FO', assignment: 'FLY', assignment_group: 'FLY', nationality: 'CA', teams: 'A', source: 'CR', qualifications: 'FC-GREEN' },
        ],
      }]
    },
  }
  const logs = []
  const ctx = {
    dateFrom: '2026-06-01',
    dateTo: '2026-06-30',
    log: (m) => logs.push(m),
    instancesOf: (fn) => fn === 8072
      ? [{ instance: '001', header: HDR8072, rows: [['*', 'FLY', '*', '*', '*', '*', '*', 'FC-GREEN', '*', '*', '*', '0', '1']] }]
      : [],
  }
  const out = await rule8072(source, ctx)
  assert.equal(out.length, 1)
  assert.equal(out[0].rule_code, '8072')
  assert.equal(out[0].rule_instance, '001')
  assert.equal(out[0].pairing_id, 7001)
  assert.equal(out[0].segment_id, 9001)
  assert.equal(out[0].actual_value, 2)
  assert.equal(out[0].limit_value, 1)
  assert.match(out[0].message, /valid qualification \(FC-GREEN\)/)
})

test('rule8072 emits nothing and does not query source when absent from ruleset', async () => {
  let called = false
  const out = await rule8072({ async qualificationFlightSegments() { called = true; return [] } }, {
    instancesOf: () => [],
    log() {},
  })
  assert.deepEqual(out, [])
  assert.equal(called, false)
})
```

- [ ] **Step 4: Run Node tests and verify they fail**

Run:

```bash
node --test live-server/scripts/__tests__/legality-recheck-core.test.mjs
```

Expected: FAIL because `rule8072` is not exported yet.

- [ ] **Step 5: Implement `rule8072` in core**

Modify `live-server/scripts/legality-recheck-core.mjs`:

- Add `qualificationFlightSegments(filters) -> normalized crew-on-flight segment rows [rule8072]` to the source accessor comment.
- Add constant:

```js
const HDR8072 = [
  'Flight Fleets', 'Flight Assignment Groups', 'Crew Teams', 'Crew Nationality',
  'Destination Countries', 'Acting Ranks', 'Flight Compositions', 'Required Qualifications',
  'Attributes', 'Dep', 'Arr', 'Min Limits', 'Max Limits',
]
```

- Add function after `rule8071`:

```js
export async function rule8072(source, ctx) {
  const instances = ctx.instancesOf(8072)
  if (!instances.length) { ctx.log('8072: no instances in rule set — skipped'); return [] }
  const groupSet = new Set()
  const fleetSet = new Set()
  const depSet = new Set()
  const arrSet = new Set()
  const ruleLines = []
  const meta = []
  for (const inst of instances) {
    const H = headerIndexer(inst.header)
    for (const row of inst.rows ?? []) {
      const minLimits = Number(row[H('Min Limits')] ?? 0)
      const maxLimits = Number(row[H('Max Limits')] ?? 99)
      const quals = rawOrStar(row[H('Required Qualifications')])
      if (Number.isNaN(minLimits) || Number.isNaN(maxLimits) || !quals) {
        ctx.log(`skip 8072/${inst.instance}: missing Required Qualifications/Min Limits/Max Limits`)
        continue
      }
      for (const value of filterValues(row[H('Flight Assignment Groups')])) groupSet.add(value)
      for (const value of filterValues(row[H('Flight Fleets')])) fleetSet.add(value)
      for (const value of filterValues(row[H('Dep')])) depSet.add(value)
      for (const value of filterValues(row[H('Arr')])) arrSet.add(value)
      const idx = meta.length
      const sk = `${rawOrStar(row[H('Required Qualifications')])}:${rawOrStar(row[H('Flight Assignment Groups')])}:${minLimits}-${maxLimits}`.slice(0, 40)
      meta.push({ inst, row, H, sk, minLimits, maxLimits })
      ruleLines.push(['R', idx, ...HDR8072.map((name) => rawOrStar(row[H(name)]))].join('\t'))
    }
  }
  if (!ruleLines.length) return []
  const rows = await source.qualificationFlightSegments({
    groups: [...groupSet],
    fleets: [...fleetSet],
    deps: [...depSet],
    arrs: [...arrSet],
  })
  const inputLines = [...ruleLines]
  for (const r of rows) {
    const matchingRules = meta
      .map((_, idx) => String(idx))
      .join('|')
    inputLines.push(['S',
      r.segment_id, r.pairing_id, r.duty_seq ?? 0, r.seg_seq ?? 0, r.flight_id ?? 0,
      r.flight_number ?? '', r.flight_date ?? '', r.start_utc, r.end_utc,
      r.fleet ?? '', r.dep ?? '', r.arr ?? '', r.assignment ?? '',
      r.assignment_group ?? '', r.composition ?? '', r.attributes ?? '*',
      r.destination_country ?? '', r.planned_by_rank ?? '', r.filled_by_rank ?? '',
      matchingRules,
    ].map((v) => String(v).replace(/[\t\n\r]/g, ' ')).join('\t'))
    for (const c of r.crews ?? []) {
      inputLines.push(['C',
        r.segment_id, c.crew_id, c.division ?? '', c.acting_rank ?? '',
        c.assignment ?? '', c.assignment_group ?? '', c.nationality ?? '',
        c.teams ?? '', c.source ?? '', c.qualifications ?? '',
      ].map((v) => String(v).replace(/[\t\n\r]/g, ' ')).join('\t'))
    }
  }
  const out = []
  for (const cols of runBin('check-8072', ['--emit-tsv'], inputLines.join('\n'))) {
    if (cols[0] !== 'V' || cols.length < 17) continue
    const [, idxRaw, crewId, pairingId, segmentId, dutySeq, startUtc, endUtc, flightNumber, fleet, actingRank, qualified, planned, filled, minLimits, maxLimits, overRaw] = cols
    const m = meta[Number(idxRaw)]
    if (!m || Number(pairingId) <= 0 || Number(segmentId) <= 0) continue
    const over = overRaw === '1' || String(overRaw).toUpperCase() === 'TRUE'
    out.push({
      crew_id: crewId,
      pairing_id: Number(pairingId),
      segment_id: Number(segmentId),
      duty_seq: Number(dutySeq) || null,
      rule_code: '8072',
      rule_instance: m.inst.instance,
      scope_key: m.sk,
      start_dt: new Date(Number(startUtc) * 1000).toISOString(),
      end_dt: new Date(Number(endUtc) * 1000).toISOString(),
      window_start_dt: new Date(Number(startUtc) * 1000).toISOString(),
      window_end_dt: new Date(Number(endUtc) * 1000).toISOString(),
      severity: 2,
      actual_value: Number(qualified),
      limit_value: over ? Number(maxLimits) : Number(minLimits),
      unit: 'COUNT',
      message: `The number of crews (${qualified}) with valid qualification (${rawOrStar(m.row[m.H('Required Qualifications')])}) on flight (${flightNumber},${fleet}) and acting rank (${actingRank}) does not meet the requirement (min=${minLimits}, max=${maxLimits}). Parameters: dep-arr=${rawOrStar(m.row[m.H('Dep')])}-${rawOrStar(m.row[m.H('Arr')])}, attribute=${rawOrStar(m.row[m.H('Attributes')])}, assignment group=${rawOrStar(m.row[m.H('Flight Assignment Groups')])}, composition=${rawOrStar(m.row[m.H('Flight Compositions')])}. Current composition plan/fill=${planned}/${filled}.`,
    })
  }
  return out
}
```

- [ ] **Step 6: Register rule and scoped deps**

Modify `RULES` in `live-server/scripts/legality-recheck-core.mjs`:

```js
export const RULES = [rule1001, rule8002, rule8056, rule8071, rule8072, rule8030, rule8004, rule7505, rule7506, rule7501, rule7503, rule7504]
```

Modify `live-server/src/services/rule/legality-recheck.ts`:

```ts
'8072': ['8072'],
```

Place it next to `'8071': ['8071']`.

- [ ] **Step 7: Run focused tests**

Run:

```bash
node --test live-server/scripts/__tests__/legality-recheck-core.test.mjs
```

Expected: PASS. If it fails because `check-8072` is stale/missing, run `cargo build --release --manifest-path rule-engine-rs/Cargo.toml --bin check-8072` and rerun.

- [ ] **Step 8: Run TypeScript check**

Run from `live-server/`:

```bash
npm exec -- tsc --noEmit
```

Expected: PASS.

- [ ] **Step 9: Commit recheck core**

Run:

```bash
git add live-server/scripts/legality-recheck-core.mjs live-server/src/services/rule/legality-recheck.ts live-server/scripts/__tests__/legality-recheck-core.test.mjs
git commit -m "feat: wire rule 8072 legality recheck core" -m "Resolve 8072 params from rule sets, invoke check-8072, map segment qualification violations to persisted rows, and add scoped recheck dependency coverage." -m "Co-Authored-By: Codex Opus 4.6 (1M context) <noreply@anthropic.com>"
```

Expected: commit succeeds.

---

### Task 5: Live/Scenario Source Accessors

**Files:**
- Modify: `live-server/scripts/live-legality.mjs`
- Modify: `live-server/scripts/scenario-legality.mjs`
- Modify: `live-server/scripts/scenario-legality-source.mjs`
- Test: `live-server/scripts/__tests__/legality-recheck-core.test.mjs`

**Interfaces:**
- Consumes: `source.qualificationFlightSegments(filters)` contract from Task 4.
- Produces: identical normalized row shape for Live, Scenario, and seed/live-backed recheck paths.

- [ ] **Step 1: Run local context review**

Run:

```bash
rg -n "rosterProperties\\(|crewQualEntries\\(|assignment_group|roster_flight|crew_qualification|crew_team|airport|pairing_composition|flight_composition" live-server/scripts live-server/src/models sql/schema
```

Expected: identifies 8071 source accessors and authoritative table/column names for crew, roster, qualification, and composition data.

- [ ] **Step 2: Implement shared SQL shape in `live-legality.mjs`**

Add `qualificationFlightSegments(filters)` to the source object in `live-server/scripts/live-legality.mjs`.

The query must:

- Read `roster_flight rf` for crew x segment membership.
- Join `pairing_segment ps` by pairing/duty/segment where needed.
- Join `flight f` by `rf.flt_id = f.id` or `ps.flt_id = f.id` when `rf.flt_id` is absent.
- Join `crew c` by `rf.crew_id = c.crew_id`.
- Join airport table for arrival country.
- Join or aggregate `crew_qualification` rows effective for the segment window.
- Join or aggregate crew team rows effective for the segment window.
- Aggregate all crew on a segment into `crews`.
- Return one JS object per segment:

```js
{
  segment_id: Number(row.segment_id),
  pairing_id: Number(row.pairing_id),
  duty_seq: Number(row.duty_seq ?? 0),
  seg_seq: Number(row.seg_seq ?? 0),
  flight_id: Number(row.flight_id ?? 0),
  flight_number: row.flight_number ?? '',
  flight_date: row.flight_date ?? '',
  start_utc: Number(row.start_utc),
  end_utc: Number(row.end_utc),
  fleet: row.fleet ?? '',
  dep: row.dep ?? '',
  arr: row.arr ?? '',
  assignment: row.assignment ?? '',
  assignment_group: row.assignment_group ?? '',
  composition: row.composition ?? '',
  attributes: row.attributes ?? '*',
  destination_country: row.destination_country ?? '',
  planned_by_rank: row.planned_by_rank ?? '',
  filled_by_rank: row.filled_by_rank ?? '',
  crews: JSON.parse(row.crews_json ?? '[]'),
}
```

Use `filters.groups`, `filters.fleets`, `filters.deps`, and `filters.arrs` only as optional SQL narrowing. Empty filter arrays must not restrict the source.

- [ ] **Step 3: Implement scenario accessor**

Add the same `qualificationFlightSegments(filters)` function to `live-server/scripts/scenario-legality.mjs`.

Requirements:

- Use scenario tables with `scenario_id = $scenarioId` where the live source uses live roster/segment/flight tables.
- Use live crew/qualification/team/airport master data where scenario tables do not mirror those dimensions.
- Return the exact same normalized row shape as Live.

- [ ] **Step 4: Implement seed/live-backed accessor**

Add the same accessor to `live-server/scripts/scenario-legality-source.mjs`.

Requirements:

- Reuse the live-backed DB source pattern already present in this file.
- Return the exact same normalized row shape.
- If the seed source cannot produce real segment data for a unit test path, return an empty array only when no scenario/live rows exist; do not silently stub non-empty scenario rows.

- [ ] **Step 5: Add source-shape unit test**

Add a small source-shape assertion to `live-server/scripts/__tests__/legality-recheck-core.test.mjs` near the 8072 tests:

```js
test('rule8072 accepts normalized source rows with multiple crew records', async () => {
  let filtersSeen = null
  const source = {
    async qualificationFlightSegments(filters) {
      filtersSeen = filters
      return [{
        segment_id: 1, pairing_id: 2, duty_seq: 3, seg_seq: 4, flight_id: 5,
        flight_number: 'F8001', flight_date: '2026-06-01', start_utc: 1780000000, end_utc: 1780007200,
        fleet: '737', dep: 'YYZ', arr: 'YVR', assignment: 'FLY', assignment_group: 'FLY',
        composition: 'STD', attributes: '*', destination_country: 'CA',
        planned_by_rank: 'CA:1|FO:1', filled_by_rank: 'CA:1|FO:1',
        crews: [
          { crew_id: 'C1', division: 'P', acting_rank: 'CA', assignment: 'FLY', assignment_group: 'FLY', nationality: 'CA', teams: '*', source: 'CR', qualifications: 'FC-GREEN' },
          { crew_id: 'C2', division: 'P', acting_rank: 'FO', assignment: 'FLY', assignment_group: 'FLY', nationality: 'CA', teams: '*', source: 'CR', qualifications: 'FC-GREEN' },
        ],
      }]
    },
  }
  const ctx = {
    dateFrom: '2026-06-01',
    dateTo: '2026-06-30',
    log() {},
    instancesOf: (fn) => fn === 8072
      ? [{ instance: '001', header: HDR8072, rows: [['*', 'FLY', '*', '*', '*', '*', '*', 'FC-GREEN', '*', '*', '*', '0', '1']] }]
      : [],
  }
  const out = await rule8072(source, ctx)
  assert.equal(filtersSeen.groups[0], 'FLY')
  assert.equal(out.length, 1)
})
```

- [ ] **Step 6: Run focused tests and TS check**

Run:

```bash
node --test live-server/scripts/__tests__/legality-recheck-core.test.mjs
cd live-server && npm exec -- tsc --noEmit
```

Expected: both PASS.

- [ ] **Step 7: Commit source accessors**

Run:

```bash
git add live-server/scripts/live-legality.mjs live-server/scripts/scenario-legality.mjs live-server/scripts/scenario-legality-source.mjs live-server/scripts/__tests__/legality-recheck-core.test.mjs
git commit -m "feat: add 8072 legality segment sources" -m "Expose normalized crew-on-flight segment qualification data for live, scenario, and live-backed legality recheck sources." -m "Co-Authored-By: Codex Opus 4.6 (1M context) <noreply@anthropic.com>"
```

Expected: commit succeeds.

---

### Task 6: Legality UI And Gantt E2E Coverage

**Files:**
- Modify: `e2e/tests/gantt/legality-param-editor.spec.ts`
- Create: `e2e/tests/gantt/rule-8072-flight-qualification.spec.ts`

**Interfaces:**
- Consumes: Task 3 DB migration applied to test DB, Task 4/5 recheck wiring, existing Gantt persisted-violation UI.
- Produces: Playwright proof that 8072 is editable and visible through generic Gantt violation display.

- [ ] **Step 1: Add 8072 parameter editor test**

Modify `e2e/tests/gantt/legality-param-editor.spec.ts` by adding:

```ts
test('Legal-6034 — rule 8072 opens the 13-column flight-qualification ParamRowDialog', async ({ page, request }) => {
  const token = await ganttApiLogin(request)
  await seedGanttAuth(page, token)
  await gotoGantt(page)
  await page.getByTestId('module-nav-rule').click()
  await page.getByTestId('legality-rule-edit-8072-001').click()
  await page.getByTestId('legality-params-editor-8072-001').waitFor({ state: 'visible', timeout: 5_000 })
  await page.getByTestId('legality-param-edit-8072-001-0-0').click()
  const dialog = page.getByRole('dialog', { name: /Edit Parameter Row/i })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Required Qualifications')).toHaveValue('FC-GREEN')
  await expect(dialog.getByLabel('Flight Assignment Groups')).toHaveValue('FLY')
  await expect(dialog.getByLabel('Max Limits')).toHaveValue('1')
})
```

If helper signatures differ, adapt only the login/navigation calls to match the existing 8071 test in the same file.

- [ ] **Step 2: Create 8072 Gantt E2E spec**

Create `e2e/tests/gantt/rule-8072-flight-qualification.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { ganttApiLogin, gotoGantt, seedGanttAuth } from '../../utils/gantt-hook'

const WORKSET_PBS_SOLVER = 103
const FROM = '2026-06-01'
const TO = '2026-06-30'

const run8072Recheck = (): void => {
  const res = spawnSync(
    'node',
    ['scripts/live-legality.mjs', '--group', String(WORKSET_PBS_SOLVER), '--from', FROM, '--to', TO, '--rules', '8072'],
    { cwd: process.cwd().replace(/\/e2e$/, '/live-server'), encoding: 'utf-8', timeout: 120_000 },
  )
  expect(res.status, res.stderr || res.stdout).toBe(0)
}

test.describe('Rule 8072/001 — flight qualification counts', () => {
  test('Rule-8072-001 — workset 103 carries F8 default 8072 params', async ({ request }) => {
    const token = await ganttApiLogin(request)
    const res = await request.get(`/api/legality/rules?worksetId=${WORKSET_PBS_SOLVER}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    const rule8072 = body.data.rules.find((r: any) => Number(r.function) === 8072 && r.instance === '001')
    expect(rule8072).toBeTruthy()
    const table = rule8072.paramJson.tables[0]
    expect(table.header).toEqual([
      'Flight Fleets', 'Flight Assignment Groups', 'Crew Teams', 'Crew Nationality',
      'Destination Countries', 'Acting Ranks', 'Flight Compositions', 'Required Qualifications',
      'Attributes', 'Dep', 'Arr', 'Min Limits', 'Max Limits',
    ])
    expect(table.rows[0]).toEqual(['*', 'FLY', '*', '*', '*', '*', '*', 'FC-GREEN', '*', '*', '*', '0', '1'])
  })

  test('Rule-8072-002 — scoped recheck persists 8072 and Alert Center shows it', async ({ page, request }) => {
    const token = await ganttApiLogin(request)
    await seedGanttAuth(page, token)
    run8072Recheck()
    await gotoGantt(page)
    await expect.poll(async () => {
      return page.evaluate(() => {
        const t = (window as any).__ganttTest
        return (t?.liveViolations?.() ?? []).filter((v: any) => v.ruleCode === '8072').length
      })
    }, { timeout: 30_000, intervals: [1000] }).toBeGreaterThan(0)
    await page.getByTestId('alert-center-button').click()
    const dialog = page.getByTestId('violation-list-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('[data-testid="alert-group-item"]', { hasText: '8072/001' })).toHaveCount(1)
    const rows8072 = dialog.locator('[data-testid="violation-list-row"][data-rule-id="8072/001"]')
    await expect.poll(() => rows8072.count(), { timeout: 15_000, intervals: [500] }).toBeGreaterThan(0)
    await expect(rows8072.first()).toContainText('8072/001')
    await expect(rows8072.first()).toContainText(/valid qualification/)
  })
})
```

If live data does not naturally produce 8072 violations with `Max Limits=1`, add a reversible setup in this spec: temporarily lower or raise the 8072 param row through the API, run scoped recheck, assert persisted rows, and restore original `paramJson` in `finally`.

- [ ] **Step 3: Run focused Playwright tests**

Run from repo root with local live-server available:

```bash
cd e2e
npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps tests/gantt/legality-param-editor.spec.ts -g "8072" --reporter=list
npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps tests/gantt/rule-8072-flight-qualification.spec.ts --reporter=list
```

Expected: both PASS.

- [ ] **Step 4: Commit E2E coverage**

Run:

```bash
git add e2e/tests/gantt/legality-param-editor.spec.ts e2e/tests/gantt/rule-8072-flight-qualification.spec.ts
git commit -m "test: cover rule 8072 legality and gantt display" -m "Add Playwright coverage for 8072 parameter editing, ruleset defaults, scoped recheck persistence, and Alert Center display." -m "Co-Authored-By: Codex Opus 4.6 (1M context) <noreply@anthropic.com>"
```

Expected: commit succeeds.

---

### Task 7: Full Verification, DB Sync, Context Save, And Push

**Files:**
- Potentially modify: `docs/dev-context/LATEST.md` via `./save-context.sh`
- Potentially create: `docs/dev-context/<timestamp>-engines-rule-8072-rust-legality.md`

**Interfaces:**
- Consumes: all prior implementation commits.
- Produces: verified local branch ready to push and, if authorized, 8072 DB migration applied to `f8_sit_live`.

- [ ] **Step 1: Run full Rust verification**

Run:

```bash
cargo test --manifest-path rule-engine-rs/Cargo.toml
cargo build --release --manifest-path rule-engine-rs/Cargo.toml
```

Expected: both PASS.

- [ ] **Step 2: Run full live-server focused verification**

Run:

```bash
node --test live-server/scripts/__tests__/legality-recheck-core.test.mjs
cd live-server && npm exec -- tsc --noEmit
```

Expected: both PASS.

- [ ] **Step 3: Run focused Gantt E2E verification**

Run:

```bash
cd e2e
npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps tests/gantt/legality-param-editor.spec.ts -g "8072" --reporter=list
npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps tests/gantt/rule-8072-flight-qualification.spec.ts --reporter=list
```

Expected: both PASS.

- [ ] **Step 4: Run UI standard gate only if UI/style files changed**

If only E2E files changed under `e2e/`, skip this step and record "not required: no frontend UI/style files changed".

If any `gantt/src` UI/style file changed, run:

```bash
npm run check:ui
```

Expected: PASS with zero hard violations.

- [ ] **Step 5: Verify expected git scope**

Run:

```bash
git status --short --branch
git diff --stat origin/main...HEAD
```

Expected: changes are limited to 8072 Rust legality, live-server recheck/source wiring, SQL migration, E2E tests, spec, plan, and saved context. If GitNexus is unavailable, record that `detect_changes()` could not be run and this diff-stat was used as fallback.

- [ ] **Step 6: Apply DB migration to authorized target DB**

When authorized for `f8_sit_live`, run:

```bash
psql '<authorized-f8-sit-live-dsn>' -v ON_ERROR_STOP=1 -f sql/migration/2026-07-18-rule-8072-add-f8-ruleset.sql
```

Expected: migration completes. Do not write the DSN into any docs, commits, or logs beyond shell history already controlled by the operator.

- [ ] **Step 7: Verify target DB rows**

Run against the same authorized DB:

```sql
select r.rule_id, r.function, r.instance,
       r.param_json#>>'{tables,0,rows,0,7}' as required_qualifications,
       array_agg(rs.workset_id order by rs.workset_id) as worksets
  from rule r
  left join rule_set rs on rs.rule_id = r.rule_id
 where r.rule_id = 8072001
 group by r.rule_id, r.function, r.instance, r.param_json;
```

Expected: `required_qualifications=FC-GREEN` and `worksets={103,433}`.

- [ ] **Step 8: Save development context**

Run:

```bash
./save-context.sh engines rule-8072-rust-legality <<'EOF'
Implemented full rule 8072 migration from C++ to Rust legality:
- Rust checker: rule-engine-rs/src/rule8072.rs and check-8072.
- F8 catalog migration: sql/migration/2026-07-18-rule-8072-add-f8-ruleset.sql.
- legality-recheck-core persists rule_code 8072 rows generically for Gantt Alert Center and crew bells.
- Live/Scenario/seed sources expose normalized crew-on-flight segment qualification data.
- Worksets 103 and 433 include rule_id 8072001 when migration is applied.
- Verification commands and DB sync status are recorded in the final delivery.
EOF
```

Expected: updates `docs/dev-context/LATEST.md` and creates a timestamped context file.

- [ ] **Step 9: Commit saved context**

Run:

```bash
git add docs/dev-context/LATEST.md docs/dev-context/*.md
git commit -m "docs: save rule 8072 migration context" -m "Record implementation context and verification notes for the full 8072 Rust legality migration." -m "Co-Authored-By: Codex Opus 4.6 (1M context) <noreply@anthropic.com>"
```

Expected: commit succeeds.

- [ ] **Step 10: Push**

Run:

```bash
git push origin main
```

Expected: push succeeds.

---

## Self-Review Checklist

- Spec coverage: Tasks cover Rust kernel/CLI, DB migration, live-server core, source accessors, scoped dependency mapping, Legality UI coverage, Gantt persisted violation E2E, verification, DB sync, context save, and push.
- Placeholder scan: This plan has concrete file paths, commands, expected results, and code blocks for implementation steps.
- Type consistency: The Rust types from Task 1 are defined and exported in Task 2; `rule8072` and `qualificationFlightSegments` introduced in Task 4 are implemented by Task 5 and consumed by Task 6.
- Scope check: The plan stays focused on F8 8072 migration and does not introduce custom Gantt rendering, schema changes, dependencies, or multi-airline abstractions.
