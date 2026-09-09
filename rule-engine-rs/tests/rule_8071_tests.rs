//! Rule 8071 C++ fidelity expectations.
//!
//! Source of truth:
//! - `rule8071.cpp::LegalityChecker::checkMaxRosterProperties`
//! - `RuleParseParams.cpp::parseRuleParam8071`
//! - `Utility.cpp::howManyRostersInRange2`, `howManyDutiesInRange`, and
//!   `howManyFlightsInRange`
//!
//! C++ contract captured for the Rust port:
//! - The parser reads 19 columns in the new format; legacy 17/18-column rows
//!   remain accepted with `Assignments` and/or `Countries` treated as `*`.
//! - `COUNTRIES` is a pairing-level gate over arrival-airport country codes:
//!   `CA|US` means "at least one country in the set", `!(CA+US)` means
//!   "at least one country outside the set", `*` or blank disables it.
//! - A crew is checked over generated date windows and violates when
//!   `count > Max Times`, or when `count < Min Times` outside the optimizer
//!   and `Min Times > 0`.
//! - `Check Mode = F` uses flight-level counting and divides matched sectors
//!   by 2 without rounding.
//! - `Check Mode = D` counts matched duties.
//! - Any other mode, including `P` or `*`, uses roster/pairing-level counting.
//! - C++ range helpers count partial roster/duty overlaps as 0.5; the tests
//!   below lock the F8 default and core count-mode behavior needed by the
//!   current migration.

use rois_rule_engine::{
    check_roster_properties_row, Application, RosterPropertyActivity, Rule8071, Rule8071Mode,
};
use std::io::Write;
use std::process::{Command, Stdio};

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
        assignment: "*".to_string(),
        qualifier: "*".to_string(),
        flight_number: flight_number.to_string(),
        destination: destination.to_string(),
        position: position.to_string(),
        destination_country: String::new(),
    }
}

fn default_rule(max_times: f64) -> Rule8071 {
    Rule8071::from_cells(&[
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "FLY",
        "*",
        "*",
        "*",
        "*",
        "1",
        "CM",
        &max_times.to_string(),
        "0",
        "*",
    ])
    .expect("valid 8071 row")
}

fn rule_with_countries(countries: &str, max_times: f64) -> Rule8071 {
    Rule8071::from_cells(&[
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "FLY",
        "*",
        "*",
        "*",
        countries,
        "*",
        "1",
        "CM",
        &max_times.to_string(),
        "0",
        "*",
    ])
    .expect("valid 8071 row")
}

fn act_country(
    crew_id: &str,
    pairing_id: i64,
    duty_seq: i64,
    segment_id: i64,
    start_utc: i64,
    flight_number: &str,
    country: &str,
) -> RosterPropertyActivity {
    let mut activity = act(
        crew_id,
        pairing_id,
        duty_seq,
        segment_id,
        start_utc,
        "FLY",
        flight_number,
        "YVR",
        "CA",
    );
    activity.destination_country = country.to_string();
    activity
}

#[test]
fn parser_accepts_the_17_column_f8_default_row() {
    let rule = default_rule(11.0);
    assert_eq!(rule.assignment_groups, vec!["FLY"]);
    assert_eq!(rule.assignments, vec!["*"]);
    assert_eq!(rule.flights, vec!["*"]);
    assert_eq!(rule.period, 1);
    assert_eq!(rule.unit.as_str(), "CM");
    assert_eq!(rule.max_times, 11.0);
    assert_eq!(rule.min_times, 0.0);
    assert_eq!(rule.mode, Rule8071Mode::Roster);
}

#[test]
fn parser_accepts_the_18_column_row_with_countries() {
    let rule = rule_with_countries("CA|US", 11.0);
    assert_eq!(rule.assignments, vec!["*"]);
    assert_eq!(rule.destinations, vec!["*"]);
    assert_eq!(rule.positions, vec!["*"]);
    assert_eq!(rule.max_times, 11.0);
}

#[test]
fn parser_accepts_the_19_column_row_with_assignments_and_countries() {
    let rule = Rule8071::from_cells(&[
        "*", "*", "*", "*", "*", "*", "*", "FLY", "FLT", "QUAL", "*", "YVR", "CA|US", "CA",
        "1", "CM", "11", "0", "R",
    ])
    .expect("valid 8071 row");

    assert_eq!(rule.assignment_groups, vec!["FLY"]);
    assert_eq!(rule.assignments, vec!["FLT"]);
    assert_eq!(rule.qualifiers, vec!["QUAL"]);
    assert_eq!(rule.destinations, vec!["YVR"]);
    assert_eq!(rule.positions, vec!["CA"]);
    assert_eq!(rule.period, 1);
    assert_eq!(rule.unit.as_str(), "CM");
    assert_eq!(rule.max_times, 11.0);
    assert_eq!(rule.min_times, 0.0);
    assert_eq!(rule.mode, Rule8071Mode::Roster);
}

#[test]
fn assignments_filter_matches_assignment_code_independently_from_group() {
    let rule = Rule8071::from_cells(&[
        "*", "*", "*", "*", "*", "*", "*", "FLY", "FLT", "*", "*", "*", "*", "*", "31",
        "CD", "1", "0", "R",
    ])
    .expect("valid 8071 row with assignments");

    let mut flt = act(
        "C1",
        100,
        1,
        1001,
        1_780_000_000,
        "FLY",
        "F1",
        "YVR",
        "CA",
    );
    flt.assignment = "FLT".to_string();
    let mut dhd = act(
        "C1",
        101,
        1,
        1002,
        1_780_086_400,
        "FLY",
        "F2",
        "YVR",
        "CA",
    );
    dhd.assignment = "DHD".to_string();

    let violations = check_roster_properties_row(
        "C1",
        &rule,
        &[flt, dhd],
        1_780_000_000,
        1_782_863_999,
        &[],
        Application::Editor,
    );

    assert!(
        violations.is_empty(),
        "DHD must not count under Assignments=FLT"
    );
}

#[test]
fn flights_star_does_not_filter_out_flight_numbers() {
    let rule = default_rule(1.0);
    let rows = vec![
        act("C1", 1, 1, 1, 1_780_000_000, "FLY", "0031", "YVR", "CA"),
        act("C1", 2, 1, 2, 1_780_086_400, "FLY", "7777", "YYZ", "CA"),
    ];
    let out = check_roster_properties_row(
        "C1",
        &rule,
        &rows,
        1_779_811_200,
        1_782_403_199,
        &[],
        Application::Editor,
    );
    assert_eq!(out.len(), 1);
    assert_eq!(out[0].actual_count, 2.0);
}

#[test]
fn countries_positive_match_requires_at_least_one_arrival_country_hit() {
    let rule = rule_with_countries("CA|US", 0.0);
    let rows = vec![
        act_country("C1", 1, 1, 1, 1_780_000_000, "0031", "CA"),
        act_country("C1", 1, 1, 2, 1_780_003_600, "0032", "MX"),
    ];
    let out = check_roster_properties_row(
        "C1",
        &rule,
        &rows,
        1_779_811_200,
        1_782_403_199,
        &[],
        Application::Editor,
    );
    assert_eq!(out.len(), 1);
    assert_eq!(out[0].actual_count, 1.0);
}

#[test]
fn countries_negative_match_requires_a_non_whitelisted_arrival_country() {
    let rule = rule_with_countries("!(CA+US)", 0.0);
    let rows = vec![
        act_country("C1", 1, 1, 1, 1_780_000_000, "0031", "CA"),
        act_country("C1", 2, 1, 2, 1_780_003_600, "0032", "US"),
        act_country("C1", 3, 1, 3, 1_780_007_200, "0033", "MX"),
    ];
    let out = check_roster_properties_row(
        "C1",
        &rule,
        &rows,
        1_779_811_200,
        1_782_403_199,
        &[],
        Application::Editor,
    );
    assert_eq!(out.len(), 1);
    assert_eq!(out[0].actual_count, 1.0);
}

#[test]
fn countries_missing_or_wildcard_disables_filtering() {
    let wildcard = rule_with_countries("*", 0.0);
    let blank = rule_with_countries("", 0.0);
    let rows = vec![act(
        "C1",
        1,
        1,
        1,
        1_780_000_000,
        "FLY",
        "0031",
        "YVR",
        "CA",
    )];
    assert_eq!(
        check_roster_properties_row(
            "C1",
            &wildcard,
            &rows,
            1_779_811_200,
            1_782_403_199,
            &[],
            Application::Editor,
        )[0]
        .actual_count,
        1.0
    );
    assert_eq!(
        check_roster_properties_row(
            "C1",
            &blank,
            &rows,
            1_779_811_200,
            1_782_403_199,
            &[],
            Application::Editor,
        )[0]
        .actual_count,
        1.0
    );
}

#[test]
fn roster_mode_counts_distinct_pairings_and_exactly_max_is_legal() {
    let rule = default_rule(11.0);
    let rows: Vec<_> = (0..11)
        .map(|i| {
            act(
                "C1",
                100 + i,
                1,
                i,
                1_780_272_000 + i * 86_400,
                "FLY",
                "0031",
                "YVR",
                "CA",
            )
        })
        .collect();
    let out = check_roster_properties_row(
        "C1",
        &rule,
        &rows,
        1_780_272_000,
        1_782_863_999,
        &[],
        Application::Editor,
    );
    assert!(out.is_empty(), "count == Max Times is legal");
}

#[test]
fn roster_mode_emits_when_count_exceeds_max() {
    let rule = default_rule(11.0);
    let rows: Vec<_> = (0..12)
        .map(|i| {
            act(
                "C1",
                200 + i,
                1,
                i,
                1_780_272_000 + i * 86_400,
                "FLY",
                "0031",
                "YVR",
                "CA",
            )
        })
        .collect();
    let out = check_roster_properties_row(
        "C1",
        &rule,
        &rows,
        1_780_272_000,
        1_782_863_999,
        &[],
        Application::Editor,
    );
    assert_eq!(out.len(), 1);
    assert_eq!(out[0].actual_count, 12.0);
    assert!(out[0].over);
}

#[test]
fn cm_windows_start_at_calendar_month_start_not_checked_start() {
    let rule = default_rule(11.0);
    let mut rows = vec![act(
        "C1",
        300,
        1,
        1,
        1_780_272_000,
        "FLY",
        "0031",
        "YVR",
        "CA",
    )];
    rows.extend((0..11).map(|i| {
        act(
            "C1",
            301 + i,
            1,
            2 + i,
            1_781_049_600 + i * 86_400,
            "FLY",
            "0031",
            "YVR",
            "CA",
        )
    }));

    let out = check_roster_properties_row(
        "C1",
        &rule,
        &rows,
        1_781_049_600,
        1_782_863_999,
        &[],
        Application::Editor,
    );

    assert_eq!(out.len(), 1);
    assert_eq!(out[0].window_start_utc, 1_780_272_000);
    assert_eq!(out[0].window_end_utc, 1_782_863_999);
    assert_eq!(out[0].actual_count, 12.0);
    assert!(out[0].over);
}

#[test]
fn duty_mode_counts_distinct_pairing_duty_pairs() {
    let mut rule = default_rule(2.0);
    rule.mode = Rule8071Mode::Duty;
    let rows = vec![
        act("C1", 1, 1, 1, 1_780_272_000, "FLY", "0031", "YVR", "CA"),
        act("C1", 1, 1, 2, 1_780_275_600, "FLY", "0032", "YVR", "CA"),
        act("C1", 1, 2, 3, 1_780_358_400, "FLY", "0033", "YVR", "CA"),
        act("C1", 2, 1, 4, 1_780_444_800, "FLY", "0034", "YVR", "CA"),
    ];
    let out = check_roster_properties_row(
        "C1",
        &rule,
        &rows,
        1_780_272_000,
        1_782_863_999,
        &[],
        Application::Editor,
    );
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
    let out = check_roster_properties_row(
        "C1",
        &rule,
        &rows,
        1_779_811_200,
        1_782_403_199,
        &[],
        Application::Editor,
    );
    assert_eq!(out[0].actual_count, 1.5);
}

#[test]
fn under_min_fires_in_editor_but_not_optimizer() {
    let mut rule = default_rule(99.0);
    rule.min_times = 2.0;
    let rows = vec![act(
        "C1",
        1,
        1,
        1,
        1_780_272_000,
        "FLY",
        "0031",
        "YVR",
        "CA",
    )];
    let editor = check_roster_properties_row(
        "C1",
        &rule,
        &rows,
        1_780_272_000,
        1_782_863_999,
        &[],
        Application::Editor,
    );
    let optimizer = check_roster_properties_row(
        "C1",
        &rule,
        &rows,
        1_780_272_000,
        1_782_863_999,
        &[],
        Application::Optimizer,
    );
    assert_eq!(editor.len(), 1);
    assert!(!editor[0].over);
    assert!(optimizer.is_empty());
}

#[test]
fn check_8071_cli_accepts_blank_trailing_position_column() {
    let bin = env!("CARGO_BIN_EXE_check-8071");
    let input = concat!(
        "C\t1780272000\t1783036799\n",
        "R\t0\t*\t*\t*\t*\t*\t*\t*\tFLY\t*\t*\t*\t*\t1\tCM\t0\t0\t*\n",
        "A\t815\t10573\t3\t86572\t1780279200\t1780287900\tYOW|YUL|YYZ\tFO\t737\t*\tF8655 YHZ-YYZ\t*\t*\tFLY\tDHD\tF8655\tYYZ\t\n",
    );
    let mut child = Command::new(bin)
        .arg("--emit-tsv")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("spawn check-8071");
    child
        .stdin
        .as_mut()
        .expect("stdin")
        .write_all(input.as_bytes())
        .expect("write stdin");
    let output = child.wait_with_output().expect("wait check-8071");

    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout).expect("utf8 stdout");
    assert!(
        stdout
            .lines()
            .any(|line| line.starts_with("V\t815\t0\t10573\t")),
        "expected one violation, got stdout: {stdout}",
    );
}

#[test]
fn check_8071_cli_filters_new_assignment_column() {
    let bin = env!("CARGO_BIN_EXE_check-8071");
    let input = concat!(
        "C\t1780272000\t1783036799\n",
        "R\t0\t*\t*\t*\t*\t*\t*\t*\tFLY\tFLT\t*\t*\t*\t*\t*\t31\tCD\t0\t0\tR\n",
        "A\tC1\t100\t1\t1001\t1780279200\t1780282800\tYYZ\tCA\t737\t*\tP100\t*\t*\tFLY\tFLT\t*\tF100\tYVR\tCA\tCA\n",
        "A\tC1\t101\t1\t1002\t1780365600\t1780369200\tYYZ\tCA\t737\t*\tP101\t*\t*\tFLY\tDHD\t*\tF101\tYVR\tCA\tCA\n",
    );
    let mut child = Command::new(bin)
        .arg("--emit-tsv")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("spawn check-8071");
    child
        .stdin
        .as_mut()
        .expect("stdin")
        .write_all(input.as_bytes())
        .expect("write stdin");
    let output = child.wait_with_output().expect("wait check-8071");

    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout).expect("utf8 stdout");
    assert!(
        stdout
            .lines()
            .any(|line| line.starts_with("V\tC1\t0\t100\t")),
        "expected FLT pairing violation, got stdout: {stdout}",
    );
    assert!(
        !stdout
            .lines()
            .any(|line| line.starts_with("V\tC1\t0\t101\t")),
        "DHD pairing must not match Assignments=FLT, got stdout: {stdout}",
    );
}

#[test]
fn narrowed_country_rule_emits_one_finding_per_matching_pairing() {
    // Countries = "!(CA)" (negative, enabled) narrows the row. Two pairings match:
    // pairing 135320 (SFO/US) and pairing 136829 (MEX/MX). Each must get its own
    // finding anchored to its pairing_id — not a single max-pairing_id finding.
    let rule = rule_with_countries("!(CA)", 0.0);
    let rows = vec![
        act_country("923", 135_320, 3, 1, 1_780_560_000, "0031", "US"),
        act_country("923", 136_829, 1, 2, 1_780_771_200, "0044", "MX"),
    ];
    let out = check_roster_properties_row(
        "923",
        &rule,
        &rows,
        1_779_811_200,
        1_782_403_199,
        &[],
        Application::Editor,
    );
    assert_eq!(
        out.len(),
        2,
        "expected one finding per matching pairing: {out:?}"
    );
    let mut anchors: Vec<i64> = out.iter().map(|v| v.anchor_pairing_id).collect();
    anchors.sort_unstable();
    assert_eq!(anchors, vec![135_320, 136_829]);
    // Each finding reports its own pairing's count (1), and both are over max=0.
    assert!(out.iter().all(|v| v.over));
    assert!(out.iter().all(|v| v.actual_count == 1.0));
}

#[test]
fn wildcard_rule_keeps_single_finding_anchored_to_max_pairing_id() {
    // Fully wildcard row (no Labels/Attributes/Destinations/Countries narrowing):
    // legacy behaviour — one finding per window, anchored to the max pairing_id.
    let rule = default_rule(0.0);
    let rows = vec![
        act(
            "923",
            135_320,
            1,
            1,
            1_780_560_000,
            "FLY",
            "0031",
            "YVR",
            "CA",
        ),
        act(
            "923",
            136_829,
            1,
            1,
            1_780_771_200,
            "FLY",
            "0044",
            "YVR",
            "CA",
        ),
    ];
    let out = check_roster_properties_row(
        "923",
        &rule,
        &rows,
        1_779_811_200,
        1_782_403_199,
        &[],
        Application::Editor,
    );
    assert_eq!(out.len(), 1, "expected single legacy finding, got: {out:?}");
    assert_eq!(out[0].anchor_pairing_id, 136_829);
    assert_eq!(out[0].actual_count, 2.0);
}
