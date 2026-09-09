//! Rule 8072 C++ fidelity expectations.
//!
//! C++ source:
//! - rule8072.cpp::LegalityChecker::checkGenMinQualByFleetAndRank
//! - RuleEngineDef.h::MIN_QAL_PER_FLEET_RANK = 8072
//! Local impact fallback used because GitNexus tooling is unavailable in this environment.

use rois_rule_engine::{
    check_min_qual_by_fleet_rank, Application, Rule8072, Rule8072Crew, Rule8072Segment,
};
use std::io::Write;
use std::process::{Command, Stdio};

fn default_rule(max_limits: i32) -> Rule8072 {
    Rule8072::from_cells(&[
        "*",
        "FLY",
        "*",
        "*",
        "*",
        "*",
        "*",
        "FC-GREEN",
        "*",
        "*",
        "*",
        "0",
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
    assert!(
        out.is_empty(),
        "open planned slots can satisfy the missing qualified count"
    );
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
    let seg = segment(vec![crew("C1", "CA", &["FC-GREEN"], "CR")]);

    let mut nationality_rule = default_rule(0);
    nationality_rule.crew_nationality = "!(CA|GB)".to_string();
    assert!(
        check_min_qual_by_fleet_rank(&nationality_rule, &[seg.clone()], Application::Editor)
            .is_empty(),
        "ignored nationality exclude filter would emit an over-max violation"
    );

    let mut destination_rule = default_rule(0);
    destination_rule.destination_countries = "US|MX".to_string();
    assert!(
        check_min_qual_by_fleet_rank(&destination_rule, &[seg.clone()], Application::Editor)
            .is_empty(),
        "ignored destination include filter would emit an over-max violation"
    );

    let mut team_rule = default_rule(0);
    team_rule.crew_teams = "B|C".to_string();
    assert!(
        check_min_qual_by_fleet_rank(&team_rule, &[seg], Application::Editor).is_empty(),
        "ignored team include filter would emit an over-max violation"
    );
}

#[test]
fn optimizer_tolerates_over_max_when_all_qualified_crew_are_pa() {
    let rule = default_rule(1);
    let out = check_min_qual_by_fleet_rank(
        &rule,
        &[segment(vec![
            crew("C1", "CA", &["FC-GREEN"], "PA"),
            crew("C2", "FO", &["FC-GREEN"], "PA"),
        ])],
        Application::Optimizer,
    );
    assert!(out.is_empty());
}

#[test]
fn check_8072_cli_accepts_core_segment_tsv_shape() {
    let input = [
        "R\t0\t*\tFLY\t*\t*\t*\t*\t*\tFC-GREEN\t*\t*\t*\t0\t1",
        "S\t9001\t7001\t1\t1\t3001\tF8001\t2026-06-01\t1780000000\t1780007200\t737\tYYZ\tYVR\tFLY\tFLY\tSTD\tLONG\tCA\tCA:1|FO:1\tCA:1|FO:1\t0",
        "C\t9001\tC1\tP\tCA\tFLY\tFLY\tCA\tA\tCR\tFC-GREEN",
        "C\t9001\tC2\tP\tFO\tFLY\tFLY\tCA\tA\tCR\tFC-GREEN",
        "",
    ]
    .join("\n");

    let mut child = Command::new(env!("CARGO_BIN_EXE_check-8072"))
        .arg("--emit-tsv")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn check-8072");
    child
        .stdin
        .as_mut()
        .expect("stdin")
        .write_all(input.as_bytes())
        .expect("write input");
    drop(child.stdin.take());
    let output = child.wait_with_output().expect("check-8072 output");

    assert!(
        output.status.success(),
        "stderr={}",
        String::from_utf8_lossy(&output.stderr)
    );
    let stdout = String::from_utf8(output.stdout).expect("utf8 stdout");
    assert!(
        stdout.starts_with(
            "V\t0\tC1\t7001\t9001\t1\t1780000000\t1780007200\tF8001\t737\t*\t2\t2\t2\t0\t1\t1"
        ),
        "stdout={stdout:?}"
    );
}
