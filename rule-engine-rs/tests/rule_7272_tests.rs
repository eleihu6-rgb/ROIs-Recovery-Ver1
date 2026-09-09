//! C++ → Rust migration-fidelity replica for rule 7272/001 (CALCULATE DP OF THE RESERVES).
//!
//! Source of truth: `crewrule-dev/RuleEngine/rule/rule7272/CalculateStandbyDPForTGRule.cpp`.
//! Oracle: `crewrule-dev/RuleTest/rule7272_gtest.cpp` — a standby roster of 12h at RATE 0.33
//! earns DP = 43200·0.33 = 14256 s; an unlisted qualifier returns -1; an offset reduces it;
//! a callout adds the notify period when within the limit.
//!
//! 7272/001 is a DEFINITION / CALC rule: it computes a DP value and emits NO violations (like
//! 7502/2014/7500). F8 params: Assignments=SBY|PRAM|PRPM, Standby Offset=00:00, Rate=0.33,
//! SBY Limit=00:00, Notification Limit=00:00.

use rois_rule_engine::{
    calc_standby_dp, callout_standby_dp, parse_utc_seconds, regular_standby_dp, standby_dp_minutes,
    StandbyDpParam, StandbyRoster,
};

fn t(s: &str) -> i64 {
    parse_utc_seconds(s).expect("utc")
}

/// Build the param row: assignments (csv), rate, and HH:MM limits → minutes.
fn param(
    assignments: &str,
    rate: f64,
    offset_min: i64,
    sby_min: i64,
    notify_min: i64,
) -> StandbyDpParam {
    StandbyDpParam {
        assignments: assignments.split('|').map(|s| s.to_string()).collect(),
        offset_min,
        rate,
        sby_limit_min: sby_min,
        notify_limit_min: notify_min,
    }
}

/// A simple standby roster with no callout (rest start = end).
fn standby(qualifier: &str, start: &str, end: &str) -> StandbyRoster {
    StandbyRoster {
        crew_id: "1427".to_string(),
        qualifier: qualifier.to_string(),
        start_utc: t(start),
        rest_start_utc: t(end),
        notification_utc: 0,
        next_report_utc: 0,
    }
}

// ── gtest 1 & 2: 12h standby at RATE 0.33 → 14256 s, for PRAM and SBY qualifiers. ───────
#[test]
fn pram_12h_rate_033_returns_14256_seconds() {
    let p = [param("SBY|PRAM|PRPM", 0.33, 0, 0, 0)];
    let r = standby("PRAM", "2026-06-02 10:00:00", "2026-06-02 22:00:00");
    assert_eq!(calc_standby_dp(&r, &p), 14256);
}

#[test]
fn sby_qualifier_matches_production_assignment_list() {
    let p = [param("SBY|PRAM|PRPM", 0.33, 0, 0, 0)];
    let r = standby("SBY", "2026-06-02 10:00:00", "2026-06-02 22:00:00");
    assert_eq!(calc_standby_dp(&r, &p), 14256);
}

// ── gtest 3 & 4: an unlisted qualifier returns -1 (no match). ────────────────────────────
#[test]
fn unlisted_qualifier_returns_minus_one() {
    let p = [param("SBY|PRAM|PRPM", 0.33, 0, 0, 0)];
    let r = standby("RES", "2026-06-02 10:00:00", "2026-06-02 22:00:00");
    assert_eq!(calc_standby_dp(&r, &p), -1);
}

#[test]
fn assignments_sby_only_does_not_match_pram_qualifier() {
    let p = [param("SBY", 0.33, 0, 0, 0)];
    let r = standby("PRAM", "2026-06-02 10:00:00", "2026-06-02 22:00:00");
    assert_eq!(calc_standby_dp(&r, &p), -1);
}

// ── gtest 5 & 6: STANDBY OFFSET reduces DP; an offset ≥ duration floors it at 0. ─────────
#[test]
fn with_one_hour_offset_reduces_dp() {
    let p = [param("PRAM", 0.33, 60, 0, 0)]; // offset 01:00 = 60 min
    let r = standby("PRAM", "2026-06-02 10:00:00", "2026-06-02 22:00:00");
    // (43200 - 3600) * 0.33 = 13068
    assert_eq!(calc_standby_dp(&r, &p), 13068);
}

#[test]
fn duration_below_offset_returns_zero() {
    let p = [param("PRAM", 0.33, 780, 0, 0)]; // offset 13:00 = 780 min > 12h duration
    let r = standby("PRAM", "2026-06-02 10:00:00", "2026-06-02 22:00:00");
    assert_eq!(calc_standby_dp(&r, &p), 0);
}

// ── gtest 7 & 8: the duty/pairing path stores DP in whole minutes (14256 → 237 → 14220). ──
#[test]
fn pairing_dp_rounds_to_whole_minutes() {
    let dp_secs = regular_standby_dp(43200, 0, 0.33);
    assert_eq!(dp_secs, 14256);
    let dp_min = standby_dp_minutes(dp_secs);
    assert_eq!(dp_min, 237, "C++ setActualDP(dp/60) floors to minutes");
    assert_eq!(dp_min * 60, 14220, "stored DP seconds become minutes*60");
}

// ── gtest 9: callout standby adds the notify period when within the limit. ───────────────
#[test]
fn callout_adds_notify_period_within_limit() {
    // offset 0, SBY Limit 02:00 (120 min), Notification Limit 04:00 (240 min).
    let p = param("PRAM", 0.33, 0, 120, 240);
    let mut r = standby("PRAM", "2026-06-02 08:00:00", "2026-06-02 20:00:00");
    r.notification_utc = t("2026-06-02 12:00:00"); // 4h into standby
    r.next_report_utc = t("2026-06-02 14:00:00"); // next pairing report

    // sbyDuration = 4h = 14400 → 14400·0.33 = 4752; callout = 2h = 7200 < 240·60 → +7200·0.33
    // = 2376; total 7128.
    assert_eq!(calc_standby_dp(&r, &[p.clone()]), 7128);

    // The callout helper alone agrees.
    assert_eq!(
        callout_standby_dp(
            t("2026-06-02 12:00:00"),
            t("2026-06-02 14:00:00"),
            14400,
            &p
        ),
        7128
    );
}

// ── Live-shape check: regular standby for the demo reserve code 'RES' at rate 0.33. ─────
#[test]
fn live_res_reserve_regular_standby() {
    // The live roster uses 'RES' for reserve standby; the harness adds it to the param's
    // assignment list (SBY|PRAM|PRPM are the dictionary codes for the same standby group).
    let p = [param("SBY|PRAM|PRPM|RES", 0.33, 0, 0, 0)];
    let r = standby("RES", "2026-06-10 12:00:00", "2026-06-11 00:00:00"); // 12h
    assert_eq!(calc_standby_dp(&r, &p), 14256);
    assert_eq!(standby_dp_minutes(calc_standby_dp(&r, &p)), 237);
}
