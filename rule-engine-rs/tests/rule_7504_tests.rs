//! C++ → Rust migration-fidelity replica for rule 7504 (SPACING RULE - WOCL).
//!
//! Source of truth: `crewrule-dev/RuleEngine/rule/rule7504/CheckMinSpaceBetweenDutyForF8Rule.cpp`
//! + `CheckMinSpaceBetweenDutyForF8RuleParam.cpp` (`CheckMinRest`).
//! Oracle: `crewrule-dev/RuleTest/rule7504_gtest.cpp` — the WOCL window is evaluated in
//! CREW-BASE-local time; two WOCL duties spaced below Min Period RH are rejected.
//!
//! F8 7504/003: Prev=FLY, Next=FLY, Prev/Next Attributes=WOCL, Level=D, Utilize Post Rest=Y,
//! Min Period=55 RH → raised to 80 in workset 103
//! (`sql/migration/2026-06-15-rule-7504-003-add-to-103-minperiod-80.sql`). WOCL window
//! 02:00–05:59 (matching 7503).

use rois_rule_engine::rules::rule7504::{
    check_rule7504_structured, Rule7504CrewContext, Rule7504Duty, Rule7504Row,
};
use rois_rule_engine::{
    check_min_space_wocl, check_min_space_wocl_cd, format_local_dt, BaseQual, WoclSpacingDuty,
};

const WOCL_START: i64 = 120; // 02:00
const WOCL_END: i64 = 359; // 05:59
const YEG: i64 = -360; // YEG (MDT, June) offset: minutes east of UTC

/// A flight duty from UTC timestamps with the YEG base offset.
fn duty(pairing: i64, start_utc: &str, end_utc: &str) -> WoclSpacingDuty {
    use rois_rule_engine::parse_utc_seconds;
    WoclSpacingDuty {
        pairing_id: pairing,
        start_utc: parse_utc_seconds(start_utc).expect("start"),
        end_utc: parse_utc_seconds(end_utc).expect("end"),
        offset_min: YEG,
    }
}

fn structured_row(unit: &str, min_period: i64) -> Rule7504Row {
    Rule7504Row {
        prev_assignment_groups: vec!["FLY".to_string()],
        next_assignment_groups: vec!["FLY".to_string()],
        prev_assignments: vec!["FLY".to_string()],
        next_assignments: vec!["FLY".to_string()],
        prev_attributes: vec!["WOCL".to_string()],
        next_attributes: vec!["WOCL".to_string()],
        apply_prelabelled_attributes: true,
        utilize_post_rest: false,
        bases: vec!["*".to_string()],
        ranks: vec!["*".to_string()],
        fleets: vec!["*".to_string()],
        teams: vec!["*".to_string()],
        level: "D".to_string(),
        min_period,
        unit: unit.to_string(),
        wocl_window: Some((WOCL_START, WOCL_END)),
    }
}

fn structured_duty(
    pairing_id: i64,
    start_utc: &str,
    end_duty_utc: &str,
    end_including_rest_utc: &str,
    attributes: &str,
) -> Rule7504Duty {
    use rois_rule_engine::parse_utc_seconds;
    let start_utc = parse_utc_seconds(start_utc).expect("start");

    Rule7504Duty {
        pairing_id,
        start_utc,
        end_duty_utc: parse_utc_seconds(end_duty_utc).expect("duty end"),
        end_including_rest_utc: parse_utc_seconds(end_including_rest_utc).expect("rest end"),
        day_ord: start_utc.div_euclid(86_400),
        offset_min: YEG,
        assignment_group: "FLY".to_string(),
        assignment: "FLY".to_string(),
        attributes: attributes.to_string(),
        is_pre_assigned: false,
    }
}

// ── gtest: daytime ground/flight reserves (YEG local 14:00–23:59) are NOT WOCL ──────────
#[test]
fn daytime_duties_are_not_wocl_no_violation() {
    // YEG local 14:00→23:59 == UTC 20:00 → next-day 05:59. In crew-base local time this does
    // NOT overlap 02:00–05:59, so neither duty is WOCL → no spacing check, even <55h apart.
    let duties = [
        duty(1, "2026-05-24T20:00", "2026-05-25T05:59"),
        duty(2, "2026-05-25T20:00", "2026-05-26T05:59"),
    ];
    assert!(
        check_min_space_wocl("c", &duties, WOCL_START, WOCL_END, 55).is_empty(),
        "daytime (14:00–23:59 local) duties are not WOCL → 7504 must not fire"
    );
}

// ── gtest positive control: overnight WOCL duties (YEG local 00:00–05:00) <55h apart fire ─
#[test]
fn overnight_wocl_duties_under_55h_fire_with_cpp_message() {
    // YEG local 00:00→05:00 == UTC 06:00 → 11:00 → overlaps 02:00–05:59 → WOCL.
    // Gap May24 11:00Z → May25 06:00Z = 19h < 55 RH → violation.
    let duties = [
        duty(101, "2026-05-24T06:00", "2026-05-24T11:00"),
        duty(202, "2026-05-25T06:00", "2026-05-25T11:00"),
    ];
    let v = check_min_space_wocl("c", &duties, WOCL_START, WOCL_END, 55);
    assert_eq!(
        v.len(),
        1,
        "two WOCL duties 19h apart violate the 55 RH spacing"
    );
    assert_eq!(
        v[0].pairing_id, 101,
        "attributed to the earlier duty's pairing"
    );
    assert_eq!(v[0].actual_minutes, 19 * 60);
    assert_eq!(v[0].limit_minutes, 55 * 60);
    // Local-time message (gap start = duty end local 05:00; gap end = next start local 00:00).
    assert_eq!(format_local_dt(v[0].gap_start_utc, YEG), "2026-05-24 05:00");
    assert_eq!(
        v[0].message("55", "RH"),
        "The space between duty(2026-05-24 05:00 - 2026-05-25 00:00) is less than the minumum rest time (55 RH).",
    );
}

// ── strict `<`: a gap exactly at the limit is legal ─────────────────────────────────────
#[test]
fn gap_exactly_at_limit_is_legal() {
    // 1st WOCL duty ends May24 11:00Z; the 2nd starts exactly 55h later (May26 18:00Z) and
    // runs to May27 11:00Z — its local span (12:00 → next-day 05:00) overlaps 02:00–05:59 so
    // it too is WOCL. gap == 55h exactly → legal under strict `<`.
    let wocl_pair = [
        duty(1, "2026-05-24T06:00", "2026-05-24T11:00"),
        duty(2, "2026-05-26T18:00", "2026-05-27T11:00"),
    ];
    assert!(
        check_min_space_wocl("c", &wocl_pair, WOCL_START, WOCL_END, 55).is_empty(),
        "a gap of exactly 55h is legal under strict <"
    );
}

// ── THE 55→80 MIGRATION: a 67h gap is legal at Min 55 but a violation at Min 80 ─────────
#[test]
fn gap_67h_legal_at_55_fires_at_80() {
    // Two WOCL duties (YEG local 00:00–05:00) with end May24 11:00Z → start May27 06:00Z = 67h.
    let duties = [
        duty(11, "2026-05-24T06:00", "2026-05-24T11:00"),
        duty(22, "2026-05-27T06:00", "2026-05-27T11:00"),
    ];
    assert!(
        check_min_space_wocl("c", &duties, WOCL_START, WOCL_END, 55).is_empty(),
        "67h ≥ 55 RH → legal at the old Min Period"
    );
    let v = check_min_space_wocl("c", &duties, WOCL_START, WOCL_END, 80);
    assert_eq!(
        v.len(),
        1,
        "67h < 80 RH → violation at the migrated Min Period"
    );
    assert_eq!(v[0].actual_minutes, 67 * 60);
    assert_eq!(v[0].limit_minutes, 80 * 60);
}

// ── only consecutive WOCL pairs in the filtered sequence; a single WOCL duty never fires ─
#[test]
fn single_wocl_duty_and_ordering() {
    let single = [duty(1, "2026-05-24T06:00", "2026-05-24T11:00")];
    assert!(check_min_space_wocl("c", &single, WOCL_START, WOCL_END, 80).is_empty());
    // Unsorted input is ordered internally; the earlier duty is the triggering pairing.
    let reversed = [
        duty(22, "2026-05-25T06:00", "2026-05-25T11:00"),
        duty(11, "2026-05-24T06:00", "2026-05-24T11:00"),
    ];
    let v = check_min_space_wocl("c", &reversed, WOCL_START, WOCL_END, 55);
    assert_eq!(v.len(), 1);
    assert_eq!(v[0].pairing_id, 11, "sorted so the earlier duty triggers");
}

// ── Unit=CD: calendar-day CheckMinRest (crew-base offset); RH API untouched ─────────────
#[test]
fn cd_overnight_wocl_under_2_days_fires() {
    // Same overnight WOCL pair as the RH gtest (~19h / same local days).
    // gap_start May24 11:00Z → YEG dayStart = May24 06:00Z; minRestEnd for 2 CD = May27 06:00Z.
    // gap_end May25 06:00Z < May27 06:00Z → violate; actual_days = 0.
    let duties = [
        duty(101, "2026-05-24T06:00", "2026-05-24T11:00"),
        duty(202, "2026-05-25T06:00", "2026-05-25T11:00"),
    ];
    let v = check_min_space_wocl_cd("c", &duties, WOCL_START, WOCL_END, 2);
    assert_eq!(v.len(), 1);
    assert_eq!(v[0].pairing_id, 101);
    assert_eq!(
        v[0].actual_minutes, 0,
        "CD path stores calendar days in actual_minutes"
    );
    assert_eq!(v[0].limit_minutes, 2);
    // RH path still sees hours for the same duties.
    let rh = check_min_space_wocl("c", &duties, WOCL_START, WOCL_END, 55);
    assert_eq!(rh[0].actual_minutes, 19 * 60);
}

#[test]
fn cd_gap_exactly_at_limit_is_legal() {
    // minPeriod=2 CD → minRestEnd = dayStart(May24 11:00Z) + 3d = May27 06:00Z.
    // Next WOCL starts exactly then → legal under strict `<`.
    let duties = [
        duty(1, "2026-05-24T06:00", "2026-05-24T11:00"),
        duty(2, "2026-05-27T06:00", "2026-05-27T11:00"),
    ];
    assert!(
        check_min_space_wocl_cd("c", &duties, WOCL_START, WOCL_END, 2).is_empty(),
        "gap_end == minRestEnd is legal for CD"
    );
}

#[test]
fn structured_7504_filters_by_assignment_group_and_attribute() {
    let row = structured_row("RH", 55);
    let crew = Rule7504CrewContext::default();
    let missing_attribute = [
        structured_duty(
            101,
            "2026-05-24T06:00",
            "2026-05-24T11:00",
            "2026-05-24T11:00",
            "",
        ),
        structured_duty(
            202,
            "2026-05-25T06:00",
            "2026-05-25T11:00",
            "2026-05-25T11:00",
            "WOCL",
        ),
    ];
    assert!(
        check_rule7504_structured(
            "c",
            &row,
            &crew,
            &missing_attribute,
            None,
            rois_rule_engine::Application::Editor
        )
        .is_empty(),
        "prelabelled WOCL row must not fire unless both duties carry matching attributes",
    );

    let matching_attributes = [
        structured_duty(
            101,
            "2026-05-24T06:00",
            "2026-05-24T11:00",
            "2026-05-24T11:00",
            "WOCL",
        ),
        structured_duty(
            202,
            "2026-05-25T06:00",
            "2026-05-25T11:00",
            "2026-05-25T11:00",
            "WOCL",
        ),
    ];
    let violations = check_rule7504_structured(
        "c",
        &row,
        &crew,
        &matching_attributes,
        None,
        rois_rule_engine::Application::Editor,
    );
    assert_eq!(violations.len(), 1);
    assert_eq!(violations[0].pairing_id, 101);
    assert_eq!(violations[0].actual_minutes, 19 * 60);
    assert_eq!(violations[0].limit_minutes, 55 * 60);
}

#[test]
fn structured_7504_uses_post_rest_when_requested() {
    let mut row = structured_row("RH", 55);
    row.utilize_post_rest = true;
    let crew = Rule7504CrewContext::default();
    let duties = [
        structured_duty(
            101,
            "2026-05-24T06:00",
            "2026-05-24T11:00",
            "2026-05-26T00:00",
            "WOCL",
        ),
        structured_duty(
            202,
            "2026-05-26T18:00",
            "2026-05-27T11:00",
            "2026-05-27T11:00",
            "WOCL",
        ),
    ];
    let violations = check_rule7504_structured(
        "c",
        &row,
        &crew,
        &duties,
        None,
        rois_rule_engine::Application::Editor,
    );
    assert_eq!(
        violations.len(),
        0,
        "utilize_post_rest=true must measure from duty end; the exact 55h gap is legal",
    );
}

#[test]
fn structured_7504_uses_end_including_rest_when_not_requested() {
    let mut row = structured_row("RH", 55);
    row.utilize_post_rest = false;
    let crew = Rule7504CrewContext::default();
    let duties = [
        structured_duty(
            101,
            "2026-05-24T06:00",
            "2026-05-24T11:00",
            "2026-05-26T00:00",
            "WOCL",
        ),
        structured_duty(
            202,
            "2026-05-26T18:00",
            "2026-05-27T11:00",
            "2026-05-27T11:00",
            "WOCL",
        ),
    ];
    let violations = check_rule7504_structured(
        "c",
        &row,
        &crew,
        &duties,
        None,
        rois_rule_engine::Application::Editor,
    );
    assert_eq!(
        violations.len(),
        1,
        "utilize_post_rest=false must measure from end including rest, so the post-rest boundary makes this pair illegal",
    );
    assert_eq!(violations[0].actual_minutes, 18 * 60);
    assert_eq!(violations[0].limit_minutes, 55 * 60);
}

#[test]
fn structured_7504_cd_and_rh_units_share_the_same_row_model() {
    let crew = Rule7504CrewContext::default();
    let duties = [
        structured_duty(
            101,
            "2026-05-24T06:00",
            "2026-05-24T11:00",
            "2026-05-24T11:00",
            "WOCL",
        ),
        structured_duty(
            202,
            "2026-05-25T06:00",
            "2026-05-25T11:00",
            "2026-05-25T11:00",
            "WOCL",
        ),
    ];

    let rh = check_rule7504_structured(
        "c",
        &structured_row("RH", 55),
        &crew,
        &duties,
        None,
        rois_rule_engine::Application::Editor,
    );
    assert_eq!(rh.len(), 1);
    assert_eq!(rh[0].actual_minutes, 19 * 60);
    assert_eq!(rh[0].limit_minutes, 55 * 60);

    let cd = check_rule7504_structured(
        "c",
        &structured_row("CD", 2),
        &crew,
        &duties,
        None,
        rois_rule_engine::Application::Editor,
    );
    assert_eq!(cd.len(), 1);
    assert_eq!(cd[0].actual_minutes, 0);
    assert_eq!(cd[0].limit_minutes, 2);
}

#[test]
fn structured_7504_applies_qualification_and_team_scope() {
    let mut row = structured_row("RH", 55);
    row.bases = vec!["YVR".to_string()];
    row.ranks = vec!["CA".to_string()];
    row.fleets = vec!["737".to_string()];
    row.teams = vec!["TEAM-A".to_string()];
    let duties = [
        structured_duty(
            101,
            "2026-05-24T06:00",
            "2026-05-24T11:00",
            "2026-05-24T11:00",
            "WOCL",
        ),
        structured_duty(
            202,
            "2026-05-25T06:00",
            "2026-05-25T11:00",
            "2026-05-25T11:00",
            "WOCL",
        ),
    ];
    let matching_crew = Rule7504CrewContext {
        base_quals: vec![BaseQual {
            base: "YVR".into(),
            eff_ord: Some(20_000),
            exp_ord: Some(21_000),
        }],
        rank_quals: vec![BaseQual {
            base: "CA".into(),
            eff_ord: Some(20_000),
            exp_ord: Some(21_000),
        }],
        fleet_quals: vec![BaseQual {
            base: "737".into(),
            eff_ord: Some(20_000),
            exp_ord: Some(21_000),
        }],
        teams: vec!["TEAM-A".into()],
    };
    let violations = check_rule7504_structured(
        "c",
        &row,
        &matching_crew,
        &duties,
        None,
        rois_rule_engine::Application::Editor,
    );
    assert_eq!(violations.len(), 1);

    let expired_base = Rule7504CrewContext {
        base_quals: vec![BaseQual {
            base: "YVR".into(),
            eff_ord: Some(20_000),
            exp_ord: Some(20_500),
        }],
        ..matching_crew.clone()
    };
    assert!(
        check_rule7504_structured(
            "c",
            &row,
            &expired_base,
            &duties,
            None,
            rois_rule_engine::Application::Editor,
        )
        .is_empty(),
        "non-wildcard qualification filters must respect effective windows",
    );

    let wrong_team = Rule7504CrewContext {
        teams: vec!["TEAM-B".into()],
        ..matching_crew
    };
    assert!(
        check_rule7504_structured(
            "c",
            &row,
            &wrong_team,
            &duties,
            None,
            rois_rule_engine::Application::Editor,
        )
        .is_empty(),
        "non-wildcard Crew Teams must not silently wildcard when the crew lacks the team",
    );
}

#[test]
fn check_7504_binary_accepts_structured_tagged_input() {
    use std::io::Write;
    use std::process::{Command, Stdio};

    let start_a = rois_rule_engine::parse_utc_seconds("2026-05-24T06:00").expect("start a");
    let end_a = rois_rule_engine::parse_utc_seconds("2026-05-24T11:00").expect("end a");
    let start_b = rois_rule_engine::parse_utc_seconds("2026-05-25T06:00").expect("start b");
    let end_b = rois_rule_engine::parse_utc_seconds("2026-05-25T11:00").expect("end b");
    let input = format!(
        "R\tFLY\tFLY\tFLY\tFLY\tWOCL\tWOCL\tY\tN\t*\t*\t*\t*\tD\t55\tRH\t{WOCL_START}\t{WOCL_END}\n\
         D\tc\t101\t{start_a}\t{end_a}\t{end_a}\t{}\t{YEG}\tFLY\tFLY\tWOCL\tN\n\
         D\tc\t202\t{start_b}\t{end_b}\t{end_b}\t{}\t{YEG}\tFLY\tFLY\tWOCL\tN\n",
        start_a.div_euclid(86_400),
        start_b.div_euclid(86_400),
    );

    let mut child = Command::new(env!("CARGO_BIN_EXE_check-7504"))
        .arg("--emit-tsv")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("spawn check-7504");
    child
        .stdin
        .as_mut()
        .expect("stdin")
        .write_all(input.as_bytes())
        .expect("write structured input");
    let output = child.wait_with_output().expect("wait");
    assert!(
        output.status.success(),
        "check-7504 failed: {}",
        String::from_utf8_lossy(&output.stderr),
    );
    let stdout = String::from_utf8(output.stdout).expect("utf8 stdout");
    let rows: Vec<&str> = stdout.lines().collect();
    assert_eq!(rows.len(), 1, "expected one violation row, got {stdout:?}");
    assert!(
        rows[0].starts_with("c\t101\t"),
        "unexpected row: {}",
        rows[0]
    );
    assert!(
        rows[0].ends_with("\t1140"),
        "unexpected actual minutes: {}",
        rows[0]
    );
}

#[test]
fn check_7504_binary_applies_structured_qualification_and_team_rows() {
    use std::io::Write;
    use std::process::{Command, Stdio};

    let start_a = rois_rule_engine::parse_utc_seconds("2026-05-24T06:00").expect("start a");
    let end_a = rois_rule_engine::parse_utc_seconds("2026-05-24T11:00").expect("end a");
    let start_b = rois_rule_engine::parse_utc_seconds("2026-05-25T06:00").expect("start b");
    let end_b = rois_rule_engine::parse_utc_seconds("2026-05-25T11:00").expect("end b");
    let day = start_a.div_euclid(86_400);
    let input = format!(
        "R\tFLY\tFLY\tFLY\tFLY\tWOCL\tWOCL\tY\tN\tYVR\tCA\t737\tTEAM-A\tD\t55\tRH\t{WOCL_START}\t{WOCL_END}\n\
         D\tc\t101\t{start_a}\t{end_a}\t{end_a}\t{day}\t{YEG}\tFLY\tFLY\tWOCL\tN\n\
         D\tc\t202\t{start_b}\t{end_b}\t{end_b}\t{}\t{YEG}\tFLY\tFLY\tWOCL\tN\n\
         Q\tc\tBASE\tYVR\t{}\t{}\n\
         Q\tc\tRANK\tCA\t{}\t{}\n\
         Q\tc\tFLEET\t737\t{}\t{}\n\
         T\tc\tTEAM-A\n",
        start_b.div_euclid(86_400),
        day - 1,
        day + 10,
        day - 1,
        day + 10,
        day - 1,
        day + 10,
    );

    let mut child = Command::new(env!("CARGO_BIN_EXE_check-7504"))
        .arg("--emit-tsv")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("spawn check-7504");
    child
        .stdin
        .as_mut()
        .expect("stdin")
        .write_all(input.as_bytes())
        .expect("write structured input");
    let output = child.wait_with_output().expect("wait");
    assert!(
        output.status.success(),
        "check-7504 failed: {}",
        String::from_utf8_lossy(&output.stderr),
    );
    let stdout = String::from_utf8(output.stdout).expect("utf8 stdout");
    let rows: Vec<&str> = stdout.lines().collect();
    assert_eq!(
        rows.len(),
        1,
        "expected qualified crew to violate, got {stdout:?}"
    );
    assert!(
        rows[0].starts_with("c\t101\t"),
        "unexpected row: {}",
        rows[0]
    );
}
