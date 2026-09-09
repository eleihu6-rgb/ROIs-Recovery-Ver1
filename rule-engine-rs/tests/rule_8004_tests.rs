//! C++ → Rust migration-fidelity replica for rule 8004 (BASIC COMPETENCY — BASE).
//!
//! Source of truth: `crewrule-dev/RuleEngine/RuleEngine.cpp`
//! (`LegalityChecker::checkBasicCompetency`, line 8429). There is NO `rule8004_gtest.cpp`,
//! so this replica encodes the BASE-type contract taken directly from the active checker
//! (RuleEngine.cpp:8529-8573):
//!
//!   per roster: covered ⇔ ∃ crew_base row with base match,
//!                          eff <= roster_start  AND  exp(+grace) > roster_end   (8542)
//!   violation  ⇔  no covering row
//!   message: "{crewId}: No base ({base}) assigned in roster."                   (8554)
//!
//! Instance 8004/004 (F8 "Basic Competency"): three Type rows; only BASE has Enable=Y
//! (RANK, FLEET = N), Grace Period=0. The migration maps 8004/004 into workset 103
//! (`sql/migration/2026-06-15-rule-8004-004-add-to-103.sql`); no param value is changed.
//!
//! Live-port null handling (see lib.rs): exp null → far-future (C++ does this at 8535);
//! eff null → always-effective (the demo leaves every crew_base.eff null); empty/'*'-base
//! rosters are skipped.

use rois_rule_engine::{
    base_is_covered, check_base_competency, check_base_competency_app, parse_date_ord,
    parse_utc_seconds, Application, BaseActivity, BaseQual, BaseRoster,
};

#[test]
fn rank_and_fleet_competency_use_actual_interval_and_departure() {
    use rois_rule_engine::{check_fleet_competency, check_rank_competency, CompetencyFlight, CompetencyQual};
    let flight = CompetencyFlight { pairing_id: 7, duty_seq: 1, seg_seq: 1, assignment: "FLY".into(), rank: "CA".into(), fleet: "7M8".into(), start_utc: 0, end_utc: 7200, start_ord: 20000, end_ord: 20000, deadhead: false, ferry: false };
    let rank = CompetencyQual { value: "CA".into(), eff_ord: Some(19999), exp_ord: Some(20001) };
    let fleet = CompetencyQual { value: "7M8".into(), eff_ord: Some(19999), exp_ord: Some(20001) };
    assert!(check_rank_competency("C", std::slice::from_ref(&flight), &[rank], &["FLY".into()], 0).is_empty());
    assert!(check_fleet_competency("C", std::slice::from_ref(&flight), &[fleet], &["FLY".into()], 0).is_empty());
    let no_fleet = CompetencyQual { value: "737".into(), eff_ord: None, exp_ord: None };
    assert_eq!(check_fleet_competency("C", std::slice::from_ref(&flight), &[no_fleet], &[], 0)[0].value, "7M8");
}

#[test]
fn fleet_expiry_after_departure_before_landing_remains_legal() {
    use rois_rule_engine::{check_fleet_competency, check_rank_competency, CompetencyFlight, CompetencyQual};
    let flight = CompetencyFlight {
        pairing_id: 9, duty_seq: 1, seg_seq: 1, assignment: "FLY".into(), rank: "CA".into(), fleet: "7M8".into(),
        start_utc: 0, end_utc: 86_400, start_ord: 20_000, end_ord: 20_001, deadhead: false, ferry: false,
    };
    let expiring = CompetencyQual { value: "7M8".into(), eff_ord: Some(19_000), exp_ord: Some(20_001) };
    assert!(check_fleet_competency("C", std::slice::from_ref(&flight), &[expiring], &[], 0).is_empty());
    let rank = CompetencyQual { value: "CA".into(), eff_ord: Some(19_000), exp_ord: Some(20_001) };
    assert_eq!(check_rank_competency("C", &[flight], &[rank], &[], 0).len(), 1);
}

#[test]
fn fleet_skips_deadhead_and_assignment_filter_is_case_insensitive() {
    use rois_rule_engine::{check_fleet_competency, CompetencyFlight, CompetencyQual};
    let flight = CompetencyFlight { pairing_id: 8, duty_seq: 1, seg_seq: 1, assignment: "fly".into(), rank: "".into(), fleet: "7M8".into(), start_utc: 0, end_utc: 1, start_ord: 20000, end_ord: 20000, deadhead: true, ferry: false };
    let q = CompetencyQual { value: "737".into(), eff_ord: None, exp_ord: None };
    assert!(check_fleet_competency("C", std::slice::from_ref(&flight), &[q.clone()], &["FLY".into()], 0).is_empty());
    let mut operating = flight; operating.deadhead = false;
    assert_eq!(check_fleet_competency("C", &[operating], &[q], &["FLY".into()], 0).len(), 1);
}

fn qual(base: &str, eff: Option<&str>, exp: Option<&str>) -> BaseQual {
    BaseQual {
        base: base.to_string(),
        eff_ord: eff.map(|s| parse_date_ord(s).expect("eff")),
        exp_ord: exp.map(|s| parse_date_ord(s).expect("exp")),
    }
}

fn roster(pairing_id: i64, base: &str, start: &str, end: &str) -> BaseRoster {
    BaseRoster {
        pairing_id,
        base: base.to_string(),
        start_ord: parse_date_ord(start).expect("start"),
        end_ord: parse_date_ord(end).expect("end"),
    }
}

fn activity(pairing_id: Option<i64>, start: &str, end: &str, from: &str, to: &str) -> BaseActivity {
    BaseActivity {
        pairing_id,
        start_utc: parse_utc_seconds(start).expect("start"),
        end_utc: parse_utc_seconds(end).expect("end"),
        start_station: from.to_string(),
        end_station: to.to_string(),
    }
}

// ── covering window: eff<=start AND exp(+grace)>end ─────────────────────────────────
#[test]
fn base_covered_only_inside_validity_window() {
    let quals = [qual("YYZ", Some("2026-01-01"), Some("2026-12-31"))];
    // Roster fully inside the window → covered.
    assert!(base_is_covered(
        "YYZ",
        parse_date_ord("2026-06-01").unwrap(),
        parse_date_ord("2026-06-10").unwrap(),
        &quals,
        0
    ));
    // Roster ends on/after expiry → NOT covered (exp must be strictly > end).
    assert!(!base_is_covered(
        "YYZ",
        parse_date_ord("2026-06-01").unwrap(),
        parse_date_ord("2026-12-31").unwrap(),
        &quals,
        0
    ));
    // Roster starts before eff → NOT covered.
    assert!(!base_is_covered(
        "YYZ",
        parse_date_ord("2025-12-30").unwrap(),
        parse_date_ord("2026-06-10").unwrap(),
        &quals,
        0
    ));
    // Different base code → NOT covered.
    assert!(!base_is_covered(
        "YVR",
        parse_date_ord("2026-06-01").unwrap(),
        parse_date_ord("2026-06-10").unwrap(),
        &quals,
        0
    ));
}

// ── null eff = always-effective, null exp = far-future (demo-data handling) ─────────
#[test]
fn null_eff_and_exp_are_open_ended() {
    let quals = [qual("YYZ", None, None)];
    assert!(
        base_is_covered(
            "YYZ",
            parse_date_ord("1999-01-01").unwrap(),
            parse_date_ord("2099-01-01").unwrap(),
            &quals,
            0
        ),
        "open-ended qual covers any window",
    );
}

// ── the real demo case: crew based YKF/YYZ flies a YVR pairing → violation ──────────
#[test]
fn crew_based_elsewhere_violates_with_cpp_message() {
    // crew 1031 (live): crew_base = YKF, YYZ; flies pairing 10708 based at YVR.
    let quals = [qual("YKF", None, None), qual("YYZ", None, None)];
    let rosters = [roster(10708, "YVR", "2026-06-05", "2026-06-07")];
    let v = check_base_competency("1031", &rosters, &quals, 0);
    assert_eq!(
        v.len(),
        1,
        "YVR pairing not covered by YKF/YYZ bases → 1 violation"
    );
    assert_eq!(v[0].pairing_id, 10708);
    assert_eq!(v[0].base, "YVR");
    assert_eq!(v[0].message(), "1031: No base (YVR) assigned in roster.");
}

// ── crew based at the pairing's base → legal ────────────────────────────────────────
#[test]
fn crew_based_at_pairing_base_is_legal() {
    let quals = [qual("YVR", None, None), qual("YYZ", None, None)];
    let rosters = [roster(10708, "YVR", "2026-06-05", "2026-06-07")];
    assert!(check_base_competency("c", &rosters, &quals, 0).is_empty());
}

// ── empty/'*' base rosters carry no base requirement → skipped ───────────────────────
#[test]
fn empty_and_wildcard_base_rosters_are_skipped() {
    let quals = [qual("YYZ", None, None)];
    let rosters = [
        roster(1, "", "2026-06-05", "2026-06-07"), // empty base → skip
        roster(2, "*", "2026-06-05", "2026-06-07"), // wildcard base → skip
        roster(3, "YVR", "2026-06-05", "2026-06-07"), // real, uncovered → fires
    ];
    let v = check_base_competency("c", &rosters, &quals, 0);
    assert_eq!(v.len(), 1, "only the real-base uncovered roster fires");
    assert_eq!(v[0].pairing_id, 3);
}

// ── grace period extends the expiry ─────────────────────────────────────────────────
#[test]
fn grace_period_extends_expiry() {
    let quals = [qual("YYZ", Some("2026-01-01"), Some("2026-06-05"))];
    // Roster ends 2026-06-07, expiry 06-05 → uncovered with 0 grace.
    assert!(!base_is_covered(
        "YYZ",
        parse_date_ord("2026-06-01").unwrap(),
        parse_date_ord("2026-06-07").unwrap(),
        &quals,
        0
    ));
    // 5 days grace pushes expiry to 06-10 > 06-07 → covered.
    assert!(base_is_covered(
        "YYZ",
        parse_date_ord("2026-06-01").unwrap(),
        parse_date_ord("2026-06-07").unwrap(),
        &quals,
        5
    ));
}

// ── location-continuity exemption: real false-positive, crew 295 (SIT, 2026-09) ────────
// YVR-based crew flies YVR→YYZ, does two SIM sessions at YYZ, then flies YYZ→YVR. Every
// leg's arrival station matches the next leg's departure station — a genuine closed loop
// out of and back to the crew's qualified base — so the YYZ-based return pairing must NOT
// violate even though its own `base` field (YYZ) isn't a qualification the crew holds.
#[test]
fn crew_295_ground_duty_loop_back_to_qualified_base_is_legal() {
    let quals = [qual("YVR", Some("2021-12-15"), None)];
    let rosters = [
        roster(155083, "YVR", "2026-09-13", "2026-09-14"),
        roster(155089, "YYZ", "2026-09-16", "2026-09-16"),
    ];
    let activities = [
        activity(
            Some(155083),
            "2026-09-13T19:50",
            "2026-09-14T00:30",
            "YVR",
            "YYZ",
        ),
        activity(None, "2026-09-14T13:00", "2026-09-14T19:15", "YYZ", "YYZ"),
        activity(None, "2026-09-15T17:30", "2026-09-15T23:30", "YYZ", "YYZ"),
        activity(
            Some(155089),
            "2026-09-16T13:40",
            "2026-09-16T18:50",
            "YYZ",
            "YVR",
        ),
    ];
    let v = check_base_competency_app(
        "295",
        &rosters,
        &quals,
        0,
        Application::Editor,
        &[],
        &activities,
    );
    assert!(
        v.is_empty(),
        "continuous closed loop back to YVR must not violate, got {v:?}"
    );
}

// ── strict closed-loop requirement: no scheduled return in this roster → still violates ─
#[test]
fn away_base_with_no_scheduled_return_still_violates() {
    let quals = [qual("YVR", Some("2021-12-15"), None)];
    let rosters = [roster(155089, "YYZ", "2026-09-16", "2026-09-16")];
    // Same outbound chain as above, but nothing brings the crew back to YVR.
    let activities = [
        activity(
            Some(155083),
            "2026-09-13T19:50",
            "2026-09-14T00:30",
            "YVR",
            "YYZ",
        ),
        activity(None, "2026-09-14T13:00", "2026-09-14T19:15", "YYZ", "YYZ"),
        activity(
            Some(155089),
            "2026-09-16T13:40",
            "2026-09-16T18:50",
            "YYZ",
            "YYZ",
        ),
    ];
    let v = check_base_competency_app(
        "295",
        &rosters,
        &quals,
        0,
        Application::Editor,
        &[],
        &activities,
    );
    assert_eq!(
        v.len(),
        1,
        "no confirmed return to a qualified base → violation still fires"
    );
}

// ── a genuine discontinuity (station mismatch) still breaks the chain → violates ────────
#[test]
fn broken_chain_with_genuine_discontinuity_still_violates() {
    let quals = [qual("YVR", Some("2021-12-15"), None)];
    let rosters = [roster(155089, "YYZ", "2026-09-16", "2026-09-16")];
    let activities = [
        activity(
            Some(155083),
            "2026-09-13T19:50",
            "2026-09-14T00:30",
            "YVR",
            "YYZ",
        ),
        // Discontinuity: this ground record is at YOW, not YYZ — the chain to it is broken.
        activity(None, "2026-09-14T13:00", "2026-09-14T19:15", "YOW", "YOW"),
        activity(
            Some(155089),
            "2026-09-16T13:40",
            "2026-09-16T18:50",
            "YYZ",
            "YVR",
        ),
    ];
    let v = check_base_competency_app(
        "295",
        &rosters,
        &quals,
        0,
        Application::Editor,
        &[],
        &activities,
    );
    assert_eq!(
        v.len(),
        1,
        "a real location discontinuity must not be exempted"
    );
}

// ── an unknown (empty) station never lets the chain infer a pass ────────────────────────
#[test]
fn unknown_station_activity_breaks_chain() {
    let quals = [qual("YVR", Some("2021-12-15"), None)];
    let rosters = [roster(155089, "YYZ", "2026-09-16", "2026-09-16")];
    let activities = [
        activity(
            Some(155083),
            "2026-09-13T19:50",
            "2026-09-14T00:30",
            "YVR",
            "YYZ",
        ),
        // Missing location data — must not be inferred as a match.
        activity(None, "2026-09-14T13:00", "2026-09-14T19:15", "", ""),
        activity(
            Some(155089),
            "2026-09-16T13:40",
            "2026-09-16T18:50",
            "YYZ",
            "YVR",
        ),
    ];
    let v = check_base_competency_app(
        "295",
        &rosters,
        &quals,
        0,
        Application::Editor,
        &[],
        &activities,
    );
    assert_eq!(
        v.len(),
        1,
        "unknown station data must never be inferred as a continuity match"
    );
}

// ── two different qualified bases on each end is NOT a closed loop → still violates ─────
#[test]
fn different_qualified_bases_on_each_end_does_not_suppress() {
    let quals = [
        qual("YVR", Some("2021-12-15"), None),
        qual("LAX", Some("2021-12-15"), None),
    ];
    let rosters = [roster(155089, "YYZ", "2026-09-16", "2026-09-16")];
    let activities = [
        activity(
            Some(155083),
            "2026-09-13T19:50",
            "2026-09-14T00:30",
            "YVR",
            "YYZ",
        ),
        activity(
            Some(155089),
            "2026-09-16T13:40",
            "2026-09-16T18:50",
            "YYZ",
            "YYZ",
        ),
        // Forward anchor is a DIFFERENT qualified base (LAX, not YVR) — not a real loop.
        activity(
            Some(999),
            "2026-09-17T10:00",
            "2026-09-17T15:00",
            "YYZ",
            "LAX",
        ),
    ];
    let v = check_base_competency_app(
        "c",
        &rosters,
        &quals,
        0,
        Application::Editor,
        &[],
        &activities,
    );
    assert_eq!(
        v.len(),
        1,
        "backward anchor YVR and forward anchor LAX differ → not a genuine closed loop"
    );
}
