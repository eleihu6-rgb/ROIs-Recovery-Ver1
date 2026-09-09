//! C++ → Rust migration-fidelity replica for rule 7503 (LIMITS OF CONSECUTIVE WOCLs, CARS).
//!
//! Source of truth: `crewrule-dev/RuleEngine/rule/rule7503/LimitConsecutiveWoclForCARSRule.cpp`
//! (`CheckRule`) + `TimeUtils::IsTimesCovered` + `DutyUtils::GetLocalNightNums`. There is NO
//! `rule7503_gtest.cpp`, so this replica encodes the contract from the active checker:
//!   WOCL duty ⇔ FDP overlaps [WOCL Start, WOCL End] in acclimatisation-local time;
//!   consecutive WOCL duties accumulate unless a full LOCAL NIGHT of rest (rule 2014's band,
//!   ≥ Min Interval), a ground duty, or a non-WOCL duty resets the run;
//!   violation ⇔ run size > MAX CONSECUTIVE WOCLs (strict `>`).
//!   message: "Concecutive WOCL duties(N) is more than the limitation(M)." (C++ verbatim.)
//!
//! Instance 7503/003 (F8): WOCL 02:00–05:59, MAX 3 → lowered to 2 in workset 103
//! (`sql/migration/2026-06-15-rule-7503-003-and-7500-002-add-to-103-maxwocl-2.sql`). 2014/014
//! Local Night = 22:00–08:00, Min Interval 08:00.

use rois_rule_engine::{
    check_consecutive_wocl, local_night_count, parse_utc_seconds, LocalNightDef, WoclWorkPeriod,
};
use std::io::Write;
use std::process::Command;

fn run_structured_7503(input: &str) -> String {
    let mut child = Command::new(env!("CARGO_BIN_EXE_check-7503"))
        .args([
            "--emit-tsv",
            "--night-start-min",
            "1320",
            "--night-end-min",
            "480",
            "--min-rest-min",
            "480",
        ])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .spawn()
        .expect("start check-7503");
    child
        .stdin
        .take()
        .unwrap()
        .write_all(input.as_bytes())
        .unwrap();
    let output = child.wait_with_output().expect("wait for check-7503");
    assert!(output.status.success());
    String::from_utf8(output.stdout).unwrap()
}

/// F8 2014/014 Local Night Definition: 22:00–08:00, min interval 8h.
fn lnd() -> LocalNightDef {
    LocalNightDef {
        start_min: 22 * 60,
        end_min: 8 * 60,
        min_rest_secs: 8 * 3600,
    }
}

const WOCL_START: i64 = 120; // 02:00
const WOCL_END: i64 = 359; // 05:59

/// A flight duty from UTC timestamps; offset 0 (so UTC == local in these fixtures).
fn fly(pairing: i64, start: &str, end: &str) -> WoclWorkPeriod {
    WoclWorkPeriod {
        pairing_id: Some(pairing),
        start_utc: parse_utc_seconds(start).expect("start"),
        end_utc: parse_utc_seconds(end).expect("end"),
        offset_min: 0,
        is_ground: false,
    }
}

fn ground(start: &str, end: &str) -> WoclWorkPeriod {
    WoclWorkPeriod {
        pairing_id: None,
        start_utc: parse_utc_seconds(start).expect("start"),
        end_utc: parse_utc_seconds(end).expect("end"),
        offset_min: 0,
        is_ground: true,
    }
}

// ── WOCL overlap: a duty touching 02:00–05:59 is a WOCL duty; a daytime duty is not ─────
#[test]
fn wocl_overlap_classification() {
    // A duty 03:00–05:00 overlaps the WOCL window → with itself it's never a violation, but a
    // run of 3 such duties (no night between) must fire at max 2; a daytime-only roster never.
    let day = [fly(1, "2026-06-01T03:00", "2026-06-01T05:00")];
    assert!(
        check_consecutive_wocl("c", &day, WOCL_START, WOCL_END, 0, &lnd()).len() == 1,
        "max 0 → a single WOCL duty already exceeds it (sanity of the overlap test)"
    );
    let daytime = [
        fly(1, "2026-06-01T10:00", "2026-06-01T12:00"),
        fly(2, "2026-06-02T10:00", "2026-06-02T12:00"),
        fly(3, "2026-06-03T10:00", "2026-06-03T12:00"),
    ];
    assert!(
        check_consecutive_wocl("c", &daytime, WOCL_START, WOCL_END, 2, &lnd()).is_empty(),
        "daytime duties never touch the WOCL window"
    );
}

#[test]
fn structured_7503_applies_scope_and_wildcard_rows() {
    let mut input = String::from("R\tYVR\tCA\t737\tTEAM1\t120\t359\t2\n");
    input.push_str("R\t*\t*\t*\t*\t120\t359\t1\n");
    input.push_str("Q\tC1\tBASE\tYVR\t-1000000\t-1\nQ\tC1\tRANK\tCA\t-1000000\t-1\nQ\tC1\tFLEET\t737\t-1000000\t-1\nT\tC1\tTEAM1\n");
    input.push_str("Q\tC2\tBASE\tYYZ\t-1000000\t-1\nT\tC2\tTEAM2\n");
    for crew in ["C1", "C2"] {
        for (pairing, start, end) in [
            ("11", "2026-06-01T03:00", "2026-06-01T05:00"),
            ("22", "2026-06-01T23:00", "2026-06-02T05:00"),
            ("33", "2026-06-02T23:00", "2026-06-03T05:00"),
        ] {
            input.push_str(&format!(
                "D\t{crew}\t{pairing}\t{}\t{}\t0\t0\n",
                parse_utc_seconds(start).unwrap(),
                parse_utc_seconds(end).unwrap()
            ));
        }
    }
    let output = run_structured_7503(&input);
    assert_eq!(output.lines().count(), 3);
    assert_eq!(
        output
            .lines()
            .filter(|line| line.starts_with("C1\t"))
            .count(),
        2
    );
    assert_eq!(
        output
            .lines()
            .filter(|line| line.starts_with("C2\t"))
            .count(),
        1
    );
}

#[test]
fn structured_7503_missing_context_does_not_match_scoped_row() {
    let mut input = String::from("R\tYVR\tCA\t737\tTEAM1\t120\t359\t2\n");
    for (pairing, start, end) in [
        ("11", "2026-06-01T03:00", "2026-06-01T05:00"),
        ("22", "2026-06-01T23:00", "2026-06-02T05:00"),
        ("33", "2026-06-02T23:00", "2026-06-03T05:00"),
    ] {
        input.push_str(&format!(
            "D\tC1\t{pairing}\t{}\t{}\t0\t0\n",
            parse_utc_seconds(start).unwrap(),
            parse_utc_seconds(end).unwrap()
        ));
    }
    assert!(run_structured_7503(&input).is_empty());
}

// ── local_night_count: a full 22:00–08:00 night of rest counts; a short gap does not ────
#[test]
fn local_night_count_matches_cpp() {
    let d = |s: &str| parse_utc_seconds(s).unwrap();
    // Rest 2026-06-01 05:00 → 06-02 12:00 spans the whole 22:00–08:00 night (10h ≥ 8h) → 1.
    assert_eq!(
        local_night_count(d("2026-06-01T05:00"), d("2026-06-02T12:00"), 1320, 480, 480),
        1
    );
    // Rest 06-01 05:00 → 06-01 23:00 overlaps the night only 22:00–23:00 (1h < 8h) → 0.
    assert_eq!(
        local_night_count(d("2026-06-01T05:00"), d("2026-06-01T23:00"), 1320, 480, 480),
        0
    );
}

// ── CARS local night: 22:30–09:30, at least 9h; boundary is 00:30 / 07:30. ───────────
#[test]
fn cars_local_night_rest_boundary_0030_0730() {
    let d = |s: &str| parse_utc_seconds(s).unwrap();
    let start_2230 = 22 * 60 + 30;
    let end_0930 = 9 * 60 + 30;
    let min_9h = 9 * 60;

    assert_eq!(
        local_night_count(
            d("2026-06-02T00:30"),
            d("2026-06-02T09:30"),
            start_2230,
            end_0930,
            min_9h,
        ),
        1,
        "CARS allows a local night's rest starting as late as 00:30"
    );
    assert_eq!(
        local_night_count(
            d("2026-06-02T00:31"),
            d("2026-06-02T09:30"),
            start_2230,
            end_0930,
            min_9h,
        ),
        0,
        "00:31 leaves less than 9h inside the CARS local-night band"
    );
    assert_eq!(
        local_night_count(
            d("2026-06-01T22:30"),
            d("2026-06-02T07:30"),
            start_2230,
            end_0930,
            min_9h,
        ),
        1,
        "CARS allows a local night's rest ending as early as 07:30"
    );
    assert_eq!(
        local_night_count(
            d("2026-06-01T22:30"),
            d("2026-06-02T07:29"),
            start_2230,
            end_0930,
            min_9h,
        ),
        0,
        "07:29 leaves less than 9h inside the CARS local-night band"
    );
}

// ── THE 3→2 MIGRATION: a run of 3 consecutive WOCL duties is legal at max 3, fires at 2 ─
#[test]
fn three_consecutive_wocl_legal_at_3_fires_at_2() {
    // Three WOCL duties, each separated by a gap that does NOT contain a full local night
    // (end 05:00 → next start 23:00 = only 1h of the 22:00–08:00 band) → run grows to 3.
    let duties = [
        fly(11, "2026-06-01T03:00", "2026-06-01T05:00"),
        fly(22, "2026-06-01T23:00", "2026-06-02T05:00"),
        fly(33, "2026-06-02T23:00", "2026-06-03T05:00"),
    ];
    // Legal at MAX=3 (3 is not > 3).
    assert!(
        check_consecutive_wocl("c", &duties, WOCL_START, WOCL_END, 3, &lnd()).is_empty(),
        "3 consecutive WOCL duties is legal at MAX 3"
    );
    // Violation at MAX=2 (3 > 2) — the whole point of the 3→2 change.
    let v = check_consecutive_wocl("c", &duties, WOCL_START, WOCL_END, 2, &lnd());
    assert_eq!(v.len(), 1, "3 consecutive WOCL duties violates at MAX 2");
    assert_eq!(v[0].count, 3);
    assert_eq!(v[0].max_limit, 2);
    assert_eq!(
        v[0].pairing_id, 11,
        "attributed to the FIRST WOCL duty in the run"
    );
    assert_eq!(
        v[0].start_utc,
        parse_utc_seconds("2026-06-01T03:00").unwrap()
    );
    assert_eq!(v[0].end_utc, parse_utc_seconds("2026-06-03T05:00").unwrap());
    assert_eq!(
        v[0].message(),
        "Concecutive WOCL duties(3) is more than the limitation(2)."
    );
}

// ── a full local night of rest RESETS the run ───────────────────────────────────────────
#[test]
fn full_local_night_resets_the_run() {
    // Two WOCL duties separated by a real overnight rest (05:00 → +2 days 23:00, spanning a
    // full 22:00–08:00 night) → the run resets, so even MAX 1 sees only singletons.
    let duties = [
        fly(11, "2026-06-01T03:00", "2026-06-01T05:00"),
        fly(22, "2026-06-03T03:00", "2026-06-03T05:00"),
    ];
    assert!(
        check_consecutive_wocl("c", &duties, WOCL_START, WOCL_END, 1, &lnd()).is_empty(),
        "a full local night between WOCL duties resets the consecutive count"
    );
}

// ── a GROUND duty and a non-WOCL flight duty both reset the run ──────────────────────────
#[test]
fn ground_and_non_wocl_reset_the_run() {
    // WOCL, WOCL, [ground], WOCL, WOCL — the ground duty breaks what would be a run of 4 into
    // two runs of 2, so MAX 2 does NOT fire (2 is not > 2).
    let with_ground = [
        fly(11, "2026-06-01T03:00", "2026-06-01T05:00"),
        fly(22, "2026-06-01T23:00", "2026-06-02T05:00"),
        ground("2026-06-02T10:00", "2026-06-02T18:00"),
        fly(33, "2026-06-02T23:00", "2026-06-03T05:00"),
        fly(44, "2026-06-03T23:00", "2026-06-04T05:00"),
    ];
    assert!(
        check_consecutive_wocl("c", &with_ground, WOCL_START, WOCL_END, 2, &lnd()).is_empty(),
        "a ground duty resets the run into two legal pairs"
    );

    // Replace the ground with a non-WOCL daytime flight duty: same reset behaviour.
    let with_daytime = [
        fly(11, "2026-06-01T03:00", "2026-06-01T05:00"),
        fly(22, "2026-06-01T23:00", "2026-06-02T05:00"),
        fly(99, "2026-06-02T10:00", "2026-06-02T14:00"), // daytime, not WOCL
        fly(33, "2026-06-02T23:00", "2026-06-03T05:00"),
        fly(44, "2026-06-03T23:00", "2026-06-04T05:00"),
    ];
    assert!(
        check_consecutive_wocl("c", &with_daytime, WOCL_START, WOCL_END, 2, &lnd()).is_empty(),
        "a non-WOCL duty resets the run"
    );
}
