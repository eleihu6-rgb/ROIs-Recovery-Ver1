//! C++ replica of `custombiz_calculatedutyfdp_gtest.cpp` plus 3010 node fill.

use rois_rule_engine::fdp::{
    calculate_duty_fdp, calculate_pairing_duty_times, ensure_fly_fdp, fill_3010_nodes,
    CheckInOutParams, DutyNode, FdpBasicDefinition, FdpContext, FdpDuty, FdpSegment, LongTransitRow,
};
use rois_rule_engine::parse_utc_seconds;

fn utc(ts: &str) -> i64 {
    parse_utc_seconds(&ts.replace(' ', "T")).expect(ts)
}

fn fly(id: i64, start: &str, end: &str) -> FdpSegment {
    FdpSegment::fly(id, utc(start), utc(end))
}

fn assignment(
    start: &str,
    end: &str,
    id: i64,
    name: &str,
) -> FdpSegment {
    let mut s = fly(id, start, end);
    s.assignment = name.into();
    s
}

fn duty_with(segments: Vec<FdpSegment>, nodes: Vec<DutyNode>) -> FdpDuty {
    FdpDuty {
        segments,
        nodes,
        assignment_group: "FLY".into(),
        ..FdpDuty::default()
    }
}

#[test]
fn duty_nodes_respect_basic_definition_switches() {
    let mut ctx = FdpContext::with_fly_assignment(1.0);
    ctx.basic = FdpBasicDefinition {
        include_ci: true,
        include_co: true,
        pickup_count: true,
        dropoff_count: true,
        ..FdpBasicDefinition::default()
    };
    let duty = duty_with(
        vec![fly(1, "2025-01-01 08:00:00", "2025-01-01 10:00:00")],
        vec![
            DutyNode::duty("PICKUP", utc("2025-01-01 07:40:00"), utc("2025-01-01 07:50:00")),
            DutyNode::duty("BRIEF", utc("2025-01-01 07:50:00"), utc("2025-01-01 08:00:00")),
            DutyNode::duty("DEBRIEF", utc("2025-01-01 10:00:00"), utc("2025-01-01 10:35:00")),
            DutyNode::duty("DROPOFF", utc("2025-01-01 10:35:00"), utc("2025-01-01 10:50:00")),
        ],
    );
    assert_eq!(calculate_duty_fdp(&duty, &ctx), 11400);

    ctx.basic.include_ci = false;
    ctx.basic.include_co = false;
    ctx.basic.pickup_count = false;
    ctx.basic.dropoff_count = false;
    assert_eq!(calculate_duty_fdp(&duty, &ctx), 7200);
}

#[test]
fn long_transit_and_fixed_extensions_follow_basic_definition_flags() {
    let mut ctx = FdpContext::with_fly_assignment(1.0);
    ctx.basic = FdpBasicDefinition {
        include_lt_ci: true,
        include_lt_co: true,
        include_lt_pickup: true,
        include_lt_dropoff: true,
        include_lt_break: true,
        fixed_extension_min: 5,
        before_fixed_extension_min: 2,
        ..FdpBasicDefinition::default()
    };
    ctx.long_transits.push(LongTransitRow {
        max_turn_time_min: 120,
        pseudo_ci_min: 20,
        pseudo_co_min: 15,
        pseudo_pickup_min: 10,
        pseudo_dropoff_min: 5,
        is_split_duty: true,
        ..LongTransitRow::default()
    });
    let duty = duty_with(
        vec![
            fly(100, "2025-01-01 08:00:00", "2025-01-01 09:00:00"),
            fly(200, "2025-01-01 12:00:00", "2025-01-01 13:00:00"),
        ],
        vec![],
    );
    assert_eq!(calculate_duty_fdp(&duty, &ctx), 18420);

    ctx.basic.include_lt_break = false;
    assert_eq!(calculate_duty_fdp(&duty, &ctx), 10620);
}

#[test]
fn pre_ferry_and_last_dhd_honors_flags() {
    let mut ctx = FdpContext::with_fly_assignment(1.0);
    ctx.add_assignment("FERRY", 0.0, &["FERRY"]);
    ctx.basic.pre_ferry_count = true;
    ctx.basic.include_last_dhd = true;
    let duty = duty_with(
        vec![
            assignment("2025-01-01 08:00:00", "2025-01-01 09:00:00", 10, "FERRY"),
            fly(11, "2025-01-01 09:00:00", "2025-01-01 10:00:00"),
            assignment("2025-01-01 10:00:00", "2025-01-01 11:00:00", 12, "FERRY"),
        ],
        vec![],
    );
    assert_eq!(calculate_duty_fdp(&duty, &ctx), 10800);

    ctx.basic.pre_ferry_count = false;
    ctx.basic.include_last_dhd = false;
    assert_eq!(calculate_duty_fdp(&duty, &ctx), 3600);
}

#[test]
fn pre_and_post_ground_stay_hsb_segments_toggle_with_flags() {
    let mut ctx = FdpContext::with_fly_assignment(1.0);
    ctx.add_assignment("GND", 0.0, &["GND"]);
    ctx.add_assignment("STAY", 0.0, &["STAY"]);
    ctx.add_assignment("HSB", 0.0, &["HSB"]);
    ctx.basic.include_pre_ground = true;
    ctx.basic.include_post_stay = true;
    ctx.basic.include_post_hsb = true;
    let duty = duty_with(
        vec![
            assignment("2025-02-01 07:00:00", "2025-02-01 08:00:00", 20, "GND"),
            fly(21, "2025-02-01 08:00:00", "2025-02-01 09:00:00"),
            assignment("2025-02-01 09:00:00", "2025-02-01 10:00:00", 22, "STAY"),
            assignment("2025-02-01 10:00:00", "2025-02-01 11:00:00", 23, "HSB"),
        ],
        vec![],
    );
    assert_eq!(calculate_duty_fdp(&duty, &ctx), 14400);

    ctx.basic.include_pre_ground = false;
    ctx.basic.include_post_stay = false;
    ctx.basic.include_post_hsb = false;
    assert_eq!(calculate_duty_fdp(&duty, &ctx), 3600);
}

#[test]
fn stick_time_overrides_actual_when_enabled() {
    let mut ctx = FdpContext::with_fly_assignment(1.0);
    ctx.basic.use_stick_time = true;
    let mut seg = fly(301, "2025-03-01 08:00:00", "2025-03-01 08:20:00");
    seg.blk_seconds = 90 * 60;
    let duty = duty_with(vec![seg], vec![]);
    assert_eq!(calculate_duty_fdp(&duty, &ctx), 5400);
}

#[test]
fn min_connection_time_applies_between_flights() {
    let mut ctx = FdpContext::with_fly_assignment(1.0);
    ctx.basic.use_stick_time = true;
    ctx.basic.min_connection_time_min = 55;
    let mut a = fly(401, "2025-03-01 08:00:00", "2025-03-01 08:40:00");
    a.blk_seconds = 60 * 60;
    let mut b = fly(402, "2025-03-01 09:30:00", "2025-03-01 10:10:00");
    b.blk_seconds = 60 * 60;
    let duty = duty_with(vec![a, b], vec![]);
    assert_eq!(calculate_duty_fdp(&duty, &ctx), 10500);
}

#[test]
fn fill_3010_creates_brief_and_debrief_when_nodes_missing() {
    let mut duty = duty_with(
        vec![fly(1, "2025-01-01 08:00:00", "2025-01-01 10:00:00")],
        vec![],
    );
    fill_3010_nodes(&mut duty, CheckInOutParams { brief_min: 60, debrief_min: 15 });
    assert_eq!(duty.nodes.len(), 2);
    let brief = duty.nodes.iter().find(|n| n.node == "BRIEF").unwrap();
    let debrief = duty.nodes.iter().find(|n| n.node == "DEBRIEF").unwrap();
    assert_eq!(brief.start_loc, utc("2025-01-01 07:00:00"));
    assert_eq!(brief.end_loc, utc("2025-01-01 08:00:00"));
    assert_eq!(debrief.start_loc, utc("2025-01-01 10:00:00"));
    assert_eq!(debrief.end_loc, utc("2025-01-01 10:15:00"));
}

#[test]
fn fill_3010_does_not_replace_existing_duty_nodes() {
    let existing = DutyNode::duty("BRIEF", utc("2025-01-01 07:30:00"), utc("2025-01-01 08:00:00"));
    let mut duty = duty_with(
        vec![fly(1, "2025-01-01 08:00:00", "2025-01-01 10:00:00")],
        vec![existing.clone()],
    );
    fill_3010_nodes(&mut duty, CheckInOutParams::default());
    let briefs: Vec<_> = duty.nodes.iter().filter(|n| n.node == "BRIEF").collect();
    assert_eq!(briefs.len(), 1);
    assert_eq!(briefs[0].start_loc, existing.start_loc);
}

#[test]
fn pairing_duty_times_include_ci_excludes_co_and_sets_times_calculated() {
    let mut ctx = FdpContext::with_fly_assignment(1.0);
    ctx.basic = FdpBasicDefinition::seed_wildcard();
    ctx.checkin = CheckInOutParams::default();
    let mut duty = duty_with(
        vec![fly(1, "2025-01-01 08:00:00", "2025-01-01 10:00:00")],
        vec![],
    );
    calculate_pairing_duty_times(&mut duty, &ctx);
    assert!(duty.times_calculated);
    // 60 min brief + 120 min fly; debrief skipped because INCLUDE CO=N
    assert_eq!(duty.pln_fdp_min, Some(180));
}

#[test]
fn ensure_fly_calculates_once_res_skips() {
    let mut ctx = FdpContext::with_fly_assignment(1.0);
    ctx.basic = FdpBasicDefinition::seed_wildcard();
    let mut fly_duty = duty_with(
        vec![fly(1, "2025-01-01 08:00:00", "2025-01-01 09:00:00")],
        vec![],
    );
    ensure_fly_fdp(&mut fly_duty, &ctx);
    let first = fly_duty.pln_fdp_min;
    assert!(first.is_some());
    fly_duty.nodes.clear();
    ensure_fly_fdp(&mut fly_duty, &ctx);
    assert_eq!(fly_duty.pln_fdp_min, first);

    let mut res = fly_duty.clone();
    res.assignment_group = "RES".into();
    res.pln_fdp_min = None;
    res.times_calculated = false;
    res.nodes.clear();
    ensure_fly_fdp(&mut res, &ctx);
    assert_eq!(res.pln_fdp_min, None);
    assert!(!res.times_calculated);
}
