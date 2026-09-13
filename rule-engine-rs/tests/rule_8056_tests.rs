//! C++ → Rust migration-fidelity replica for rule 8056 (ROSTER SPACING).
//!
//! Source of truth: `crewrule-dev/RuleEngine/rule8056.cpp`.
//! There is NO `rule8056_gtest.cpp` in the C++ repo (8056 has no committed gtest), so
//! this replica encodes the contract taken directly from the active checker logic
//! (`LegalityChecker::checkRosterSpaceByLableAndAtt`, rule8056.cpp:637-839):
//!
//!   interval = nextRoster.actStrUtc − currentRoster.actEndUtc
//!   violation  ⇔  interval < SPACE·3600      (strict `<`; equal is legal)
//!   message: "The spacing between ({curLabel}) and ({nextLabel}) is {H:MM},
//!             which is less than {SPACE} {UNIT}."             (rule8056.cpp:808-810)
//!
//! Instance 8056/006 (F8 "PBS Solver Ruleset"): A=FLY → B=FLY|SBY|SIM, Directional=Y,
//! UtilizePostDutyRest=Y, UNIT=RH (clock hours). The live SPACE was raised 13 → 24 RH
//! (`sql/migration/2026-06-15-rule-8056-006-add-to-103-and-24h.sql`) to surface the many
//! sub-24h turnarounds in the live roster.

use rois_rule_engine::{
    check_roster_spacing, check_roster_spacing_full, check_roster_spacing_full_with_context,
    format_hhmm, parse_utc_seconds, LocalNightDef, RosterDuty, Rule8056Duty, Rule8056Rule,
};

/// Build a FLY duty from `YYYY-MM-DDTHH:MM` start/end (UTC) + label.
fn duty(pairing_id: i64, start: &str, end: &str, label: &str) -> RosterDuty {
    RosterDuty {
        pairing_id,
        start_utc: parse_utc_seconds(start).expect("valid start"),
        end_utc: parse_utc_seconds(end).expect("valid end"),
        label: label.to_string(),
        assignment_group: "FLY".to_string(),
        assignment: "FLT".to_string(),
    }
}

// ── format_hhmm matches C++ Utility::formatMinutes (with sign for overlap) ──────────
#[test]
fn format_hhmm_matches_cpp_formatminutes() {
    assert_eq!(format_hhmm(1250), "20:50"); // 20h50m
    assert_eq!(format_hhmm(60), "1:00");
    assert_eq!(format_hhmm(5), "0:05");
    assert_eq!(format_hhmm(0), "0:00");
    assert_eq!(format_hhmm(-90), "-1:30"); // overlap → negative gap
}

// ── strict `<`: a gap exactly equal to the limit is LEGAL ───────────────────────────
#[test]
fn gap_exactly_at_limit_is_legal() {
    // Two FLY duties exactly 24:00 apart (end 12:00 → start next-day 12:00).
    let duties = [
        duty(1, "2026-06-01T08:00", "2026-06-01T12:00", "FLY-A"),
        duty(2, "2026-06-02T12:00", "2026-06-02T16:00", "FLY-B"),
    ];
    let v = check_roster_spacing("c1", &duties, 24.0);
    assert!(
        v.is_empty(),
        "exactly 24:00 must be legal under strict <, got {:?}",
        v
    );
}

// ── one sub-limit gap → exactly one violation, correct numbers + message ────────────
#[test]
fn sub_limit_gap_fires_one_violation_with_cpp_message() {
    // Gap = end 2026-06-01 00:10 → start 2026-06-01 21:00 = 20h50m (1250 min) < 24h.
    let duties = [
        duty(11381, "2026-05-31T18:50", "2026-06-01T00:10", "HKGTPE"),
        duty(11456, "2026-06-01T21:00", "2026-06-02T08:25", "HKGNRT"),
    ];
    let v = check_roster_spacing("1001", &duties, 24.0);
    assert_eq!(v.len(), 1, "one sub-24h gap → one violation");
    let viol = &v[0];
    assert_eq!(
        viol.pairing_id, 11381,
        "attributed to the EARLIER duty's pairing"
    );
    assert_eq!(viol.actual_minutes, 1250, "20:50 = 1250 minutes");
    assert_eq!(viol.limit_minutes, 24 * 60);
    assert_eq!(
        viol.message("24", "RH"),
        "The spacing between (HKGTPE) and (HKGNRT) is 20:50, which is less than 24 RH.",
    );
}

// ── the 13 → 24 migration is what flips this real-data gap to a violation ───────────
#[test]
fn live_crew1001_gap_legal_at_13h_but_violates_at_24h() {
    // crew 1001 (live June roster): pairing 11381 ends 2026-06-13 00:10, pairing 11456
    // starts 2026-06-13 21:00 → 20h50m apart. Legal under the old 13h SPACE, a violation
    // under the migrated 24h SPACE. This is the whole point of the param change.
    let duties = [
        duty(11381, "2026-06-12T18:50", "2026-06-13T00:10", "P11381"),
        duty(11456, "2026-06-13T21:00", "2026-06-14T08:25", "P11456"),
    ];
    assert!(
        check_roster_spacing("1001", &duties, 13.0).is_empty(),
        "20:50 gap is legal at 13h SPACE",
    );
    let at24 = check_roster_spacing("1001", &duties, 24.0);
    assert_eq!(at24.len(), 1, "20:50 gap violates at 24h SPACE");
    assert_eq!(at24[0].actual_minutes, 1250);
}

// ── a chain of duties: only the sub-limit gaps fire, each on its own current pairing ─
#[test]
fn chain_flags_only_sub_limit_gaps_distinct_pairings() {
    let duties = [
        // gap A→B = 20:50 (< 24)  → violation on pairing 1
        duty(1, "2026-06-01T00:00", "2026-06-01T04:00", "D1"),
        duty(2, "2026-06-02T00:50", "2026-06-02T05:00", "D2"),
        // gap B→C = 48:00 (>= 24) → legal
        duty(3, "2026-06-04T05:00", "2026-06-04T09:00", "D3"),
        // gap C→D = 02:00 (< 24)  → violation on pairing 3
        duty(4, "2026-06-04T11:00", "2026-06-04T15:00", "D4"),
    ];
    let v = check_roster_spacing("cN", &duties, 24.0);
    assert_eq!(v.len(), 2, "two sub-24h gaps fire");
    assert_eq!(v[0].pairing_id, 1);
    assert_eq!(v[0].next_label, "D2");
    assert_eq!(v[1].pairing_id, 3);
    assert_eq!(v[1].next_label, "D4");
    assert_eq!(v[1].actual_minutes, 120); // 2:00
}

// ── unsorted input is ordered internally; a single duty never violates ──────────────
#[test]
fn unsorted_input_and_single_duty() {
    let single = [duty(1, "2026-06-01T00:00", "2026-06-01T04:00", "solo")];
    assert!(check_roster_spacing("c", &single, 24.0).is_empty());

    // Same two duties as the firing test, passed in reverse order.
    let reversed = [
        duty(11456, "2026-06-01T21:00", "2026-06-02T08:25", "HKGNRT"),
        duty(11381, "2026-05-31T18:50", "2026-06-01T00:10", "HKGTPE"),
    ];
    let v = check_roster_spacing("1001", &reversed, 24.0);
    assert_eq!(v.len(), 1);
    assert_eq!(v[0].pairing_id, 11381, "sorted so earlier duty is current");
}

#[test]
fn full_rule_matches_all_duty_attributes_and_direction() {
    let rule = Rule8056Rule {
        bases: vec!["YYZ".into()],
        ranks: vec!["CA".into()],
        fleets: vec!["320".into()],
        teams: vec!["TEAM1".into()],
        attribute_a: vec!["WOCL".into()],
        label_a: vec!["FLY-A".into()],
        assignment_group_a: vec!["FLY".into()],
        assignment_a: vec!["FLT".into()],
        qualifier_a: vec!["FLT".into()],
        airport_a: vec!["YYZ".into()],
        roles_a: vec!["CA".into()],
        is_requested_a: Some(true),
        attribute_b: vec!["REST".into()],
        label_b: vec!["FLY-B".into()],
        assignment_group_b: vec!["FLY".into()],
        assignment_b: vec!["FLT".into()],
        qualifier_b: vec!["FLT".into()],
        airport_b: vec!["YYZ".into()],
        roles_b: vec!["CA".into()],
        is_requested_b: Some(false),
        space: 13.0,
        unit: "RH".into(),
        directional: true,
        location_equal_base_a: Some(true),
        location_equal_base_b: Some(false),
        utilize_post_duty_rest: false,
    };
    let duties = [
        Rule8056Duty {
            pairing_id: 1,
            start_utc: parse_utc_seconds("2026-06-01T00:00").unwrap(),
            end_utc: parse_utc_seconds("2026-06-01T04:00").unwrap(),
            post_rest_end_utc: parse_utc_seconds("2026-06-01T05:00").unwrap(),
            label: "FLY-A".into(),
            assignment_group: "FLY".into(),
            assignment: "FLT".into(),
            attribute: "WOCL".into(),
            qualifier: "FLT".into(),
            airport: "YYZ".into(),
            role: "CA".into(),
            is_requested: true,
            location: "YYZ".into(),
            crew_base: "YYZ".into(),
            pre_assigned: false,
        },
        Rule8056Duty {
            pairing_id: 2,
            start_utc: parse_utc_seconds("2026-06-01T10:00").unwrap(),
            end_utc: parse_utc_seconds("2026-06-01T12:00").unwrap(),
            post_rest_end_utc: parse_utc_seconds("2026-06-01T13:00").unwrap(),
            label: "FLY-B".into(),
            assignment_group: "FLY".into(),
            assignment: "FLT".into(),
            attribute: "REST".into(),
            qualifier: "FLT".into(),
            airport: "YYZ".into(),
            role: "CA".into(),
            is_requested: false,
            location: "YVR".into(),
            crew_base: "YYZ".into(),
            pre_assigned: false,
        },
    ];

    let violations = check_roster_spacing_full("crew-1", &duties, &rule, 0);
    assert_eq!(violations.len(), 1);
    assert_eq!(violations[0].actual_minutes, 300);
}

fn wildcard_full_rule(unit: &str, space: f64, directional: bool) -> Rule8056Rule {
    Rule8056Rule {
        bases: vec!["*".into()],
        ranks: vec!["*".into()],
        fleets: vec!["*".into()],
        teams: vec!["*".into()],
        attribute_a: vec!["A".into()],
        label_a: vec!["*".into()],
        assignment_group_a: vec!["*".into()],
        assignment_a: vec!["*".into()],
        qualifier_a: vec!["*".into()],
        airport_a: vec!["*".into()],
        roles_a: vec!["*".into()],
        is_requested_a: None,
        attribute_b: vec!["B".into()],
        label_b: vec!["*".into()],
        assignment_group_b: vec!["*".into()],
        assignment_b: vec!["*".into()],
        qualifier_b: vec!["*".into()],
        airport_b: vec!["*".into()],
        roles_b: vec!["*".into()],
        is_requested_b: None,
        space,
        unit: unit.into(),
        directional,
        location_equal_base_a: None,
        location_equal_base_b: None,
        utilize_post_duty_rest: false,
    }
}

fn attribute_duty(id: i64, start: &str, end: &str, attribute: &str) -> Rule8056Duty {
    Rule8056Duty {
        pairing_id: id,
        start_utc: parse_utc_seconds(start).unwrap(),
        end_utc: parse_utc_seconds(end).unwrap(),
        post_rest_end_utc: parse_utc_seconds(end).unwrap(),
        label: id.to_string(),
        assignment_group: "FLY".into(),
        assignment: "FLT".into(),
        attribute: attribute.into(),
        qualifier: "FLT".into(),
        airport: "YYZ".into(),
        role: "CA".into(),
        is_requested: false,
        location: "YYZ".into(),
        crew_base: "YYZ".into(),
        pre_assigned: false,
    }
}

#[test]
fn directional_n_checks_reverse_attribute_order() {
    let duties = [
        attribute_duty(1, "2026-06-01T00:00", "2026-06-01T04:00", "B"),
        attribute_duty(2, "2026-06-01T10:00", "2026-06-01T12:00", "A"),
    ];
    let rule = wildcard_full_rule("RH", 13.0, false);
    assert_eq!(
        check_roster_spacing_full("crew-1", &duties, &rule, 0).len(),
        1
    );
}

#[test]
fn full_rule_supports_calendar_days_and_local_nights() {
    let duties = [
        attribute_duty(1, "2026-06-01T00:00", "2026-06-01T04:00", "A"),
        attribute_duty(2, "2026-06-04T00:00", "2026-06-04T04:00", "B"),
    ];
    let cd = wildcard_full_rule("CD", 2.0, true);
    assert_eq!(
        check_roster_spacing_full("crew-1", &duties, &cd, 0).len(),
        0
    );

    let ln_duties = [
        attribute_duty(1, "2026-06-01T08:00", "2026-06-01T12:00", "A"),
        attribute_duty(2, "2026-06-03T08:00", "2026-06-03T12:00", "B"),
    ];
    let ln = wildcard_full_rule("LN", 3.0, true);
    let local_night = LocalNightDef {
        start_min: 22 * 60,
        end_min: 6 * 60,
        min_rest_secs: 8 * 3600,
    };
    let violations = check_roster_spacing_full_with_context(
        "crew-1",
        &ln_duties,
        &ln,
        0,
        Some(local_night),
        &[],
    )
    .unwrap();
    assert_eq!(violations.len(), 1);
}

#[test]
fn check_8056_binary_accepts_structured_input_and_applies_full_scope() {
    use std::io::Write;
    use std::process::{Command, Stdio};

    let input = [
        "R\tYYZ\tCA\t320\tTEAM1\tA\t*\tFLY\tFLT\tFLT\tYYZ\tCA\tY\tB\t*\tFLY\tFLT\tFLT\tYVR\tFO\tN\t13\tRH\tY\tY\tN\tY",
        "Q\tcrew1\tBASE\tYYZ\t0\t99999",
        "Q\tcrew1\tRANK\tCA\t0\t99999",
        "Q\tcrew1\tFLEET\t320\t0\t99999",
        "T\tcrew1\tTEAM1",
        "D\tcrew1\t101\t0\t14400\t14400\tA1\tFLY\tFLT\tA\tFLT\tYYZ\tCA\tY\tYYZ\tYYZ\tN\t0",
        "D\tcrew1\t102\t36000\t43200\t43200\tB1\tFLY\tFLT\tB\tFLT\tYVR\tFO\tN\tYVR\tYYZ\tN\t0",
        "D\tcrew2\t201\t0\t14400\t14400\tA2\tFLY\tFLT\tA\tFLT\tYYZ\tCA\tY\tYYZ\tYYZ\tN\t0",
        "D\tcrew2\t202\t36000\t43200\t43200\tB2\tFLY\tFLT\tB\tFLT\tYVR\tFO\tN\tYVR\tYYZ\tN\t0",
    ]
    .join("\n");

    let mut child = Command::new(env!("CARGO_BIN_EXE_check-8056"))
        .arg("--emit-tsv")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("spawn check-8056");
    child
        .stdin
        .as_mut()
        .expect("stdin")
        .write_all(input.as_bytes())
        .expect("write input");
    let output = child.wait_with_output().expect("wait check-8056");
    assert!(
        output.status.success(),
        "stderr={}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert_eq!(
        String::from_utf8(output.stdout).unwrap().trim(),
        "crew1\t101\t14400\t36000\t360\tA1\tB1\t0"
    );
}

#[test]
fn check_8056_binary_rejects_legacy_untyped_tsv() {
    use std::io::Write;
    use std::process::{Command, Stdio};

    let input = "crew1\t101\t0\t14400\tA\tFLY\tFLT\t0\ncrew1\t102\t36000\t43200\tB\tFLY\tFLT\t0\n";
    let mut child = Command::new(env!("CARGO_BIN_EXE_check-8056"))
        .arg("--emit-tsv")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn check-8056");
    child
        .stdin
        .as_mut()
        .expect("stdin")
        .write_all(input.as_bytes())
        .expect("write input");
    let output = child.wait_with_output().expect("wait check-8056");
    assert!(!output.status.success(), "legacy TSV must not be accepted");
    assert!(
        String::from_utf8_lossy(&output.stderr).contains("structured"),
        "stderr={}",
        String::from_utf8_lossy(&output.stderr)
    );
}

#[test]
fn full_rule_uses_post_duty_rest_only_when_disabled() {
    let duties = [
        Rule8056Duty {
            pairing_id: 1,
            start_utc: parse_utc_seconds("2026-06-01T00:00").unwrap(),
            end_utc: parse_utc_seconds("2026-06-01T04:00").unwrap(),
            post_rest_end_utc: parse_utc_seconds("2026-06-01T08:00").unwrap(),
            label: "A".into(),
            assignment_group: "FLY".into(),
            assignment: "FLT".into(),
            attribute: "A".into(),
            qualifier: "FLT".into(),
            airport: "YYZ".into(),
            role: "CA".into(),
            is_requested: false,
            location: "YYZ".into(),
            crew_base: "YYZ".into(),
            pre_assigned: true,
        },
        Rule8056Duty {
            pairing_id: 2,
            start_utc: parse_utc_seconds("2026-06-01T16:00").unwrap(),
            end_utc: parse_utc_seconds("2026-06-01T18:00").unwrap(),
            post_rest_end_utc: parse_utc_seconds("2026-06-01T18:00").unwrap(),
            label: "B".into(),
            assignment_group: "FLY".into(),
            assignment: "FLT".into(),
            attribute: "B".into(),
            qualifier: "FLT".into(),
            airport: "YYZ".into(),
            role: "CA".into(),
            is_requested: false,
            location: "YYZ".into(),
            crew_base: "YYZ".into(),
            pre_assigned: false,
        },
    ];
    let mut rule = wildcard_full_rule("RH", 10.0, true);
    rule.utilize_post_duty_rest = true;
    assert!(check_roster_spacing_full("crew-1", &duties, &rule, 0).is_empty());

    rule.utilize_post_duty_rest = false;
    assert_eq!(
        check_roster_spacing_full("crew-1", &duties, &rule, 0).len(),
        1
    );
}

#[test]
fn full_rule_ignores_fixed_pairing_only_conflicts() {
    let mut first = attribute_duty(1, "2026-06-01T00:00", "2026-06-01T04:00", "A");
    first.pre_assigned = true;
    let mut second = attribute_duty(2, "2026-06-01T04:30", "2026-06-01T05:00", "B");
    second.pre_assigned = true;
    let rule = wildcard_full_rule("RH", 2.0, true);
    assert!(check_roster_spacing_full("crew-1", &[first, second], &rule, 0).is_empty());
}

/// Reproduces the F8 8056/001 Row 2 bug: crew 12928's two 2026-09-08/09 RES duties
/// carry `assignment_group="GRD"` (RES's *primary* group) / `assignment="RES"`, while
/// Row 2 filters Group A/B = "RES" (RES's *secondary* group, per the Assignment Group
/// Map). Without consulting `group_map`, neither duty's literal assignment_group ever
/// equals "RES", so the 12h gap (< the 13h limit) went unflagged. With the map wired
/// through, "RES" assignment resolves to group "RES" too and the violation fires.
fn res_ground_duty(id: i64, start: &str, end: &str) -> Rule8056Duty {
    Rule8056Duty {
        pairing_id: id,
        start_utc: parse_utc_seconds(start).unwrap(),
        end_utc: parse_utc_seconds(end).unwrap(),
        post_rest_end_utc: parse_utc_seconds(end).unwrap(),
        label: "PRAM".into(),
        assignment_group: "GRD".into(),
        assignment: "RES".into(),
        attribute: "*".into(),
        qualifier: "RES".into(),
        airport: "YYZ".into(),
        role: "".into(),
        is_requested: false,
        location: "YYZ".into(),
        crew_base: "YYZ".into(),
        pre_assigned: false,
    }
}

fn res_res_row_rule() -> Rule8056Rule {
    let mut rule = wildcard_full_rule("RH", 13.0, true);
    rule.attribute_a = vec!["*".into()];
    rule.attribute_b = vec!["*".into()];
    rule.assignment_group_a = vec!["RES".into()];
    rule.assignment_group_b = vec!["RES".into()];
    rule.utilize_post_duty_rest = true;
    rule
}

#[test]
fn group_a_b_filter_ignores_secondary_group_without_map() {
    let duties = [
        res_ground_duty(1, "2026-09-08T08:00", "2026-09-08T20:00"),
        res_ground_duty(2, "2026-09-09T08:00", "2026-09-09T20:00"),
    ];
    let rule = res_res_row_rule();
    // No group_map supplied: assignment_group is literally "GRD", never "RES", so the
    // Group A/B = RES row cannot match either side and the 12h gap is silently missed.
    assert!(check_roster_spacing_full("crew-12928", &duties, &rule, 0).is_empty());
}

#[test]
fn group_a_b_filter_matches_via_assignment_group_map() {
    let duties = [
        res_ground_duty(1, "2026-09-08T08:00", "2026-09-08T20:00"),
        res_ground_duty(2, "2026-09-09T08:00", "2026-09-09T20:00"),
    ];
    let rule = res_res_row_rule();
    let group_map = vec![
        ("RES".to_string(), "GRD".to_string()),
        ("RES".to_string(), "RES".to_string()),
    ];
    let violations = check_roster_spacing_full_with_context(
        "crew-12928",
        &duties,
        &rule,
        0,
        None,
        &group_map,
    )
    .unwrap();
    assert_eq!(violations.len(), 1, "12h gap must violate the 13h RES→RES spacing once assignment=RES resolves to group=RES via the map");
    assert_eq!(violations[0].actual_minutes, 12 * 60);
}
