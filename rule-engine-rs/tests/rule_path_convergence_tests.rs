#[test]
fn shared_rules_namespace_is_available() {
    let _ = rois_rule_engine::rules::RULE_PATH_CONVERGENCE_MARKER;
}

#[test]
fn batch_a_rule_modules_export_shared_1001_and_8056_contracts() {
    let _ = rois_rule_engine::rules::rule1001::AssignmentOverlapRule {
        group_before: vec!["FLY".into()],
        assignment_before: vec!["*".into()],
        rest_before: true,
        type_before: vec!["*".into()],
        group_after: vec!["DO".into()],
        assignment_after: vec!["*".into()],
        type_after: vec!["*".into()],
    };
    let _ = rois_rule_engine::rules::rule8056::Rule8056Rule {
        bases: vec!["*".into()],
        ranks: vec!["*".into()],
        fleets: vec!["*".into()],
        teams: vec!["*".into()],
        attribute_a: vec!["*".into()],
        label_a: vec!["*".into()],
        assignment_group_a: vec!["FLY".into()],
        assignment_a: vec!["*".into()],
        qualifier_a: vec!["*".into()],
        airport_a: vec!["*".into()],
        roles_a: vec!["*".into()],
        is_requested_a: None,
        attribute_b: vec!["*".into()],
        label_b: vec!["*".into()],
        assignment_group_b: vec!["FLY".into()],
        assignment_b: vec!["*".into()],
        qualifier_b: vec!["*".into()],
        airport_b: vec!["*".into()],
        roles_b: vec!["*".into()],
        is_requested_b: None,
        space: 24.0,
        unit: "RH".into(),
        directional: true,
        location_equal_base_a: None,
        location_equal_base_b: None,
        utilize_post_duty_rest: false,
    };
}

#[test]
fn batch_b_rule_modules_export_rest_and_day_off_contracts() {
    let _ = rois_rule_engine::rules::rule7501::WorkPeriod7501 {
        pairing_id: Some(1),
        start_utc: 0,
        end_utc: 3600,
    };
    let _ = rois_rule_engine::rules::rule7503::WoclWorkPeriod {
        pairing_id: Some(1),
        start_utc: 0,
        end_utc: 3600,
        offset_min: 0,
        is_ground: false,
    };
    let _ = rois_rule_engine::rules::rule7505::DaysOffRow {
        min_do: 1,
        rp_days_lower: 0,
        rp_days_upper: 30,
        leave_days_lower: 0,
        leave_days_upper: 30,
        do_codes: vec!["DO".into()],
        leave_codes: vec!["VAC".into()],
        count_blank: false,
        count_layover: false,
        count_post_rest: false,
        period: "1".into(),
        unit: "RP".into(),
        fly_days_lower: 0,
        fly_days_upper: i64::MAX,
        fly_assignments: Vec::new(),
        reserve_days_lower: 0,
        reserve_days_upper: i64::MAX,
        reserve_assignments: Vec::new(),
    };
    let _ = rois_rule_engine::rules::rule7506::CheckinRoster {
        duty: "FLY".into(),
        start_utc: 0,
        rest_start_utc: 3600,
        end_offset_min: 0,
    };
}

#[test]
fn batch_c_rule_modules_export_qualification_and_complement_contracts() {
    let _ = rois_rule_engine::rules::rule8004::BaseRoster {
        pairing_id: 1,
        base: "YVR".into(),
        start_ord: 20_000,
        end_ord: 20_001,
    };
    let _ = rois_rule_engine::rules::rule8030::AgeFlight {
        flight_id: 1,
        start_ord: 20_000,
        crew: vec![rois_rule_engine::rules::rule8030::FlightCrew {
            crew_id: "101".into(),
            division: "P".into(),
            birth_ord: 4_000,
            pairing_id: 1,
        }],
    };
    let _ = rois_rule_engine::rules::rule8071::Rule8071Mode::Roster;
    let _ = rois_rule_engine::rules::rule8072::Rule8072Segment {
        segment_id: 1,
        pairing_id: 1,
        duty_seq: 1,
        seg_seq: 1,
        flight_id: 1,
        flight_number: "F8001".into(),
        flight_date: "2026-06-01".into(),
        start_utc: 0,
        end_utc: 3600,
        fleet: "737".into(),
        dep: "YVR".into(),
        arr: "YYZ".into(),
        assignment: "FLT".into(),
        assignment_group: "FLY".into(),
        composition: "FC-GREEN".into(),
        attributes: Vec::new(),
        destination_country: "CA".into(),
        planned_by_rank: Vec::new(),
        filled_by_rank: Vec::new(),
        crews: Vec::new(),
    };
    let _ = rois_rule_engine::rules::rule7510::Rule7510Param::from_cells(&[
        "*", "*", "*", "*", "*", "*", "*", "8", "0", "1",
    ])
    .expect("valid 7510 shared contract");
}

#[test]
fn batch_d_rule_modules_export_cumulative_and_credit_contracts() {
    let _ = rois_rule_engine::rules::rule8002::CumRule8002 {
        bases: vec!["*".into()],
        ranks: vec!["*".into()],
        fleets: vec!["*".into()],
        teams: vec!["*".into()],
        period: 28,
        unit: rois_rule_engine::rules::rule8002::CumUnit::Cd,
        max_min: 6_720,
        min_min: 0,
        rtype: rois_rule_engine::rules::rule8002::CumType::Bh,
        int_oper_band: None,
        aug_oper_band: None,
        duty_aloft_band: None,
        has_sby_or_fly: None,
        reduction_min_per_duty: 0,
    };
    let _ = rois_rule_engine::rules::rule7502::CreditParam {
        min_ch_minutes: 240,
        ft_ratio: 1.0,
        dp_ratio: 0.5,
    };
    let _ = rois_rule_engine::rules::rule7272::StandbyDpParam {
        assignments: vec!["SBY".into()],
        offset_min: 0,
        rate: 0.33,
        sby_limit_min: 0,
        notify_limit_min: 0,
    };
}
