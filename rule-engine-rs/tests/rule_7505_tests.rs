//! C++ → Rust migration-fidelity replica for rule 7505/002 (MIN # GDOs IN A RP).
//!
//! Source of truth: `crewrule-dev/RuleEngine/rule/rule7505/MinimumDaysOffForCARSRule.cpp`
//! + `MinimumDaysOffForCARSRuleParam.cpp` (`howManyDaysOffInRanges` /
//! `countLeaveAssignmentDaysInWindow` / `CheckRuleForCrew`).
//! Oracle: `crewrule-dev/RuleTest/rule7505_gtest.cpp` — crew 247 with a daily PRPM SBY
//! block (Jun 1–20 at YEG, plus one DO spanning May 31–Jun 1) has fewer than the 12
//! required days off in the June rostering period and must be rejected (`iDaysOff < 12`).
//!
//! F8 7505/002: DO group = {DO,…}, LEAVE = {VAC}, Count Blank Day=Y, Utilize Post Rest=Y,
//! Count Layover=N. The band row is chosen by RP length (30-30 / 31-31) and the crew's
//! VAC-day count; its MIN DO is the floor. Violation ⇔ daysOff < MIN DO (strict).

use rois_rule_engine::{
    check_min_days_off, check_min_days_off_app, filter_days_off_rows_for_crew,
    parse_check_7505_input, parse_utc_seconds, unrestricted_assignment_day_filters, Activity7505,
    Application, CrewScope7505, DaysOffRow, DaysOffScope, QualEntry, ScopedDaysOffRow,
};

const YEG: i64 = -360; // YEG (MDT, June): minutes east of UTC

fn t(s: &str) -> i64 {
    parse_utc_seconds(s).expect("utc")
}

/// June RP at YEG = local June = [Jun 1 00:00, Jul 1 00:00) local = [06:00 UTC, 06:00 UTC).
fn june_rp() -> (i64, i64) {
    (t("2026-06-01 06:00:00"), t("2026-07-01 06:00:00"))
}

/// A roster activity.
/// `end` = duty end (C++ actRestStrUtc); `rest` = end including post-duty rest (C++ actEndUtc).
fn act(code: &str, start: &str, end: &str, rest: &str) -> Activity7505 {
    Activity7505 {
        code: code.to_string(),
        assignment_group: code.to_string(),
        start_utc: t(start),
        end_utc: t(end),
        rest_start_utc: t(rest),
        pairing_id: None,
    }
}

/// A whole-day ground activity on a single June day (start 07:00 → end 23:00 UTC).
fn day_act(code: &str, day: u32) -> Activity7505 {
    let s = format!("2026-06-{:02} 07:00:00", day);
    let e = format!("2026-06-{:02} 23:00:00", day);
    act(code, &s, &e, &e)
}

/// crew 247-like June: one GDO spanning May 31–Jun 1 + a daily PRPM SBY block Jun 1–20.
/// (Mirrors `addCrew247LikeJun2026PrpmBlock`.)
fn crew247_activities() -> Vec<Activity7505> {
    let mut v = Vec::new();
    // GDO May 31 06:01 → Jun 1 06:00 (rest start Jun 1 06:00).
    v.push(act(
        "DO",
        "2026-05-31 06:01:00",
        "2026-06-01 06:00:00",
        "2026-06-01 06:00:00",
    ));
    // PRPM SBY each day Jun 1–20: local 14:00 (20:00 UTC) → duty end next day 05:59,
    // including rest 15:59 (Live/Py: end_utc / rest_start_utc).
    for day in 1..=20u32 {
        let start = format!("2026-06-{:02} 20:00:00", day);
        let (end, rest) = if day < 20 {
            (
                format!("2026-06-{:02} 05:59:00", day + 1),
                format!("2026-06-{:02} 15:59:00", day + 1),
            )
        } else {
            (
                "2026-06-21 05:59:00".to_string(),
                "2026-06-21 15:59:00".to_string(),
            )
        };
        v.push(act("PRPM", &start, &end, &rest));
    }
    v
}

/// The 30-30 band row for a given (min_do, leave-days range). DO group = {DO}, LEAVE={VAC}.
fn row_30(min_do: i64, leave_lo: i64, leave_hi: i64) -> DaysOffRow {
    let (fly_lo, fly_hi, fly_codes, res_lo, res_hi, res_codes) =
        unrestricted_assignment_day_filters();
    DaysOffRow {
        min_do,
        do_codes: vec!["DO".to_string()],
        leave_codes: vec!["VAC".to_string()],
        count_blank: true,
        count_layover: false,
        count_post_rest: true,
        rp_days_lower: 30,
        rp_days_upper: 30,
        leave_days_lower: leave_lo,
        leave_days_upper: leave_hi,
        period: "1".to_string(),
        unit: "RP".to_string(),
        fly_days_lower: fly_lo,
        fly_days_upper: fly_hi,
        fly_assignments: fly_codes,
        reserve_days_lower: res_lo,
        reserve_days_upper: res_hi,
        reserve_assignments: res_codes,
    }
}

/// A 31-31 row (must NOT apply to a 30-day RP).
fn row_31(min_do: i64, leave_lo: i64, leave_hi: i64) -> DaysOffRow {
    let mut r = row_30(min_do, leave_lo, leave_hi);
    r.rp_days_lower = 31;
    r.rp_days_upper = 31;
    r
}

fn qual(value: &str, eff_s: i64, exp_s: i64) -> QualEntry {
    QualEntry {
        value: value.to_string(),
        eff_s,
        exp_s,
    }
}

#[test]
fn scoped_7505_row_matches_wildcard_and_or_filters() {
    let row = ScopedDaysOffRow {
        scope: DaysOffScope {
            bases: vec!["YYZ|YVR".to_string()],
            ranks: vec!["CA".to_string()],
            fleets: vec!["737".to_string()],
            teams: vec!["TEAM1".to_string()],
        },
        row: row_30(7, 0, 0),
    };
    let crew = CrewScope7505 {
        bases: vec![qual("YVR", 0, i64::MAX)],
        ranks: vec![qual("CA", 0, i64::MAX)],
        fleets: vec![qual("737", 0, i64::MAX)],
        teams: vec![qual("TEAM1", 0, i64::MAX)],
    };

    let matched = filter_days_off_rows_for_crew(&[row], &crew, 0, 86_400);

    assert_eq!(matched.len(), 1);
}

#[test]
fn scoped_7505_row_rejects_missing_nonwildcard_dimension() {
    let row = ScopedDaysOffRow {
        scope: DaysOffScope {
            bases: vec!["YYZ".to_string()],
            ranks: vec!["CA".to_string()],
            fleets: vec!["737".to_string()],
            teams: vec!["TEAM1".to_string()],
        },
        row: row_30(7, 0, 0),
    };
    let crew = CrewScope7505 {
        bases: vec![qual("YYZ", 0, i64::MAX)],
        ranks: vec![qual("FO", 0, i64::MAX)],
        fleets: vec![qual("737", 0, i64::MAX)],
        teams: vec![qual("TEAM1", 0, i64::MAX)],
    };

    let matched = filter_days_off_rows_for_crew(&[row], &crew, 0, 86_400);

    assert!(matched.is_empty());
}

#[test]
fn parse_check_7505_accepts_structured_scope_rows() {
    let parsed = parse_check_7505_input(
        "R\tYYZ\tCA\t737\tTEAM1\t7\t30\t30\t0\t0\tDO\t\t1\t0\t1\tRP\n\
         Q\tC1\tB\tYYZ\t0\t999999\n\
         Q\tC1\tR\tCA\t0\t999999\n\
         Q\tC1\tF\t737\t0\t999999\n\
         T\tC1\tTEAM1\t0\t999999\n\
         A\tC1\tFLY\t0\t86400\t86400\n",
    );

    assert_eq!(parsed.rows.len(), 1);
    assert_eq!(parsed.crew_scopes["C1"].teams.len(), 1);
    assert_eq!(parsed.by_crew["C1"].len(), 1);
}

#[test]
fn parse_check_7505_qualification_days_match_epoch_second_window() {
    let parsed = parse_check_7505_input(
        "R\tYYZ\tCA\t737\tTEAM1\t7\t30\t30\t0\t0\tDO\t\t1\t0\t1\tRP\n\
         Q\tC1\tB\tYYZ\t20454\t20818\n\
         Q\tC1\tR\tCA\t20454\t20818\n\
         Q\tC1\tF\t737\t20454\t20818\n\
         T\tC1\tTEAM1\t20454\t20818\n\
         A\tC1\tFLY\t1780293600\t1782885600\t1782885600\n",
    );

    let matched = filter_days_off_rows_for_crew(
        &parsed.rows,
        &parsed.crew_scopes["C1"],
        1_780_293_600,
        1_782_885_600,
    );

    assert_eq!(matched.len(), 1);
}

#[test]
fn parse_check_7505_keeps_legacy_r_rows_as_wildcard_scope() {
    let parsed = parse_check_7505_input(
        "R\t7\t30\t30\t0\t0\tDO\t\t1\t0\t1\tRP\n\
         A\tC1\tFLY\t0\t86400\t86400\n",
    );

    assert_eq!(parsed.rows.len(), 1);
    assert!(parsed.rows[0].scope.bases.is_empty());
    assert_eq!(parsed.by_crew["C1"].len(), 1);
}

// ── Oracle: crew 247 has too few days off in the June RP (the gtest case). ──────────
#[test]
fn rejects_crew247_daily_prpm_sby_jun2026_insufficient_days_off() {
    let (s, e) = june_rp();
    let acts = crew247_activities();
    // The gtest's single param row: 30-30 / VAC 0-1 / MIN DO 12.
    let rows = [row_30(12, 0, 1)];
    let v = check_min_days_off("247", &acts, s, e, YEG, &rows, 0);
    assert_eq!(v.len(), 1, "crew 247 must fire one June-RP shortfall");
    // PRPM (SBY) never counts as a day off. Last duty ends 05:59 UTC Jun 21 = local
    // Jun 20 23:59 (YEG−6), so local Jun 21–30 are blank ⇒ 10 days off < 12.
    // (Utilize Post Rest=Y uses duty end, not including-rest 15:59 UTC which would paint Jun 21.)
    assert_eq!(
        v[0].days_off, 10,
        "10 blank late-June local days are the only days off"
    );
    assert_eq!(v[0].min_do, 12);
    assert!(v[0].days_off < 12);
    assert_eq!(
        v[0].message(),
        "The number of days off(10) must be at least 12 in 1 RP."
    );
}

// ── Boundary: exactly MIN DO days off is legal (strict `<`). ─────────────────────────
#[test]
fn accepts_crew_with_exactly_min_days_off() {
    let (s, e) = june_rp();
    let mut acts: Vec<Activity7505> = (1..=12).map(|d| day_act("DO", d)).collect();
    acts.extend((13..=30).map(|d| day_act("FLY", d))); // every other day worked ⇒ no blanks
    let v = check_min_days_off("legal", &acts, s, e, YEG, &[row_30(12, 0, 1)], 0);
    assert!(
        v.is_empty(),
        "12 DO days == MIN DO ⇒ legal (off=12 not < 12)"
    );
}

#[test]
fn rejects_crew_one_day_under_min() {
    let (s, e) = june_rp();
    let mut acts: Vec<Activity7505> = (1..=11).map(|d| day_act("DO", d)).collect();
    acts.extend((12..=30).map(|d| day_act("FLY", d)));
    let v = check_min_days_off("under", &acts, s, e, YEG, &[row_30(12, 0, 1)], 0);
    assert_eq!(v.len(), 1);
    assert_eq!(v[0].days_off, 11);
}

/// VAC encoded as crew-base `[D 00:00, D+1 00:00)` must not paint local day D+1.
/// Scenario 740 / crew 2807 shape: YYZ EDT VAC ends at next local midnight (…04:00Z).
#[test]
fn vac_ending_at_local_midnight_does_not_occupy_next_calendar_day() {
    const YYZ: i64 = -240;
    let rp_start = t("2026-09-01 04:00:00");
    let rp_end = t("2026-10-01 04:00:00");
    let acts = vec![act(
        "VAC",
        "2026-09-04 04:00:00",
        "2026-09-05 04:00:00",
        "2026-09-05 04:00:00",
    )];
    // Force a violation so we can read days_off. Sep RP = 30 days; only Sep 4 is
    // occupied by non-DO VAC → 29 blank DO days when the end is exclusive.
    let v = check_min_days_off(
        "2807",
        &acts,
        rp_start,
        rp_end,
        YYZ,
        &[row_30(1000, 0, 1)],
        0,
    );
    assert_eq!(v.len(), 1);
    assert_eq!(
        v[0].days_off, 29,
        "VAC [Sep4 00:00, Sep5 00:00) local must leave Sep 5 blank"
    );
}

// ── Band selection: VAC-day count picks a lower-MIN row; the 0-1 row is skipped, and a
//    31-31 row never applies to a 30-day RP. ──────────────────────────────────────────
#[test]
fn leave_day_count_selects_the_band_row() {
    let (s, e) = june_rp();
    // 20 VAC days (Jun 1–20) + worked Jun 21–30 ⇒ 0 days off, 20 leave days.
    let mut acts: Vec<Activity7505> = (1..=20).map(|d| day_act("VAC", d)).collect();
    acts.extend((21..=30).map(|d| day_act("FLY", d)));
    // Full band: VAC 0-1 ⇒ 12, VAC 19-21 ⇒ 4, plus a 31-31 decoy that must be ignored.
    let rows = [row_30(12, 0, 1), row_30(4, 19, 21), row_31(13, 0, 0)];
    let v = check_min_days_off("vac20", &acts, s, e, YEG, &rows, 0);
    assert_eq!(
        v.len(),
        1,
        "exactly one band row matches (30-30 / VAC 19-21)"
    );
    assert_eq!(
        v[0].min_do, 4,
        "the VAC-19-21 row (MIN DO 4) is selected, not 12 or 13"
    );
    assert_eq!(v[0].days_off, 0);
}

#[test]
fn high_leave_crew_meeting_lowered_min_is_legal() {
    let (s, e) = june_rp();
    // 28 VAC days + 2 DO ⇒ 2 days off, 28 leave days ⇒ matches VAC 28-29 (MIN DO 1).
    let mut acts: Vec<Activity7505> = (1..=28).map(|d| day_act("VAC", d)).collect();
    acts.extend((29..=30).map(|d| day_act("DO", d)));
    let rows = [row_30(12, 0, 1), row_30(1, 28, 29)];
    let v = check_min_days_off("vac28", &acts, s, e, YEG, &rows, 0);
    assert!(
        v.is_empty(),
        "2 days off ≥ MIN DO 1 for a 28-VAC crew ⇒ legal"
    );
}

#[test]
fn utilize_post_duty_rest_y_stops_at_duty_end_n_extends_through_rest() {
    // YEG local days: duty ends late Jun 1 (still Jun 1 local); rest ends Jun 2 morning.
    // end_utc = duty end; rest_start_utc = including rest (Live/Py ↔ C++ actEndUtc).
    let (s, e) = june_rp();
    let acts = vec![act(
        "FLY",
        "2026-06-01 20:00:00", // local Jun 1 14:00
        "2026-06-02 05:00:00", // local Jun 1 23:00 — still Jun 1
        "2026-06-02 14:00:00", // local Jun 2 08:00 — paints Jun 2 when N
    )];

    let mut row_y = row_30(30, 0, 0);
    row_y.count_post_rest = true;
    let off_y = check_min_days_off("post-rest-y", &acts, s, e, YEG, &[row_y], 0)[0].days_off;

    let mut row_n = row_30(30, 0, 0);
    row_n.count_post_rest = false;
    let off_n = check_min_days_off("post-rest-n", &acts, s, e, YEG, &[row_n], 0)[0].days_off;

    // June has 30 local days; FLY occupies Jun 1 always. Y leaves Jun 2 blank (+1 DO);
    // N paints Jun 2 with FLY.
    assert_eq!(off_y, 29, "Y: duty end only ⇒ Jun 2 blank counts as DO");
    assert_eq!(off_n, 28, "N: including rest paints Jun 2 ⇒ one fewer DO");
    assert_eq!(off_y, off_n + 1);
}

#[test]
fn sole_layover_code_always_counts_as_day_off() {
    // C++ classifies sole "LAYOVER" as DO regardless of Count Layover; the flag only
    // gates duty-gap synthesis.
    let (s, e) = june_rp();
    let acts = vec![day_act("LAYOVER", 1)];

    let mut row_n = row_30(30, 0, 0);
    row_n.count_layover = false;
    assert!(
        check_min_days_off("layover-n", &acts, s, e, YEG, &[row_n], 0).is_empty(),
        "sole LAYOVER + blank days must meet a 30-day floor even when Count Layover=N"
    );

    let mut row_y = row_30(30, 0, 0);
    row_y.count_layover = true;
    assert!(
        check_min_days_off("layover-y", &acts, s, e, YEG, &[row_y], 0).is_empty(),
        "sole LAYOVER + blank days must meet a 30-day floor when Count Layover=Y"
    );
}

#[test]
fn count_layover_synthesizes_middle_days_between_duties() {
    // Two duties on Jun 1 and Jun 4 (same pairing) → Jun 2–3 are middle days.
    // Count Layover=N: span fill paints them working → 27 DO (30 − 3 working? Jun1,2,3,4 = 4 working → 26 DO)
    // Actually: Jun1 duty, Jun4 duty; span fill paints Jun2,Jun3 as FLY; working days = 4; DO = 26.
    // Count Layover=Y: Jun2–3 become LAYOVER/DO; working = Jun1+Jun4 = 2; DO = 28.
    let (s, e) = june_rp();
    let acts = vec![
        Activity7505 {
            code: "FLY".to_string(),
            assignment_group: "FLY".to_string(),
            start_utc: t("2026-06-01 12:00:00"),
            end_utc: t("2026-06-01 18:00:00"),
            rest_start_utc: t("2026-06-01 18:00:00"),
            pairing_id: Some(99),
        },
        Activity7505 {
            code: "FLY".to_string(),
            assignment_group: "FLY".to_string(),
            start_utc: t("2026-06-04 12:00:00"),
            end_utc: t("2026-06-04 18:00:00"),
            rest_start_utc: t("2026-06-04 18:00:00"),
            pairing_id: Some(99),
        },
    ];

    let mut row_n = row_30(30, 0, 0);
    row_n.count_layover = false;
    let v_n = check_min_days_off("gap-n", &acts, s, e, YEG, &[row_n], 0);
    assert_eq!(v_n.len(), 1);
    assert_eq!(
        v_n[0].days_off, 26,
        "N: middle days stay working via span fill"
    );

    let mut row_y = row_30(30, 0, 0);
    row_y.count_layover = true;
    let v_y = check_min_days_off("gap-y", &acts, s, e, YEG, &[row_y], 0);
    assert_eq!(v_y.len(), 1);
    assert_eq!(v_y[0].days_off, 28, "Y: middle days become LAYOVER/DO");
    assert_eq!(v_y[0].days_off, v_n[0].days_off + 2);
}

#[test]
fn parse_trailing_count_layover_on_r_line() {
    let with = parse_check_7505_input("R\t*\t*\t*\t*\t12\t30\t30\t0\t0\tDO\tVAC\t1\t1\t1\tRP\t1\n");
    assert!(with.rows[0].row.count_layover);

    let without = parse_check_7505_input("R\t*\t*\t*\t*\t12\t30\t30\t0\t0\tDO\tVAC\t1\t1\t1\tRP\n");
    assert!(!without.rows[0].row.count_layover);

    let zero = parse_check_7505_input("R\t*\t*\t*\t*\t12\t30\t30\t0\t0\tDO\tVAC\t1\t1\t1\tRP\t0\n");
    assert!(!zero.rows[0].row.count_layover);
}

#[test]
fn parse_a_line_optional_pairing_id() {
    let parsed =
        parse_check_7505_input("A\tC1\tFLY\t100\t200\t200\t42\nA\tC1\tDO\t300\t400\t400\n");
    let acts = &parsed.by_crew["C1"];
    assert_eq!(acts[0].pairing_id, Some(42));
    assert_eq!(acts[1].pairing_id, None);
}

#[test]
fn do_assignment_group_matches_assignment_group_not_only_code() {
    let (s, e) = june_rp();
    let acts = vec![Activity7505 {
        code: "GDO".to_string(),
        assignment_group: "DO".to_string(),
        start_utc: t("2026-06-01 07:00:00"),
        end_utc: t("2026-06-01 23:00:00"),
        rest_start_utc: t("2026-06-01 23:00:00"),
        pairing_id: None,
    }];
    let row = row_30(30, 0, 0);

    assert!(
        check_min_days_off("group-do", &acts, s, e, YEG, &[row], 0).is_empty(),
        "DO group must classify GDO as a day off"
    );
}

// ── Optimizer / PA-ignore: a shortfall arising entirely among pre-assigned rosters is
//    tolerated; one newly-assigned (non-PA) roster in the window makes it fire. ────────
#[test]
fn optimizer_tolerates_all_pre_assigned_then_fires_on_non_pa() {
    let (s, e) = june_rp();
    let acts = crew247_activities();
    let rows = [row_30(12, 0, 1)];

    // Editor always reports.
    assert_eq!(
        check_min_days_off("247", &acts, s, e, YEG, &rows, 0).len(),
        1
    );

    // Optimizer, every roster pre-assigned ⇒ tolerated.
    let all_pa = vec![true; acts.len()];
    let v_pa = check_min_days_off_app(
        "247",
        &acts,
        s,
        e,
        YEG,
        &rows,
        0,
        Application::Optimizer,
        &all_pa,
    );
    assert!(
        v_pa.is_empty(),
        "all-PA shortfall is tolerated by the optimizer"
    );

    // Optimizer, one roster newly assigned (non-PA) ⇒ fires.
    let mut one_ro = vec![true; acts.len()];
    one_ro[5] = false;
    let v_ro = check_min_days_off_app(
        "247",
        &acts,
        s,
        e,
        YEG,
        &rows,
        0,
        Application::Optimizer,
        &one_ro,
    );
    assert_eq!(v_ro.len(), 1, "a non-PA roster in the window makes it fire");
}

/// Rule 2015: duty ending before DO Start does not paint that local day.
#[test]
fn do_start_grace_0059_keeps_morning_blank_0100_occupies() {
    // YEG −360: local midnight = 06:00 UTC. Local 00:59 = 06:59 UTC; local 01:00 = 07:00 UTC.
    let (s, e) = june_rp();
    let row = row_30(1000, 0, 1); // force a violation so days_off is reported
                                  // Duty on Jun 1 local afternoon into Jun 2 00:59 local.
    let acts_0059 = vec![act(
        "FLY",
        "2026-06-01 20:00:00", // local Jun 1 14:00
        "2026-06-02 06:59:00", // local Jun 2 00:59
        "2026-06-02 06:59:00",
    )];
    let off_grace =
        check_min_days_off("g59", &acts_0059, s, e, YEG, &[row.clone()], 60)[0].days_off;
    let off_mid = check_min_days_off("g59m", &acts_0059, s, e, YEG, &[row.clone()], 0)[0].days_off;
    // With DO start 01:00, Jun 2 is not painted → one more blank day than midnight paint.
    assert_eq!(off_grace, off_mid + 1);

    let acts_0100 = vec![act(
        "FLY",
        "2026-06-01 20:00:00",
        "2026-06-02 07:00:00", // local Jun 2 01:00
        "2026-06-02 07:00:00",
    )];
    let off_at = check_min_days_off("g100", &acts_0100, s, e, YEG, &[row.clone()], 60)[0].days_off;
    assert_eq!(
        off_at, off_mid,
        "end at exactly DO Start still occupies the morning day"
    );
}

#[test]
fn do_start_span_fill_does_not_respoil_grace_day() {
    let (s, e) = june_rp();
    let row = row_30(1000, 0, 1);
    // Two FLY legs same pairing ending 00:59 local on Jun 2 — span fill must use grace too.
    let mut a1 = act(
        "FLY",
        "2026-06-01 18:00:00",
        "2026-06-01 22:00:00",
        "2026-06-01 22:00:00",
    );
    a1.pairing_id = Some(99);
    let mut a2 = act(
        "FLY",
        "2026-06-01 23:00:00",
        "2026-06-02 06:59:00",
        "2026-06-02 06:59:00",
    );
    a2.pairing_id = Some(99);
    let acts = vec![a1, a2];
    let off_grace = check_min_days_off("span", &acts, s, e, YEG, &[row.clone()], 60)[0].days_off;
    let off_mid = check_min_days_off("span0", &acts, s, e, YEG, &[row], 0)[0].days_off;
    assert_eq!(off_grace, off_mid + 1);
}
