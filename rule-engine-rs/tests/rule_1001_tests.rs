use rois_rule_engine::{
    check_assignment_overlap, check_assignment_overlap_with_group_map, parse_utc_seconds,
    AssignmentOverlapRoster, AssignmentOverlapRule, DoStartGrace1001,
};

const YEG: i64 = -360;

fn t(s: &str) -> i64 {
    parse_utc_seconds(s).expect("utc")
}

fn roster(
    id: i64,
    start: i64,
    end_duty: i64,
    end_rest: i64,
    group: &str,
    assignment: &str,
    assignment_type: &str,
) -> AssignmentOverlapRoster {
    roster_with_offset(
        id,
        start,
        end_duty,
        end_rest,
        group,
        assignment,
        assignment_type,
        0,
    )
}

fn roster_with_offset(
    id: i64,
    start: i64,
    end_duty: i64,
    end_rest: i64,
    group: &str,
    assignment: &str,
    assignment_type: &str,
    offset_min: i64,
) -> AssignmentOverlapRoster {
    AssignmentOverlapRoster {
        id,
        start_utc: start,
        end_duty_utc: end_duty,
        end_including_rest_utc: end_rest,
        assignment_group: group.to_string(),
        assignment: assignment.to_string(),
        assignment_type: assignment_type.to_string(),
        is_pre_assigned: false,
        offset_min,
    }
}

fn rule(
    group_before: &[&str],
    assignment_before: &[&str],
    rest_before: bool,
    type_before: &[&str],
    group_after: &[&str],
    assignment_after: &[&str],
    type_after: &[&str],
) -> AssignmentOverlapRule {
    AssignmentOverlapRule {
        group_before: group_before.iter().map(|s| s.to_string()).collect(),
        assignment_before: assignment_before.iter().map(|s| s.to_string()).collect(),
        rest_before,
        type_before: type_before.iter().map(|s| s.to_string()).collect(),
        group_after: group_after.iter().map(|s| s.to_string()).collect(),
        assignment_after: assignment_after.iter().map(|s| s.to_string()).collect(),
        type_after: type_after.iter().map(|s| s.to_string()).collect(),
    }
}

fn fly_do_rule() -> AssignmentOverlapRule {
    rule(&["FLY"], &["*"], true, &["*"], &["DO"], &["*"], &["*"])
}

fn no_grace() -> DoStartGrace1001 {
    DoStartGrace1001::default()
}

fn do_grace(min: i64) -> DoStartGrace1001 {
    DoStartGrace1001 {
        do_start_min: min,
        assignments: vec!["DO".to_string()],
        groups: vec!["DO".to_string()],
    }
}

#[test]
fn direct_duty_overlap_without_rules_fails_closed() {
    let rosters = [
        roster(1, 0, 10, 20, "FLY", "FLT", "W"),
        roster(2, 5, 15, 15, "DO", "DO", "O"),
    ];
    let out = check_assignment_overlap("C1", &rosters, &[], no_grace());
    assert_eq!(out.len(), 1);
    assert_eq!(out[0].before_id, 1);
    assert_eq!(out[0].after_id, 2);
}

#[test]
fn rest_before_n_prohibits_rest_only_into_l_or_o() {
    let rosters = [
        roster(1, 0, 10, 30, "FLY", "FLT", "W"),
        roster(2, 20, 40, 40, "ANY", "VAC", "L"),
    ];
    let rules = [rule(
        &["FLY"],
        &["*"],
        false,
        &["*"],
        &["*"],
        &["*"],
        &["L", "O"],
    )];
    let out = check_assignment_overlap("C1", &rosters, &rules, no_grace());
    assert_eq!(out.len(), 1);
}

#[test]
fn rest_before_y_allows_rest_only_into_l_or_o() {
    let rosters = [
        roster(1, 0, 10, 30, "FLY", "FLT", "W"),
        roster(2, 20, 40, 40, "ANY", "VAC", "L"),
    ];
    let rules = [rule(
        &["FLY"],
        &["*"],
        true,
        &["*"],
        &["*"],
        &["*"],
        &["L", "O"],
    )];
    assert!(check_assignment_overlap("C1", &rosters, &rules, no_grace()).is_empty());
}

#[test]
fn rest_before_y_prohibits_duty_overlap_into_do() {
    let rosters = [
        roster(1, 0, 20, 30, "FLY", "FLT", "W"),
        roster(2, 10, 40, 40, "DO", "DO", "O"),
    ];
    let rules = [fly_do_rule()];
    let out = check_assignment_overlap("C1", &rosters, &rules, no_grace());
    assert_eq!(out.len(), 1);
}

#[test]
fn sby_before_do_rest_only_allowed_with_rest_before_y() {
    let rosters = [
        roster(1, 0, 10, 30, "SBY", "SBY", "S"),
        roster(2, 20, 40, 40, "DO", "DO", "O"),
    ];
    let rules = [rule(
        &["SBY"],
        &["*"],
        true,
        &["*"],
        &["DO"],
        &["*"],
        &["*"],
    )];
    assert!(check_assignment_overlap("C1", &rosters, &rules, no_grace()).is_empty());
}

#[test]
fn unmatched_filters_fail_closed_when_rules_present() {
    let rosters = [
        roster(1, 0, 10, 20, "FLY", "FLT", "W"),
        roster(2, 5, 15, 15, "RES", "RES", "S"),
    ];
    let rules = [fly_do_rule()];
    let out = check_assignment_overlap("C1", &rosters, &rules, no_grace());
    assert_eq!(out.len(), 1);
}

#[test]
fn boundary_touch_is_not_overlap() {
    let rosters = [
        roster(1, 0, 10, 10, "FLY", "FLT", "W"),
        roster(2, 10, 20, 20, "DO", "DO", "O"),
    ];
    assert!(check_assignment_overlap("C1", &rosters, &[], no_grace()).is_empty());
}

#[test]
fn fly_do_2015_grace_0059_before_do_start_allows_pair() {
    let fly_start = t("2026-06-01 20:00:00");
    let fly_end = t("2026-06-02 06:59:00");
    let fly_rest = t("2026-06-02 15:59:00");
    let do_start = t("2026-06-02 06:00:00");
    let do_end = t("2026-06-02 23:00:00");
    let rosters = [
        roster_with_offset(1, fly_start, fly_end, fly_rest, "FLY", "FLY", "W", YEG),
        roster_with_offset(2, do_start, do_end, do_end, "DO", "DO", "O", YEG),
    ];
    let rules = [fly_do_rule()];
    assert!(
        check_assignment_overlap("C1", &rosters, &rules, do_grace(60)).is_empty(),
        "00:59 local release before 01:00 DO Start is legal"
    );
}

#[test]
fn fly_do_2015_grace_grd_do_assignment_before_do_start_allows_pair() {
    let fly_start = t("2026-06-01 20:00:00");
    let fly_end = t("2026-06-02 06:59:00");
    let fly_rest = t("2026-06-02 15:59:00");
    let do_start = t("2026-06-02 06:00:00");
    let do_end = t("2026-06-02 23:00:00");
    let rosters = [
        roster_with_offset(1, fly_start, fly_end, fly_rest, "FLY", "FLY", "W", YEG),
        roster_with_offset(2, do_start, do_end, do_end, "GRD", "DO", "O", YEG),
    ];
    let rules = [fly_do_rule()];
    assert!(
        check_assignment_overlap("C1", &rosters, &rules, do_grace(60)).is_empty(),
        "GRD/DO after row with ASSIGNMENTS=DO gets grace when release is before DO Start"
    );
}

#[test]
fn fly_do_2015_grace_after_do_start_still_overlap_even_for_grd_do() {
    const YYZ: i64 = -240;
    let fly_start = t("2026-09-11 20:00:00");
    let fly_end = t("2026-09-12 08:40:00");
    let fly_rest = t("2026-09-12 16:40:00");
    let do_start = t("2026-09-12 08:01:00");
    let do_end = t("2026-09-13 08:00:00");
    let rosters = [
        roster_with_offset(1, fly_start, fly_end, fly_rest, "FLY", "FLY", "W", YYZ),
        roster_with_offset(2, do_start, do_end, do_end, "GRD", "DO", "O", YYZ),
    ];
    let rules = [fly_do_rule()];
    assert_eq!(
        check_assignment_overlap("C1", &rosters, &rules, do_grace(60)).len(),
        1,
        "release at 04:40 local is not before 01:00 DO Start"
    );
}

#[test]
fn fly_do_2015_grace_0100_at_do_start_still_overlap() {
    let fly_start = t("2026-06-01 20:00:00");
    let fly_end = t("2026-06-02 07:00:00");
    let fly_rest = t("2026-06-02 15:59:00");
    let do_start = t("2026-06-02 06:00:00");
    let do_end = t("2026-06-02 23:00:00");
    let rosters = [
        roster_with_offset(1, fly_start, fly_end, fly_rest, "FLY", "FLY", "W", YEG),
        roster_with_offset(2, do_start, do_end, do_end, "DO", "DO", "O", YEG),
    ];
    let rules = [fly_do_rule()];
    assert_eq!(
        check_assignment_overlap("C1", &rosters, &rules, do_grace(60)).len(),
        1,
        "01:00 local release at DO Start still overlaps DO"
    );
}

#[test]
fn fly_do_2015_grace_missing_do_start_matches_pre_change() {
    let fly_start = t("2026-06-01 20:00:00");
    let fly_end = t("2026-06-02 06:59:00");
    let fly_rest = t("2026-06-02 15:59:00");
    let do_start = t("2026-06-02 06:00:00");
    let do_end = t("2026-06-02 23:00:00");
    let rosters = [
        roster_with_offset(1, fly_start, fly_end, fly_rest, "FLY", "FLY", "W", YEG),
        roster_with_offset(2, do_start, do_end, do_end, "DO", "DO", "O", YEG),
    ];
    let rules = [fly_do_rule()];
    assert_eq!(
        check_assignment_overlap("C1", &rosters, &rules, no_grace()).len(),
        1,
        "empty filter lists keep overlap behaviour"
    );
}

#[test]
fn fly_do_2015_grace_empty_filter_lists_disable_grace_even_with_do_start_min() {
    let fly_start = t("2026-06-01 20:00:00");
    let fly_end = t("2026-06-02 06:59:00");
    let fly_rest = t("2026-06-02 15:59:00");
    let do_start = t("2026-06-02 06:00:00");
    let do_end = t("2026-06-02 23:00:00");
    let rosters = [
        roster_with_offset(1, fly_start, fly_end, fly_rest, "FLY", "FLY", "W", YEG),
        roster_with_offset(2, do_start, do_end, do_end, "GRD", "DO", "O", YEG),
    ];
    let rules = [fly_do_rule()];
    let grace = DoStartGrace1001 {
        do_start_min: 60,
        assignments: Vec::new(),
        groups: Vec::new(),
    };
    assert_eq!(
        check_assignment_overlap("C1", &rosters, &rules, grace).len(),
        1,
        "both filter lists empty → grace off"
    );
}

#[test]
fn fly_do_2015_grace_applies_with_rest_before_n() {
    let fly_start = t("2026-06-01 20:00:00");
    let fly_end = t("2026-06-02 06:59:00");
    let fly_rest = t("2026-06-02 15:59:00");
    let do_start = t("2026-06-02 06:00:00");
    let do_end = t("2026-06-02 23:00:00");
    let rosters = [
        roster_with_offset(1, fly_start, fly_end, fly_rest, "FLY", "FLY", "W", YEG),
        roster_with_offset(2, do_start, do_end, do_end, "DO", "DO", "O", YEG),
    ];
    let rules = [rule(
        &["FLY"],
        &["*"],
        false,
        &["*"],
        &["DO"],
        &["*"],
        &["*"],
    )];
    assert!(
        check_assignment_overlap("C1", &rosters, &rules, do_grace(60)).is_empty(),
        "2015 grace clears the whole FLY→DO pair even with Rest Before=N"
    );
}

#[test]
fn fly_do_2015_grace_does_not_apply_to_sby_before_do() {
    let sby_start = t("2026-06-01 20:00:00");
    let sby_end = t("2026-06-02 06:30:00");
    let sby_rest = t("2026-06-02 15:59:00");
    let do_start = t("2026-06-02 06:00:00");
    let do_end = t("2026-06-02 23:00:00");
    let rosters = [
        roster_with_offset(1, sby_start, sby_end, sby_rest, "SBY", "SBY", "S", YEG),
        roster_with_offset(2, do_start, do_end, do_end, "DO", "DO", "O", YEG),
    ];
    let rules = [rule(
        &["SBY"],
        &["*"],
        true,
        &["*"],
        &["DO"],
        &["*"],
        &["*"],
    )];
    assert_eq!(
        check_assignment_overlap("C1", &rosters, &rules, do_grace(60)).len(),
        1,
        "SBY→DO does not receive 2015 grace"
    );
}

#[test]
fn fly_do_2015_grace_does_not_apply_to_fly_before_leave() {
    let fly_start = t("2026-06-01 20:00:00");
    let fly_end = t("2026-06-02 06:59:00");
    let fly_rest = t("2026-06-02 15:59:00");
    let vac_start = t("2026-06-02 06:00:00");
    let vac_end = t("2026-06-02 23:00:00");
    let rosters = [
        roster_with_offset(1, fly_start, fly_end, fly_rest, "FLY", "FLY", "W", YEG),
        roster_with_offset(2, vac_start, vac_end, vac_end, "GRD", "VAC", "L", YEG),
    ];
    let rules = [rule(
        &["FLY"],
        &["*"],
        true,
        &["*"],
        &["*"],
        &["*"],
        &["L", "O"],
    )];
    assert_eq!(
        check_assignment_overlap("C1", &rosters, &rules, do_grace(60)).len(),
        1,
        "FLY→VAC is unchanged when filters only list DO"
    );
}

fn dhd_assignment_do_rule() -> AssignmentOverlapRule {
    rule(&["GRD"], &["DHD"], true, &["*"], &["DO"], &["*"], &["*"])
}

fn dhd_group_do_rule() -> AssignmentOverlapRule {
    rule(&["DHD"], &["*"], true, &["*"], &["DO"], &["*"], &["*"])
}

#[test]
fn dhd_do_2015_grace_assignment_dhd_0059_allows() {
    let dhd_start = t("2026-06-01 20:00:00");
    let dhd_end = t("2026-06-02 06:59:00");
    let dhd_rest = t("2026-06-02 15:59:00");
    let do_start = t("2026-06-02 06:00:00");
    let do_end = t("2026-06-02 23:00:00");
    let rosters = [
        roster_with_offset(1, dhd_start, dhd_end, dhd_rest, "GRD", "DHD", "W", YEG),
        roster_with_offset(2, do_start, do_end, do_end, "DO", "DO", "O", YEG),
    ];
    let rules = [dhd_assignment_do_rule()];
    assert!(
        check_assignment_overlap("C1", &rosters, &rules, do_grace(60)).is_empty(),
        "assignment=DHD (group not FLY) with 00:59 release gets 2015 grace"
    );
}

#[test]
fn dhd_do_2015_grace_group_dhd_0059_allows() {
    let dhd_start = t("2026-06-01 20:00:00");
    let dhd_end = t("2026-06-02 06:59:00");
    let dhd_rest = t("2026-06-02 15:59:00");
    let do_start = t("2026-06-02 06:00:00");
    let do_end = t("2026-06-02 23:00:00");
    let rosters = [
        roster_with_offset(1, dhd_start, dhd_end, dhd_rest, "DHD", "DH", "W", YEG),
        roster_with_offset(2, do_start, do_end, do_end, "DO", "DO", "O", YEG),
    ];
    let rules = [dhd_group_do_rule()];
    assert!(
        check_assignment_overlap("C1", &rosters, &rules, do_grace(60)).is_empty(),
        "assignment_group=DHD with 00:59 release gets 2015 grace"
    );
}

#[test]
fn dhd_do_2015_grace_0100_still_overlap() {
    let dhd_start = t("2026-06-01 20:00:00");
    let dhd_end = t("2026-06-02 07:00:00");
    let dhd_rest = t("2026-06-02 15:59:00");
    let do_start = t("2026-06-02 06:00:00");
    let do_end = t("2026-06-02 23:00:00");
    let rosters = [
        roster_with_offset(1, dhd_start, dhd_end, dhd_rest, "DHD", "DHD", "W", YEG),
        roster_with_offset(2, do_start, do_end, do_end, "DO", "DO", "O", YEG),
    ];
    let rules = [dhd_group_do_rule()];
    assert_eq!(
        check_assignment_overlap("C1", &rosters, &rules, do_grace(60)).len(),
        1,
        "01:00 local release at DO Start still overlaps DO for DHD"
    );
}

// A "Group Before=RES" exemption rule cannot recognize a RES roster whose
// assignment_group column is "GRD" (RES's primary group; RES only reaches group RES
// via the Assignment Group Map) — so without the map the pair falls through to the
// fail-closed default and gets wrongly flagged, even though the rule's own Rest-Before
// window would have exempted it. With the map wired through, the rule matches, its
// window does not reach the After duty, and the overlap is correctly allowed.
#[test]
fn group_before_res_exemption_needs_assignment_group_map_to_match_grd_res_roster() {
    let rosters = [
        roster(1, 0, 10, 5, "GRD", "RES", "O"),
        roster(2, 8, 20, 20, "FLY", "FLT", "W"),
    ];
    // rest_before=false → Before end = end_including_rest_utc (5), which does not reach
    // After's start (8): this rule, once it matches, exempts the overlap.
    let rules = [rule(&["RES"], &["*"], false, &["*"], &["*"], &["*"], &["*"])];

    assert_eq!(
        check_assignment_overlap("C1", &rosters, &rules, no_grace()).len(),
        1,
        "without the map, GRD/RES never matches Group Before=RES, so fail-closed fires"
    );

    let group_map = [("RES".to_string(), "GRD".to_string()), ("RES".to_string(), "RES".to_string())];
    assert!(
        check_assignment_overlap_with_group_map("C1", &rosters, &rules, no_grace(), &group_map)
            .is_empty(),
        "with the map, assignment=RES resolves to group RES too, the rule matches, and its \
         Rest-Before window (ending before After starts) exempts the overlap"
    );
}
