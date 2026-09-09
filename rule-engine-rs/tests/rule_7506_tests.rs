//! Rule 7506/002 — ONE CHECKIN PER DAY — C++ gtest replica (the GATE).
//!
//! Replicates `crewrule-dev/RuleTest/rule7506_gtest.cpp` exactly (UTC base "AAA",
//! offset 0): two checked rosters whose START local-days are equal → violation; checks
//! the start-day, NOT the end-day; non-checked assignment groups are ignored. Plus the
//! optimizer/PA three-state per the playbook §5h (EDITOR fires · OPTIMIZER all-PA
//! tolerates · OPTIMIZER with a non-PA contributor fires).

use rois_rule_engine::{
    check_single_daily_checkin, check_single_daily_checkin_app, Application, CheckinRoster,
};
use std::io::Write;
use std::process::Command;

fn run_structured_7506(input: &str) -> String {
    let mut child = Command::new(env!("CARGO_BIN_EXE_check-7506"))
        .args(["--emit-tsv"])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .spawn()
        .expect("start check-7506");
    child
        .stdin
        .take()
        .unwrap()
        .write_all(input.as_bytes())
        .unwrap();
    let output = child.wait_with_output().expect("wait for check-7506");
    assert!(output.status.success());
    String::from_utf8(output.stdout).unwrap()
}

/// "YYYY-MM-DD HH:MM:SS" → UTC seconds (the gtest's `utcStrToUtc`, UTC interpretation).
fn utc(s: &str) -> i64 {
    rois_rule_engine::parse_utc_seconds(s).expect("valid utc")
}

/// A checked/unchecked roster at UTC offset 0 ("AAA"), like the gtest's `makeGroundRoster`.
fn roster(start: &str, rest: &str, duty: &str) -> CheckinRoster {
    CheckinRoster {
        duty: duty.to_string(),
        start_utc: utc(start),
        rest_start_utc: utc(rest),
        end_offset_min: 0,
    }
}

fn fly() -> Vec<String> {
    vec!["FLY".to_string()]
}

// ---- gtest case 1: AllowsDifferentStartLocalDays ----
#[test]
fn allows_different_start_local_days() {
    let rosters = [
        roster("2026-03-01 08:00:00", "2026-03-01 18:00:00", "FLY"),
        roster("2026-03-02 08:00:00", "2026-03-02 18:00:00", "FLY"),
    ];
    let v = check_single_daily_checkin("7506OK", &rosters, &fly(), "FLY");
    assert!(v.is_empty(), "different start days must pass: {v:?}");
}

// ---- gtest case 2: RejectsSameStartLocalDay ----
#[test]
fn rejects_same_start_local_day() {
    let rosters = [
        roster("2026-03-01 08:00:00", "2026-03-01 16:00:00", "FLY"),
        roster("2026-03-01 20:00:00", "2026-03-01 23:00:00", "FLY"),
    ];
    let v = check_single_daily_checkin("7506BAD", &rosters, &fly(), "FLY");
    assert_eq!(v.len(), 1, "same start day must fire exactly once: {v:?}");
    // Span clamped to the local day: [min(dayStart,start), min(dayStart+24h, restStart)].
    assert_eq!(v[0].local_day_start_utc, utc("2026-03-01 00:00:00"));
    assert_eq!(v[0].viol_start_utc, utc("2026-03-01 00:00:00"));
    assert_eq!(v[0].viol_end_utc, utc("2026-03-01 23:00:00"));
    assert_eq!(
        v[0].message(),
        "Only one roster allowed (FLY) in one local day."
    );
}

// ---- gtest case 3: AllowsSameEndAndNextStartDayWhenStartsDiffer ----
// roster 1 ends Mar-2 (same day roster 2 starts) but the two STARTS are Mar-1 vs Mar-2.
#[test]
fn allows_same_end_and_next_start_day_when_starts_differ() {
    let rosters = [
        roster("2026-03-01 08:00:00", "2026-03-02 06:00:00", "FLY"),
        roster("2026-03-02 07:00:00", "2026-03-02 18:00:00", "FLY"),
    ];
    let v = check_single_daily_checkin("7506EDGE", &rosters, &fly(), "FLY");
    assert!(
        v.is_empty(),
        "different START days must pass even if end==next start day: {v:?}"
    );
}

// ---- gtest case 4: IgnoresUncheckedAssignmentGroups ----
// checkedGroups=["DO"]: only the single DO roster is checked → no pair → pass.
#[test]
fn ignores_unchecked_assignment_groups() {
    let rosters = [
        roster("2026-03-01 08:00:00", "2026-03-01 16:00:00", "DO"),
        roster("2026-03-01 20:00:00", "2026-03-01 23:00:00", "FLY"),
    ];
    let groups = vec!["DO".to_string()];
    let v = check_single_daily_checkin("7506SKIP", &rosters, &groups, "DO");
    assert!(v.is_empty(), "only checked groups count: {v:?}");
}

// ---- A non-UTC base: local-day bucketing uses the end-station offset ----
// YEG (MDT, -360): two duties starting 2026-06-02 03:00Z and 05:00Z fall on DIFFERENT
// MDT calendar days (Jun-1 21:00 vs Jun-2 23:00 local? no — verify) — assert the engine
// buckets by local day, not UTC day.
#[test]
fn buckets_by_local_day_not_utc() {
    // YEG offset -360 (UTC-6). 2026-06-02 04:00Z = Jun-1 22:00 local; 2026-06-02 05:30Z
    // = Jun-1 23:30 local → SAME local day (Jun-1) → fire. (UTC day would be Jun-2 for both,
    // also same, so to make the point use a UTC-day-different but local-day-same pair.)
    // 2026-06-02 04:00Z = Jun-1 22:00 MDT ; 2026-06-02 05:30Z = Jun-1 23:30 MDT.
    let rosters = [
        CheckinRoster {
            duty: "FLY".into(),
            start_utc: utc("2026-06-02 04:00:00"),
            rest_start_utc: utc("2026-06-02 04:30:00"),
            end_offset_min: -360,
        },
        CheckinRoster {
            duty: "FLY".into(),
            start_utc: utc("2026-06-02 05:30:00"),
            rest_start_utc: utc("2026-06-02 06:00:00"),
            end_offset_min: -360,
        },
    ];
    let v = check_single_daily_checkin("YEG", &rosters, &fly(), "FLY");
    assert_eq!(v.len(), 1, "both start on Jun-1 MDT → fire: {v:?}");
    // The same two instants are on Jun-2 in UTC — a naive UTC-day check would also fire,
    // so add a control: shift the second to Jun-2 00:30 local (Jun-2 06:30Z) → different
    // local day → pass.
    let rosters2 = [
        CheckinRoster {
            duty: "FLY".into(),
            start_utc: utc("2026-06-02 04:00:00"),
            rest_start_utc: utc("2026-06-02 04:30:00"),
            end_offset_min: -360,
        },
        CheckinRoster {
            duty: "FLY".into(),
            start_utc: utc("2026-06-02 06:30:00"),
            rest_start_utc: utc("2026-06-02 07:00:00"),
            end_offset_min: -360,
        },
    ];
    let v2 = check_single_daily_checkin("YEG", &rosters2, &fly(), "FLY");
    assert!(
        v2.is_empty(),
        "Jun-1 23:00 vs Jun-2 00:30 MDT → different local day → pass: {v2:?}"
    );
}

// ---- Optimizer / PA-ignore three-state (playbook §5h) ----
#[test]
fn optimizer_pa_three_state() {
    // Same-day FLY pair → editor fires.
    let rosters = [
        roster("2026-03-01 08:00:00", "2026-03-01 16:00:00", "FLY"),
        roster("2026-03-01 20:00:00", "2026-03-01 23:00:00", "FLY"),
    ];

    // (a) EDITOR → fires.
    let editor = check_single_daily_checkin("CR", &rosters, &fly(), "FLY");
    assert_eq!(editor.len(), 1, "editor fires");

    // (b) OPTIMIZER, BOTH pre-assigned → tolerated (no fire).
    let all_pa = check_single_daily_checkin_app(
        "CR",
        &rosters,
        &fly(),
        "FLY",
        Application::Optimizer,
        &[true, true],
    );
    assert!(
        all_pa.is_empty(),
        "optimizer tolerates an all-PA same-day pair: {all_pa:?}"
    );

    // (c) OPTIMIZER, the second roster newly assigned (non-PA) → fires.
    let one_non_pa = check_single_daily_checkin_app(
        "CR",
        &rosters,
        &fly(),
        "FLY",
        Application::Optimizer,
        &[true, false],
    );
    assert_eq!(
        one_non_pa.len(),
        1,
        "optimizer fires when a contributor is non-PA"
    );
}

#[test]
fn structured_7506_applies_scope_and_assignments() {
    let first = utc("2026-07-14 10:00:00");
    let second = utc("2026-07-14 17:00:00");
    let input = format!(
        "R\tYVR\tCA\t737\tTEAM1\tFLY|SIM\nQ\tC1\tBASE\tYVR\t-1000000\t-1\nQ\tC1\tRANK\tCA\t-1000000\t-1\nQ\tC1\tFLEET\t737\t-1000000\t-1\nT\tC1\tTEAM1\nD\tC1\tSIM\t{first}\t{}\t0\nD\tC1\tFLY\t{second}\t{}\t0\n",
        first + 3600,
        second + 3600
    );
    let output = run_structured_7506(&input);
    assert_eq!(output.lines().count(), 1);
    assert!(output.starts_with("C1\t"));
}

/// Feeder-shaped order: same-day FLY, then an other-day FLY, then same-day SIM.
/// Consecutive walk without a chronological sort misses the FLY↔SIM pair.
#[test]
fn structured_7506_fires_when_d_rows_are_not_chronological() {
    let fly_same = utc("2026-07-14 17:00:00");
    let fly_other = utc("2026-07-20 12:00:00");
    let sim_same = utc("2026-07-14 10:00:00");
    let input = format!(
        "R\t*\t*\t*\t*\tFLY|SIM\nD\tC1\tFLY\t{fly_same}\t{}\t0\nD\tC1\tFLY\t{fly_other}\t{}\t0\nD\tC1\tSIM\t{sim_same}\t{}\t0\n",
        fly_same + 3600,
        fly_other + 3600,
        sim_same + 3600
    );
    let output = run_structured_7506(&input);
    assert_eq!(
        output.lines().count(),
        1,
        "unsorted FLY→FLY→SIM must still fire after chronological sort: {output:?}"
    );
    assert!(output.starts_with("C1\t"));
}

#[test]
fn structured_7506_missing_context_does_not_match_scoped_row() {
    let first = utc("2026-07-14 10:00:00");
    let second = utc("2026-07-14 17:00:00");
    let input = format!(
        "R\tYVR\tCA\t737\tTEAM1\tFLY|SIM\nD\tC1\tSIM\t{first}\t{}\t0\nD\tC1\tFLY\t{second}\t{}\t0\n",
        first + 3600,
        second + 3600
    );
    assert!(run_structured_7506(&input).is_empty());
}
