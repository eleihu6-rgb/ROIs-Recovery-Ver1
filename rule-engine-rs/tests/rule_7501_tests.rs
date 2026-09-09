//! C++ → Rust migration-fidelity replica for rule 7501 (SINGLE DAY FREE FROM DUTY).
//!
//! Source of truth: `crewrule-dev/RuleEngine/rule/rule7501/LimitSingleDayFreeFromDutyForCARSRule.cpp`
//! Oracle:          `crewrule-dev/RuleTest/rule7501_gtest.cpp`.
//!
//! Contract: an SDFD = a True Rest covering TWO CONSECUTIVE local nights (a valid min-rest
//! placement in each band, no duty in the daytime gap). Every rolling PERIOD-hour window
//! must contain at least MIN LIMITS fully-contained SDFDs; fewer → violation (strict `<`).
//! Non-`RH` units are ignored.
//!
//! These replicate the gtest's EDITOR-mode cases (the surface the gantt uses). All fixtures
//! live in a single month, so the fixed crew-base offset reproduces the C++ IANA local
//! night exactly (no DST transition is crossed). The gtest's Local Night Definition fixture
//! is 22:30–09:30 / 9h (`SetUp()`); the live engine is driven from rule 2014 (22:00/08:00/8h)
//! instead — both flow through the SAME parameterized `LocalNightDef`.
//!
//! Optimizer/PA-ignore cases (`ROSTER_OPTIMIZER`) are out of scope here: the gantt evaluates
//! editor-mode legality; the optimizer path is not part of the live SDFD surface.

use rois_rule_engine::{
    check_sdfd_rolling, check_sdfd_rolling_app, parse_utc_seconds,
    rules::rule7501::{check_rule7501_structured, Rule7501CrewContext, Rule7501Row},
    Application, LocalNightDef, SdfdViolation, WorkPeriod7501,
};

/// gtest `SetUp()` Local Night Definition: 22:30 start, 09:30 end, 9h min interval.
const GTEST_LND: LocalNightDef = LocalNightDef {
    start_min: 22 * 60 + 30,
    end_min: 9 * 60 + 30,
    min_rest_secs: 9 * 3600,
};

fn t(s: &str) -> i64 {
    parse_utc_seconds(s).expect("valid utc")
}

/// FLY duty (has a pairing).
fn fly(pairing_id: i64, start: &str, end: &str) -> WorkPeriod7501 {
    WorkPeriod7501 {
        pairing_id: Some(pairing_id),
        start_utc: t(start),
        end_utc: t(end),
    }
}

/// Ground duty (no pairing — DO / SBY etc.).
fn grd(start: &str, end: &str) -> WorkPeriod7501 {
    WorkPeriod7501 {
        pairing_id: None,
        start_utc: t(start),
        end_utc: t(end),
    }
}

/// Round a UTC instant down to the hour (C++ `checkedStartTime -= checkedStartTime % 3600`).
fn rd_hour(secs: i64) -> i64 {
    secs - secs.rem_euclid(3600)
}

/// Editor-mode evaluation of one rule row. `checked_end` defaults to last duty end + 1h
/// (the gtest's `makeFlyRoster` sets `restStrUtc = end + 3600`) unless overridden.
struct Eval<'a> {
    work: &'a [WorkPeriod7501],
    offset_min: i64,
    period_hours: i64,
    unit: &'a str,
    buffer_secs: i64,
    min_limits: i64,
    checked_end: Option<i64>,
}

fn run(e: Eval) -> Option<SdfdViolation> {
    let checked_start = rd_hour(e.work.iter().map(|w| w.start_utc).min().unwrap());
    let checked_end = e
        .checked_end
        .unwrap_or_else(|| e.work.iter().map(|w| w.end_utc).max().unwrap() + 3600);
    check_sdfd_rolling(
        "crew",
        e.work,
        e.offset_min,
        &GTEST_LND,
        e.period_hours,
        e.unit,
        e.buffer_secs,
        e.min_limits,
        checked_start,
        checked_end,
    )
}

fn two_violating_clusters() -> Vec<WorkPeriod7501> {
    let mut work = Vec::new();
    for day in 1..=8 {
        work.push(fly(
            7501_1000 + day,
            &format!("2026-01-{day:02}T08:00"),
            &format!("2026-01-{day:02}T18:00"),
        ));
        work.push(fly(
            7501_8000 + day,
            &format!("2026-08-{day:02}T08:00"),
            &format!("2026-08-{day:02}T18:00"),
        ));
    }
    work.sort_by_key(|duty| duty.start_utc);
    work
}

fn run_with_focus(work: &[WorkPeriod7501], focus_intervals: &[(i64, i64)]) -> SdfdViolation {
    check_sdfd_rolling_app(
        "crew",
        work,
        0,
        &GTEST_LND,
        168,
        "RH",
        0,
        1,
        rd_hour(work.first().expect("work").start_utc),
        work.last().expect("work").end_utc + 3600,
        Application::Editor,
        &[],
        None,
        focus_intervals,
        None,
    )
    .expect("both dense duty clusters contain a violating 0-SDFD window")
}

#[test]
fn focus_prefers_overlapping_window_when_both_violate() {
    let work = two_violating_clusters();
    let focus = [(t("2026-08-04T08:00"), t("2026-08-04T18:00"))];

    let violation = run_with_focus(&work, &focus);

    assert_eq!(violation.total_sdfd, 0);
    assert!(
        violation.window_start_utc < focus[0].1 && violation.window_end_utc > focus[0].0,
        "selected window must overlap the late focus, got {violation:?}"
    );
}

#[test]
fn empty_focus_keeps_global_earliest_worst() {
    let work = two_violating_clusters();

    let violation = run_with_focus(&work, &[]);

    assert_eq!(violation.total_sdfd, 0);
    assert!(
        violation.window_start_utc < t("2026-02-01T00:00"),
        "empty focus must keep the early global worst, got {violation:?}"
    );
}

#[test]
fn focus_with_no_overlap_falls_back_to_global_worst() {
    let work = two_violating_clusters();
    let focus = [(t("2026-10-01T00:00"), t("2026-10-02T00:00"))];

    let violation = run_with_focus(&work, &focus);

    assert_eq!(violation.total_sdfd, 0);
    assert!(
        violation.window_start_utc < t("2026-02-01T00:00"),
        "non-overlapping focus must fall back to the early global worst, got {violation:?}"
    );
}

#[test]
fn focus_crew_filter_only_focuses_listed_crew() {
    let work = two_violating_clusters();
    let focus = [(t("2026-08-04T08:00"), t("2026-08-04T18:00"))];
    let focus_crew_ids = vec!["A".to_string()];
    let run_for = |crew_id: &str| {
        check_sdfd_rolling_app(
            crew_id,
            &work,
            0,
            &GTEST_LND,
            168,
            "RH",
            0,
            1,
            rd_hour(work.first().expect("work").start_utc),
            work.last().expect("work").end_utc + 3600,
            Application::Editor,
            &[],
            None,
            &focus,
            Some(&focus_crew_ids),
        )
        .expect("both crews have a violating window")
    };

    let focused = run_for("A");
    let global = run_for("B");

    assert!(
        focused.window_start_utc < focus[0].1 && focused.window_end_utc > focus[0].0,
        "listed crew must use the late focus, got {focused:?}"
    );
    assert!(
        global.window_start_utc < t("2026-02-01T00:00"),
        "unlisted crew must keep the early global worst, got {global:?}"
    );
}

#[test]
fn structured_7501_applies_only_to_matching_crew_team() {
    let work: Vec<_> = (1..=8).map(march_day).collect();
    let row = Rule7501Row {
        row_id: 0,
        bases: vec!["*".to_string()],
        ranks: vec!["*".to_string()],
        fleets: vec!["*".to_string()],
        teams: vec!["TEAM1".to_string()],
        period_hours: 168,
        unit: "RH".to_string(),
        duty_end_buffer_secs: 0,
        min_limits: 1,
    };
    let matching = Rule7501CrewContext {
        teams: vec!["TEAM1".to_string()],
        ..Default::default()
    };
    let nonmatching = Rule7501CrewContext {
        teams: vec!["TEAM2".to_string()],
        ..Default::default()
    };
    let checked_start = rd_hour(work[0].start_utc);
    let checked_end = t("2026-03-08T23:59:59Z");

    assert!(check_rule7501_structured(
        "crew",
        &row,
        &matching,
        0,
        &GTEST_LND,
        checked_start,
        checked_end,
        &work,
        Application::Editor,
        &[],
        None,
        &[],
        None,
    )
    .is_some());
    assert!(check_rule7501_structured(
        "crew",
        &row,
        &nonmatching,
        0,
        &GTEST_LND,
        checked_start,
        checked_end,
        &work,
        Application::Editor,
        &[],
        None,
        &[],
        None,
    )
    .is_none());
}

/// A day duty 08:00–18:00 UTC on `2026-03-DD`.
fn march_day(day: u32) -> WorkPeriod7501 {
    fly(
        7501_0000 + day as i64,
        &format!("2026-03-{day:02}T08:00"),
        &format!("2026-03-{day:02}T18:00"),
    )
}

// ── A long rest spanning two local nights yields one SDFD in 168h → PASS (168/1). ──────
#[test]
fn allows_one_sdfd_in_168_hours() {
    let work = [
        fly(1, "2026-01-15T08:00", "2026-01-15T18:00"),
        fly(2, "2026-02-10T08:00", "2026-02-10T18:00"),
        fly(3, "2026-03-01T08:00", "2026-03-01T18:00"),
        fly(4, "2026-03-04T08:00", "2026-03-04T18:00"),
    ];
    let v = run(Eval {
        work: &work,
        offset_min: 0,
        period_hours: 168,
        unit: "RH",
        buffer_secs: 0,
        min_limits: 1,
        checked_end: None,
    });
    assert!(
        v.is_none(),
        "every checked 168h window has ≥1 SDFD, got {v:?}"
    );
}

// ── Daily duties with ~14h rest never accumulate an SDFD in any 168h window → FAIL. ────
#[test]
fn rejects_missing_sdfd_in_168_hours() {
    let work: Vec<_> = (1..=8).map(march_day).collect();
    let v = run(Eval {
        work: &work,
        offset_min: 0,
        period_hours: 168,
        unit: "RH",
        buffer_secs: 0,
        min_limits: 1,
        checked_end: None,
    });
    assert!(v.is_some(), "no 168h window reaches 1 SDFD → must violate");
    assert_eq!(
        v.unwrap().total_sdfd,
        0,
        "the 14h-rest roster yields 0 SDFD"
    );
}

// ── Four long rests across the month satisfy BOTH 168/1 and 672/4 → PASS. ──────────────
#[test]
fn allows_four_sdfd_in_672_hours() {
    let days = [
        ("2026-01-01", 1),
        ("2026-01-08", 2),
        ("2026-01-15", 3),
        ("2026-01-22", 4),
        ("2026-02-01", 5),
        ("2026-02-05", 6),
        ("2026-02-09", 7),
        ("2026-02-13", 8),
        ("2026-03-01", 9),
        ("2026-03-04", 10),
        ("2026-03-08", 11),
        ("2026-03-12", 12),
        ("2026-03-16", 13),
    ];
    let work: Vec<_> = days
        .iter()
        .map(|(d, id)| fly(*id, &format!("{d}T08:00"), &format!("{d}T18:00")))
        .collect();
    let v168 = run(Eval {
        work: &work,
        offset_min: 0,
        period_hours: 168,
        unit: "RH",
        buffer_secs: 0,
        min_limits: 1,
        checked_end: None,
    });
    let v672 = run(Eval {
        work: &work,
        offset_min: 0,
        period_hours: 672,
        unit: "RH",
        buffer_secs: 0,
        min_limits: 4,
        checked_end: None,
    });
    assert!(v168.is_none(), "168/1 passes, got {v168:?}");
    assert!(v672.is_none(), "672/4 passes, got {v672:?}");
}

// ── Non-RH units (CD) are ignored entirely → PASS regardless of roster. ────────────────
#[test]
fn ignores_non_rh_units() {
    let work: Vec<_> = (1..=5).map(march_day).collect();
    let v = run(Eval {
        work: &work,
        offset_min: 0,
        period_hours: 168,
        unit: "CD",
        buffer_secs: 0,
        min_limits: 1,
        checked_end: None,
    });
    assert!(v.is_none(), "unit=CD is not checked by 7501");
}

// ── A 168h window that only clips the tail of a long rest is still checked → FAIL. ─────
#[test]
fn rejects_window_that_misses_full_rest_block() {
    let mut work = vec![march_day(1), march_day(4)];
    work.extend((6..=20).map(march_day));
    let v = run(Eval {
        work: &work,
        offset_min: 0,
        period_hours: 168,
        unit: "RH",
        buffer_secs: 0,
        min_limits: 1,
        checked_end: None,
    });
    assert!(
        v.is_some(),
        "a 168h window over the Mar6-20 daily block has 0 SDFD → violate"
    );
}

// ── A single one-day assignment passes in editor mode (both 168/1 and 672/4). ──────────
#[test]
fn allows_single_one_day_duty_editor() {
    let work = [fly(1, "2026-03-15T08:00", "2026-03-15T18:00")];
    let v168 = run(Eval {
        work: &work,
        offset_min: 0,
        period_hours: 168,
        unit: "RH",
        buffer_secs: 0,
        min_limits: 1,
        checked_end: None,
    });
    let v672 = run(Eval {
        work: &work,
        offset_min: 0,
        period_hours: 672,
        unit: "RH",
        buffer_secs: 0,
        min_limits: 4,
        checked_end: None,
    });
    assert!(
        v168.is_none() && v672.is_none(),
        "single short duty cannot violate, got {v168:?}/{v672:?}"
    );
}

// ── Cross-midnight single pairing at UTC+8, idle crew, checked end spans the scenario. ─
#[test]
fn allows_cross_midnight_pairing_idle_crew() {
    // Local Apr 13 14:25 – Apr 14 01:00 at UTC+8 = UTC 06:25 – 17:00.
    let work = [fly(1, "2026-04-13T06:25", "2026-04-13T17:00")];
    let v168 = run(Eval {
        work: &work,
        offset_min: 480,
        period_hours: 168,
        unit: "RH",
        buffer_secs: 0,
        min_limits: 1,
        checked_end: Some(t("2026-04-30T23:59:59")),
    });
    let v672 = run(Eval {
        work: &work,
        offset_min: 480,
        period_hours: 672,
        unit: "RH",
        buffer_secs: 0,
        min_limits: 4,
        checked_end: Some(t("2026-04-30T23:59:59")),
    });
    assert!(
        v168.is_none() && v672.is_none(),
        "idle crew + 1 pairing cannot violate, got {v168:?}/{v672:?}"
    );
}

// ── Jun 2026 five overnight duties at YYZ (EDT, -240): 168/1 fails, 672/4 passes. ──────
#[test]
fn june_five_overnight_168_fails_672_passes() {
    let starts = [
        "2026-06-03T21:40",
        "2026-06-04T21:40",
        "2026-06-05T21:40",
        "2026-06-07T21:40",
        "2026-06-08T21:40",
    ];
    let ends = [
        "2026-06-04T07:45",
        "2026-06-05T07:45",
        "2026-06-06T07:45",
        "2026-06-08T07:45",
        "2026-06-09T07:45",
    ];
    let work: Vec<_> = (0..5)
        .map(|i| fly(i as i64 + 1, starts[i], ends[i]))
        .collect();
    let end = Some(t("2026-06-30T23:59:59"));
    let v168 = run(Eval {
        work: &work,
        offset_min: -240,
        period_hours: 168,
        unit: "RH",
        buffer_secs: 0,
        min_limits: 1,
        checked_end: end,
    });
    let v672 = run(Eval {
        work: &work,
        offset_min: -240,
        period_hours: 672,
        unit: "RH",
        buffer_secs: 0,
        min_limits: 4,
        checked_end: end,
    });
    assert!(
        v168.is_some(),
        "back-to-back overnights have no 168h SDFD → violate"
    );
    assert!(
        v672.is_none(),
        "672h/4 is satisfied across the month, got {v672:?}"
    );
}

// ── Crew-387-like (YYZ EDT): minimal May31+Jun3 roster has one SDFD → PASS (168/1). ────
#[test]
fn crew387_minimal_one_sdfd_passes() {
    let work = [
        fly(1, "2026-05-31T18:40", "2026-06-01T03:45"),
        fly(2, "2026-06-03T18:40", "2026-06-04T03:45"),
    ];
    let v = run(Eval {
        work: &work,
        offset_min: -240,
        period_hours: 168,
        unit: "RH",
        buffer_secs: 0,
        min_limits: 1,
        checked_end: Some(t("2026-06-20T23:59:59")),
    });
    assert!(
        v.is_none(),
        "the May31→Jun3 rest hosts a flexible-night SDFD, got {v:?}"
    );
}

// ── Crew-387-like full roster: the Jun 6 day duty breaks the SDFD run → FAIL, worst=0. ─
#[test]
fn crew387_full_roster_168_violates_with_zero_sdfd_window() {
    let work = [
        fly(1, "2026-05-31T18:40", "2026-06-01T03:45"),
        fly(2, "2026-06-03T18:40", "2026-06-04T03:45"),
        fly(3, "2026-06-04T18:40", "2026-06-05T03:45"),
        fly(4, "2026-06-05T18:40", "2026-06-06T03:45"),
        fly(5, "2026-06-06T15:50", "2026-06-06T21:10"),
        fly(6, "2026-06-07T18:40", "2026-06-08T03:45"),
        fly(7, "2026-06-08T18:40", "2026-06-09T03:45"),
    ];
    let v = run(Eval {
        work: &work,
        offset_min: -240,
        period_hours: 168,
        unit: "RH",
        buffer_secs: 0,
        min_limits: 1,
        checked_end: Some(t("2026-06-20T23:59:59")),
    });
    let v = v.expect("a 0-SDFD 168h window must fire");
    assert_eq!(
        v.total_sdfd, 0,
        "the worst window has zero fully-contained SDFD"
    );
}

// ── Crew 247 (YEG MDT, -360): May FLY history + GDO + Jun-1 PRPM SBY violates 168/1.
//    In the GTEST fixture only "FLY" is registered, so the GDO (duty "DO") is NOT a rest
//    assignment → GetWorkPeriods keeps it as a work period (this is the oracle's world).
//    NOTE: in LIVE data "DO" has assignment TYPE LVE → `isRestAssignment` true → it is
//    dropped (free time). The live check-7501 harness excludes DO/VAC/ILL accordingly;
//    the engine is identical, only the input classification differs. ────────────────────
#[test]
fn crew247_pairing32_prpm_editor_168_violates() {
    let work = [
        fly(61411, "2026-05-25T20:25", "2026-05-26T06:35"),
        fly(61556, "2026-05-28T22:50", "2026-05-30T12:10"),
        grd("2026-05-31T06:01", "2026-06-01T06:00"), // GDO (work period in the gtest fixture)
        grd("2026-06-01T20:00", "2026-06-02T05:59"), // PRPM SBY (pairing #32) — standby = work
    ];
    // Production keeps restStrUtc at the roster-period end for the trailing SBY.
    let v = run(Eval {
        work: &work,
        offset_min: -360,
        period_hours: 168,
        unit: "RH",
        buffer_secs: 30 * 60,
        min_limits: 1,
        checked_end: Some(t("2026-06-30T23:59:59")),
    });
    assert!(
        v.is_some(),
        "crew 247 with pairing #32 PRPM has a sub-1-SDFD 168h window → violate"
    );
}

// ── THE PARAM CHANGE: the live first row goes MinLimits 1 → 3. A roster whose every 168h
//    window holds 1–2 SDFDs clears MinLimits=1 but fails MinLimits=3 — the whole point of
//    the change ("easy to trigger"). Daily duties (0 SDFD) with one single-SDFD rest every
//    5 days: every rolling 7-day window sees ≥1 (spacing < 7) but never 3 (spacing > 3.5). ─
#[test]
fn min_limits_1_passes_but_3_fires() {
    // Mar 1–25 daily 08:00–18:00, dropping Mar 3/8/13/18/23 to leave a 2-night (1-SDFD)
    // rest at each drop. Interior windows hold 1–2 SDFDs.
    let drops = [3u32, 8, 13, 18, 23];
    let work: Vec<_> = (1..=25u32)
        .filter(|d| !drops.contains(d))
        .map(march_day)
        .collect();
    let at1 = run(Eval {
        work: &work,
        offset_min: 0,
        period_hours: 168,
        unit: "RH",
        buffer_secs: 0,
        min_limits: 1,
        checked_end: None,
    });
    let at3 = run(Eval {
        work: &work,
        offset_min: 0,
        period_hours: 168,
        unit: "RH",
        buffer_secs: 0,
        min_limits: 3,
        checked_end: None,
    });
    assert!(
        at1.is_none(),
        "every 168h window has ≥1 SDFD → legal at MinLimits=1, got {at1:?}"
    );
    let at3 = at3.expect("raising MinLimits to 3 makes the same roster violate");
    assert!(
        at3.total_sdfd < 3,
        "the firing window holds fewer than 3 SDFDs (was {})",
        at3.total_sdfd
    );
}

// ── DutyEndBuffer 00:30 boundary — legal: duty ends at local midnight, buffer 30min
//    puts rest start at 00:30, giving Night1 (Mar 1→2) exactly 9h00m = min_interval ✓,
//    Night2 (Mar 2→3) = 11h ✓ → SDFD confirmed → 168h/1 PASS. ─────────────────────────
#[test]
fn duty_end_buffer_30min_legal_when_duty_ends_at_midnight() {
    let work = [
        fly(1, "2026-03-01T14:00", "2026-03-02T00:00"),
        fly(2, "2026-03-04T10:00", "2026-03-04T18:00"),
    ];
    let v = run(Eval {
        work: &work,
        offset_min: 0,
        period_hours: 168,
        unit: "RH",
        buffer_secs: 30 * 60,
        min_limits: 1,
        checked_end: None,
    });
    assert!(
        v.is_none(),
        "duty ending at midnight with 30min buffer should be legal, got {v:?}"
    );
}

// ── DutyEndBuffer 00:30 boundary — illegal: duty ends at local 00:01 (1 min past midnight),
//    buffer 30min puts rest start at 00:31, leaving only 8h59m in Night1 < 9h ✗,
//    Night2 not reached → no SDFD in any 168h window → 168h/1 FAIL. ─────────────────
#[test]
fn duty_end_buffer_30min_illegal_when_duty_ends_one_minute_past_midnight() {
    let mut work = vec![
        fly(1, "2026-03-01T14:00", "2026-03-02T00:01"),
        fly(2, "2026-03-02T10:00", "2026-03-02T18:00"),
    ];
    // Six more daily duties to fill a 168h window — each inter-duty rest (14h) spans
    // only one local night and cannot form an SDFD on its own.
    for day in 3..=8u32 {
        work.push(march_day(day));
    }
    let v = run(Eval {
        work: &work,
        offset_min: 0,
        period_hours: 168,
        unit: "RH",
        buffer_secs: 30 * 60,
        min_limits: 1,
        checked_end: None,
    });
    assert!(
        v.is_some(),
        "duty ending 1min past midnight with 30min buffer should violate, got {v:?}"
    );
    assert_eq!(
        v.unwrap().total_sdfd,
        0,
        "the worst 168h window should have 0 SDFD"
    );
}

// ── Acclimatisation rest offsets must align 1:1 with BuildTrueRestPeriods segments.
// When an inter-duty gap is shorter than the duty-end buffer, C++ omits that rest and
// must NOT emit an acc offset for it (ro_check crew 1439 used to panic: 10 vs 9). ───
#[test]
fn rest_acc_offsets_match_true_rest_when_gap_shorter_than_buffer() {
    use rois_rule_engine::{sdfd_rest_acc_offsets, AccDutyRef};

    let work = vec![
        fly(1, "2026-06-01T08:00", "2026-06-01T18:00"),
        fly(2, "2026-06-02T08:00", "2026-06-02T18:00"),
        fly(3, "2026-06-03T08:00", "2026-06-03T18:00"),
        fly(4, "2026-06-04T08:00", "2026-06-04T18:00"),
        fly(5, "2026-06-05T08:00", "2026-06-05T18:00"),
        fly(6, "2026-06-05T18:30", "2026-06-05T22:00"), // 30 min gap — below 60 min buffer
        fly(7, "2026-06-06T08:00", "2026-06-06T18:00"),
        fly(8, "2026-06-07T08:00", "2026-06-07T18:00"),
        fly(9, "2026-06-08T08:00", "2026-06-08T18:00"),
    ];
    let buffer_secs = 3600;
    let duty_refs: Vec<AccDutyRef> = (0..work.len())
        .map(|i| AccDutyRef {
            ref_tz_min: i as i64,
            duty_end_ref_tz_min: (i as i64) * 10,
        })
        .collect();
    let work_to_ref: Vec<usize> = (0..work.len()).collect();
    let leading_start = work[0].start_utc - 7200;
    let trailing = work.last().unwrap().end_utc + 168 * 3600;

    // debug_assert_eq!(offsets.len(), rests.len()) inside — panics on mismatch in debug builds.
    let offsets = sdfd_rest_acc_offsets(
        &work,
        &duty_refs,
        &work_to_ref,
        0,
        buffer_secs,
        leading_start,
        trailing,
    );
    assert_eq!(
        offsets.len(),
        9,
        "leading + 7 inter-duty (one buffer-skipped) + trailing"
    );
}
