//! Rule 7508 — F8 calendar-day single day free from duty.
//!
//! 7508 keeps the 7501 parameter shape (`168 RH` / `672 RH`) but interprets
//! those periods as crew-base-local calendar-day windows: 7 days / 28 days.

use rois_rule_engine::{
    parse_utc_seconds,
    rules::rule7508::{
        check_rule7508_structured, check_rule7508_structured_focused, CalendarSdfdViolation,
        Rule7508CrewContext, Rule7508Row, WorkPeriod7508,
    },
    Application, LocalNightDef,
};

const NIGHT: LocalNightDef = LocalNightDef {
    start_min: 22 * 60 + 30,
    end_min: 9 * 60 + 30,
    min_rest_secs: 9 * 3600,
};

fn t(s: &str) -> i64 {
    parse_utc_seconds(s).expect("valid utc")
}

fn row(period_hours: i64, min_limits: i64) -> Rule7508Row {
    Rule7508Row {
        row_id: 0,
        bases: vec!["*".to_string()],
        ranks: vec!["*".to_string()],
        fleets: vec!["*".to_string()],
        teams: vec!["*".to_string()],
        period_hours,
        unit: "RH".to_string(),
        duty_report: true,
        duty_release: true,
        duty_end_buffer_secs: 0,
        min_limits,
        count_layover: true,
    }
}

fn fly(id: i64, start: &str, end: &str) -> WorkPeriod7508 {
    fly_with_flight_bounds(id, start, end, start, end)
}

fn fly_with_flight_bounds(
    id: i64,
    start: &str,
    end: &str,
    first_departure: &str,
    last_arrival: &str,
) -> WorkPeriod7508 {
    WorkPeriod7508 {
        pairing_id: Some(id),
        start_utc: t(start),
        end_utc: t(end),
        first_flight_departure_utc: t(first_departure),
        last_flight_arrival_utc: t(last_arrival),
        is_rest: false,
        is_pre_assigned: false,
        start_ref_tz_min: 0,
        end_ref_tz_min: 0,
    }
}

fn rest(start: &str, end: &str) -> WorkPeriod7508 {
    WorkPeriod7508 {
        pairing_id: None,
        start_utc: t(start),
        end_utc: t(end),
        first_flight_departure_utc: t(start),
        last_flight_arrival_utc: t(end),
        is_rest: true,
        is_pre_assigned: true,
        start_ref_tz_min: 0,
        end_ref_tz_min: 0,
    }
}

/// Work period with explicit rule-7500 acclimatisation ref TZs (start/end).
fn wp_ref(
    id: i64,
    start: &str,
    end: &str,
    ref_start: i64,
    ref_end: i64,
    is_rest: bool,
) -> WorkPeriod7508 {
    WorkPeriod7508 {
        pairing_id: if is_rest { None } else { Some(id) },
        start_utc: t(start),
        end_utc: t(end),
        first_flight_departure_utc: t(start),
        last_flight_arrival_utc: t(end),
        is_rest,
        is_pre_assigned: true,
        start_ref_tz_min: ref_start,
        end_ref_tz_min: ref_end,
    }
}

fn run(work: &[WorkPeriod7508], rule: Rule7508Row) -> Option<CalendarSdfdViolation> {
    check_rule7508_structured(
        "crew",
        &rule,
        &Rule7508CrewContext::default(),
        0,
        &NIGHT,
        t("2026-01-01T00:00"),
        t("2026-02-01T00:00"),
        work,
        Application::Editor,
    )
}

#[test]
fn single_blank_day_with_two_local_nights_satisfies_7_day_window() {
    let work = [
        fly(1, "2026-01-01T06:45", "2026-01-01T13:10"),
        fly(2, "2026-01-03T16:45", "2026-01-03T23:40"),
        fly(3, "2026-01-04T06:45", "2026-01-04T13:10"),
        fly(4, "2026-01-05T06:45", "2026-01-05T13:10"),
    ];

    assert!(run(&work, row(168, 1)).is_none());
}

#[test]
fn morning_after_blank_day_breaks_the_second_local_night() {
    let work = [
        fly(1, "2026-01-01T06:45", "2026-01-01T13:10"),
        fly(2, "2026-01-03T06:45", "2026-01-03T13:10"),
        fly(3, "2026-01-04T06:45", "2026-01-04T13:10"),
        fly(4, "2026-01-05T06:45", "2026-01-05T13:10"),
        fly(5, "2026-01-06T06:45", "2026-01-06T13:10"),
        fly(6, "2026-01-07T06:45", "2026-01-07T13:10"),
    ];

    let violation = run(&work, row(168, 1)).expect("no qualifying day in a 7-day window");
    assert_eq!(violation.total_sdfd, 0);
    assert_eq!(violation.min_limits, 1);
}

#[test]
fn full_rest_ground_day_counts_like_blank_day() {
    let work = [
        fly(1, "2026-01-01T06:45", "2026-01-01T13:10"),
        rest("2026-01-02T00:00", "2026-01-03T00:00"),
        fly(2, "2026-01-03T16:45", "2026-01-03T23:40"),
    ];

    assert!(run(&work, row(168, 1)).is_none());
}

#[test]
fn rest_ending_one_second_before_midnight_still_covers_day() {
    // Airline DO often ends at 23:59:59 — 1s short of next local midnight.
    let work = [
        fly(1, "2026-01-01T06:45", "2026-01-01T13:10"),
        rest("2026-01-02T00:00:00", "2026-01-02T23:59:59"),
        fly(2, "2026-01-03T16:45", "2026-01-03T23:40"),
    ];

    assert!(run(&work, row(168, 1)).is_none());
}

#[test]
fn rest_ending_sixty_seconds_before_midnight_still_covers_day() {
    let work = [
        fly(1, "2026-01-01T06:45", "2026-01-01T13:10"),
        rest("2026-01-02T00:00:00", "2026-01-02T23:59:00"),
        fly(2, "2026-01-03T16:45", "2026-01-03T23:40"),
    ];

    assert!(run(&work, row(168, 1)).is_none());
}

#[test]
fn rest_ending_sixty_one_seconds_before_midnight_does_not_cover_day() {
    let work = [
        fly(1, "2026-01-01T06:45", "2026-01-01T13:10"),
        rest("2026-01-02T00:00:00", "2026-01-02T23:58:59"),
        fly(2, "2026-01-03T16:45", "2026-01-03T23:40"),
        fly(3, "2026-01-04T06:45", "2026-01-04T13:10"),
        fly(4, "2026-01-05T06:45", "2026-01-05T13:10"),
        fly(5, "2026-01-06T06:45", "2026-01-06T13:10"),
        fly(6, "2026-01-07T06:45", "2026-01-07T13:10"),
    ];

    assert!(run(&work, row(168, 1)).is_some());
}

#[test]
fn rest_starting_sixty_seconds_after_midnight_still_covers_day() {
    let work = [
        fly(1, "2026-01-01T06:45", "2026-01-01T13:10"),
        rest("2026-01-02T00:01:00", "2026-01-03T00:00:00"),
        fly(2, "2026-01-03T16:45", "2026-01-03T23:40"),
    ];

    assert!(run(&work, row(168, 1)).is_none());
}

#[test]
fn rest_starting_sixty_one_seconds_after_midnight_does_not_cover_day() {
    let work = [
        fly(1, "2026-01-01T06:45", "2026-01-01T13:10"),
        rest("2026-01-02T00:01:01", "2026-01-03T00:00:00"),
        fly(2, "2026-01-03T16:45", "2026-01-03T23:40"),
        fly(3, "2026-01-04T06:45", "2026-01-04T13:10"),
        fly(4, "2026-01-05T06:45", "2026-01-05T13:10"),
        fly(5, "2026-01-06T06:45", "2026-01-06T13:10"),
        fly(6, "2026-01-07T06:45", "2026-01-07T13:10"),
    ];

    assert!(run(&work, row(168, 1)).is_some());
}

#[test]
fn rest_with_mid_day_gap_does_not_cover_day() {
    let work = [
        fly(1, "2026-01-01T06:45", "2026-01-01T13:10"),
        rest("2026-01-02T00:00:00", "2026-01-02T10:00:00"),
        rest("2026-01-02T12:00:00", "2026-01-03T00:00:00"),
        fly(2, "2026-01-03T16:45", "2026-01-03T23:40"),
        fly(3, "2026-01-04T06:45", "2026-01-04T13:10"),
        fly(4, "2026-01-05T06:45", "2026-01-05T13:10"),
        fly(5, "2026-01-06T06:45", "2026-01-06T13:10"),
        fly(6, "2026-01-07T06:45", "2026-01-07T13:10"),
    ];

    assert!(run(&work, row(168, 1)).is_some());
}

#[test]
fn partial_rest_ground_day_does_not_count() {
    let work = [
        fly(1, "2026-01-01T06:45", "2026-01-01T13:10"),
        rest("2026-01-02T00:00", "2026-01-02T12:00"),
        fly(2, "2026-01-03T16:45", "2026-01-03T23:40"),
        fly(3, "2026-01-04T06:45", "2026-01-04T13:10"),
        fly(4, "2026-01-05T06:45", "2026-01-05T13:10"),
        fly(5, "2026-01-06T06:45", "2026-01-06T13:10"),
        fly(6, "2026-01-07T06:45", "2026-01-07T13:10"),
    ];

    assert!(run(&work, row(168, 1)).is_some());
}

#[test]
fn consecutive_blank_days_count_one_per_local_day() {
    let work = [
        fly(1, "2026-01-01T06:45", "2026-01-01T13:10"),
        fly(2, "2026-01-05T16:45", "2026-01-05T23:40"),
    ];

    assert!(run(&work, row(168, 3)).is_none());
}

#[test]
fn duty_end_buffer_can_break_the_leading_local_night() {
    let mut buffered = row(168, 1);
    buffered.duty_end_buffer_secs = 60 * 60;
    let work = [
        fly(1, "2026-01-01T16:00", "2026-01-01T23:59"),
        fly(2, "2026-01-03T16:45", "2026-01-03T23:40"),
        fly(3, "2026-01-04T06:45", "2026-01-04T13:10"),
        fly(4, "2026-01-05T06:45", "2026-01-05T13:10"),
        fly(5, "2026-01-06T06:45", "2026-01-06T13:10"),
        fly(6, "2026-01-07T06:45", "2026-01-07T13:10"),
    ];

    assert!(run(&work, buffered).is_some());
}

#[test]
fn duty_end_buffer_does_not_occupy_the_next_calendar_day() {
    // Crew-1015 regression: a duty ending 23:48 (just before local midnight) with a
    // 30-min Duty End Buffer delays the *rest start* to 00:18 but must NOT make the
    // duty occupy the following calendar day, so that day still counts as a single
    // day free from duty (leading local night still holds 09:30 - 00:18 = 9h12m >= 9h).
    let mut buffered = row(168, 1);
    buffered.duty_end_buffer_secs = 30 * 60;
    let work = [
        fly(1, "2026-01-01T13:00", "2026-01-01T19:00"),
        fly(2, "2026-01-02T06:45", "2026-01-02T13:10"),
        fly(3, "2026-01-03T06:45", "2026-01-03T13:10"),
        fly(4, "2026-01-04T06:45", "2026-01-04T13:10"),
        fly(5, "2026-01-05T06:45", "2026-01-05T13:10"),
        fly(6, "2026-01-06T21:00", "2026-01-06T23:48"),
        rest("2026-01-07T00:00", "2026-01-08T00:00"),
        fly(7, "2026-01-09T16:45", "2026-01-09T23:40"),
    ];

    assert!(
        run(&work, buffered).is_none(),
        "30-min buffer on a 23:48 duty must not occupy the following rest day"
    );
}

#[test]
fn trailing_night_uses_next_duty_ref_not_frozen_prev_ref() {
    // Crew 13440 shape. Base YYZ (-240). The last flying duty ends 11:28Z still
    // acclimatised to Mountain (-360); the crew then rests at home base, so by the
    // trailing local night the 7500 acclimatisation has drifted back to YYZ (-240),
    // which the NEXT duty's start-ref already carries. The trailing night band must
    // use that next ref (-240) — not the frozen prev end-ref (-360), which would cut
    // the rest short (8h30m < 9h) and wrongly reject the day off.
    let work = vec![
        // flying block 149060
        wp_ref(149060, "2026-09-01T11:30:00", "2026-09-01T19:31:00", -240, -240, false),
        wp_ref(149060, "2026-09-02T19:15:00", "2026-09-03T04:50:00", -300, -300, false),
        wp_ref(149060, "2026-09-04T02:00:00", "2026-09-04T11:28:00", -360, -360, false),
        // leading days off before the block (rest)
        wp_ref(0, "2026-08-26T04:01:00", "2026-08-27T04:00:00", -240, -240, true),
        wp_ref(0, "2026-08-27T04:01:00", "2026-08-28T04:00:00", -240, -240, true),
        wp_ref(0, "2026-08-28T04:01:00", "2026-08-29T04:00:00", -240, -240, true),
        wp_ref(0, "2026-08-29T04:01:00", "2026-08-30T04:00:00", -240, -240, true),
        wp_ref(0, "2026-08-30T04:01:00", "2026-08-31T04:00:00", -240, -240, true),
        wp_ref(0, "2026-08-31T04:01:00", "2026-09-01T04:00:00", -240, -240, true),
        // day off Sep 5 (the free day under test)
        wp_ref(0, "2026-09-05T04:01:00", "2026-09-06T04:00:00", -240, -240, true),
        // following ground work, acclimatised back to YYZ
        wp_ref(0, "2026-09-06T13:00:00", "2026-09-06T19:00:00", -240, -240, false),
        wp_ref(0, "2026-09-07T13:00:00", "2026-09-07T19:15:00", -240, -240, false),
        wp_ref(0, "2026-09-08T17:30:00", "2026-09-08T23:30:00", -240, -240, false),
        // trailing days off
        wp_ref(0, "2026-09-09T04:01:00", "2026-09-10T04:00:00", -240, -240, true),
        wp_ref(0, "2026-09-11T04:01:00", "2026-09-12T04:00:00", -240, -240, true),
    ];

    let violation = check_rule7508_structured_focused(
        "13440",
        &row(168, 1),
        &Rule7508CrewContext::default(),
        -240,
        &NIGHT,
        t("2026-09-01T04:00:00"),
        t("2026-09-08T04:00:00"),
        &work,
        Application::Editor,
        &[],
        None,
    );

    assert!(
        violation.is_none(),
        "Sep 5 day off must qualify when the trailing night uses the next duty's -240 ref"
    );
}

#[test]
fn duty_release_no_uses_last_flight_arrival_for_rest_start() {
    let mut duty_bounds = row(168, 1);
    duty_bounds.duty_release = true;
    let mut flight_bounds = row(168, 1);
    flight_bounds.duty_release = false;
    let work = [
        fly_with_flight_bounds(
            1,
            "2026-01-01T15:00",
            "2026-01-02T00:30",
            "2026-01-01T16:00",
            "2026-01-01T21:30",
        ),
        fly_with_flight_bounds(
            2,
            "2026-01-03T13:00",
            "2026-01-03T20:00",
            "2026-01-03T14:00",
            "2026-01-03T19:00",
        ),
        fly(3, "2026-01-04T06:45", "2026-01-04T13:10"),
        fly(4, "2026-01-05T06:45", "2026-01-05T13:10"),
        fly(5, "2026-01-06T06:45", "2026-01-06T13:10"),
        fly(6, "2026-01-07T06:45", "2026-01-07T13:10"),
    ];

    assert!(
        run(&work, duty_bounds).is_some(),
        "Duty Release=Y starts rest at duty end 00:30 and breaks the leading local night"
    );
    assert!(
        run(&work, flight_bounds).is_none(),
        "Duty Release=N starts rest at last flight arrival 21:30 and preserves the local night"
    );
}

#[test]
fn duty_report_no_uses_first_flight_departure_for_rest_end() {
    let mut duty_bounds = row(168, 1);
    duty_bounds.duty_report = true;
    let mut flight_bounds = row(168, 1);
    flight_bounds.duty_report = false;
    let work = [
        fly_with_flight_bounds(
            1,
            "2026-01-01T12:00",
            "2026-01-01T20:00",
            "2026-01-01T13:00",
            "2026-01-01T19:00",
        ),
        fly_with_flight_bounds(
            2,
            "2026-01-03T07:00",
            "2026-01-03T20:00",
            "2026-01-03T13:00",
            "2026-01-03T19:00",
        ),
        fly(3, "2026-01-04T06:45", "2026-01-04T13:10"),
        fly(4, "2026-01-05T06:45", "2026-01-05T13:10"),
        fly(5, "2026-01-06T06:45", "2026-01-06T13:10"),
        fly(6, "2026-01-07T06:45", "2026-01-07T13:10"),
    ];

    assert!(
        run(&work, duty_bounds).is_some(),
        "Duty Report=Y ends rest at duty start 09:00 and breaks the trailing local night"
    );
    assert!(
        run(&work, flight_bounds).is_none(),
        "Duty Report=N ends rest at first flight departure 13:00 and preserves the local night"
    );
}

#[test]
fn duty_report_and_release_no_use_flight_bounds_on_both_sides() {
    let mut both_duty = row(168, 1);
    both_duty.duty_report = true;
    both_duty.duty_release = true;
    let mut both_flight = row(168, 1);
    both_flight.duty_report = false;
    both_flight.duty_release = false;
    let work = [
        fly_with_flight_bounds(
            1,
            "2026-01-01T15:00",
            "2026-01-02T00:30",
            "2026-01-01T16:00",
            "2026-01-01T21:30",
        ),
        fly_with_flight_bounds(
            2,
            "2026-01-03T07:00",
            "2026-01-03T20:00",
            "2026-01-03T13:00",
            "2026-01-03T19:00",
        ),
        fly(3, "2026-01-04T06:45", "2026-01-04T13:10"),
        fly(4, "2026-01-05T06:45", "2026-01-05T13:10"),
        fly(5, "2026-01-06T06:45", "2026-01-06T13:10"),
        fly(6, "2026-01-07T06:45", "2026-01-07T13:10"),
    ];

    assert!(run(&work, both_duty).is_some());
    assert!(run(&work, both_flight).is_none());
}

#[test]
fn twenty_eight_day_window_requires_four_qualifying_days() {
    let mut work = Vec::new();
    let off_days = [6, 7, 13, 14, 20, 21, 27, 28];
    for d in 1..=31 {
        if off_days.contains(&d) {
            continue;
        }
        work.push(fly(
            d,
            &format!("2026-01-{d:02}T06:45"),
            &format!("2026-01-{d:02}T13:10"),
        ));
    }

    assert!(run(&work, row(672, 4)).is_none());
    assert!(run(&work, row(672, 5)).is_some());
}

#[test]
fn focus_selects_the_worst_window_inside_the_requested_interval() {
    let work = [
        fly(1, "2026-01-01T06:45", "2026-01-01T13:10"),
        fly(2, "2026-01-03T06:45", "2026-01-03T13:10"),
        fly(3, "2026-01-04T06:45", "2026-01-04T13:10"),
        fly(4, "2026-01-05T06:45", "2026-01-05T13:10"),
        fly(5, "2026-01-06T06:45", "2026-01-06T13:10"),
        fly(6, "2026-01-07T06:45", "2026-01-07T13:10"),
        fly(7, "2026-01-10T06:45", "2026-01-10T13:10"),
    ];

    let violation = check_rule7508_structured_focused(
        "crew",
        &row(168, 1),
        &Rule7508CrewContext::default(),
        0,
        &NIGHT,
        t("2026-01-01T00:00"),
        t("2026-01-15T00:00"),
        &work,
        Application::Editor,
        &[(t("2026-01-01T00:00"), t("2026-01-08T00:00"))],
        None,
    )
    .expect("focused interval contains a violating window");

    assert!(violation.window_end_utc > t("2026-01-01T00:00"));
    assert!(violation.window_start_utc < t("2026-01-08T00:00"));
}

#[test]
fn focus_with_no_overlapping_violation_returns_none() {
    let work = [
        fly(1, "2026-01-01T06:45", "2026-01-01T13:10"),
        fly(2, "2026-01-03T06:45", "2026-01-03T13:10"),
        fly(3, "2026-01-04T06:45", "2026-01-04T13:10"),
        fly(4, "2026-01-05T06:45", "2026-01-05T13:10"),
        fly(5, "2026-01-06T06:45", "2026-01-06T13:10"),
        fly(6, "2026-01-07T06:45", "2026-01-07T13:10"),
        fly(7, "2026-09-15T06:45", "2026-09-18T13:10"),
    ];

    assert!(check_rule7508_structured_focused(
        "crew",
        &row(168, 1),
        &Rule7508CrewContext::default(),
        0,
        &NIGHT,
        t("2026-01-01T00:00"),
        t("2026-10-01T00:00"),
        &work,
        Application::Editor,
        &[(t("2026-09-15T00:00"), t("2026-09-19T00:00"))],
        None,
    ).is_none());
}

fn row_with_layover(period_hours: i64, min_limits: i64, count_layover: bool) -> Rule7508Row {
    Rule7508Row {
        count_layover,
        ..row(period_hours, min_limits)
    }
}

/// One pairing whose two duties enclose a qualifying layover day (Jan 2), the
/// remaining window filled by other pairings.
fn layover_inside_pairing_work() -> Vec<WorkPeriod7508> {
    vec![
        fly(10, "2026-01-01T06:45", "2026-01-01T13:10"),
        fly(10, "2026-01-03T16:45", "2026-01-03T23:40"),
        fly(11, "2026-01-04T06:45", "2026-01-04T13:10"),
        fly(12, "2026-01-05T06:45", "2026-01-05T13:10"),
        fly(13, "2026-01-06T06:45", "2026-01-06T13:10"),
        fly(14, "2026-01-07T06:45", "2026-01-07T13:10"),
    ]
}

#[test]
fn count_layover_y_counts_pairing_layover_as_free_day() {
    let work = layover_inside_pairing_work();
    assert!(
        run(&work, row_with_layover(168, 1, true)).is_none(),
        "layover day inside the pairing satisfies the 7-day window"
    );
}

#[test]
fn count_layover_n_fuses_pairing_into_single_block() {
    let work = layover_inside_pairing_work();
    let violation = run(&work, row_with_layover(168, 1, false))
        .expect("layover inside the pairing must not count as a free day");
    assert_eq!(violation.total_sdfd, 0);
    assert_eq!(violation.min_limits, 1);
}

#[test]
fn count_layover_n_still_counts_rest_between_pairings() {
    let work = vec![
        fly(10, "2026-01-01T06:45", "2026-01-01T13:10"),
        fly(11, "2026-01-03T16:45", "2026-01-03T23:40"),
        fly(12, "2026-01-04T06:45", "2026-01-04T13:10"),
        fly(13, "2026-01-05T06:45", "2026-01-05T13:10"),
        fly(14, "2026-01-06T06:45", "2026-01-06T13:10"),
        fly(15, "2026-01-07T06:45", "2026-01-07T13:10"),
    ];
    assert!(
        run(&work, row_with_layover(168, 1, false)).is_none(),
        "free day between two distinct pairings still satisfies the window"
    );
}

#[test]
fn count_layover_n_single_duty_pairing_matches_y() {
    let work = vec![
        fly(1, "2026-01-01T06:45", "2026-01-01T13:10"),
        fly(2, "2026-01-03T06:45", "2026-01-03T13:10"),
        fly(3, "2026-01-04T06:45", "2026-01-04T13:10"),
        fly(4, "2026-01-05T06:45", "2026-01-05T13:10"),
        fly(5, "2026-01-06T06:45", "2026-01-06T13:10"),
        fly(6, "2026-01-07T06:45", "2026-01-07T13:10"),
    ];
    let y = run(&work, row_with_layover(168, 1, true));
    let n = run(&work, row_with_layover(168, 1, false));
    assert_eq!(y.is_some(), n.is_some());
    assert!(n.is_some(), "no qualifying day anywhere in the window");
}
