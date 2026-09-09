//! Optimizer / pre-assignment (PA) tolerance — shared C++ contract across all checkers.
//!
//! The C++ engine, when run by the OPTIMIZER (`ROSTER_OPTIMIZER`), tolerates a violation that
//! arises entirely among PRE-ASSIGNED rosters (`source == "PA"`) — it only flags a breach when
//! at least one *contributing* roster is newly assigned (non-PA). It must not be blamed for
//! legality it did not create. The editor (and the live gantt) always reports.
//!
//! Oracle: `rule7501_gtest.cpp` exercises this directly —
//!   `Crew247Pairing32PrpmOptimizerIgnoresPaOnly168RhViolation`  → all-PA → no violation,
//!   `Crew247Pairing32PrpmOptimizerReportsWhenCrInViolationWindow` → a CR roster in the
//!     violation window → fires,
//!   `DISABLED_OptimizerIgnoresRhViolationWhenWindowIsAllPreAssigned` → same for the 5-overnight
//!     roster.
//! Other rules (8002/8056/8004/8030) have no gtest; their PA skip is the same principle taken
//! from `rule8056.cpp:719-721` (`source != "PA"` clause) and `rule8002.cpp` (the optimizer only
//! re-checks windows touched by the roster it is placing — i.e. a non-PA window).
//!
//! Every test asserts the three states: EDITOR fires · OPTIMIZER all-PA tolerates ·
//! OPTIMIZER with a non-PA contributor fires.

use std::collections::{BTreeMap, BTreeSet};

use rois_rule_engine::{
    check_base_competency, check_base_competency_app, check_consecutive_wocl,
    check_consecutive_wocl_app, check_credit_band, check_credit_band_app, check_max_cum_block,
    check_max_cum_block_app, check_min_space_wocl, check_min_space_wocl_app, check_pilot_age,
    check_pilot_age_app, check_roster_spacing, check_roster_spacing_app, check_sdfd_rolling,
    check_sdfd_rolling_app, days_from_civil, parse_utc_seconds, AgeFlight, Application, BaseQual,
    BaseRoster, FlightCrew, LocalNightDef, RosterDuty, WoclSpacingDuty, WoclWorkPeriod,
    WorkPeriod7501,
};

fn t(s: &str) -> i64 {
    parse_utc_seconds(s).expect("valid utc")
}

// ── 8056 ROSTER SPACING ─────────────────────────────────────────────────────────────
// A sub-limit gap fires in editor; the optimizer tolerates it only when BOTH rosters are PA.
#[test]
fn rule8056_optimizer_tolerates_pa_only_gap() {
    let duties = [
        RosterDuty {
            pairing_id: 1,
            start_utc: t("2026-06-01T00:00"),
            end_utc: t("2026-06-01T04:00"),
            label: "A".into(),
            assignment_group: "FLY".into(),
            assignment: "FLT".into(),
        },
        RosterDuty {
            pairing_id: 2,
            start_utc: t("2026-06-01T20:00"),
            end_utc: t("2026-06-02T00:00"),
            label: "B".into(),
            assignment_group: "FLY".into(),
            assignment: "FLT".into(),
        },
    ]; // gap = 16h < 24h

    assert_eq!(
        check_roster_spacing("c", &duties, 24.0).len(),
        1,
        "editor fires"
    );
    assert_eq!(
        check_roster_spacing_app("c", &duties, 24.0, Application::Optimizer, &[true, true]).len(),
        0,
        "optimizer tolerates a tight gap between two pre-assigned rosters",
    );
    assert_eq!(
        check_roster_spacing_app("c", &duties, 24.0, Application::Optimizer, &[true, false]).len(),
        1,
        "a non-PA roster in the pair → optimizer fires",
    );
}

// ── 8004 BASIC COMPETENCY ───────────────────────────────────────────────────────────
#[test]
fn rule8004_optimizer_tolerates_pa_roster() {
    let rosters = [BaseRoster {
        pairing_id: 10,
        base: "YVR".into(),
        start_ord: days_from_civil(2026, 6, 1),
        end_ord: days_from_civil(2026, 6, 2),
    }];
    let quals = [BaseQual {
        base: "YYZ".into(),
        eff_ord: None,
        exp_ord: None,
    }]; // based YYZ, flies YVR → breach

    assert_eq!(
        check_base_competency("c", &rosters, &quals, 0).len(),
        1,
        "editor fires"
    );
    assert_eq!(
        check_base_competency_app("c", &rosters, &quals, 0, Application::Optimizer, &[true], &[])
            .len(),
        0,
        "optimizer tolerates a pre-assigned base breach",
    );
    assert_eq!(
        check_base_competency_app("c", &rosters, &quals, 0, Application::Optimizer, &[false], &[])
            .len(),
        1,
        "a newly-assigned base breach → optimizer fires",
    );
}

// ── 8030 PILOT AGE ──────────────────────────────────────────────────────────────────
#[test]
fn rule8030_optimizer_tolerates_pa_flight() {
    let born = |y| days_from_civil(y, 1, 1);
    let flights = [AgeFlight {
        flight_id: 20,
        start_ord: days_from_civil(2026, 6, 1),
        crew: vec![
            FlightCrew {
                crew_id: "p1".into(),
                division: "P".into(),
                birth_ord: born(1980),
                pairing_id: 20,
            }, // 46
            FlightCrew {
                crew_id: "p2".into(),
                division: "P".into(),
                birth_ord: born(1978),
                pairing_id: 20,
            }, // 48
        ],
    }];
    // age limit 35, max 1 → 2 over-age → 2 violations.
    assert_eq!(
        check_pilot_age(&flights, "P", 35, 1).len(),
        2,
        "editor fires"
    );
    assert_eq!(
        check_pilot_age_app(&flights, "P", 35, 1, Application::Optimizer, &[true]).len(),
        0,
        "optimizer tolerates an entirely pre-assigned flight",
    );
    assert_eq!(
        check_pilot_age_app(&flights, "P", 35, 1, Application::Optimizer, &[false]).len(),
        2,
        "a flight the solver touched → optimizer fires",
    );
}

// ── 8002 MAX_CUM_BLOCK (cumulative window) ──────────────────────────────────────────
#[test]
fn rule8002_optimizer_tolerates_pa_only_window() {
    let d = days_from_civil(2026, 6, 10);
    let mut daily = BTreeMap::new();
    daily.insert(d, 700.0); // 700 min in a 28-day window
    let limit = 600.0; // 10:00

    assert!(
        check_max_cum_block("c", &daily, 28, limit).is_some(),
        "editor fires"
    );
    // Optimizer, the busy day is all pre-assigned (not in non_pa_days) → tolerate.
    assert!(
        check_max_cum_block_app(
            "c",
            &daily,
            28,
            limit,
            Application::Optimizer,
            &BTreeSet::new()
        )
        .is_none(),
        "optimizer tolerates a window made of only pre-assigned days",
    );
    // Optimizer, the busy day carries non-PA block → fire.
    let non_pa: BTreeSet<i64> = [d].into_iter().collect();
    assert!(
        check_max_cum_block_app("c", &daily, 28, limit, Application::Optimizer, &non_pa).is_some(),
        "a non-PA day in the window → optimizer fires",
    );
}

// ── 8002 standalone CREDIT BAND (monthly) ───────────────────────────────────────────
#[test]
fn rule8002_credit_band_optimizer_tolerates_pa_month() {
    // 90:00 credit vs a 75:00 max (no proration) → over-max.
    let over = || check_credit_band("c", "2026-06", 5400, 0, 4500, 1.0);
    assert!(over().is_some(), "editor fires (90:00 > 75:00)");
    assert!(
        check_credit_band_app(
            "c",
            "2026-06",
            5400,
            0,
            4500,
            1.0,
            Application::Optimizer,
            false
        )
        .is_none(),
        "optimizer tolerates an entirely pre-assigned crew-month",
    );
    assert!(
        check_credit_band_app(
            "c",
            "2026-06",
            5400,
            0,
            4500,
            1.0,
            Application::Optimizer,
            true
        )
        .is_some(),
        "a crew-month with newly-assigned activity → optimizer fires",
    );
}

// ── 7501 SDFD — the gtest oracle (Crew247 + 5-overnight) ────────────────────────────
const GTEST_LND: LocalNightDef = LocalNightDef {
    start_min: 22 * 60 + 30,
    end_min: 9 * 60 + 30,
    min_rest_secs: 9 * 3600,
};

fn wp(start: &str, end: &str) -> WorkPeriod7501 {
    WorkPeriod7501 {
        pairing_id: Some(1),
        start_utc: t(start),
        end_utc: t(end),
    }
}

fn rd_hour(secs: i64) -> i64 {
    secs - secs.rem_euclid(3600)
}

/// gtest `DISABLED_OptimizerIgnoresRhViolationWhenWindowIsAllPreAssigned`: 5 back-to-back
/// overnights (YYZ, -240) violate 168h/1 in the editor; the optimizer tolerates when all are
/// pre-assigned, and fires again once a roster in the violation window is newly assigned.
#[test]
fn rule7501_optimizer_tolerates_pa_only_then_fires_on_cr() {
    let work = [
        wp("2026-06-03T21:40", "2026-06-04T07:45"),
        wp("2026-06-04T21:40", "2026-06-05T07:45"),
        wp("2026-06-05T21:40", "2026-06-06T07:45"),
        wp("2026-06-07T21:40", "2026-06-08T07:45"),
        wp("2026-06-08T21:40", "2026-06-09T07:45"),
    ];
    let cs = rd_hour(work[0].start_utc);
    let ce = t("2026-06-30T23:59:59");
    let run = |app, pa: &[bool]| {
        check_sdfd_rolling_app(
            "c",
            &work,
            -240,
            &GTEST_LND,
            168,
            "RH",
            0,
            1,
            cs,
            ce,
            app,
            pa,
            None,
            &[],
            None,
        )
    };

    assert!(
        check_sdfd_rolling("c", &work, -240, &GTEST_LND, 168, "RH", 0, 1, cs, ce).is_some(),
        "editor fires"
    );
    assert!(
        run(Application::Optimizer, &[true, true, true, true, true]).is_none(),
        "optimizer tolerates when every roster in the breach window is pre-assigned",
    );
    // The first roster becomes a new (CR) assignment — its window now must be reported.
    assert!(
        run(Application::Optimizer, &[false, true, true, true, true]).is_some(),
        "a newly-assigned roster in the violation window → optimizer fires",
    );
}

/// gtest Crew247 (YEG, -360): May FLY history + GDO + Jun-1 PRPM SBY. Editor fires; optimizer
/// all-PA tolerates; optimizer with the new PRPM (CR) in the breach window fires.
#[test]
fn rule7501_crew247_optimizer_pa_then_cr() {
    let g = |start: &str, end: &str| WorkPeriod7501 {
        pairing_id: None,
        start_utc: t(start),
        end_utc: t(end),
    };
    let work = [
        wp("2026-05-25T20:25", "2026-05-26T06:35"),
        wp("2026-05-28T22:50", "2026-05-30T12:10"),
        g("2026-05-31T06:01", "2026-06-01T06:00"), // GDO (work period in the gtest fixture)
        g("2026-06-01T20:00", "2026-06-02T05:59"), // PRPM SBY (#32)
    ];
    let cs = rd_hour(work[0].start_utc);
    let ce = t("2026-06-30T23:59:59");
    let run = |app, pa: &[bool]| {
        check_sdfd_rolling_app(
            "c",
            &work,
            -360,
            &GTEST_LND,
            168,
            "RH",
            30 * 60,
            1,
            cs,
            ce,
            app,
            pa,
            None,
            &[],
            None,
        )
    };

    assert!(run(Application::Editor, &[]).is_some(), "editor fires");
    assert!(
        run(Application::Optimizer, &[true, true, true, true]).is_none(),
        "all pre-assigned → optimizer ignores the PA-only 168h breach",
    );
    assert!(
        run(Application::Optimizer, &[true, true, true, false]).is_some(),
        "the new CR PRPM overlaps the breach window → optimizer fires",
    );
}

// ── Shorter SDFD periods are NOT PA-ignored (only 168/672 RH per the C++) ────────────
#[test]
fn rule7501_short_period_is_always_checked_in_optimizer() {
    // A 72h period is not in {168, 672}, so optimizer must behave like the editor.
    let work = [
        wp("2026-06-03T21:40", "2026-06-04T07:45"),
        wp("2026-06-04T21:40", "2026-06-05T07:45"),
        wp("2026-06-05T21:40", "2026-06-06T07:45"),
    ];
    let cs = rd_hour(work[0].start_utc);
    let ce = t("2026-06-30T23:59:59");
    let editor = check_sdfd_rolling("c", &work, -240, &GTEST_LND, 72, "RH", 0, 1, cs, ce);
    let opt_all_pa = check_sdfd_rolling_app(
        "c",
        &work,
        -240,
        &GTEST_LND,
        72,
        "RH",
        0,
        1,
        cs,
        ce,
        Application::Optimizer,
        &[true, true, true],
        None,
        &[],
        None,
    );
    assert_eq!(
        editor.is_some(),
        opt_all_pa.is_some(),
        "72h period: optimizer == editor (no PA-ignore)"
    );
}

// ── 7503 CONSECUTIVE WOCL DUTIES ──────────────────────────────────────────────────────
// 3 back-to-back WOCL overnight duties exceed max_consecutive=2 in the editor.
// Optimizer tolerates the run when ALL duties in it are pre-assigned; fires when any is non-PA.
// Oracle: C++ `LimitConsecutiveWoclForCARSRule.cpp:102` hard-fails in ROSTER_OPTIMIZER on any
// violation — the Rust adds the per-roster PA granularity consistent with all other checkers.
#[test]
fn rule7503_optimizer_tolerates_pa_only_wocl_run() {
    let offset = -240_i64; // YYZ UTC-4
    let lnd = LocalNightDef {
        start_min: 22 * 60,
        end_min: 8 * 60,
        min_rest_secs: 8 * 3600,
    };
    // 3 flights in the same WOCL window (02:00-05:59 local), gaps 30 min each → no local night
    // between consecutive pairs → single run of 3, exceeding max_consecutive=2.
    let periods = [
        WoclWorkPeriod {
            pairing_id: Some(1),
            start_utc: t("2026-06-01T06:00"),
            end_utc: t("2026-06-01T07:00"),
            offset_min: offset,
            is_ground: false,
        },
        WoclWorkPeriod {
            pairing_id: Some(2),
            start_utc: t("2026-06-01T07:30"),
            end_utc: t("2026-06-01T08:30"),
            offset_min: offset,
            is_ground: false,
        },
        WoclWorkPeriod {
            pairing_id: Some(3),
            start_utc: t("2026-06-01T09:00"),
            end_utc: t("2026-06-01T10:00"),
            offset_min: offset,
            is_ground: false,
        },
    ];

    assert_eq!(
        check_consecutive_wocl("c", &periods, 120, 359, 2, &lnd).len(),
        1,
        "editor fires: run of 3 consecutive WOCL duties > max_consecutive=2",
    );
    assert_eq!(
        check_consecutive_wocl_app(
            "c",
            &periods,
            120,
            359,
            2,
            &lnd,
            Application::Optimizer,
            &[true, true, true]
        )
        .len(),
        0,
        "optimizer tolerates an all-PA consecutive WOCL run",
    );
    assert_eq!(
        check_consecutive_wocl_app(
            "c",
            &periods,
            120,
            359,
            2,
            &lnd,
            Application::Optimizer,
            &[true, true, false]
        )
        .len(),
        1,
        "a newly-assigned duty in the run → optimizer fires",
    );
}

// ── 7504 MINIMUM SPACE BETWEEN WOCL DUTIES ────────────────────────────────────────────
// 2 WOCL duties with a 2h gap (< min_period_hours=8h) fire in the editor.
// Optimizer tolerates when BOTH duties are pre-assigned; fires when either is non-PA.
// Oracle: C++ `CheckMinSpaceBetweenDutyForF8Rule.cpp:129,183,240` hard-fails in optimizer —
// the Rust adds the per-roster PA granularity consistent with all other checkers.
#[test]
fn rule7504_optimizer_tolerates_pa_only_wocl_spacing() {
    let offset = -240_i64; // YYZ UTC-4
                           // Duty 1: 06:00-07:00 UTC = 02:00-03:00 local (WOCL). Duty 2: 09:00-10:00 UTC = 05:00-06:00
                           // local (WOCL: 05:00 < 05:59). Gap = 2h < min_period_hours=8h → violation.
    let duties = [
        WoclSpacingDuty {
            pairing_id: 1,
            start_utc: t("2026-06-01T06:00"),
            end_utc: t("2026-06-01T07:00"),
            offset_min: offset,
        },
        WoclSpacingDuty {
            pairing_id: 2,
            start_utc: t("2026-06-01T09:00"),
            end_utc: t("2026-06-01T10:00"),
            offset_min: offset,
        },
    ];

    assert_eq!(
        check_min_space_wocl("c", &duties, 120, 359, 8).len(),
        1,
        "editor fires: 2h gap < 8h min spacing between WOCL duties",
    );
    assert_eq!(
        check_min_space_wocl_app(
            "c",
            &duties,
            120,
            359,
            8,
            Application::Optimizer,
            &[true, true]
        )
        .len(),
        0,
        "optimizer tolerates a PA-only WOCL spacing breach",
    );
    assert_eq!(
        check_min_space_wocl_app(
            "c",
            &duties,
            120,
            359,
            8,
            Application::Optimizer,
            &[false, true]
        )
        .len(),
        1,
        "a newly-assigned duty in the pair → optimizer fires",
    );
}
