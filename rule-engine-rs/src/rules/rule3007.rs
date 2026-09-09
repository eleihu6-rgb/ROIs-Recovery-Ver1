//! Rule 3007 MAX FDP PER DUTY — C++ `checkFDPPerDutyByDuty` (full matcher).
//!
//! First matching param row wins. No matching row is illegal (C++ line 480).
//! FLY duties with `pln_fdp_min == None` lazy-fill via `ensure_fly_fdp` once.

use crate::fdp::{
    duty_type, ensure_fly_fdp, first_fly_fleet_grp, has_operating_duty, hhmm_to_minutes,
    is_times_in_range, landing_count, minutes_to_hhmm, FdpContext, FdpDuty,
};
use crate::Application;

#[derive(Debug, Clone, PartialEq)]
pub struct Rule3007Row {
    pub composition: String,
    pub compositions: Vec<String>,
    pub rest_facility: String,
    pub landing_lower: i32,
    pub landing_upper: i32,
    pub rpt_start: String,
    pub rpt_end: String,
    pub max_fdp: String,
    pub max_extension: String,
    pub is_augment: bool,
    pub departure_start: String,
    pub departure_end: String,
    pub duty_type: String,
    pub duty_fleet: String,
    pub duty_fleets: Vec<String>,
    pub lt_rest_threshold: String,
    pub lt_rest_ratio: String,
    pub extension_ts_flags: String,
    pub extension_ts_flag_list: Vec<String>,
    pub at_base_fdp_extension: String,
    pub out_of_base_fdp_extension: String,
    pub leg_sch_blh_start: String,
    pub leg_sch_blh_end: String,
}

impl Default for Rule3007Row {
    fn default() -> Self {
        Self {
            composition: "*".into(),
            compositions: vec!["*".into()],
            rest_facility: "*".into(),
            landing_lower: 0,
            landing_upper: 99,
            rpt_start: "00:00".into(),
            rpt_end: "23:59".into(),
            max_fdp: "16:00".into(),
            max_extension: String::new(),
            is_augment: false,
            departure_start: "00:00".into(),
            departure_end: "23:59".into(),
            duty_type: "*".into(),
            duty_fleet: "*".into(),
            duty_fleets: vec!["*".into()],
            lt_rest_threshold: String::new(),
            lt_rest_ratio: String::new(),
            extension_ts_flags: "*".into(),
            extension_ts_flag_list: vec!["*".into()],
            at_base_fdp_extension: "00:00".into(),
            out_of_base_fdp_extension: "00:00".into(),
            leg_sch_blh_start: "*".into(),
            leg_sch_blh_end: "*".into(),
        }
    }
}

impl Rule3007Row {
    pub fn wildcard_max_fdp(max_fdp: &str) -> Self {
        Self {
            max_fdp: max_fdp.into(),
            rest_facility: "*".into(),
            is_augment: false,
            ..Self::default()
        }
    }

    pub fn from_headers(header: &[String], row: &[String]) -> Self {
        let get = |name: &str| -> String {
            header
                .iter()
                .position(|h| h.eq_ignore_ascii_case(name))
                .and_then(|i| row.get(i).cloned())
                .unwrap_or_default()
        };
        let composition = nonempty_or(&get("COMPOSITION"), "*");
        let duty_fleet = nonempty_or(&get("DUTY FLEET"), "*");
        let extension_ts_flags = nonempty_or(&get("EXTENSION TS FLAGS"), "*");
        let rest = get("REST FACILITY");
        Self {
            compositions: split_bar(&composition),
            composition,
            rest_facility: if rest.is_empty() { "*".into() } else { rest },
            landing_lower: parse_i32(&get("LANDING LOWER"), 0),
            landing_upper: parse_i32(&get("LANDINGS UPPER"), 99),
            rpt_start: nonempty_or(&get("RPT START"), "00:00"),
            rpt_end: nonempty_or(&get("RPT END"), "23:59"),
            max_fdp: get("MAX FDP"),
            max_extension: get("MAX EXTENSION"),
            is_augment: get("ISAUGMENT").eq_ignore_ascii_case("Y"),
            departure_start: nonempty_or(&get("DEPARTURE START"), "00:00"),
            departure_end: nonempty_or(&get("DEPARTURE END"), "23:59"),
            duty_type: nonempty_or(&or_empty(&get("DUTY TYPE"), &get("DUTY DIR")), "*"),
            duty_fleets: split_bar(&duty_fleet),
            duty_fleet,
            lt_rest_threshold: get("LT REST THREADHOLD"),
            lt_rest_ratio: get("LT REST RATIO"),
            extension_ts_flag_list: split_bar(&extension_ts_flags),
            extension_ts_flags,
            at_base_fdp_extension: nonempty_or(&get("AT BASE FDP EXTENSION"), "00:00"),
            out_of_base_fdp_extension: nonempty_or(&get("OUT OF BASE FDP EXTENSION"), "00:00"),
            leg_sch_blh_start: nonempty_or(&get("LEG SCH BLH START"), "*"),
            leg_sch_blh_end: nonempty_or(&get("LEG SCH BLH END"), "*"),
        }
    }
}

fn nonempty_or(value: &str, fallback: &str) -> String {
    let t = value.trim();
    if t.is_empty() {
        fallback.into()
    } else {
        t.into()
    }
}

fn or_empty(a: &str, b: &str) -> String {
    if a.trim().is_empty() {
        b.to_string()
    } else {
        a.to_string()
    }
}

fn parse_i32(raw: &str, fallback: i32) -> i32 {
    raw.trim().parse().unwrap_or(fallback)
}

fn split_bar(value: &str) -> Vec<String> {
    value
        .split('|')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

#[derive(Debug, Clone, PartialEq)]
pub struct Rule3007Violation {
    pub rule_id: String,
    pub pairing_id: i64,
    pub duty_seq: i32,
    pub crew_id: String,
    pub start_utc: i64,
    pub end_utc: i64,
    pub fdp_min: i64,
    pub max_fdp_min: i64,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Rule3007Result {
    pub violations: Vec<Rule3007Violation>,
    pub fdp_min: Option<i64>,
    pub times_calculated: bool,
    pub max_fdp_min: Option<i64>,
    pub legal: bool,
}

fn composition_matches(row: &Rule3007Row, complement: &str) -> bool {
    complement.is_empty()
        || row.composition == "*"
        || row.compositions.iter().any(|c| c == "*" || c == complement)
}

fn rest_facility_matches(row: &Rule3007Row, duty_rf: i32) -> bool {
    row.rest_facility == "*" || row.rest_facility.parse::<i32>().ok() == Some(duty_rf)
}

fn match_sch_blh(duty: &FdpDuty, row: &Rule3007Row) -> bool {
    let start = row.leg_sch_blh_start.trim();
    let end = row.leg_sch_blh_end.trim();
    if (start.is_empty() || start == "*") && (end.is_empty() || end == "*") {
        return true;
    }
    let lo = hhmm_to_minutes(start);
    let hi = hhmm_to_minutes(end);
    duty.segments.iter().any(|seg| {
        let blh = seg.end_utc_sch - seg.start_utc_sch;
        blh >= lo * 60 && blh < hi * 60
    })
}

fn delay_extension_secs(duty: &FdpDuty, max_extension: &str) -> i64 {
    if duty.segments.len() <= 1 {
        return 0;
    }
    let last = duty.segments.last().unwrap();
    if last.end_utc_act > last.end_utc_sch {
        hhmm_to_minutes(max_extension) * 60
    } else {
        0
    }
}

fn apply_lt_rest(duty: &FdpDuty, row: &Rule3007Row, max_fdp_min: &mut i64) {
    let threshold = hhmm_to_minutes(&row.lt_rest_threshold);
    let ratio: f64 = row.lt_rest_ratio.trim().parse().unwrap_or(0.0);
    if threshold <= 0 || ratio <= 0.0 || duty.segments.len() <= 1 {
        return;
    }
    for i in 0..duty.segments.len() - 1 {
        let has_node = duty.nodes.iter().any(|n| {
            n.node_type == "SEGMENT"
                && ((n.node == "DEBRIEF" && n.from_segment_id == duty.segments[i].db_id)
                    || (n.node == "BRIEF" && n.to_segment_id == duty.segments[i + 1].db_id))
        });
        if !has_node {
            continue;
        }
        let rest_min = (duty.segments[i + 1].start_utc_act - duty.segments[i].end_utc_act) / 60;
        if rest_min >= threshold {
            *max_fdp_min += (ratio * rest_min as f64) as i64;
        }
    }
}

fn fdp_discretion_min(duty: &FdpDuty) -> i64 {
    if duty.discretion_types.iter().any(|t| t == "FDP") {
        duty.fdp_discretion_min
    } else {
        0
    }
}

fn extension_ulr_min(duty: &FdpDuty, row: &Rule3007Row) -> i64 {
    if row.extension_ts_flags == "*" || row.extension_ts_flags.is_empty() {
        return 0;
    }
    let hit = duty.ts_flags.iter().any(|f| {
        row.extension_ts_flag_list
            .iter()
            .any(|p| p == f || p == "*")
    });
    if !hit {
        return 0;
    }
    if duty.first_dep_is_crew_base {
        hhmm_to_minutes(&row.at_base_fdp_extension)
    } else {
        hhmm_to_minutes(&row.out_of_base_fdp_extension)
    }
}

fn format_checkin(utc: i64) -> String {
    let tod = ((utc % 86_400) + 86_400) % 86_400;
    format!("{:02}:{:02}", tod / 3600, (tod % 3600) / 60)
}

fn row_matches(duty: &FdpDuty, row: &Rule3007Row, can_augment: bool, app: Application) -> bool {
    if app == Application::Optimizer && !can_augment && row.is_augment {
        return false;
    }
    if row.max_fdp.trim().is_empty() {
        return false;
    }
    if !rest_facility_matches(row, duty.rest_facility) {
        return false;
    }
    if !match_sch_blh(duty, row) {
        return false;
    }
    let landing = landing_count(duty);
    if landing < row.landing_lower || landing > row.landing_upper {
        return false;
    }
    let checkin = if duty.checkin_local != 0 {
        duty.checkin_local
    } else {
        duty.segments.first().map(|s| s.start_utc_act).unwrap_or(0)
    };
    let dep = if duty.dep_local != 0 {
        duty.dep_local
    } else {
        duty.segments.first().map(|s| s.start_utc_act).unwrap_or(0)
    };
    if !is_times_in_range(checkin, hhmm_to_minutes(&row.rpt_start), hhmm_to_minutes(&row.rpt_end)) {
        return false;
    }
    if !is_times_in_range(
        dep,
        hhmm_to_minutes(&row.departure_start),
        hhmm_to_minutes(&row.departure_end),
    ) {
        return false;
    }
    if row.duty_type != "*" && duty_type(duty) != row.duty_type {
        return false;
    }
    if row.duty_fleet != "*" {
        let grp = first_fly_fleet_grp(duty);
        if !row.duty_fleets.iter().any(|f| f == &grp || f == "*") {
            return false;
        }
    }
    composition_matches(row, &duty.composition_name)
}

/// Full 3007 check. Mutates `duty` when FLY FDP is still uncomputed.
pub fn check_fdp_per_duty(
    duty: &mut FdpDuty,
    ctx: &FdpContext,
    rows: &[Rule3007Row],
    app: Application,
    can_augment: bool,
) -> Rule3007Result {
    if !has_operating_duty(duty) {
        return Rule3007Result {
            violations: Vec::new(),
            fdp_min: duty.pln_fdp_min,
            times_calculated: duty.times_calculated,
            max_fdp_min: None,
            legal: true,
        };
    }
    ensure_fly_fdp(duty, ctx);
    let fdp_secs = duty.pln_fdp_min.unwrap_or(0) * 60;
    let checkin = if duty.checkin_local != 0 {
        duty.checkin_local
    } else {
        duty.segments.first().map(|s| s.start_utc_act).unwrap_or(0)
    };
    let dep = if duty.dep_local != 0 {
        duty.dep_local
    } else {
        duty.segments.first().map(|s| s.start_utc_act).unwrap_or(0)
    };

    for row in rows {
        if !row_matches(duty, row, can_augment, app) {
            continue;
        }
        let mut max_fdp_min = hhmm_to_minutes(&row.max_fdp);
        apply_lt_rest(duty, row, &mut max_fdp_min);
        let extension_secs = delay_extension_secs(duty, &row.max_extension);
        let discretion = fdp_discretion_min(duty);
        let ulr = extension_ulr_min(duty, row);
        let limit_secs = (max_fdp_min + discretion + ulr) * 60;
        let fdp_hhmm = minutes_to_hhmm(fdp_secs / 60);
        let act_checkin = format_checkin(checkin);
        let act_dep = format_checkin(dep);

        let viol = |rule_id: &str, message: String, max_shown: i64| Rule3007Violation {
            rule_id: rule_id.into(),
            pairing_id: duty.pairing_id,
            duty_seq: duty.duty_seq,
            crew_id: duty.crew_id.clone(),
            start_utc: duty.start_utc,
            end_utc: duty.end_utc,
            fdp_min: fdp_secs / 60,
            max_fdp_min: max_shown,
            message,
        };

        if fdp_secs > limit_secs + extension_secs && extension_secs != 0 {
            if app == Application::Optimizer {
                return Rule3007Result {
                    violations: Vec::new(),
                    fdp_min: duty.pln_fdp_min,
                    times_calculated: duty.times_calculated,
                    max_fdp_min: Some(max_fdp_min),
                    legal: false,
                };
            }
            let ext_shown = max_fdp_min + extension_secs / 60 + ulr;
            let mut max_label = minutes_to_hhmm(ext_shown);
            if discretion > 0 {
                max_label = format!("{max_label} + {}", minutes_to_hhmm(discretion));
            }
            let message = format!(
                "Flight duty period ({fdp_hhmm}) is more than the extension limitation ({max_label}), \
Crew Complement={}, Reported Time ({}-{}), Actual Repoert Time ({act_checkin}), Departure Time ({}-{}), Actual Departure Time ({act_dep}).",
                row.composition, row.rpt_start, row.rpt_end, row.departure_start, row.departure_end
            );
            return Rule3007Result {
                violations: vec![viol("3007.1", message, ext_shown)],
                fdp_min: duty.pln_fdp_min,
                times_calculated: duty.times_calculated,
                max_fdp_min: Some(max_fdp_min),
                legal: false,
            };
        } else if fdp_secs > limit_secs && fdp_secs <= limit_secs + extension_secs && extension_secs != 0
        {
            if app == Application::Optimizer {
                return Rule3007Result {
                    violations: Vec::new(),
                    fdp_min: duty.pln_fdp_min,
                    times_calculated: duty.times_calculated,
                    max_fdp_min: Some(max_fdp_min),
                    legal: false,
                };
            }
            let ext_shown = max_fdp_min + extension_secs / 60 + ulr;
            let mut ext_label = minutes_to_hhmm(ext_shown);
            if discretion > 0 {
                ext_label = format!("{ext_label} + {}", minutes_to_hhmm(discretion));
            }
            let message = format!(
                "Flight duty period ({fdp_hhmm}) is more than the limitation ({}) but less than the extension limitation ({ext_label}), \
Crew Complement={}, Reported Time ({}-{}), Actual Repoert Time ({act_checkin}), Departure Time ({}-{}), Actual Departure Time ({act_dep}).",
                minutes_to_hhmm(max_fdp_min),
                row.composition, row.rpt_start, row.rpt_end, row.departure_start, row.departure_end
            );
            return Rule3007Result {
                violations: vec![viol("3007.2", message, ext_shown)],
                fdp_min: duty.pln_fdp_min,
                times_calculated: duty.times_calculated,
                max_fdp_min: Some(max_fdp_min),
                legal: false,
            };
        } else if fdp_secs > limit_secs {
            if app == Application::Optimizer {
                return Rule3007Result {
                    violations: Vec::new(),
                    fdp_min: duty.pln_fdp_min,
                    times_calculated: duty.times_calculated,
                    max_fdp_min: Some(max_fdp_min),
                    legal: false,
                };
            }
            let mut max_label = minutes_to_hhmm(max_fdp_min + ulr);
            if discretion > 0 {
                max_label = format!("{max_label} + {}", minutes_to_hhmm(discretion));
            }
            let message = format!(
                "Flight duty period ({fdp_hhmm}) is more than the limitation ({max_label}), Crew Complement={}, Reported Time ({}-{}), Actual Repoert Time ({act_checkin}), Departure Time ({}-{}), Actual Departure Time ({act_dep}).",
                row.composition, row.rpt_start, row.rpt_end, row.departure_start, row.departure_end
            );
            return Rule3007Result {
                violations: vec![viol("3007.3", message, max_fdp_min + ulr)],
                fdp_min: duty.pln_fdp_min,
                times_calculated: duty.times_calculated,
                max_fdp_min: Some(max_fdp_min),
                legal: false,
            };
        }
        return Rule3007Result {
            violations: Vec::new(),
            fdp_min: duty.pln_fdp_min,
            times_calculated: duty.times_calculated,
            max_fdp_min: Some(max_fdp_min),
            legal: true,
        };
    }

    let message = "No matching Max FDP parameter row for this duty.".to_string();
    Rule3007Result {
        violations: if app == Application::Optimizer {
            Vec::new()
        } else {
            vec![Rule3007Violation {
                rule_id: "3007.0".into(),
                pairing_id: duty.pairing_id,
                duty_seq: duty.duty_seq,
                crew_id: duty.crew_id.clone(),
                start_utc: duty.start_utc,
                end_utc: duty.end_utc,
                fdp_min: fdp_secs / 60,
                max_fdp_min: 0,
                message,
            }]
        },
        fdp_min: duty.pln_fdp_min,
        times_calculated: duty.times_calculated,
        max_fdp_min: None,
        legal: false,
    }
}
