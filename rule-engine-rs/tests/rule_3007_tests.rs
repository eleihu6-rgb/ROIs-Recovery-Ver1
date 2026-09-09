//! C++ replica coverage for rule 3007 MAX FDP PER DUTY (full matcher + lazy FLY fill).

use rois_rule_engine::fdp::{FdpBasicDefinition, FdpContext, FdpDuty, FdpSegment};
use rois_rule_engine::parse_utc_seconds;
use rois_rule_engine::rules::rule3007::{check_fdp_per_duty, Rule3007Row};
use rois_rule_engine::Application;

fn utc(ts: &str) -> i64 {
    parse_utc_seconds(&ts.replace(' ', "T")).expect(ts)
}

fn two_hour_fly_duty() -> FdpDuty {
    FdpDuty {
        assignment_group: "FLY".into(),
        pairing_id: 150398,
        duty_seq: 1,
        crew_id: "K1002".into(),
        segments: vec![FdpSegment::fly(
            1,
            utc("2025-01-01 08:00:00"),
            utc("2025-01-01 10:00:00"),
        )],
        ..FdpDuty::default()
    }
}

fn ctx_ci() -> FdpContext {
    let mut ctx = FdpContext::with_fly_assignment(1.0);
    ctx.basic = FdpBasicDefinition::seed_wildcard();
    ctx
}

#[test]
fn wildcard_row_passes_when_fdp_under_max() {
    let mut duty = two_hour_fly_duty();
    let result = check_fdp_per_duty(
        &mut duty,
        &ctx_ci(),
        &[Rule3007Row::wildcard_max_fdp("16:00")],
        Application::Editor,
        true,
    );
    assert!(result.legal);
    assert!(result.violations.is_empty());
    assert_eq!(result.fdp_min, Some(180));
    assert!(result.times_calculated);
}

#[test]
fn wildcard_row_fires_3007_3_when_fdp_over_max() {
    let mut duty = two_hour_fly_duty();
    let result = check_fdp_per_duty(
        &mut duty,
        &ctx_ci(),
        &[Rule3007Row::wildcard_max_fdp("01:00")],
        Application::Editor,
        true,
    );
    assert!(!result.legal);
    assert_eq!(result.violations.len(), 1);
    assert_eq!(result.violations[0].rule_id, "3007.3");
    assert!(result.violations[0].message.contains("01:00"));
}

#[test]
fn lazy_calc_fly_null_once_then_stable() {
    let mut duty = two_hour_fly_duty();
    assert!(duty.pln_fdp_min.is_none());
    let first = check_fdp_per_duty(
        &mut duty,
        &ctx_ci(),
        &[Rule3007Row::wildcard_max_fdp("16:00")],
        Application::Editor,
        true,
    );
    let minutes = first.fdp_min;
    assert!(minutes.is_some());
    duty.nodes.clear();
    let second = check_fdp_per_duty(
        &mut duty,
        &ctx_ci(),
        &[Rule3007Row::wildcard_max_fdp("16:00")],
        Application::Editor,
        true,
    );
    assert_eq!(second.fdp_min, minutes);
}

#[test]
fn res_duty_skips_calc() {
    let mut duty = two_hour_fly_duty();
    duty.assignment_group = "RES".into();
    let result = check_fdp_per_duty(
        &mut duty,
        &ctx_ci(),
        &[Rule3007Row::wildcard_max_fdp("16:00")],
        Application::Editor,
        true,
    );
    assert!(result.legal);
    assert_eq!(duty.pln_fdp_min, None);
    assert!(!duty.times_calculated);
}

#[test]
fn duty_type_filter_rejects_when_no_row_matches() {
    let mut duty = two_hour_fly_duty();
    duty.segments[0].dom_int = "D".into();
    let mut row = Rule3007Row::wildcard_max_fdp("16:00");
    row.duty_type = "I".into();
    let result = check_fdp_per_duty(
        &mut duty,
        &ctx_ci(),
        &[row],
        Application::Editor,
        true,
    );
    assert!(!result.legal);
    assert_eq!(result.violations[0].rule_id, "3007.0");
}

#[test]
fn rest_facility_star_matches_any() {
    let mut duty = two_hour_fly_duty();
    duty.rest_facility = 2;
    let row = Rule3007Row::wildcard_max_fdp("16:00");
    assert_eq!(row.rest_facility, "*");
    let result = check_fdp_per_duty(
        &mut duty,
        &ctx_ci(),
        &[row],
        Application::Editor,
        true,
    );
    assert!(result.legal);
}

#[test]
fn delay_extension_uses_3007_1_when_over_extended_cap() {
    let mut duty = two_hour_fly_duty();
    duty.pln_fdp_min = Some(200);
    duty.times_calculated = true;
    duty.segments.push(FdpSegment::fly(
        2,
        utc("2025-01-01 11:00:00"),
        utc("2025-01-01 12:30:00"),
    ));
    duty.segments[1].end_utc_sch = utc("2025-01-01 12:00:00");
    let mut row = Rule3007Row::wildcard_max_fdp("02:00");
    row.max_extension = "00:30".into();
    let result = check_fdp_per_duty(
        &mut duty,
        &ctx_ci(),
        &[row],
        Application::Editor,
        true,
    );
    assert!(!result.legal);
    assert_eq!(result.violations[0].rule_id, "3007.1");
}

#[test]
fn delay_extension_uses_3007_2_when_between_limit_and_extension() {
    let mut duty = two_hour_fly_duty();
    duty.pln_fdp_min = Some(130);
    duty.times_calculated = true;
    duty.segments.push(FdpSegment::fly(
        2,
        utc("2025-01-01 11:00:00"),
        utc("2025-01-01 12:10:00"),
    ));
    duty.segments[1].end_utc_sch = utc("2025-01-01 12:00:00");
    let mut row = Rule3007Row::wildcard_max_fdp("02:00");
    row.max_extension = "00:30".into();
    let result = check_fdp_per_duty(
        &mut duty,
        &ctx_ci(),
        &[row],
        Application::Editor,
        true,
    );
    assert!(!result.legal);
    assert_eq!(result.violations[0].rule_id, "3007.2");
}

#[test]
fn computed_zero_is_not_recalculated() {
    let mut duty = two_hour_fly_duty();
    duty.pln_fdp_min = Some(0);
    duty.times_calculated = true;
    let result = check_fdp_per_duty(
        &mut duty,
        &ctx_ci(),
        &[Rule3007Row::wildcard_max_fdp("16:00")],
        Application::Editor,
        true,
    );
    assert!(result.legal);
    assert_eq!(duty.pln_fdp_min, Some(0));
}
