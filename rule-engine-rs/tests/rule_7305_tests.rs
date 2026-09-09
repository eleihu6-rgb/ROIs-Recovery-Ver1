use rois_rule_engine::rules::rule7305::{
    check_rule7305_row, Rule7305, Rule7305ConsecutiveType, Rule7305CrewContext, Rule7305Duty,
};
use rois_rule_engine::{parse_utc_seconds, Application};

const DAY: i64 = 86_400;
const HOUR: i64 = 3_600;

fn duty(
    id: i64,
    start: i64,
    duty_end: i64,
    rest_end: i64,
    assignment: &str,
    group: &str,
    attributes: &str,
    label: &str,
    pre_assigned: bool,
) -> Rule7305Duty {
    Rule7305Duty {
        activity_id: id,
        pairing_id: (id > 0).then_some(id),
        start_utc: start,
        duty_end_utc: duty_end,
        rest_end_utc: rest_end,
        local_offset_min: -360,
        assignment: assignment.to_string(),
        assignment_group: group.to_string(),
        attributes: attributes
            .split('|')
            .filter(|v| !v.is_empty())
            .map(str::to_string)
            .collect(),
        label: label.to_string(),
        is_ground: id < 0,
        pre_assigned,
        phase_checked: true,
    }
}

fn row(typ: &str, max: i64) -> Rule7305 {
    Rule7305::from_cells(&[
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        typ,
        &max.to_string(),
        "1",
    ])
    .unwrap()
}

fn context() -> Rule7305CrewContext {
    Rule7305CrewContext {
        base_quals: vec![("YEG".to_string(), 0, i64::MAX)],
        rank_quals: vec![("CA".to_string(), 0, i64::MAX)],
        position_quals: vec![("CAPT".to_string(), 0, i64::MAX)],
        fleet_quals: vec![("320".to_string(), 0, i64::MAX)],
        teams: vec!["TEAM-A".to_string()],
        assignment_group_map: vec![
            ("FLT".to_string(), "FLY".to_string()),
            ("VAC".to_string(), "DO".to_string()),
        ],
    }
}

#[test]
fn parses_the_rust_12_column_layout_and_crew_teams() {
    let rule = Rule7305::from_cells(&[
        "*", "CA", "CAPT", "*", "TEAM-A", "FLY", "FLT", "LABEL-A", "ATTR-A", "D", "3", "1",
    ])
    .unwrap();

    assert_eq!(rule.teams, vec!["TEAM-A"]);
    assert_eq!(rule.labels, vec!["LABEL-A"]);
    assert_eq!(rule.attributes, vec!["ATTR-A"]);
    assert_eq!(rule.assignment_groups, vec!["FLY"]);
    assert_eq!(rule.assignments, vec!["FLT"]);
    assert_eq!(rule.consecutive_type, Rule7305ConsecutiveType::Days);
    assert_eq!(rule.max_consecutive, 3);
    assert_eq!(rule.severity, 1);
}

#[test]
fn rejects_invalid_shape_type_max_and_severity() {
    assert!(Rule7305::from_cells(&["*"; 11]).unwrap_err().contains("12"));
    assert!(
        Rule7305::from_cells(&["*", "*", "*", "*", "*", "*", "*", "*", "*", "X", "1", "1",])
            .unwrap_err()
            .contains("Consecutive Type")
    );
    assert!(Rule7305::from_cells(&[
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "T",
        "not-number",
        "1",
    ])
    .unwrap_err()
    .contains("Max"));
    assert!(Rule7305::from_cells(&[
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "T",
        "1",
        "not-number",
    ])
    .unwrap_err()
    .contains("Severity"));
    assert!(Rule7305::from_cells(&[
        "*", "*", "*", "*", "*", "*", "*", "*", "*", "T", "1", "1", "extra",
    ])
    .unwrap_err()
    .contains("exactly 12"));
    assert!(Rule7305::from_cells(&[
        "*", "*", "*", "*", "*", "*", "*", "*", "*", "*", "*", "T", "*", "1", "1",
    ])
    .unwrap_err()
    .contains("exactly 12"));
}

#[test]
fn treats_negative_expiry_as_open_ended() {
    let mut crew = context();
    crew.base_quals = vec![("YEG".to_string(), 0, -1)];
    let mut rule = row("T", 0);
    rule.bases = vec!["YEG".to_string()];
    assert_eq!(
        check_rule7305_row(
            "C1",
            &rule,
            &[duty(
                1,
                100 * DAY,
                100 * DAY + HOUR,
                100 * DAY + 2 * HOUR,
                "FLT",
                "FLY",
                "",
                "",
                false
            )],
            &crew,
            100 * DAY,
            101 * DAY,
            Application::Editor,
        )
        .len(),
        1
    );
}

#[test]
fn qualification_must_cover_checked_window_with_strict_expiry_boundary() {
    let mut rule = row("T", 0);
    rule.bases = vec!["YEG".to_string()];
    let mut crew = context();
    crew.base_quals = vec![("YEG".to_string(), 100, 101)];
    let duties = [duty(
        1,
        100 * DAY,
        100 * DAY + HOUR,
        100 * DAY + 2 * HOUR,
        "FLT",
        "FLY",
        "",
        "",
        false,
    )];

    assert!(
        check_rule7305_row(
            "C1",
            &rule,
            &duties,
            &crew,
            100 * DAY,
            101 * DAY,
            Application::Editor,
        )
        .is_empty(),
        "C++ requires checked_end to be strictly before the qualification expiry"
    );

    crew.base_quals = vec![("YEG".to_string(), 100, 102)];
    assert_eq!(
        check_rule7305_row(
            "C1",
            &rule,
            &duties,
            &crew,
            100 * DAY,
            101 * DAY,
            Application::Editor,
        )
        .len(),
        1
    );
}

#[test]
fn type_counts_first_same_day_and_next_day_duties() {
    let duties = [
        duty(1, 0, 4 * HOUR, 10 * HOUR, "FLT", "FLY", "", "", false),
        duty(
            2,
            12 * HOUR,
            16 * HOUR,
            20 * HOUR,
            "FLT",
            "FLY",
            "",
            "",
            false,
        ),
        duty(
            3,
            DAY + 4 * HOUR,
            DAY + 8 * HOUR,
            DAY + 12 * HOUR,
            "FLT",
            "FLY",
            "",
            "",
            false,
        ),
    ];

    let violations = check_rule7305_row(
        "C1",
        &row("T", 2),
        &duties,
        &context(),
        0,
        2 * DAY,
        Application::Editor,
    );

    assert_eq!(violations.len(), 1);
    assert_eq!(violations[0].actual, 3);
    assert_eq!(violations[0].start_utc, 0);
    assert_eq!(violations[0].end_utc, DAY + 12 * HOUR);
    // First start_utc=0 @ UTC-6 → 1969-12-31; last duty_end=DAY+8h → 1970-01-02.
    assert_eq!(
        violations[0].message,
        "The number of consecutive rosters (3) [1969-12-31, 1970-01-02] exceeds the threshold (2)."
    );
}

#[test]
fn type_resets_after_a_gap_and_exact_limit_is_legal() {
    let duties = [
        duty(1, 0, HOUR, 2 * HOUR, "FLT", "FLY", "", "", false),
        duty(
            2,
            3 * DAY,
            3 * DAY + HOUR,
            3 * DAY + 2 * HOUR,
            "FLT",
            "FLY",
            "",
            "",
            false,
        ),
        duty(
            3,
            3 * DAY + 3 * HOUR,
            3 * DAY + 4 * HOUR,
            3 * DAY + 5 * HOUR,
            "FLT",
            "FLY",
            "",
            "",
            false,
        ),
    ];
    assert!(check_rule7305_row(
        "C1",
        &row("T", 2),
        &duties,
        &context(),
        0,
        4 * DAY,
        Application::Editor,
    )
    .is_empty());
}

#[test]
fn days_counts_inclusive_span_and_continuations() {
    let duties = [
        duty(1, 0, DAY, DAY + 2 * HOUR, "FLT", "FLY", "", "", false),
        duty(
            2,
            2 * DAY + 4 * HOUR,
            3 * DAY + 7 * HOUR,
            3 * DAY + 7 * HOUR,
            "FLT",
            "FLY",
            "",
            "",
            false,
        ),
        duty(
            3,
            4 * DAY + 8 * HOUR,
            4 * DAY + 10 * HOUR,
            4 * DAY + 12 * HOUR,
            "FLT",
            "FLY",
            "",
            "",
            false,
        ),
    ];
    let violations = check_rule7305_row(
        "C1",
        &row("D", 4),
        &duties,
        &context(),
        0,
        6 * DAY,
        Application::Editor,
    );
    assert_eq!(violations.len(), 1);
    // First duty starts on the prior local day at UTC-6 (2 local days). Rest ends are
    // intentionally off local midnight so exclusive-end does not change continuity.
    assert_eq!(violations[0].actual, 6);
    // First start_utc=0 @ UTC-6 → 1969-12-31; last duty_end=4*DAY+10h → 1970-01-05.
    assert_eq!(
        violations[0].message,
        "The number of consecutive roster days (6) [1969-12-31, 1970-01-05] exceeds the threshold (4)."
    );
}

/// Half-open local span [D 00:00, D+N 00:00) must count N days, not N+1.
/// Scenario 740 / crew 1877 shape: [2026-09-15, 2026-09-23) local → 8 occupied days.
#[test]
fn days_ending_at_local_midnight_counts_exclusive_and_message_uses_last_occupied_day() {
    const YYZ: i64 = -240;
    let start = parse_utc_seconds("2026-09-15 04:00:00").unwrap();
    let end = parse_utc_seconds("2026-09-23 04:00:00").unwrap();

    let mut d = duty(1, start, end, end, "FLT", "FLY", "", "", false);
    d.local_offset_min = YYZ;
    let violations = check_rule7305_row(
        "1877",
        &row("D", 5),
        &[d],
        &context(),
        start,
        end,
        Application::Editor,
    );
    assert_eq!(violations.len(), 1);
    assert_eq!(violations[0].actual, 8);
    assert_eq!(
        violations[0].message,
        "The number of consecutive roster days (8) [2026-09-15, 2026-09-22] exceeds the threshold (5)."
    );
}

#[test]
fn filters_assignment_group_assignment_attribute_label_and_ground_label() {
    let mut rule = row("T", 0);
    rule.assignment_groups = vec!["DO".to_string()];
    rule.assignments = vec!["VAC".to_string()];
    rule.attributes = vec!["REST".to_string()];
    rule.labels = vec!["SPECIAL".to_string()];
    let ground = duty(-1, 0, HOUR, 2 * HOUR, "VAC", "DO", "REST", "SPECIAL", false);
    assert!(check_rule7305_row(
        "C1",
        &rule,
        &[ground],
        &context(),
        0,
        DAY,
        Application::Editor,
    )
    .is_empty());

    rule.labels = vec!["*".to_string()];
    assert_eq!(
        check_rule7305_row(
            "C1",
            &rule,
            &[duty(-1, 0, HOUR, 2 * HOUR, "VAC", "DO", "REST", "", false)],
            &context(),
            0,
            DAY,
            Application::Editor,
        )
        .len(),
        1
    );
}

#[test]
fn qualification_scope_is_effective_dated_and_position_aware() {
    let mut rule = row("T", 0);
    rule.bases = vec!["YEG".to_string()];
    rule.ranks = vec!["CA".to_string()];
    rule.positions = vec!["CAPT".to_string()];
    rule.fleets = vec!["320".to_string()];
    rule.teams = vec!["TEAM-A".to_string()];
    let mut crew = context();
    crew.position_quals = vec![("FO".to_string(), 0, i64::MAX)];
    assert!(check_rule7305_row(
        "C1",
        &rule,
        &[duty(1, 0, HOUR, 2 * HOUR, "FLT", "FLY", "", "", false)],
        &crew,
        0,
        DAY,
        Application::Editor,
    )
    .is_empty());
}

#[test]
fn phase_skipped_and_nonmatching_duties_reset_continuity() {
    let mut skipped = duty(2, 2 * HOUR, 3 * HOUR, 4 * HOUR, "FLT", "FLY", "", "", false);
    skipped.phase_checked = false;
    let nonmatching = duty(2, 2 * HOUR, 3 * HOUR, 4 * HOUR, "SIM", "SIM", "", "", false);
    let first = duty(1, 0, HOUR, 2 * HOUR, "FLT", "FLY", "", "", false);
    let third = duty(3, 5 * HOUR, 6 * HOUR, 7 * HOUR, "FLT", "FLY", "", "", false);
    let mut assignment_rule = row("T", 1);
    assignment_rule.assignments = vec!["FLT".to_string()];
    assignment_rule.assignment_groups = vec!["FLY".to_string()];
    assert!(check_rule7305_row(
        "C1",
        &assignment_rule,
        &[first.clone(), skipped, third.clone()],
        &context(),
        0,
        DAY,
        Application::Editor,
    )
    .is_empty());
    assert!(check_rule7305_row(
        "C1",
        &assignment_rule,
        &[first, nonmatching, third],
        &context(),
        0,
        DAY,
        Application::Editor,
    )
    .is_empty());
}

#[test]
fn optimizer_ignores_pa_only_but_reports_candidate_participation() {
    let pa = [
        duty(1, 0, HOUR, 2 * HOUR, "FLT", "FLY", "", "", true),
        duty(2, 3 * HOUR, 4 * HOUR, 5 * HOUR, "FLT", "FLY", "", "", true),
    ];
    assert!(check_rule7305_row(
        "C1",
        &row("T", 1),
        &pa,
        &context(),
        0,
        DAY,
        Application::Optimizer,
    )
    .is_empty());

    let mixed = [
        pa[0].clone(),
        duty(3, 3 * HOUR, 4 * HOUR, 5 * HOUR, "FLT", "FLY", "", "", false),
    ];
    let violations = check_rule7305_row(
        "C1",
        &row("T", 1),
        &mixed,
        &context(),
        0,
        DAY,
        Application::Optimizer,
    );
    assert_eq!(violations.len(), 1);
    assert_eq!(
        violations[0].message,
        "The number of consecutive rosters (2) [1969-12-31, 1969-12-31] exceeds the threshold (1)."
    );
}
