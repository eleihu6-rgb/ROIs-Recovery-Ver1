//! Rule 7507 — fly/reserve day filters on top of 7505 Min-GDO.
//!
//! Outside NUM FLY DAY / NUM RESERVES → skip the band row (no violation from that row).

use rois_rule_engine::{
    check_min_days_off, count_assignment_days, parse_check_7505_input, parse_utc_seconds,
    rp_ordinal_bounds_to_local_utc, unrestricted_assignment_day_filters, Activity7505, DaysOffRow,
};

const YEG: i64 = -360;

fn t(s: &str) -> i64 {
    parse_utc_seconds(s).expect("utc")
}

fn june_rp() -> (i64, i64) {
    (t("2026-06-01 06:00:00"), t("2026-07-01 06:00:00"))
}

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

fn day_act(code: &str, day: u32) -> Activity7505 {
    let s = format!("2026-06-{:02} 07:00:00", day);
    let e = format!("2026-06-{:02} 23:00:00", day);
    act(code, &s, &e, &e)
}

fn base_row() -> DaysOffRow {
    let (fly_lo, fly_hi, fly_codes, res_lo, res_hi, res_codes) =
        unrestricted_assignment_day_filters();
    DaysOffRow {
        min_do: 10,
        do_codes: vec!["DO".to_string()],
        leave_codes: vec![],
        count_blank: true,
        count_layover: false,
        count_post_rest: false,
        rp_days_lower: 30,
        rp_days_upper: 30,
        leave_days_lower: 0,
        leave_days_upper: 31,
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

#[test]
fn count_assignment_days_respects_utilize_post_duty_rest_invert() {
    let (rp0, rp1) = june_rp();
    // Duty ends Jun 1 local; including rest reaches Jun 2 local.
    let acts = vec![act(
        "FLY",
        "2026-06-01 20:00:00",
        "2026-06-02 05:00:00",
        "2026-06-02 14:00:00",
    )];
    assert_eq!(
        count_assignment_days(&acts, rp0, rp1, YEG, true, &["FLY".into()]),
        1,
        "Y uses duty end ⇒ one FLY day"
    );
    assert_eq!(
        count_assignment_days(&acts, rp0, rp1, YEG, false, &["FLY".into()]),
        2,
        "N uses including-rest ⇒ two FLY days"
    );
}

#[test]
fn count_assignment_days_matches_fly_codes_only() {
    let (rp0, rp1) = june_rp();
    let acts = vec![
        day_act("FLY", 1),
        day_act("FLY", 2),
        day_act("RES", 3),
        day_act("DO", 4),
    ];
    assert_eq!(
        count_assignment_days(&acts, rp0, rp1, YEG, false, &["FLY".into()]),
        2
    );
    assert_eq!(
        count_assignment_days(&acts, rp0, rp1, YEG, false, &["RES".into(), "CRAM".into()]),
        1
    );
}

#[test]
fn fly_filter_out_of_range_skips_row() {
    let (rp0, rp1) = june_rp();
    // 20 blank-ish days off if min_do=10 would fire; only 2 FLY days.
    let mut acts: Vec<Activity7505> = (1..=2).map(|d| day_act("FLY", d)).collect();
    acts.extend((3..=5).map(|d| day_act("DO", d)));
    let mut row = base_row();
    row.min_do = 25; // would violate without filter
    row.fly_assignments = vec!["FLY".into()];
    row.fly_days_lower = 10;
    row.fly_days_upper = 31; // crew has 2 fly days → skip
    let v = check_min_days_off("C1", &acts, rp0, rp1, YEG, &[row], 0);
    assert!(v.is_empty(), "out-of-range fly days must skip the band row");
}

#[test]
fn fly_filter_in_range_applies_min_do() {
    let (rp0, rp1) = june_rp();
    let mut acts: Vec<Activity7505> = (1..=5).map(|d| day_act("FLY", d)).collect();
    acts.extend((6..=8).map(|d| day_act("DO", d)));
    let mut row = base_row();
    // 5 FLY + 3 DO + blanks ≈ 25 days off; require 26 so shortfall fires.
    row.min_do = 26;
    row.count_blank = true;
    row.fly_assignments = vec!["FLY".into()];
    row.fly_days_lower = 0;
    row.fly_days_upper = 10;
    let v = check_min_days_off("C1", &acts, rp0, rp1, YEG, &[row], 0);
    assert_eq!(v.len(), 1);
    assert!(v[0].days_off < 26);
}

#[test]
fn reserve_filter_out_of_range_skips_row() {
    let (rp0, rp1) = june_rp();
    let acts: Vec<Activity7505> = (1..=3).map(|d| day_act("RES", d)).collect();
    let mut row = base_row();
    row.min_do = 28;
    row.reserve_assignments = vec!["RES".into(), "CRAM".into()];
    row.reserve_days_lower = 10;
    row.reserve_days_upper = 31;
    let v = check_min_days_off("C1", &acts, rp0, rp1, YEG, &[row], 0);
    assert!(v.is_empty());
}

#[test]
fn wildcard_fly_assignments_means_no_filter() {
    let (rp0, rp1) = june_rp();
    let acts: Vec<Activity7505> = (1..=2).map(|d| day_act("FLY", d)).collect();
    let mut row = base_row();
    // 2 FLY + 28 blanks = 28 days off; min 29 → violation when filter is unrestricted.
    row.min_do = 29;
    row.fly_days_lower = 10;
    row.fly_days_upper = 10;
    row.fly_assignments = vec![]; // unrestricted
    let v = check_min_days_off("C1", &acts, rp0, rp1, YEG, &[row], 0);
    assert_eq!(
        v.len(),
        1,
        "empty fly list must not filter; Min DO still applies"
    );
}

#[test]
fn ordinal_rp_shifted_by_crew_offset_detects_min_do_shortfall() {
    // Engine historically used UTC midnight from ordinals; with YYZ offset the
    // day_map keys miss local paints → all blank → DO inflated → silent allow.
    // Local-midnight conversion must restore detection.
    const YYZ: i64 = -240;
    let sep1_ord = t("2026-09-01 00:00:00") / 86_400;
    let sep30_ord = t("2026-09-30 00:00:00") / 86_400;
    let (rp0_utc_midnight, rp1_utc_midnight) = (sep1_ord * 86_400, (sep30_ord + 1) * 86_400);
    let (rp0, rp1) = rp_ordinal_bounds_to_local_utc(sep1_ord, sep30_ord, YYZ);

    // 21 CRAM days Sep 1..21 local mornings; blanks Sep 22–30 → 9 DO < min 10.
    let mut acts = Vec::new();
    for day in 1..=21u32 {
        acts.push(day_act_sep(day));
    }
    let mut row = base_row();
    row.min_do = 10;
    row.fly_days_lower = 0;
    row.fly_days_upper = 0;
    row.fly_assignments = vec!["FLY".into()];
    row.reserve_days_lower = 0;
    row.reserve_days_upper = 31;
    row.reserve_assignments = vec!["CRAM".into()];

    assert!(
        check_min_days_off(
            "13645",
            &acts,
            rp0_utc_midnight,
            rp1_utc_midnight,
            YYZ,
            &[row.clone()],
            0
        )
        .is_empty(),
        "UTC-midnight RP + offset must miss paints (hazard Engine had)"
    );
    let v = check_min_days_off("13645", &acts, rp0, rp1, YYZ, &[row], 0);
    assert_eq!(
        v.len(),
        1,
        "local-midnight RP must fire Min DO, got {:?}",
        v
    );
    assert_eq!(v[0].days_off, 9);
    assert_eq!(v[0].min_do, 10);
}

fn day_act_sep(day: u32) -> Activity7505 {
    let s = format!("2026-09-{:02} 12:00:00", day); // 08:00 YYZ
    let e = format!("2026-09-{:02} 20:00:00", day);
    act("CRAM", &s, &e, &e)
}

#[test]
fn parse_structured_r_line_with_fly_reserve_filters() {
    let input = "R\t*\t*\t*\t*\t10\t30\t30\t0\t31\tDO\t\t1\t0\t1\tRP\t2\t10\tFLY\t0\t5\tRES,CRAM\n\
A\tC1\tFLY\t1748775600\t1748833200\t1748833200\n";
    let parsed = parse_check_7505_input(input);
    assert_eq!(parsed.rows.len(), 1);
    let row = &parsed.rows[0].row;
    assert_eq!(row.fly_days_lower, 2);
    assert_eq!(row.fly_days_upper, 10);
    assert_eq!(row.fly_assignments, vec!["FLY".to_string()]);
    assert_eq!(row.reserve_days_lower, 0);
    assert_eq!(row.reserve_days_upper, 5);
    assert_eq!(
        row.reserve_assignments,
        vec!["RES".to_string(), "CRAM".to_string()]
    );
}
