//! C++ → Rust replica for `LegalityChecker::isOverlap` (RuleEngine.cpp:24900-24950).
//!
//! RO gate: new pairings vs `crew->rosterList`. Candidate end bound follows the
//! **existing** roster assignment TYPE (work-like → rest end; rest-like → duty end).

use rois_rule_engine::{
    check_roster_overlap, is_overlap, is_overlap_detail, is_work_like_assignment_type,
    parse_utc_seconds, OverlapCandidatePairing, OverlapExistingRoster,
};

/// YEG MDT (UTC−6): minutes east of UTC = −360.
const YEG_MDT_OFFSET_MIN: i64 = -360;

fn yeg_local(s: &str) -> i64 {
    parse_utc_seconds(s).expect("valid timestamp") - YEG_MDT_OFFSET_MIN * 60
}

fn ex(
    id: i64,
    start: i64,
    end_duty: i64,
    end_rest: i64,
    assignment_type: &str,
    is_pairing: bool,
) -> OverlapExistingRoster {
    OverlapExistingRoster {
        pairing_id: id,
        start_utc: start,
        end_duty_utc: end_duty,
        end_including_rest_utc: end_rest,
        assignment_type: assignment_type.to_string(),
        is_pairing_roster: is_pairing,
    }
}

fn cand(id: i64, start: i64, end_duty: i64, end_rest: i64) -> OverlapCandidatePairing {
    OverlapCandidatePairing {
        pairing_id: id,
        start_utc: start,
        end_duty_utc: end_duty,
        end_including_rest_utc: end_rest,
    }
}

#[test]
fn work_like_types_match_cpp_w_t_s_and_live_codes() {
    for t in ["FLY", "GRD", "SBY", "TRN", "SIM", "RES"] {
        assert!(is_work_like_assignment_type(t), "{t} must be work-like");
    }
    for t in ["LVE", "DO", "VAC"] {
        assert!(!is_work_like_assignment_type(t), "{t} must be rest-like");
    }
}

#[test]
fn empty_candidates_is_legal() {
    let existing = [ex(1, 0, 100, 200, "FLY", true)];
    assert!(!is_overlap(&existing, &[]));
}

#[test]
fn pairing_overlaps_fixed_fly_duty() {
    let existing = [ex(10, 1000, 2000, 3000, "FLY", true)];
    let candidates = [cand(20, 1500, 2500, 3500)];
    assert!(is_overlap(&existing, &candidates));
}

#[test]
fn rest_like_existing_ignores_candidate_rest() {
    // Existing LVE DO; candidate duty ends before DO but rest crosses into DO day.
    let existing = [ex(0, 86400, 86400 + 86400, 86400 + 86400, "LVE", false)];
    let candidates = [cand(1, 0, 43200, 90000)];
    assert!(
        !is_overlap(&existing, &candidates),
        "rest-like existing → candidate bound = duty end (43200), before DO at 86400"
    );
}

#[test]
fn work_like_existing_counts_candidate_rest() {
    let existing = [ex(10, 50_000, 52_000, 54_000, "FLY", true)];
    let candidates = [cand(20, 48_000, 49_000, 51_000)];
    assert!(
        is_overlap(&existing, &candidates),
        "work-like existing → candidate bound = rest end 51000, overlaps FLY from 50000"
    );
}

#[test]
fn work_like_res_existing_counts_candidate_rest() {
    let existing = [ex(10, 50_000, 52_000, 54_000, "RES", true)];
    let candidates = [cand(20, 48_000, 49_000, 51_000)];
    assert!(
        is_overlap(&existing, &candidates),
        "RES is work-like → candidate bound = rest end 51000, overlaps RES from 50000"
    );
}

/// YEG: June-10 DO (LVE) + new pairing duty Jun 9 22:30 → Jun 10 02:00, rest to 15:00 → violation.
#[test]
fn yeg_do_june10_overlaps_pairing_duty_crossing_midnight() {
    let existing_do = ex(
        0,
        yeg_local("2026-06-10T00:00:00"),
        yeg_local("2026-06-11T00:00:00"),
        yeg_local("2026-06-11T00:00:00"),
        "LVE",
        false,
    );
    let new_pairing = cand(
        42,
        yeg_local("2026-06-09T22:30:00"),
        yeg_local("2026-06-10T02:00:00"),
        yeg_local("2026-06-10T15:00:00"),
    );
    assert!(is_overlap(&[existing_do], &[new_pairing]));
}

/// YEG: pairing ends before June-10 DO starts → no violation.
#[test]
fn yeg_do_june10_no_overlap_when_pairing_ends_before_do_day() {
    let existing_do = ex(
        0,
        yeg_local("2026-06-10T00:00:00"),
        yeg_local("2026-06-11T00:00:00"),
        yeg_local("2026-06-11T00:00:00"),
        "LVE",
        false,
    );
    let pairing = cand(
        41,
        yeg_local("2026-06-08T08:00:00"),
        yeg_local("2026-06-08T12:00:00"),
        yeg_local("2026-06-09T01:00:00"),
    );
    assert!(!is_overlap(&[existing_do], &[pairing]));
}

/// YEG: June-10 DO + pairing Jun 9 08:30–12:00 duty, rest to Jun 10 01:00 → no violation.
#[test]
fn yeg_do_june10_no_overlap_when_duty_ends_june9_rest_crosses_do() {
    let existing_do = ex(
        0,
        yeg_local("2026-06-10T00:00:00"),
        yeg_local("2026-06-11T00:00:00"),
        yeg_local("2026-06-11T00:00:00"),
        "LVE",
        false,
    );
    let pairing = cand(
        43,
        yeg_local("2026-06-09T08:30:00"),
        yeg_local("2026-06-09T12:00:00"),
        yeg_local("2026-06-10T01:00:00"),
    );
    let existing = [existing_do];
    let candidates = [pairing];
    assert!(
        !is_overlap(&existing, &candidates),
        "duty ends 12:00 June-9; rest to 01:00 June-10 must not count vs LVE DO"
    );
    assert!(is_overlap_detail(&existing, &candidates).is_none());
    assert!(check_roster_overlap("YEG-CREW", &existing, &candidates).is_empty());
}

/// YEG: fixed FLY Jun 10 00:30–06:00 duty (rest to 19:00) + same new pairing as DO case → violation.
#[test]
fn yeg_fly_june10_overlaps_new_pairing_rest_into_fixed_fly() {
    let existing_fly = ex(
        100,
        yeg_local("2026-06-10T00:30:00"),
        yeg_local("2026-06-10T06:00:00"),
        yeg_local("2026-06-10T19:00:00"),
        "FLY",
        true,
    );
    let new_pairing = cand(
        43,
        yeg_local("2026-06-09T08:30:00"),
        yeg_local("2026-06-09T12:00:00"),
        yeg_local("2026-06-10T01:00:00"),
    );
    let existing = [existing_fly];
    let candidates = [new_pairing];
    assert!(
        is_overlap(&existing, &candidates),
        "candidate rest to 01:00 overlaps fixed FLY from 00:30"
    );
    let detail = is_overlap_detail(&existing, &candidates).expect("violation");
    assert_eq!(detail.candidate_pairing_id, 43);
    assert_eq!(detail.existing_pairing_id, 100);
    assert_eq!(
        detail.candidate_end_bound_utc,
        yeg_local("2026-06-10T01:00:00")
    );
    assert_eq!(detail.existing_start_utc, yeg_local("2026-06-10T00:30:00"));
    assert_eq!(detail.existing_end_utc, yeg_local("2026-06-10T19:00:00"));
    assert_eq!(
        check_roster_overlap("YEG-CREW", &existing, &candidates).len(),
        1
    );
}
