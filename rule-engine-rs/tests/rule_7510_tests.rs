use rois_rule_engine::{
    check_green_on_green, mark_green_on_green, Rule7510CrewFlight, Rule7510Param,
};
use std::io::Write;
use std::process::{Command, Stdio};

fn param(initial: i64, min: i32, max: i32) -> Rule7510Param {
    Rule7510Param::from_cells(&[
        "*",
        "*",
        "*",
        "TEAM1",
        "*",
        "*",
        "*",
        &initial.to_string(),
        &min.to_string(),
        &max.to_string(),
    ])
    .expect("valid 7510 parameter row")
    .with_row_index(0)
}

fn flight(crew_id: &str, flight_id: i64, start_utc: i64, teams: &str) -> Rule7510CrewFlight {
    Rule7510CrewFlight {
        crew_id: crew_id.to_string(),
        flight_id,
        pairing_id: flight_id + 10_000,
        duty_seq: 1,
        seg_seq: 1,
        start_utc,
        end_utc: start_utc + 3_600,
        bases: vec!["YYZ".to_string()],
        ranks: vec!["CA".to_string()],
        fleets: vec!["737".to_string()],
        teams: teams.split('|').map(str::to_string).collect(),
        attributes: vec!["GREEN".to_string()],
        assignment: "FLY".to_string(),
        assignment_group: "FLY".to_string(),
    }
}

fn flight_with_group(
    crew_id: &str,
    flight_id: i64,
    start_utc: i64,
    teams: &str,
    assignment_group: &str,
) -> Rule7510CrewFlight {
    let mut row = flight(crew_id, flight_id, start_utc, teams);
    row.assignment_group = assignment_group.to_string();
    row
}

#[test]
fn parser_accepts_the_10_column_green_on_green_row() {
    let row = Rule7510Param::from_cells(&[
        "YYZ", "CA|FO", "737", "TEAM1", "GREEN", "FLY", "FLY", "8", "0", "1",
    ])
    .expect("valid row");
    assert_eq!(row.bases, vec!["YYZ"]);
    assert_eq!(row.ranks, vec!["CA", "FO"]);
    assert_eq!(row.crew_teams, vec!["TEAM1"]);
    assert_eq!(row.initial_sectors, 8);
    assert_eq!(row.min_limits, 0);
    assert_eq!(row.max_limits, 1);
}

#[test]
fn first_n_flights_only_are_marked_and_counted_per_physical_flight() {
    let rule = param(2, 0, 1);
    let flights = vec![
        flight("C1", 101, 1_780_000_000, "TEAM1"),
        flight("C1", 102, 1_780_003_600, "TEAM1"),
        flight("C1", 103, 1_780_007_200, "TEAM1"),
        flight("C2", 101, 1_780_000_000, "TEAM1"),
        flight("C2", 102, 1_780_003_600, "TEAM1"),
        flight("C2", 103, 1_780_007_200, "TEAM1"),
    ];
    let violations = check_green_on_green(&[rule], &flights, 1_780_000_000, 1_780_086_400);
    assert_eq!(violations.len(), 4);
    assert!(violations
        .iter()
        .all(|v| (v.flight_id == 101 || v.flight_id == 102) && v.actual_count == 2));
    assert!(violations.iter().all(|v| v.limit_value == 1 && v.over_max));
    assert!(violations.iter().all(|v| v.flight_id != 103));
}

#[test]
fn first_n_ranking_uses_only_crew_owned_marks_for_the_flight_count() {
    let mut fly_and_res = param(1, 0, 1);
    fly_and_res.assignment_groups = vec!["FLY".to_string(), "RES".to_string()];
    let rows = vec![
        flight_with_group("A", 100, 1_780_000_000, "TEAM1", "FLY"),
        flight_with_group("B", 50, 1_779_996_400, "TEAM1", "RES"),
        flight_with_group("B", 100, 1_780_000_000, "TEAM1", "RES"),
        flight_with_group("B", 200, 1_780_003_600, "TEAM1", "FLY"),
    ];

    let violations = check_green_on_green(&[fly_and_res], &rows, 1_780_000_000, 1_780_086_400);

    assert!(violations.is_empty());

    let mut fly_only = param(1, 0, 1);
    fly_only.assignment_groups = vec!["FLY".to_string()];

    assert!(check_green_on_green(&[fly_only], &rows, 1_780_000_000, 1_780_086_400).is_empty());
}

#[test]
fn same_physical_flight_does_not_count_crew_outside_its_own_initial_sectors() {
    let rule = param(8, 0, 1);
    let mut rows = Vec::new();
    for idx in 0..8 {
        rows.push(flight(
            "EARLY",
            10 + idx,
            1_780_000_000 + idx * 3_600,
            "TEAM1",
        ));
    }
    rows.push(flight("EARLY", 900, 1_780_100_000, "TEAM1"));

    for idx in 0..6 {
        rows.push(flight(
            "LATE",
            100 + idx,
            1_780_020_000 + idx * 3_600,
            "TEAM1",
        ));
    }
    rows.push(flight("LATE", 900, 1_780_100_000, "TEAM1"));

    let violations = check_green_on_green(&[rule], &rows, 1_780_000_000, 1_780_200_000);

    assert!(violations.is_empty());
}

#[test]
fn crew_team_filter_excludes_rows_outside_the_effective_team_window() {
    let rule = param(2, 1, 1);
    let flights = vec![
        flight("C1", 201, 1_780_000_000, "TEAM1"),
        flight("C1", 202, 1_780_003_600, "*"),
    ];
    assert!(check_green_on_green(&[rule], &flights, 1_780_000_000, 1_780_086_400).is_empty());
}

#[test]
fn wildcard_and_pipe_filters_match_existing_rule_style() {
    let mut rule = param(1, 0, 0);
    rule.bases = vec!["YVR".to_string(), "YYZ".to_string()];
    rule.ranks = vec!["CA".to_string()];
    rule.fleets = vec!["737".to_string()];
    rule.attributes = vec!["GREEN".to_string()];
    rule.assignments = vec!["FLY".to_string()];
    rule.assignment_groups = vec!["FLY".to_string()];
    let violations = check_green_on_green(
        &[rule],
        &[flight("C1", 301, 1_780_000_000, "TEAM1")],
        1_780_000_000,
        1_780_086_400,
    );
    assert_eq!(violations.len(), 1);
    assert_eq!(violations[0].crew_id, "C1");
}

#[test]
fn duplicate_physical_flight_uses_deterministic_canonical_row() {
    let rule = param(1, 0, 0);
    let mut later_pairing = flight("C1", 401, 1_780_000_000, "TEAM1");
    later_pairing.pairing_id = 20;
    let mut earlier_pairing = later_pairing.clone();
    earlier_pairing.pairing_id = 10;

    let marks = mark_green_on_green(&[rule], &[later_pairing, earlier_pairing]);

    assert_eq!(marks.len(), 1);
    assert_eq!(marks[0].row.pairing_id, 10);
}

#[test]
fn check_7510_cli_emits_one_violation_per_marked_crew() {
    let input = [
        "C\t1780000000\t1780086400",
        "R\t0\t*\t*\t*\tTEAM1\t*\t*\t*\t2\t0\t1",
        "F\tC1\t101\t1001\t1\t1\t1780000000\t1780003600\tYYZ\tCA\t737\tTEAM1\tGREEN\tFLY\tFLY",
        "F\tC1\t102\t1002\t1\t1\t1780007200\t1780010800\tYYZ\tCA\t737\tTEAM1\tGREEN\tFLY\tFLY",
        "F\tC2\t101\t2001\t1\t1\t1780000000\t1780003600\tYYZ\tCA\t737\tTEAM1\tGREEN\tFLY\tFLY",
        "F\tC2\t102\t2002\t1\t1\t1780007200\t1780010800\tYYZ\tCA\t737\tTEAM1\tGREEN\tFLY\tFLY",
        "",
    ]
    .join("\n");
    let mut child = Command::new(env!("CARGO_BIN_EXE_check-7510"))
        .arg("--emit-tsv")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn check-7510");
    child
        .stdin
        .as_mut()
        .expect("stdin")
        .write_all(input.as_bytes())
        .expect("write input");
    drop(child.stdin.take());
    let output = child.wait_with_output().expect("check-7510 output");
    assert!(
        output.status.success(),
        "stderr={}",
        String::from_utf8_lossy(&output.stderr)
    );
    let stdout = String::from_utf8(output.stdout).expect("utf8 stdout");
    assert!(stdout.contains("V\t0\tC1\t1001\t1\t101\t1780000000\t1780003600\t2\t1\t1"));
    assert!(stdout.contains("V\t0\tC2\t2001\t1\t101\t1780000000\t1780003600\t2\t1\t1"));
}
