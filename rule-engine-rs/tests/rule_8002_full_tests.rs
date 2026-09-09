//! Rule 8002 full-port tests (window enumeration, qualification matching,
//! type branches & filters, optimizer gates). Oracle: the C++ semantics in
//! `ROCode/RO-Dev/.../rule8002.cpp` + `Utility.cpp` documented in
//! `src/rule8002.rs` — every group below cites the contract it locks.

use std::collections::{BTreeMap, BTreeSet};

use rois_rule_engine::{
    check_max_cumulative_row, crew_qualifies_8002, days_from_civil, enumerate_windows,
    qual_matches, Application, CumRule8002, CumType, CumUnit, CumViolation, DayMetrics, QualEntry,
};

const DAY: i64 = 86_400;
const HOUR: i64 = 3_600;

fn local_s(y: i64, m: i64, d: i64) -> i64 {
    days_from_civil(y, m, d) * DAY
}

fn windows(unit: CumUnit, period: i64, cs: i64, ce: i64) -> Vec<(i64, i64)> {
    enumerate_windows(unit, period, cs, ce, "SUN", &[], None)
}

fn wildcard_rule(
    rtype: CumType,
    unit: CumUnit,
    period: i64,
    max_min: i64,
    min_min: i64,
) -> CumRule8002 {
    CumRule8002 {
        bases: vec!["*".into()],
        ranks: vec!["*".into()],
        fleets: vec!["*".into()],
        teams: vec!["*".into()],
        period,
        unit,
        max_min,
        min_min,
        rtype,
        int_oper_band: None,
        aug_oper_band: None,
        duty_aloft_band: None,
        has_sby_or_fly: None,
        reduction_min_per_duty: 0,
    }
}

fn day_metrics(blh: f64) -> DayMetrics {
    DayMetrics {
        blh,
        ..Default::default()
    }
}

/// Run a rule over a daily map with every activity day treated as candidate.
fn run(
    rule: &CumRule8002,
    daily: &BTreeMap<i64, DayMetrics>,
    cs: i64,
    ce: i64,
    app: Application,
) -> Vec<CumViolation> {
    let cand: BTreeSet<i64> = daily.keys().copied().collect();
    check_max_cumulative_row("c1", rule, daily, &cand, cs, ce, "SUN", &[], None, &[], app)
}

// ═════════════════════════════════════════════════════════════════════════
// T1 — window enumeration
// ═════════════════════════════════════════════════════════════════════════

#[test]
fn t1_cd_grid_start_leadin_and_stride() {
    // Utility.cpp:1817-1821/1903-1913: start = dayStart(cs) − (N−1)d, stride 1d,
    // windows inclusive [t1, t1 + N·86400 − 1], last window covers checked end.
    let cs = local_s(2026, 6, 1);
    let ce = local_s(2026, 6, 4); // 3-day checked span (end exclusive of most days)
    let w = windows(CumUnit::Cd, 7, cs, ce);
    assert_eq!(
        w[0].0,
        cs - 6 * DAY,
        "lead-in = (N-1) days before checked start"
    );
    assert_eq!(w[0].1, w[0].0 + 7 * DAY - 1);
    for pair in w.windows(2) {
        assert_eq!(pair[1].0 - pair[0].0, DAY, "stride 1 day");
    }
    assert!(w.last().unwrap().1 >= ce, "last window reaches checked end");
    // Starts May26..May29: the loop stops at the first t2 >= ce
    // (May29 + 7d − 1 = Jun4 23:59:59 >= Jun4 00:00).
    assert_eq!(w.len(), 4);
}

#[test]
fn t1_cd_n1_daily_windows() {
    let cs = local_s(2026, 6, 1);
    let ce = cs + 2 * DAY;
    let w = windows(CumUnit::Cd, 1, cs, ce);
    assert_eq!(
        w[0],
        (cs, cs + DAY - 1),
        "N=1: single-day windows, no lead-in"
    );
    assert_eq!(w.len(), 3);
}

#[test]
fn t1_rd_equals_cd() {
    let cs = local_s(2026, 6, 1);
    let ce = local_s(2026, 6, 10);
    assert_eq!(
        windows(CumUnit::Rd, 7, cs, ce),
        windows(CumUnit::Cd, 7, cs, ce)
    );
}

#[test]
fn t1_cw_week_start_tokens() {
    // 2026-06-03 is a Wednesday (ord+4 mod 7: check via known date).
    let wed = local_s(2026, 6, 3);
    let ce = wed + DAY;
    // Default (SUN): week containing Wed 6/3 starts Sun 5/31.
    let w_sun = windows(CumUnit::Cw, 1, wed, ce);
    assert_eq!(w_sun[0].0, local_s(2026, 5, 31));
    assert_eq!(w_sun[0].1, local_s(2026, 5, 31) + 7 * DAY - 1);
    // MON start: week begins Mon 6/1.
    let w_mon = enumerate_windows(CumUnit::Cw, 1, wed, ce, "MON", &[], None);
    assert_eq!(w_mon[0].0, local_s(2026, 6, 1));
    // THU start: Wed 6/3 belongs to the week that began Thu 5/28.
    let w_thu = enumerate_windows(CumUnit::Cw, 1, wed, ce, "THU", &[], None);
    assert_eq!(w_thu[0].0, local_s(2026, 5, 28));
}

#[test]
fn t1_cw_two_week_windows_stride_one_week() {
    let cs = local_s(2026, 6, 1);
    let ce = local_s(2026, 6, 20);
    let w = enumerate_windows(CumUnit::Cw, 2, cs, ce, "MON", &[], None);
    assert_eq!(w[0], (local_s(2026, 6, 1), local_s(2026, 6, 15) - 1));
    for pair in w.windows(2) {
        assert_eq!(pair[1].0 - pair[0].0, 7 * DAY, "stride 1 week");
    }
    assert!(w.last().unwrap().1 >= ce);
}

#[test]
fn t1_cm_forward_and_backward_union() {
    // Utility.cpp:1852-1877: forward from month start of cs, backward from the
    // month boundary at/after ce; dedup keeps the FIRST inserted (forward) end.
    let cs = local_s(2026, 1, 15);
    let ce = local_s(2026, 3, 10);
    let w = windows(CumUnit::Cm, 1, cs, ce);
    // Forward: [Jan1, Feb1-1], [Feb1, Mar1-1], [Mar1, Apr1-1] (t2 >= ce stops).
    assert!(w.contains(&(local_s(2026, 1, 1), local_s(2026, 2, 1) - 1)));
    assert!(w.contains(&(local_s(2026, 2, 1), local_s(2026, 3, 1) - 1)));
    assert!(w.contains(&(local_s(2026, 3, 1), local_s(2026, 4, 1) - 1)));
    // Backward from Apr 1 (monthStart(ce)=Mar1 != ce → +1 = Apr1) inserts the
    // same three windows (dups) and breaks once t2 = Jan1 <= checked start —
    // N=1 never precedes monthStart(cs).
    assert_eq!(w.len(), 3, "duplicates collapsed via map-insert semantics");

    // N=2: the backward roll DOES extend before the checked start
    // (Utility.cpp:1870-1876; C++ keeps such windows, overlap-gated later).
    let w2 = windows(CumUnit::Cm, 2, cs, ce);
    assert!(
        w2.contains(&(local_s(2025, 12, 1), local_s(2026, 2, 1) - 1)),
        "backward N=2 window [Dec1, Feb1-1] precedes checked start"
    );
    assert!(w2.contains(&(local_s(2026, 1, 1), local_s(2026, 3, 1) - 1)));
    assert!(w2.contains(&(local_s(2026, 2, 1), local_s(2026, 4, 1) - 1)));
    assert_eq!(w2.len(), 3);
}

#[test]
fn t1_cm_three_month_windows_month_length_variation() {
    let cs = local_s(2026, 1, 1);
    let ce = local_s(2026, 2, 1);
    let w = windows(CumUnit::Cm, 3, cs, ce);
    // Forward first window: [Jan1, Apr1-1] — spans 31+28+31 days.
    let jan1 = local_s(2026, 1, 1);
    assert!(w.contains(&(jan1, local_s(2026, 4, 1) - 1)));
    let span_days = (local_s(2026, 4, 1) - jan1) / DAY;
    assert_eq!(span_days, 31 + 28 + 31);
}

#[test]
fn t1_cy_ignores_period_and_spans_year_boundary() {
    // Utility.cpp:1828-1838: consecutive 1-year windows regardless of PERIOD.
    let cs = local_s(2025, 11, 20);
    let ce = local_s(2026, 2, 10);
    let w = windows(CumUnit::Cy, 5, cs, ce);
    assert_eq!(w[0], (local_s(2025, 1, 1), local_s(2026, 1, 1) - 1));
    assert_eq!(w[1], (local_s(2026, 1, 1), local_s(2027, 1, 1) - 1));
    assert_eq!(w.len(), 2);
}

#[test]
fn t1_rh_hour_windows() {
    let cs = local_s(2026, 6, 1) + 90; // 00:01:30 → snaps to hour start
    let ce = cs + 3 * HOUR;
    let w = windows(CumUnit::Rh, 168, cs, ce);
    assert_eq!(w[0].0, local_s(2026, 6, 1), "snapped to local hour start");
    assert_eq!(w[0].1, w[0].0 + 168 * HOUR - 1);
    for pair in w.windows(2) {
        assert_eq!(pair[1].0 - pair[0].0, HOUR, "stride 1 hour");
    }
}

#[test]
fn t1_rp_windows_from_roster_periods() {
    // rule8002.cpp:132-150: [rp_start − (N−1)·28d, rp_end + 24h]; only RPs
    // overlapping the checked window.
    let rp1 = (local_s(2026, 6, 1), local_s(2026, 6, 28));
    let rp_old = (local_s(2025, 1, 1), local_s(2025, 1, 28)); // outside
    let cs = local_s(2026, 6, 1);
    let ce = local_s(2026, 7, 1);
    let w1 = enumerate_windows(CumUnit::Rp, 1, cs, ce, "SUN", &[rp1, rp_old], None);
    assert_eq!(w1, vec![(rp1.0, rp1.1 + DAY)]);
    let w2 = enumerate_windows(CumUnit::Rp, 2, cs, ce, "SUN", &[rp1], None);
    assert_eq!(w2[0].0, rp1.0 - 28 * DAY, "N=2 pushes start back 28 days");
}

#[test]
fn t1_ytm_basic_skip_and_cross_year() {
    let cs = local_s(2026, 3, 10);
    let ce = local_s(2026, 7, 1);
    // month=6 → [Jan1, Jun30 23:59:59]; kept only when the scenario end
    // reaches the end of that month (rule8002.cpp:161: endMonth > scenarioEnd
    // → skip). Jul 1 00:00 > Jun30 23:59:59 → kept.
    let w = enumerate_windows(
        CumUnit::Ytm,
        6,
        cs,
        ce,
        "SUN",
        &[],
        Some(local_s(2026, 7, 1)),
    );
    assert_eq!(w, vec![(local_s(2026, 1, 1), local_s(2026, 7, 1) - 1)]);
    // Scenario ends mid-June (before end-of-June) → rule skipped entirely.
    let w_skip = enumerate_windows(
        CumUnit::Ytm,
        6,
        cs,
        ce,
        "SUN",
        &[],
        Some(local_s(2026, 6, 15)),
    );
    assert!(w_skip.is_empty());
    // Checked window spanning a year boundary adds the end-year window.
    let cs2 = local_s(2025, 12, 20);
    let ce2 = local_s(2026, 1, 10);
    let w2 = enumerate_windows(
        CumUnit::Ytm,
        6,
        cs2,
        ce2,
        "SUN",
        &[],
        Some(local_s(2026, 12, 31)),
    );
    assert_eq!(w2.len(), 2);
    assert!(w2.contains(&(local_s(2025, 1, 1), local_s(2025, 7, 1) - 1)));
    assert!(w2.contains(&(local_s(2026, 1, 1), local_s(2026, 7, 1) - 1)));
}

// ═════════════════════════════════════════════════════════════════════════
// T2 — qualification matching
// ═════════════════════════════════════════════════════════════════════════

fn q(v: &str, eff: i64, exp: i64) -> QualEntry {
    QualEntry {
        value: v.into(),
        eff_s: eff,
        exp_s: exp,
    }
}

#[test]
fn t2_wildcard_and_pipe_list_or() {
    let quals = [q("CA", 0, i64::MAX)];
    assert!(
        qual_matches(&["*".into()], &[], 0, 100, false),
        "star = not gated"
    );
    assert!(
        qual_matches(&[], &[], 0, 100, false),
        "empty list = not gated"
    );
    assert!(
        qual_matches(&["FO".into(), "CA".into()], &quals, 0, 100, false),
        "OR list"
    );
    assert!(!qual_matches(&["FO".into()], &quals, 0, 100, false));
}

#[test]
fn t2_effective_date_boundaries_strict_vs_inclusive() {
    // Utility.cpp:4643-4645 base/rank/fleet: eff <= win_end && exp > win_start.
    // Utility.cpp:4735-4737 teams: exp >= win_start.
    let win = (1000i64, 2000i64);
    let exp_at_start = [q("X", 0, 1000)];
    assert!(
        !qual_matches(&["X".into()], &exp_at_start, win.0, win.1, false),
        "exp == win_start fails the strict flavour"
    );
    assert!(
        qual_matches(&["X".into()], &exp_at_start, win.0, win.1, true),
        "exp == win_start passes the inclusive (team) flavour"
    );
    let eff_after_end = [q("X", 2001, i64::MAX)];
    assert!(!qual_matches(
        &["X".into()],
        &eff_after_end,
        win.0,
        win.1,
        false
    ));
    let open_exp = [q("X", 0, i64::MAX)];
    assert!(qual_matches(&["X".into()], &open_exp, win.0, win.1, false));
}

#[test]
fn t2_crew_with_no_rank_rows() {
    // rule8002.cpp:114: no rank records + rank gated → crew skipped.
    let mut rule = wildcard_rule(CumType::Bh, CumUnit::Cd, 7, 100, 0);
    rule.ranks = vec!["CA".into()];
    assert!(!crew_qualifies_8002(&rule, &[], &[], &[], &[], 0, 100));
    rule.ranks = vec!["*".into()];
    assert!(crew_qualifies_8002(&rule, &[], &[], &[], &[], 0, 100));
}

#[test]
fn t2_team_gate_with_empty_team_data_never_fires() {
    // Team section is empty in F8 ro_input: a non-* teams row never matches.
    let mut rule = wildcard_rule(CumType::Bh, CumUnit::Cd, 1, 0, 0);
    rule.teams = vec!["T1".into()];
    let mut daily = BTreeMap::new();
    daily.insert(local_s(2026, 6, 1) / DAY, day_metrics(600.0)); // way over max=0
    let v = run(
        &rule,
        &daily,
        local_s(2026, 6, 1),
        local_s(2026, 6, 2),
        Application::Editor,
    );
    assert!(v.is_empty(), "per-window team gate skips every window");
}

// ═════════════════════════════════════════════════════════════════════════
// T3 — type branches & filters
// ═════════════════════════════════════════════════════════════════════════

#[test]
fn t3_bh_max_strict_greater() {
    let rule = wildcard_rule(CumType::Bh, CumUnit::Cd, 7, 600, 0);
    let cs = local_s(2026, 6, 1);
    let ce = local_s(2026, 6, 8);
    let mut daily = BTreeMap::new();
    daily.insert(cs / DAY, day_metrics(600.0));
    assert!(
        run(&rule, &daily, cs, ce, Application::Editor).is_empty(),
        "== limit is legal"
    );
    daily.insert(cs / DAY, day_metrics(601.0));
    let v = run(&rule, &daily, cs, ce, Application::Editor);
    assert!(!v.is_empty());
    assert!(v[0].over);
    assert_eq!(v[0].actual_min, 601);
}

#[test]
fn t3_min_editor_only() {
    let rule = wildcard_rule(CumType::Bh, CumUnit::Cd, 7, 999_999, 60);
    let cs = local_s(2026, 6, 1);
    let ce = cs + DAY;
    let mut daily = BTreeMap::new();
    daily.insert(cs / DAY, day_metrics(30.0)); // under min=60
    let v_ed = run(&rule, &daily, cs, ce, Application::Editor);
    assert!(!v_ed.is_empty(), "editor reports under-min");
    assert!(!v_ed[0].over);
    let v_op = run(&rule, &daily, cs, ce, Application::Optimizer);
    assert!(v_op.is_empty(), "optimizer suppresses min checks");
    // == min is legal (strict <).
    daily.insert(cs / DAY, day_metrics(60.0));
    assert!(run(&rule, &daily, cs, ce, Application::Editor).is_empty());
}

#[test]
fn t3_min_fires_on_empty_window_in_editor() {
    // C++ iterates grid windows regardless of data; an empty window under min
    // violates in editor mode.
    let rule = wildcard_rule(CumType::Bh, CumUnit::Cd, 1, 999_999, 60);
    let cs = local_s(2026, 6, 1);
    let ce = cs + DAY;
    let daily: BTreeMap<i64, DayMetrics> = BTreeMap::new();
    let v = run(&rule, &daily, cs, ce, Application::Editor);
    assert!(!v.is_empty(), "empty window < min fires in editor");
    assert_eq!(v[0].actual_min, 0);
    assert!(run(&rule, &daily, cs, ce, Application::Optimizer).is_empty());
}

#[test]
fn t3_bh_band_filters_left_closed_right_open() {
    // rule8002.cpp:403-419.
    let mut rule = wildcard_rule(CumType::Bh, CumUnit::Cd, 1, 100, 0);
    rule.int_oper_band = Some((60, 120));
    let cs = local_s(2026, 6, 1);
    let ce = cs + DAY;
    let mk = |blh: f64, int_blh: f64| {
        let mut daily = BTreeMap::new();
        daily.insert(
            cs / DAY,
            DayMetrics {
                blh,
                int_blh,
                ..Default::default()
            },
        );
        daily
    };
    // int_blh inside [60,120) → window checked → blh 200 > 100 violates.
    assert!(
        !run(&rule, &mk(200.0, 60.0), cs, ce, Application::Editor).is_empty(),
        "at lower: checked"
    );
    assert!(!run(&rule, &mk(200.0, 119.0), cs, ce, Application::Editor).is_empty());
    // At upper bound → skipped (right-open).
    assert!(
        run(&rule, &mk(200.0, 120.0), cs, ce, Application::Editor).is_empty(),
        "at upper: skipped"
    );
    assert!(
        run(&rule, &mk(200.0, 30.0), cs, ce, Application::Editor).is_empty(),
        "below lower: skipped"
    );
    // All-zero guard: lo=hi=val=0 → the (lo!=0||hi!=0||val!=0) guard is false → checked.
    rule.int_oper_band = Some((0, 0));
    assert!(
        !run(&rule, &mk(200.0, 0.0), cs, ce, Application::Editor).is_empty(),
        "0-0 band with val 0: checked"
    );
    // band None ("*") → never skips.
    rule.int_oper_band = None;
    assert!(!run(&rule, &mk(200.0, 500.0), cs, ce, Application::Editor).is_empty());
}

#[test]
fn t3_has_sby_or_fly_filter() {
    // rule8002.cpp:303-316. ce = cs + DAY − 1 keeps the grid to a SINGLE
    // window: the min-limit probe below must only see the filtered window,
    // not a trailing empty one.
    let cs = local_s(2026, 6, 1);
    let ce = cs + DAY - 1;
    let mk = |blh: f64, sby: f64| {
        let mut daily = BTreeMap::new();
        daily.insert(
            cs / DAY,
            DayMetrics {
                blh,
                sby_present: sby,
                ..Default::default()
            },
        );
        daily
    };
    let mut rule = wildcard_rule(CumType::Dp, CumUnit::Cd, 1, 999_999, 60); // min check as probe
                                                                            // Y: window with neither SBY nor BLH is skipped (no min violation emitted).
    rule.has_sby_or_fly = Some(true);
    assert!(
        run(&rule, &mk(0.0, 0.0), cs, ce, Application::Editor).is_empty(),
        "Y skips empty window"
    );
    assert!(
        !run(&rule, &mk(100.0, 0.0), cs, ce, Application::Editor).is_empty(),
        "Y keeps blh window"
    );
    assert!(
        !run(&rule, &mk(0.0, 1.0), cs, ce, Application::Editor).is_empty(),
        "Y keeps sby window"
    );
    // N: window WITH sby or blh is skipped.
    rule.has_sby_or_fly = Some(false);
    assert!(
        run(&rule, &mk(100.0, 0.0), cs, ce, Application::Editor).is_empty(),
        "N skips blh window"
    );
    assert!(
        run(&rule, &mk(0.0, 1.0), cs, ce, Application::Editor).is_empty(),
        "N skips sby window"
    );
    assert!(
        !run(&rule, &mk(0.0, 0.0), cs, ce, Application::Editor).is_empty(),
        "N keeps empty window"
    );
    // *: no filtering.
    rule.has_sby_or_fly = None;
    assert!(!run(&rule, &mk(0.0, 0.0), cs, ce, Application::Editor).is_empty());
}

#[test]
fn t3_dp_cross_tz_reduction_and_floor() {
    // rule8002.cpp:458-464: dp -= cross_tz_count × reduction, floor at 0.
    let cs = local_s(2026, 6, 1);
    let ce = cs + DAY;
    let mut daily = BTreeMap::new();
    daily.insert(
        cs / DAY,
        DayMetrics {
            dp: 200.0,
            cross_tz_count: 3.0,
            ..Default::default()
        },
    );
    let mut rule = wildcard_rule(CumType::Dp, CumUnit::Cd, 1, 100, 0);
    rule.reduction_min_per_duty = 30; // 200 − 3×30 = 110 > 100 → violates
    let v = run(&rule, &daily, cs, ce, Application::Editor);
    assert_eq!(v[0].actual_min, 110);
    assert_eq!(v[0].cross_tz_count, 3);
    rule.reduction_min_per_duty = 40; // 200 − 120 = 80 ≤ 100 → legal
    assert!(run(&rule, &daily, cs, ce, Application::Editor).is_empty());
    rule.reduction_min_per_duty = 100; // 200 − 300 → floored to 0
    rule.min_min = 10; // editor min probe: 0 < 10 fires with actual 0
    let v2 = run(&rule, &daily, cs, ce, Application::Editor);
    assert_eq!(v2[0].actual_min, 0, "reduction floors at 0");
    // No reduction param → cross_tz untouched.
    rule.reduction_min_per_duty = 0;
    rule.min_min = 0;
    rule.max_min = 150; // raw dp 200 > 150
    let v3 = run(&rule, &daily, cs, ce, Application::Editor);
    assert_eq!(v3[0].actual_min, 200);
    assert_eq!(v3[0].cross_tz_count, 0);
}

#[test]
fn t3_ft_plain_and_ch_ceil() {
    let cs = local_s(2026, 6, 1);
    let ce = cs + DAY;
    let mut daily = BTreeMap::new();
    daily.insert(
        cs / DAY,
        DayMetrics {
            ft: 90.0,
            credit: 100.2,
            ..Default::default()
        },
    );
    let ft_rule = wildcard_rule(CumType::Ft, CumUnit::Cd, 1, 89, 0);
    assert_eq!(
        run(&ft_rule, &daily, cs, ce, Application::Editor)[0].actual_min,
        90
    );
    // CH: ceil(100.2) = 101 > 100 violates; a plain truncation would pass.
    let ch_rule = wildcard_rule(CumType::Ch, CumUnit::Cd, 1, 100, 0);
    let v = run(&ch_rule, &daily, cs, ce, Application::Editor);
    assert_eq!(v[0].actual_min, 101, "CH is ceil'd (rule8002.cpp:665)");
}

#[test]
fn t3_optimizer_early_stop_one_violation_per_row() {
    let rule = wildcard_rule(CumType::Bh, CumUnit::Cd, 1, 10, 0);
    let cs = local_s(2026, 6, 1);
    let ce = cs + 3 * DAY;
    let mut daily = BTreeMap::new();
    for i in 0..3 {
        daily.insert(cs / DAY + i, day_metrics(100.0)); // every day violates
    }
    let v_op = run(&rule, &daily, cs, ce, Application::Optimizer);
    assert_eq!(v_op.len(), 1, "optimizer returns on first breach");
    let v_ed = run(&rule, &daily, cs, ce, Application::Editor);
    assert!(v_ed.len() >= 3, "editor collects every violating window");
}

// ═════════════════════════════════════════════════════════════════════════
// T4 — optimizer gates
// ═════════════════════════════════════════════════════════════════════════

#[test]
fn t4_optimizer_skips_windows_without_candidate_days() {
    let rule = wildcard_rule(CumType::Bh, CumUnit::Cd, 1, 10, 0);
    let cs = local_s(2026, 6, 1);
    let ce = cs + 2 * DAY;
    let mut daily = BTreeMap::new();
    daily.insert(cs / DAY, day_metrics(100.0)); // day 1: violating, PA-only
    daily.insert(cs / DAY + 1, day_metrics(100.0)); // day 2: violating, candidate
    let cand: BTreeSet<i64> = [cs / DAY + 1].into();
    let v = check_max_cumulative_row(
        "c1",
        &rule,
        &daily,
        &cand,
        cs,
        ce,
        "SUN",
        &[],
        None,
        &[],
        Application::Optimizer,
    );
    assert_eq!(v.len(), 1);
    assert_eq!(
        v[0].win_start_local_s,
        cs + DAY,
        "PA-only window skipped, candidate window flagged"
    );
    // No candidate days at all → nothing flagged.
    let none: BTreeSet<i64> = BTreeSet::new();
    let v2 = check_max_cumulative_row(
        "c1",
        &rule,
        &daily,
        &none,
        cs,
        ce,
        "SUN",
        &[],
        None,
        &[],
        Application::Optimizer,
    );
    assert!(v2.is_empty());
}

#[test]
fn t4_checked_window_overlap_gate() {
    // CM backward roll produces a window entirely before the checked start?
    // No — it always touches it; instead verify via RP: an RP window pushed
    // back 28 days still overlaps, but a window strictly outside is dropped
    // by the overlap gate inside check_max_cumulative_row.
    let rule_rp = CumRule8002 {
        unit: CumUnit::Rp,
        ..wildcard_rule(CumType::Bh, CumUnit::Rp, 1, 10, 0)
    };
    let cs = local_s(2026, 6, 1);
    let ce = local_s(2026, 7, 1);
    let mut daily = BTreeMap::new();
    daily.insert(cs / DAY, day_metrics(100.0));
    let cand: BTreeSet<i64> = daily.keys().copied().collect();
    // RP overlapping → its window is checked.
    let v = check_max_cumulative_row(
        "c1",
        &rule_rp,
        &daily,
        &cand,
        cs,
        ce,
        "SUN",
        &[(local_s(2026, 6, 1), local_s(2026, 6, 28))],
        None,
        &[],
        Application::Editor,
    );
    assert!(!v.is_empty());
}

#[test]
fn t4_crew_level_qualification_gate() {
    let mut rule = wildcard_rule(CumType::Bh, CumUnit::Cd, 7, 100, 0);
    rule.ranks = vec!["CA".into()];
    rule.fleets = vec!["B737".into()];
    let win = (local_s(2026, 6, 1), local_s(2026, 7, 1));
    let ca = [q("CA", 0, i64::MAX)];
    let fo = [q("FO", 0, i64::MAX)];
    let b737 = [q("B737", 0, i64::MAX)];
    assert!(crew_qualifies_8002(
        &rule,
        &[],
        &ca,
        &b737,
        &[],
        win.0,
        win.1
    ));
    assert!(
        !crew_qualifies_8002(&rule, &[], &fo, &b737, &[], win.0, win.1),
        "rank mismatch"
    );
    assert!(
        !crew_qualifies_8002(&rule, &[], &ca, &[], &[], win.0, win.1),
        "no fleet rows + gated fleet"
    );
}
