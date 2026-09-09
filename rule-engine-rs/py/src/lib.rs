//! PyO3 connector: exposes the Rust rule engine to the PBS solver in-process.
//!
//! Phase 2+ (enforced per-crew kernels): `check_line` evaluates the crew's fixed
//! rosters merged with the candidate line against:
//!   * **8002 MAX_CUM_BLOCK** — cumulative block minutes ≤ limit in any rolling
//!     N-calendar-day window (block attributed to each pairing's UTC start day);
//!   * **8056 ROSTER SPACING** — gap between consecutive FLY duties ≥ SPACE.
//! Default `application="optimizer"`: pre-assigned-only breaches are tolerated;
//! a breach fires only when the candidate participates (RO solver semantics).
//! `application="editor"` mirrors Live Gantt / Editor: full legality on the line.
//!
//! Payload stays native (i64 + Vec<i64>), no JSON (plan §6). Remaining rules
//! layer in the same way.
//!
//! See docs/superpowers/plans/2026-06-20-python-solver-rust-rule-engine-plan.md.

use std::collections::{BTreeMap, BTreeSet, HashMap};

use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;

use rois_rule_engine::rule8071::check_roster_properties_row_with_country_sets;
use rois_rule_engine::{
    acc_duty_refs, check_min_space_wocl_app, check_roster_spacing_app,
    check_roster_spacing_full_with_context, check_roster_spacing_grouped_app, format_hhmm,
    rp_ordinal_bounds_to_local_utc,
    rules::{
        rule1001::{
            check_assignment_overlap, AssignmentOverlapRoster, AssignmentOverlapRule,
            DoStartGrace1001,
        },
        rule7305::{check_rule7305_row, Rule7305, Rule7305CrewContext, Rule7305Duty},
        rule7501::{
            check_rule7501_structured, check_sdfd_rolling_app, LocalNightDef, Rule7501CrewContext,
            Rule7501Row, WorkPeriod7501,
        },
        rule7503::{check_consecutive_wocl_app, WoclWorkPeriod},
        rule7504::{check_rule7504_structured, Rule7504CrewContext, Rule7504Duty, Rule7504Row},
        rule7505::{
            check_min_days_off_app, filter_days_off_rows_for_crew, Activity7505, CrewScope7505,
            DaysOffRow, DaysOffScope, ScopedDaysOffRow,
        },
        rule7506::{check_single_daily_checkin, CheckinRoster},
        rule7508::{check_rule7508_structured, Rule7508CrewContext, Rule7508Row, WorkPeriod7508},
        rule7509::{check_avoid_co_pairing, Rule7509Member, Rule7509Param},
        rule7510::{check_green_on_green, Rule7510CrewFlight, Rule7510Param, Rule7510Violation},
        rule8002::{
            check_max_cum_block_app, check_max_cumulative_row, crew_qualifies_8002,
            merge_daily_with_candidate, qual_entry_from_ord, team_qual_entry, CumRule8002, CumType,
            CumUnit, DayMetrics, QualEntry,
        },
        rule8004::{check_base_competency_app, BaseActivity, BaseQual, BaseRoster},
        rule8030::{check_pilot_age_app, AgeFlight, FlightCrew},
        rule8071::{RosterPropertyActivity, Rule8071},
        rule8072::{check_min_qual_by_fleet_rank, Rule8072, Rule8072Crew, Rule8072Segment},
    },
    sdfd_rest_acc_offsets, AccDuty, AccDutyRef, Application, RosterDuty, Rule8056Duty,
    Rule8056Rule, WoclSpacingDuty,
};

/// Extra arrays that the PBS solver wrapper pre-computes and injects via
/// `set_next_engine_extras()` before calling the snapshot's `rre.Engine(...)`.
/// Stored as raw Python types (i64 offsets, not yet converted to usize) so the
/// existing validation logic in `Engine::new()` can handle them uniformly.
struct EngineExtras {
    crew_daily_baseline: Vec<Vec<(i64, f64)>>,
    pairing_seg_offsets: Vec<i64>,
    pairing_seg_std_utc: Vec<i64>,
    pairing_seg_sta_utc: Vec<i64>,
    pairing_seg_blk_min: Vec<i64>,
    pairing_seg_crew_offset_min: Vec<Vec<i64>>,
    pairing_seg_crew_sta_offset_min: Vec<Vec<i64>>,
    pairing_duty_offsets: Vec<i64>,
    pairing_duty_start_utc: Vec<i64>,
    pairing_duty_end_utc: Vec<i64>,
    pairing_duty_first_flight_departure_utc: Vec<i64>,
    pairing_duty_last_flight_arrival_utc: Vec<i64>,
    pairing_duty_dep_tz_min: Vec<i64>,
    pairing_duty_arr_tz_min: Vec<i64>,
    pairing_duty_dp_min: Vec<i64>,
    pairing_duty_blk_min: Vec<i64>,
    pairing_duty_dp_pct: Vec<f64>,
    pairing_duty_crew_offset_min: Vec<Vec<i64>>,
    crew_ground_is_rest: Vec<Vec<bool>>,
    crew_daily_metrics: Vec<Vec<(i64, Vec<f64>)>>,
    pairing_duty_credit_min: Vec<i64>,
    /// Rule 2015 DO Start (minutes past local midnight). None → 0.
    do_start_min: Option<i64>,
    /// Rule 2015 Assignments filter for 1001 grace (pipe-separated in Python).
    do_start_assignments: Option<String>,
    /// Rule 2015 Assignment Groups filter for 1001 grace (pipe-separated in Python).
    do_start_groups: Option<String>,
}

static NEXT_EXTRAS: std::sync::Mutex<Option<EngineExtras>> = std::sync::Mutex::new(None);

fn parse_do_start_pipe_codes(raw: &str) -> Vec<String> {
    raw.split('|')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty() && s != "*")
        .collect()
}

fn build_do_start_grace(
    do_start_min: i64,
    assignments: Option<&str>,
    groups: Option<&str>,
) -> DoStartGrace1001 {
    DoStartGrace1001 {
        do_start_min,
        assignments: assignments
            .map(parse_do_start_pipe_codes)
            .unwrap_or_default(),
        groups: groups.map(parse_do_start_pipe_codes).unwrap_or_default(),
    }
}

const SECONDS_PER_DAY: i64 = 86_400;

/// Immutable per-pairing facts needed by the per-crew kernels.
struct PairingRec {
    start_utc: i64,
    /// Duty end (`getEndTimeUtcAct`); same as legacy `pairing_end_utc`.
    end_duty_utc: i64,
    /// Rest end (`getEndTimeIncludingRestUtcAct`); defaults to duty end when unset.
    end_including_rest_utc: i64,
    blk_min: i64,
    /// Duty-period minutes (Σ PairingDuty.actualDutyMinutes); current 8002 DP.
    dp_min: i64,
    /// UTC calendar day ordinal (days since 1970-01-01) of the pairing start.
    day_ord: i64,
    /// True when assignment_group == "FLY" (the 8056 A/B side in live data).
    is_fly: bool,
    /// Assignment group code (e.g. "FLY", "RES", "SBY", "SIM"); fed so grouped 8056
    /// param rows (e.g. `Group A=FLY|RES`) can match non-FLY work pairings too.
    group: String,
    /// Source assignment code (e.g. "FLT", "SIM", "VAC").
    assignment: String,
    /// Prelabelled pairing attributes, pipe-separated when multiple values exist.
    attributes: String,
    label: String,
    /// Pairing base (rule 8004); empty/"*" → skipped.
    base: String,
    /// Departure station of the pairing's first duty / arrival station of its last duty
    /// (rule 8004 location-continuity exemption chain-walk).
    start_station: String,
    end_station: String,
    /// Assignment TYPE for isOverlap (FLY/GRD/LVE/…); drives work-like vs rest-like.
    assignment_type: String,
    qualifier: String,
    airport: String,
    role: String,
    is_requested: bool,
    location: String,
    /// Flight indices for rule 8030 (physical flights on this pairing).
    flight_idxs: Vec<usize>,
}

/// A rolling-window block-hour band: cap `limit_min` minutes over any
/// `window_days` consecutive calendar days (rule 8002 row).
struct BlockBand {
    window_days: i64,
    limit_min: f64,
}

/// A pre-assigned non-flying ground duty (RosterGround), e.g. VAC/DO/ILL, fed per
/// crew so rule 8056 grouped param rows (`Assignment A=FLY → Assignment B=VAC`) can
/// space candidate flying against it. The solver itself never blocks these (it only
/// loads source=PA), so the rule engine enforces unavailability.
struct GroundDuty {
    start_utc: i64,
    end_utc: i64,
    assignment: String,
    group: String,
    /// true = leave/off type (DO, VAC, GDO, ILL, …); excluded from rule-7501 work list.
    /// false = working ground duty (SBY/RES/SIM/OFC/…); counted as duty for SDFD.
    is_rest: bool,
    /// Station the ground duty happens at (rule 8004 location-continuity exemption
    /// chain-walk); empty when unknown.
    station: String,
}

fn rule8056_value(row: &HashMap<String, String>, name: &str) -> String {
    row.iter()
        .find(|(key, _)| key.eq_ignore_ascii_case(name))
        .map(|(_, value)| value.trim().to_string())
        .unwrap_or_default()
}

fn rule8056_filters(row: &HashMap<String, String>, name: &str) -> Vec<String> {
    let value = rule8056_value(row, name);
    if value.is_empty() || value == "*" {
        return vec!["*".to_string()];
    }
    let values = value
        .split('|')
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(ToString::to_string)
        .collect::<Vec<_>>();
    if values.is_empty() {
        vec!["*".to_string()]
    } else {
        values
    }
}

fn rule8056_optional_bool(row: &HashMap<String, String>, name: &str) -> Option<bool> {
    match rule8056_value(row, name).to_uppercase().as_str() {
        "Y" | "YES" | "TRUE" | "1" => Some(true),
        "N" | "NO" | "FALSE" | "0" => Some(false),
        _ => None,
    }
}

fn rule_row_value(row: &HashMap<String, String>, name: &str) -> String {
    row.iter()
        .find(|(key, _)| key.eq_ignore_ascii_case(name))
        .map(|(_, value)| value.trim().to_string())
        .unwrap_or_default()
}

fn split_pipe_or_star(raw: &str) -> Vec<String> {
    let raw = raw.trim();
    if raw.is_empty() || raw == "*" {
        return vec!["*".to_string()];
    }
    raw.split('|')
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect()
}

fn parse_rule8071_row(row: HashMap<String, String>) -> PyResult<Rule8071> {
    let cells = [
        rule_row_value(&row, "Bases"),
        rule_row_value(&row, "Ranks"),
        rule_row_value(&row, "Fleets"),
        rule_row_value(&row, "Crew Teams"),
        rule_row_value(&row, "Labels"),
        rule_row_value(&row, "Attributes"),
        rule_row_value(&row, "Override Duty Attributes"),
        rule_row_value(&row, "Assignment Groups"),
        rule_row_value(&row, "Assignments"),
        rule_row_value(&row, "Qualifiers"),
        rule_row_value(&row, "Flights"),
        rule_row_value(&row, "Destinations"),
        rule_row_value(&row, "Countries"),
        rule_row_value(&row, "Positions"),
        rule_row_value(&row, "Period"),
        rule_row_value(&row, "Unit"),
        rule_row_value(&row, "Max Times"),
        rule_row_value(&row, "Min Times"),
        rule_row_value(&row, "Check Mode"),
    ];
    let refs: Vec<&str> = cells.iter().map(String::as_str).collect();
    Rule8071::from_cells(&refs).map_err(|err| PyValueError::new_err(format!("8071: {err}")))
}

fn parse_i64_field(row: &HashMap<String, String>, name: &str) -> PyResult<i64> {
    let raw = rule_row_value(row, name);
    if raw.is_empty() {
        return Ok(0);
    }
    raw.parse::<i64>()
        .map_err(|_| PyValueError::new_err(format!("{name} must be an integer, got {raw:?}")))
}

fn parse_rank_counts(raw: &str) -> Vec<(String, i32)> {
    raw.split('|')
        .filter_map(|part| {
            let (rank, count) = part.split_once(':')?;
            let rank = rank.trim();
            if rank.is_empty() {
                return None;
            }
            Some((rank.to_string(), count.trim().parse::<i32>().unwrap_or(0)))
        })
        .collect()
}

fn parse_rule8072_row(row: HashMap<String, String>) -> PyResult<Rule8072> {
    let cells = [
        rule_row_value(&row, "Flight Fleets"),
        rule_row_value(&row, "Flight Assignment Groups"),
        rule_row_value(&row, "Crew Teams"),
        rule_row_value(&row, "Crew Nationality"),
        rule_row_value(&row, "Destination Countries"),
        rule_row_value(&row, "Acting Ranks"),
        rule_row_value(&row, "Flight Compositions"),
        rule_row_value(&row, "Required Qualifications"),
        rule_row_value(&row, "Attributes"),
        rule_row_value(&row, "Dep"),
        rule_row_value(&row, "Arr"),
        rule_row_value(&row, "Min Limits"),
        rule_row_value(&row, "Max Limits"),
    ];
    let refs: Vec<&str> = cells.iter().map(String::as_str).collect();
    Rule8072::from_cells(&refs).map_err(|err| PyValueError::new_err(format!("8072: {err}")))
}

fn parse_rule7510_row(row: HashMap<String, String>) -> PyResult<Rule7510Param> {
    let cells = [
        rule_row_value(&row, "Bases"),
        rule_row_value(&row, "Ranks"),
        rule_row_value(&row, "Fleets"),
        rule_row_value(&row, "Crew Teams"),
        rule_row_value(&row, "Attributes"),
        rule_row_value(&row, "Assignments"),
        rule_row_value(&row, "Assignment Groups"),
        rule_row_value(&row, "Initial Sectors"),
        rule_row_value(&row, "Min Limits"),
        rule_row_value(&row, "Max Limits"),
    ];
    let refs: Vec<&str> = cells.iter().map(String::as_str).collect();
    let row_index = row
        .get("row_index")
        .or_else(|| row.get("_row_index"))
        .map(String::as_str)
        .unwrap_or("0")
        .parse::<usize>()
        .map_err(|_| PyValueError::new_err("7510 row_index must be a non-negative integer"))?;
    Rule7510Param::from_cells(&refs)
        .map(|param| param.with_row_index(row_index))
        .map_err(|err| PyValueError::new_err(format!("7510: {err}")))
}

fn parse_8072_segment(row: HashMap<String, String>) -> PyResult<(usize, Rule8072Segment)> {
    let pairing_idx = parse_i64_field(&row, "pairing_idx")?;
    if pairing_idx < 0 {
        return Err(PyValueError::new_err(format!(
            "pairing_idx must be non-negative, got {pairing_idx}"
        )));
    }
    let segment = Rule8072Segment {
        segment_id: parse_i64_field(&row, "segment_id")?,
        pairing_id: pairing_idx,
        duty_seq: parse_i64_field(&row, "duty_seq")?,
        seg_seq: parse_i64_field(&row, "seg_seq")?,
        flight_id: parse_i64_field(&row, "flight_id")?,
        flight_number: rule_row_value(&row, "flight_number"),
        flight_date: rule_row_value(&row, "flight_date"),
        start_utc: parse_i64_field(&row, "start_utc")?,
        end_utc: parse_i64_field(&row, "end_utc")?,
        fleet: rule_row_value(&row, "fleet"),
        dep: rule_row_value(&row, "dep"),
        arr: rule_row_value(&row, "arr"),
        assignment: rule_row_value(&row, "assignment"),
        assignment_group: rule_row_value(&row, "assignment_group"),
        composition: rule_row_value(&row, "composition"),
        attributes: split_pipe_or_star(&rule_row_value(&row, "attributes")),
        destination_country: rule_row_value(&row, "destination_country"),
        planned_by_rank: parse_rank_counts(&rule_row_value(&row, "planned_by_rank")),
        filled_by_rank: parse_rank_counts(&rule_row_value(&row, "filled_by_rank")),
        crews: Vec::new(),
    };
    Ok((pairing_idx as usize, segment))
}

fn active_7510_qual_values(
    quals: &[Vec<(String, i64, i64)>],
    crew_idx: usize,
    day_ord: i64,
) -> Vec<String> {
    let values = quals
        .get(crew_idx)
        .map(|rows| {
            rows.iter()
                .filter(|(_, eff, exp)| *eff <= day_ord && (*exp < 0 || day_ord <= *exp))
                .map(|(value, _, _)| value.clone())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if values.is_empty() {
        vec!["*".to_string()]
    } else {
        values
    }
}

fn active_7510_team_values(
    team_quals: &[Vec<(String, i64, i64)>],
    fallback_teams: &[Vec<String>],
    crew_idx: usize,
    start_utc: i64,
    end_utc: i64,
) -> Vec<String> {
    if let Some(rows) = team_quals.get(crew_idx) {
        let values = rows
            .iter()
            .filter(|(_, effective, expiry)| {
                *effective < end_utc && (*expiry < 0 || *expiry > start_utc)
            })
            .map(|(value, _, _)| value.clone())
            .collect::<Vec<_>>();
        return if values.is_empty() {
            vec!["*".to_string()]
        } else {
            values
        };
    }
    let values = fallback_teams.get(crew_idx).cloned().unwrap_or_default();
    if values.is_empty() {
        vec!["*".to_string()]
    } else {
        values
    }
}

fn build_7510_seed_rows(
    cof_flight_crew: &[(i64, i64)],
    cof_flight_7510_rows: &[HashMap<String, String>],
    segments: &[Rule8072Segment],
    crew_ids: &[String],
    crew_team_quals: &[Vec<(String, i64, i64)>],
    crew_teams: &[Vec<String>],
    crew_base_quals: &[Vec<(String, i64, i64)>],
    crew_rank_quals: &[Vec<(String, i64, i64)>],
    crew_fleet_quals: &[Vec<(String, i64, i64)>],
    crew_count: usize,
) -> Vec<Vec<Rule7510CrewFlight>> {
    let mut rows = vec![Vec::new(); crew_count];
    let mut seen: BTreeSet<(usize, i64)> = BTreeSet::new();
    let mut segment_by_flight: HashMap<i64, &Rule8072Segment> = HashMap::new();
    for segment in segments {
        segment_by_flight
            .entry(segment.flight_id)
            .or_insert(segment);
    }
    for &(flight_id, crew_idx_i64) in cof_flight_crew {
        let Ok(crew_idx) = usize::try_from(crew_idx_i64) else {
            continue;
        };
        if crew_idx >= crew_count {
            continue;
        }
        if let Some(segment) = segment_by_flight.get(&flight_id).copied() {
            let day_ord = segment.start_utc.div_euclid(SECONDS_PER_DAY);
            if !seen.insert((crew_idx, segment.flight_id)) {
                continue;
            }
            rows[crew_idx].push(Rule7510CrewFlight {
                crew_id: crew_ids
                    .get(crew_idx)
                    .cloned()
                    .unwrap_or_else(|| crew_idx.to_string()),
                flight_id: segment.flight_id,
                pairing_id: segment.pairing_id,
                duty_seq: segment.duty_seq,
                seg_seq: segment.seg_seq,
                start_utc: segment.start_utc,
                end_utc: segment.end_utc,
                bases: active_7510_qual_values(crew_base_quals, crew_idx, day_ord),
                ranks: active_7510_qual_values(crew_rank_quals, crew_idx, day_ord),
                fleets: active_7510_qual_values(crew_fleet_quals, crew_idx, day_ord),
                teams: active_7510_team_values(
                    crew_team_quals,
                    crew_teams,
                    crew_idx,
                    segment.start_utc,
                    segment.end_utc,
                ),
                attributes: if segment.attributes.is_empty() {
                    vec!["*".to_string()]
                } else {
                    segment.attributes.clone()
                },
                assignment: segment.assignment.clone(),
                assignment_group: segment.assignment_group.clone(),
            });
        }
    }
    for raw in cof_flight_7510_rows {
        let Ok(crew_idx) = rule_row_value(raw, "crew_idx").parse::<usize>() else {
            continue;
        };
        if crew_idx >= crew_count {
            continue;
        }
        let Ok(flight_id) = rule_row_value(raw, "flight_id").parse::<i64>() else {
            continue;
        };
        let Ok(start_utc) = rule_row_value(raw, "start_utc").parse::<i64>() else {
            continue;
        };
        let Ok(end_utc) = rule_row_value(raw, "end_utc").parse::<i64>() else {
            continue;
        };
        if flight_id <= 0 || end_utc < start_utc || !seen.insert((crew_idx, flight_id)) {
            continue;
        }
        let day_ord = start_utc.div_euclid(SECONDS_PER_DAY);
        let crew_id = {
            let value = rule_row_value(raw, "crew_id");
            if value.is_empty() {
                crew_ids
                    .get(crew_idx)
                    .cloned()
                    .unwrap_or_else(|| crew_idx.to_string())
            } else {
                value
            }
        };
        rows[crew_idx].push(Rule7510CrewFlight {
            crew_id,
            flight_id,
            pairing_id: rule_row_value(raw, "pairing_id").parse().unwrap_or(0),
            duty_seq: rule_row_value(raw, "duty_seq").parse().unwrap_or(0),
            seg_seq: rule_row_value(raw, "seg_seq").parse().unwrap_or(0),
            start_utc,
            end_utc,
            bases: active_7510_qual_values(crew_base_quals, crew_idx, day_ord),
            ranks: active_7510_qual_values(crew_rank_quals, crew_idx, day_ord),
            fleets: active_7510_qual_values(crew_fleet_quals, crew_idx, day_ord),
            teams: active_7510_team_values(
                crew_team_quals,
                crew_teams,
                crew_idx,
                start_utc,
                end_utc,
            ),
            attributes: split_pipe_or_star(&rule_row_value(raw, "attributes")),
            assignment: rule_row_value(raw, "assignment"),
            assignment_group: rule_row_value(raw, "assignment_group"),
        });
    }
    rows
}

fn parse_rule8056_row(row: HashMap<String, String>) -> PyResult<Rule8056Rule> {
    let space_raw = rule8056_value(&row, "Space");
    let space = space_raw.parse::<f64>().map_err(|_| {
        PyValueError::new_err(format!("8056 Space must be numeric, got {space_raw:?}"))
    })?;
    if space < 0.0 {
        return Err(PyValueError::new_err("8056 Space must be non-negative"));
    }
    let unit = rule8056_value(&row, "Unit").to_uppercase();
    if !matches!(unit.as_str(), "RH" | "CD" | "LN") {
        return Err(PyValueError::new_err(format!(
            "8056 Unit must be RH, CD, or LN, got {unit:?}"
        )));
    }
    Ok(Rule8056Rule {
        bases: rule8056_filters(&row, "Bases"),
        ranks: rule8056_filters(&row, "Ranks"),
        fleets: rule8056_filters(&row, "Fleets"),
        teams: rule8056_filters(&row, "Crew Teams"),
        attribute_a: rule8056_filters(&row, "Attribute A"),
        label_a: rule8056_filters(&row, "Label A"),
        assignment_group_a: rule8056_filters(&row, "Assignment Group A"),
        assignment_a: rule8056_filters(&row, "Assignment A"),
        qualifier_a: rule8056_filters(&row, "Qualifier A"),
        airport_a: rule8056_filters(&row, "Airport A"),
        roles_a: rule8056_filters(&row, "Roles A"),
        is_requested_a: rule8056_optional_bool(&row, "Is Requested A"),
        attribute_b: rule8056_filters(&row, "Attribute B"),
        label_b: rule8056_filters(&row, "Label B"),
        assignment_group_b: rule8056_filters(&row, "Assignment Group B"),
        assignment_b: rule8056_filters(&row, "Assignment B"),
        qualifier_b: rule8056_filters(&row, "Qualifier B"),
        airport_b: rule8056_filters(&row, "Airport B"),
        roles_b: rule8056_filters(&row, "Roles B"),
        is_requested_b: rule8056_optional_bool(&row, "Is Requested B"),
        space,
        unit,
        directional: rule8056_optional_bool(&row, "Directional").unwrap_or(false),
        location_equal_base_a: rule8056_optional_bool(&row, "Is Location Equal Base A"),
        location_equal_base_b: rule8056_optional_bool(&row, "Is Location Equal Base B"),
        utilize_post_duty_rest: rule8056_optional_bool(&row, "Utilize Post Duty Rest")
            .unwrap_or(false),
    })
}

/// One workset-103 rule-8056 param row: A-side / B-side group + assignment filters
/// and the required spacing in hours. Wildcards ("*"/empty) match any value.
struct SpacingRule {
    group_a: Vec<String>,
    group_b: Vec<String>,
    assign_a: Vec<String>,
    assign_b: Vec<String>,
    space_hours: f64,
}

/// One workset rule-1001 param row: chronological Before / After filters + Rest Before.
/// Matching rows are allowances. Wildcards (empty / "*") are preserved for the Rust kernel.
struct OverlapRuleParam {
    group_before: Vec<String>,
    assignment_before: Vec<String>,
    rest_before: bool,
    type_before: Vec<String>,
    group_after: Vec<String>,
    assignment_after: Vec<String>,
    type_after: Vec<String>,
}

struct DaysOffRule {
    bases: Vec<String>,
    ranks: Vec<String>,
    fleets: Vec<String>,
    teams: Vec<String>,
    row: DaysOffRow,
}

#[allow(clippy::type_complexity)]
type DaysOffRuleInput = (
    (Vec<String>, Vec<String>, Vec<String>, Vec<String>),
    (
        Vec<String>,
        i64,
        String,
        String,
        (i64, i64),
        bool,
        bool,
        bool,
        Vec<String>,
        (i64, i64),
    ),
);

#[allow(clippy::type_complexity)]
type DaysOffRuleInput7507 = (
    (Vec<String>, Vec<String>, Vec<String>, Vec<String>),
    (
        Vec<String>,
        i64,
        String,
        String,
        (i64, i64),
        bool,
        bool,
        bool,
        Vec<String>,
        (i64, i64),
        ((i64, i64), Vec<String>),
        ((i64, i64), Vec<String>),
    ),
);

#[allow(clippy::type_complexity)]
type SdfdRuleInput = (
    usize,
    (Vec<String>, Vec<String>, Vec<String>, Vec<String>),
    (i64, String, i64, i64),
);

#[allow(clippy::type_complexity)]
type CalendarSdfdRuleInput = (
    usize,
    (Vec<String>, Vec<String>, Vec<String>, Vec<String>),
    (i64, String, bool, bool, i64, i64, bool),
);

/// Normalized rule-7504 row received from the PBS Python adapter.
struct WoclSpacingRule {
    prev_assignment_groups: Vec<String>,
    next_assignment_groups: Vec<String>,
    prev_assignments: Vec<String>,
    next_assignments: Vec<String>,
    prev_attributes: Vec<String>,
    next_attributes: Vec<String>,
    apply_prelabelled_attributes: bool,
    utilize_post_rest: bool,
    bases: Vec<String>,
    ranks: Vec<String>,
    fleets: Vec<String>,
    teams: Vec<String>,
    level: String,
    min_period: i64,
    unit: String,
    wocl_window: Option<(i64, i64)>,
}

/// Normalized rule-7503 row received from the PBS Python adapter.
struct WoclRule {
    bases: Vec<String>,
    ranks: Vec<String>,
    fleets: Vec<String>,
    teams: Vec<String>,
    wocl_window: (i64, i64),
    max_consecutive: i64,
}

/// Normalized rule-7506 row received from the PBS Python adapter.
struct OneCheckinRule {
    bases: Vec<String>,
    ranks: Vec<String>,
    fleets: Vec<String>,
    teams: Vec<String>,
    assignments: Vec<String>,
}

#[allow(clippy::type_complexity)]
type WoclSpacingRuleInput = (
    (
        Vec<String>,
        Vec<String>,
        Vec<String>,
        Vec<String>,
        Vec<String>,
        Vec<String>,
    ),
    (bool, bool),
    (Vec<String>, Vec<String>, Vec<String>, Vec<String>),
    (String, i64, String),
    (Option<(i64, i64)>, Option<i64>),
);

#[allow(clippy::type_complexity)]
type WoclRuleInput = (
    (Vec<String>, Vec<String>, Vec<String>, Vec<String>),
    (i64, i64, i64),
);

#[allow(clippy::type_complexity)]
type OneCheckinRuleInput = (
    (Vec<String>, Vec<String>, Vec<String>, Vec<String>),
    Vec<String>,
);

/// One duty on a crew line (PairingDuty or ground), with rule-7500 acclimatisation state
/// written in place — mirrors C++ `Duty::refTimeZone` / `dutyEndRefTimeZone`.
struct CrewLineDuty {
    start_utc: i64,
    end_utc: i64,
    first_flight_departure_utc: i64,
    last_flight_arrival_utc: i64,
    dep_tz_min: i64,
    arr_tz_min: i64,
    pairing_idx: Option<usize>,
    /// 0-based duty index within the pairing (`PairingDuty.dutySeq` order).
    duty_idx: Option<usize>,
    is_ground: bool,
    is_fly: bool,
    is_rest_ground: bool,
    is_pre_assigned: bool,
    /// Rule 7500 — acclimatisation ref TZ at duty start (minutes east of UTC).
    ref_tz_min: i64,
    /// Rule 7500 — ref TZ at duty end / rest start.
    duty_end_ref_tz_min: i64,
}

impl CrewLineDuty {
    /// WOCL / duty-start offset: 7500 ref when computed, else caller fallback.
    fn acc_offset_at_start(&self, fallback: i64) -> i64 {
        if self.is_acclimatised() {
            self.ref_tz_min
        } else {
            fallback
        }
    }

    fn is_acclimatised(&self) -> bool {
        self.ref_tz_min != i64::MIN
    }
}

/// In-process rule engine handle held by the Python `RustRuleChecker`.
#[pyclass]
struct Engine {
    pairings: Vec<PairingRec>,
    crew_fixed: Vec<Vec<usize>>,
    /// Rule 8002006 BLOCK-hour bands (window_days, limit_minutes). Empty → disabled.
    block_bands: Vec<BlockBand>,
    /// Rule 8056 minimum spacing in clock hours (plain consecutive-FLY port). None → off.
    spacing_hours: Option<f64>,
    /// Rule 8056 grouped param rows from workset 103 (FLY→VAC, FLY→FLY|SBY|SIM|GRD, …).
    /// Non-empty → grouped 8056 runs over FLY pairings + pre-assigned ground duties, so
    /// a candidate flying that overlaps / is too close to a pre-assigned VAC fires.
    spacing_rules: Vec<SpacingRule>,
    spacing_rule_rows: Vec<Rule8056Rule>,
    crew_teams: Vec<Vec<String>>,
    /// Rule 1001 Assignment Overlap allowance rows. Empty means fail-closed.
    overlap_rules: Vec<OverlapRuleParam>,
    /// Per-crew pre-assigned ground duties (VAC/DO/ILL …), parallel to `crew_fixed`.
    crew_ground: Vec<Vec<GroundDuty>>,
    /// Rule 7505 MIN # GDOs: the roster period (inclusive UTC day ordinals) and the
    /// minimum guaranteed days off it must contain. All-Some → 7505 enabled.
    rp_start_ord: Option<i64>,
    rp_end_ord: Option<i64>,
    min_days_off: Option<i64>,
    /// Rule 7505 structured rows. Empty -> use the legacy scalar fallback.
    days_off_rules: Vec<DaysOffRule>,
    /// Rule 7507 structured rows (7505 + fly/reserve day filters).
    days_off_rules_7507: Vec<DaysOffRule>,

    // --- rest / WOCL infrastructure (rules 7501, 7503, 7504) ---
    /// Per-crew base-TZ offset (minutes east of UTC; e.g. YEG June MDT = -360).
    crew_offset_min: Vec<i64>,
    /// Local-night definition (rule 2014): (start_min, end_min, min_rest_secs).
    local_night: Option<LocalNightDef>,
    /// Rule 2015 DO Start + 1001 grace filters.
    do_start_grace: DoStartGrace1001,
    /// Rule 7501 SDFD rows (period_hours, min_limits) + duty-end buffer + checked window.
    sdfd_rows: Vec<(i64, i64)>,
    /// Rule 7501 full parameter rows with Bases/Ranks/Fleets/Crew Teams scope.
    sdfd_rule_rows: Vec<Rule7501Row>,
    sdfd_buffer_secs: i64,
    /// Rule 7508 calendar-day SDFD rows with the same table shape as 7501.
    calendar_sdfd_rule_rows: Vec<Rule7508Row>,
    checked_window: Option<(i64, i64)>,
    /// Rule 7503/7504 WOCL band (wocl_start_min, wocl_end_min).
    wocl_window: Option<(i64, i64)>,
    /// Rule 7503 max consecutive WOCL duties.
    max_consecutive_wocl: Option<i64>,
    /// Rule 7503 full parameter rows. Empty -> use scalar fallback.
    wocl_rules: Vec<WoclRule>,
    /// Rule 7504 minimum spacing between WOCL flight duties (clock hours).
    wocl_spacing_hours: Option<i64>,
    /// Rule 7504 full parameter rows. Empty -> use wocl_spacing_hours fallback.
    wocl_spacing_rules: Vec<WoclSpacingRule>,
    /// Rule 7500 DailyAdjustment: stay duration (minutes) + TZ adjust step (minutes).
    acc_stay_per_min: Option<i64>,
    acc_adjust_min: Option<i64>,
    /// Rule 7500 AcclimatizationStayPeriod table1 rows.
    /// TODO: table1 is transported for parity but not consumed by the checker yet.
    _acc_stay_period_rows: Vec<(i64, i64, i64, i64)>,
    /// Per-pairing departure/arrival TZ fallback when PairingDuty rows are absent.
    pairing_dep_tz_min: Vec<i64>,
    pairing_arr_tz_min: Vec<i64>,
    /// Flat PairingDuty store: `pairing_duty_offsets[pi]..pairing_duty_offsets[pi+1]`.
    pairing_duty_offsets: Vec<usize>,
    pairing_duty_start_utc: Vec<i64>,
    pairing_duty_end_utc: Vec<i64>,
    pairing_duty_first_flight_departure_utc: Vec<i64>,
    pairing_duty_last_flight_arrival_utc: Vec<i64>,
    pairing_duty_dep_tz_min: Vec<i64>,
    pairing_duty_arr_tz_min: Vec<i64>,
    /// Per-duty DP minutes (same indexing as pairing_duty_start_utc).
    /// Used by current 8002 DP to attribute credit to the duty's start local-day.
    pairing_duty_dp_min: Vec<i64>,
    /// Per-duty actual block minutes (same indexing as pairing_duty_start_utc).
    /// Feeds 8002 CH formula: max(240, blk, dp/2).
    pairing_duty_blk_min: Vec<i64>,
    /// Per-duty DP weight (same indexing as pairing_duty_start_utc).
    pairing_duty_dp_pct: Vec<f64>,
    /// Flat flight-segment store per pairing: `pairing_seg_offsets[pi]..pairing_seg_offsets[pi+1]`.
    /// Used by 8002 BLK: each segment's block is split at crew-base-local midnight (SPAN).
    pairing_seg_offsets: Vec<usize>,
    pairing_seg_std_utc: Vec<i64>,
    pairing_seg_sta_utc: Vec<i64>,
    pairing_seg_blk_min: Vec<i64>,
    /// Per-crew, per-segment base-TZ offset (minutes east of UTC) at segment STD, DST-aware.
    /// `pairing_seg_crew_offset_min[crew_idx][si]` parallels `pairing_seg_std_utc`.
    pairing_seg_crew_offset_min: Vec<Vec<i64>>,
    /// Per-crew, per-segment base-TZ offset at segment STA (may differ from STD under DST).
    pairing_seg_crew_sta_offset_min: Vec<Vec<i64>>,
    /// Per-crew, per-duty base-TZ offset at duty start; parallels `pairing_duty_start_utc`.
    pairing_duty_crew_offset_min: Vec<Vec<i64>>,
    /// Per ground duty TZ at duty start (crew-base fallback when empty).
    crew_ground_tz_min: Vec<Vec<i64>>,
    /// Per ground duty assignment.type (L/O/W/T/S) for rule 1001; empty falls back to group/code.
    crew_ground_type: Vec<Vec<String>>,
    /// Rule 7506 ONE CHECKIN PER DAY: the "checked" assignment groups (e.g. ["FLY"]).
    /// Some → 7506 enabled (needs crew_offset_min too).
    one_checkin_groups: Option<Vec<String>>,
    /// Rule 7506 full parameter rows. Empty -> use scalar fallback.
    one_checkin_rules: Vec<OneCheckinRule>,
    /// Rule 8004 BASE competency: per-crew base-validity windows (base, eff_ord, exp_ord)
    /// + grace days. Non-empty quals + Some(grace) → 8004 enabled.
    crew_base_quals: Vec<Vec<(String, i64, i64)>>,
    base_grace_days: Option<i64>,

    /// Per-crew daily BLK baseline from crew_manday_fd_daily, keyed by calendar-day ordinal
    /// (days since 1970-01-01) → block minutes. Covers 365-day history so rule-8002 rolling
    /// windows have the correct cumulative totals beyond the RO planning window.
    /// Indexed by crew_idx, parallel to crew_fixed.
    crew_daily_baseline: Vec<BTreeMap<i64, f64>>,

    // --- rule 8002 full port (cum_rules path) ---
    /// Full 8002 param rows (all 15 C++ columns). Non-empty supersedes the
    /// legacy `block_bands` and switches 8002 to the faithful
    /// window-enumeration path with per-crew qualification matching.
    cum_rules: Vec<CumRule8002>,
    /// Per-crew effective-dated rank / fleet windows `(value, eff_ord, exp_ord)`;
    /// `exp_ord < 0` = open-ended. Same shape as `crew_base_quals`.
    crew_rank_quals: Vec<Vec<(String, i64, i64)>>,
    crew_fleet_quals: Vec<Vec<(String, i64, i64)>>,
    /// Per-crew multi-metric manday baseline (day_ord → DayMetrics), column
    /// order `MANDAY_METRICS`. Supersedes `crew_daily_baseline` for cum_rules.
    crew_daily_metrics: Vec<BTreeMap<i64, DayMetrics>>,
    /// Pre-parsed 8002 qualification windows (local seconds). Same conversion
    /// previously done inside `check_8002_full` on every candidate line.
    crew_8002_base_quals: Vec<Vec<QualEntry>>,
    crew_8002_rank_quals: Vec<Vec<QualEntry>>,
    crew_8002_fleet_quals: Vec<Vec<QualEntry>>,
    crew_8002_team_quals: Vec<Vec<QualEntry>>,
    /// Roster periods `(rp_start_utc, rp_end_utc)` for RP-unit rules.
    roster_periods: Vec<(i64, i64)>,
    /// Raw scenario window (start_utc, end_utc). The 8002 checked window is
    /// `[start, end + 24h]` (rule8002.cpp:87-97); falls back to `checked_window`.
    scenario_window: Option<(i64, i64)>,
    /// Week-start token for CW/RW windows ("MON".."SAT"; else Sunday).
    weekday_start_from: String,
    /// Per-duty credited minutes (PairingDuty.creditedMinutes), parallel to
    /// `pairing_duty_start_utc`. Kept in the Engine API but unused by 8002 CH
    /// (formula overlay uses `pairing_duty_blk_min` / `pairing_duty_dp_min`).
    #[allow(dead_code)]
    pairing_duty_credit_min: Vec<i64>,
    /// Rule 8071 roster-property parameter rows.
    roster_property_rules: Vec<Rule8071>,
    /// Rule 8072 minimum/maximum qualified crew rows and incremental complement state.
    min_qual_rules: Vec<Rule8072>,
    segments_8072: Vec<Rule8072Segment>,
    pairing_to_8072_segments: Vec<Vec<usize>>,
    pairing_country_sets: BTreeMap<i64, BTreeSet<String>>,
    crew_qualification_sets: Vec<Vec<String>>,
    crew_nationality_8072: Vec<String>,
    /// Rule 7305 consecutive duty times/days rows and position qualifications.
    rule7305_rules: Vec<Rule7305>,
    crew_position_quals: Vec<Vec<(String, i64, i64)>>,
    rule7305_assignment_groups: Vec<(String, String)>,
    crew_on_segment_8072: Vec<Vec<usize>>,
    /// Degraded-mode notes surfaced via the `warnings()` getter.
    engine_warnings: Vec<String>,

    // --- rule 8030 PILOT AGE (cross-crew complement, flt_id grain) ---
    /// Per-crew division (e.g. "P") and birth date (days-since-epoch).
    crew_division: Vec<String>,
    crew_birth_ord: Vec<i64>,
    /// Stable flight ids parallel to `crew_on_flight_8030` / `flight_start_ord_8030`.
    flight_ids_8030: Vec<i64>,
    flight_start_ord_8030: Vec<i64>,
    /// Mutable flight → crew indices on it (fixed/PA at construct; commit/rollback during solve).
    crew_on_flight_8030: Vec<Vec<usize>>,
    /// 8030 params: division, age limit (AGE DEFINE), max over-age per flight.
    age_division: Option<String>,
    age_limit: i64,
    age_max_number: i64,
    /// Rule 7509 AVOID CO-PAIRING params and mutable physical-flight complement.
    /// Business crew IDs parallel to `crew_fixed`; empty means dense-index fallback
    /// for direct callers that pre-normalize 7509 rows.
    crew_ids: Vec<String>,
    avoid_co_pairing_rules: Vec<Rule7509Param>,
    crew_on_flight_7509: Vec<Vec<Rule7509Member>>,
    /// Rule 7510 Green-on-Green parameter rows and mutable per-crew pairing state.
    rule7510_params: Vec<Rule7510Param>,
    crew_team_quals: Vec<Vec<(String, i64, i64)>>,
    crew_7510_pairings: Vec<Vec<usize>>,
    crew_7510_seed_rows: Vec<Vec<Rule7510CrewFlight>>,
    /// RO optimizer vs Live Gantt editor (PA-ignore vs full legality).
    application: Application,
    /// Function codes enabled for check_line (e.g. "8056", "7501"). Empty = all wired checks run.
    enabled_functions: std::collections::HashSet<String>,
}

fn parse_application(s: &str) -> PyResult<Application> {
    match s.to_lowercase().as_str() {
        "editor" | "live" => Ok(Application::Editor),
        "optimizer" | "ro" => Ok(Application::Optimizer),
        other => Err(PyValueError::new_err(format!(
            "application must be 'optimizer' or 'editor', got {other:?}"
        ))),
    }
}

impl Engine {
    #[inline]
    fn is_enabled(&self, code: &str) -> bool {
        self.enabled_functions.is_empty() || self.enabled_functions.contains(code)
    }

    fn pairing_assignment_type(group: &str, is_fly: bool) -> String {
        let g = group.to_uppercase();
        if g.is_empty() {
            if is_fly {
                "FLY".to_string()
            } else {
                "GRD".to_string()
            }
        } else {
            g
        }
    }

    fn ground_assignment_type(assignment: &str, group: &str) -> String {
        let g = group.trim();
        if !g.is_empty() && g != "*" {
            return g.to_uppercase();
        }
        assignment.to_uppercase()
    }

    fn crew_offset(&self, crew_idx: usize) -> i64 {
        self.crew_offset_min.get(crew_idx).copied().unwrap_or(0)
    }

    /// UTC span covering this crew's Live roster line for Editor 8002.
    ///
    /// Includes manday metric days, fixed + candidate pairings, and ground
    /// duties. Returns `None` when the line is empty (fall back to scenario).
    fn roster_line_window_utc(
        &self,
        crew_idx: usize,
        fixed: &[usize],
        candidate: &[usize],
    ) -> Option<(i64, i64)> {
        let mut min_u = i64::MAX;
        let mut max_u = i64::MIN;
        let mut expand = |a: i64, b: i64| {
            if a < min_u {
                min_u = a;
            }
            if b > max_u {
                max_u = b;
            }
        };
        for &pi in fixed.iter().chain(candidate.iter()) {
            if let Some(p) = self.pairings.get(pi) {
                expand(p.start_utc, p.end_duty_utc.max(p.end_including_rest_utc));
            }
        }
        if let Some(grounds) = self.crew_ground.get(crew_idx) {
            for g in grounds {
                expand(g.start_utc, g.end_utc);
            }
        }
        if let Some(metrics) = self.crew_daily_metrics.get(crew_idx) {
            for &day_ord in metrics.keys() {
                let day_start = day_ord.saturating_mul(SECONDS_PER_DAY);
                expand(day_start, day_start + SECONDS_PER_DAY - 1);
            }
        } else if let Some(baseline) = self.crew_daily_baseline.get(crew_idx) {
            for &day_ord in baseline.keys() {
                let day_start = day_ord.saturating_mul(SECONDS_PER_DAY);
                expand(day_start, day_start + SECONDS_PER_DAY - 1);
            }
        }
        if min_u == i64::MAX || max_u < min_u {
            return None;
        }
        Some((min_u, max_u))
    }

    fn pairing_dep_tz(&self, pi: usize, crew_idx: usize) -> i64 {
        self.pairing_dep_tz_min
            .get(pi)
            .copied()
            .unwrap_or_else(|| self.crew_offset(crew_idx))
    }

    fn pairing_arr_tz(&self, pi: usize, crew_idx: usize) -> i64 {
        self.pairing_arr_tz_min
            .get(pi)
            .copied()
            .unwrap_or_else(|| self.crew_offset(crew_idx))
    }

    fn pairing_duty_slice(&self, pi: usize) -> std::ops::Range<usize> {
        if self.pairing_duty_offsets.len() == self.pairings.len() + 1 {
            let start = self.pairing_duty_offsets[pi];
            let end = self.pairing_duty_offsets[pi + 1];
            return start..end;
        }
        0..0
    }

    fn push_pairing_duties(
        &self,
        duties: &mut Vec<CrewLineDuty>,
        pi: usize,
        crew_idx: usize,
        is_pa: bool,
    ) {
        let p = &self.pairings[pi];
        let slice = self.pairing_duty_slice(pi);
        if slice.end > slice.start && slice.end <= self.pairing_duty_start_utc.len() {
            for (local_idx, flat_idx) in slice.clone().enumerate() {
                duties.push(CrewLineDuty {
                    start_utc: self.pairing_duty_start_utc[flat_idx],
                    end_utc: self.pairing_duty_end_utc[flat_idx],
                    first_flight_departure_utc: self
                        .pairing_duty_first_flight_departure_utc
                        .get(flat_idx)
                        .copied()
                        .unwrap_or(self.pairing_duty_start_utc[flat_idx]),
                    last_flight_arrival_utc: self
                        .pairing_duty_last_flight_arrival_utc
                        .get(flat_idx)
                        .copied()
                        .unwrap_or(self.pairing_duty_end_utc[flat_idx]),
                    dep_tz_min: self
                        .pairing_duty_dep_tz_min
                        .get(flat_idx)
                        .copied()
                        .unwrap_or_else(|| self.pairing_dep_tz(pi, crew_idx)),
                    arr_tz_min: self
                        .pairing_duty_arr_tz_min
                        .get(flat_idx)
                        .copied()
                        .unwrap_or_else(|| self.pairing_arr_tz(pi, crew_idx)),
                    pairing_idx: Some(pi),
                    duty_idx: Some(local_idx),
                    is_ground: false,
                    is_fly: p.is_fly,
                    is_rest_ground: false,
                    is_pre_assigned: is_pa,
                    ref_tz_min: i64::MIN,
                    duty_end_ref_tz_min: i64::MIN,
                });
            }
            return;
        }
        duties.push(CrewLineDuty {
            start_utc: p.start_utc,
            end_utc: p.end_duty_utc,
            first_flight_departure_utc: p.start_utc,
            last_flight_arrival_utc: p.end_duty_utc,
            dep_tz_min: self.pairing_dep_tz(pi, crew_idx),
            arr_tz_min: self.pairing_arr_tz(pi, crew_idx),
            pairing_idx: Some(pi),
            duty_idx: Some(0),
            is_ground: false,
            is_fly: p.is_fly,
            is_rest_ground: false,
            is_pre_assigned: is_pa,
            ref_tz_min: i64::MIN,
            duty_end_ref_tz_min: i64::MIN,
        });
    }

    /// Build the crew duty line (PairingDuty + ground), sorted by start — C++ `GetDuties`.
    fn build_line_duties(
        &self,
        crew_idx: usize,
        fixed: &[usize],
        candidate: &[usize],
    ) -> Vec<CrewLineDuty> {
        let mut duties: Vec<CrewLineDuty> = Vec::new();
        for (is_pa, slice) in [(true, fixed), (false, candidate)] {
            for &pi in slice {
                self.push_pairing_duties(&mut duties, pi, crew_idx, is_pa);
            }
        }
        if crew_idx < self.crew_ground.len() {
            let tzs = self.crew_ground_tz_min.get(crew_idx);
            for (gi, g) in self.crew_ground[crew_idx].iter().enumerate() {
                let tz = tzs
                    .and_then(|v| v.get(gi).copied())
                    .unwrap_or_else(|| self.crew_offset(crew_idx));
                duties.push(CrewLineDuty {
                    start_utc: g.start_utc,
                    end_utc: g.end_utc,
                    first_flight_departure_utc: g.start_utc,
                    last_flight_arrival_utc: g.end_utc,
                    dep_tz_min: tz,
                    arr_tz_min: tz,
                    pairing_idx: None,
                    duty_idx: None,
                    is_ground: true,
                    is_fly: false,
                    is_rest_ground: g.is_rest,
                    is_pre_assigned: true,
                    ref_tz_min: i64::MIN,
                    duty_end_ref_tz_min: i64::MIN,
                });
            }
        }
        duties.sort_by_key(|d| d.start_utc);
        duties
    }

    /// Rule 7500 — write acclimatisation state onto each duty (no violations).
    fn run_acclimatisation_7500(&self, duties: &mut [CrewLineDuty]) {
        if !self.is_enabled("7500") {
            return;
        }
        let (Some(stay), Some(adj)) = (self.acc_stay_per_min, self.acc_adjust_min) else {
            return;
        };
        let acc_inputs: Vec<AccDuty> = duties
            .iter()
            .map(|d| AccDuty {
                start_utc: d.start_utc,
                end_utc: d.end_utc,
                first_flight_departure_utc: d.first_flight_departure_utc,
                last_flight_arrival_utc: d.last_flight_arrival_utc,
                dep_tz_min: d.dep_tz_min,
                arr_tz_min: d.arr_tz_min,
            })
            .collect();
        for (duty, refs) in duties.iter_mut().zip(acc_duty_refs(&acc_inputs, stay, adj)) {
            duty.ref_tz_min = refs.ref_tz_min;
            duty.duty_end_ref_tz_min = refs.duty_end_ref_tz_min;
        }
    }

    fn filter_matches(filters: &[String], value: &str) -> bool {
        filters.is_empty()
            || filters
                .iter()
                .any(|filter| filter == "*" || filter.eq_ignore_ascii_case(value))
    }

    fn qualification_matches(
        filters: &[String],
        qualifications: &[(String, i64, i64)],
        day_ord: i64,
    ) -> bool {
        if filters.is_empty() || filters.iter().any(|value| value == "*") {
            return true;
        }
        qualifications.iter().any(|(value, effective, expiry)| {
            Self::filter_matches(filters, value)
                && *effective <= day_ord
                && (*expiry < 0 || day_ord <= *expiry)
        })
    }

    fn active_qual_values(
        quals: &[Vec<(String, i64, i64)>],
        crew_idx: usize,
        day_ord: i64,
    ) -> Vec<String> {
        let values: Vec<String> = quals
            .get(crew_idx)
            .map(|rows| {
                rows.iter()
                    .filter(|(_, eff_ord, exp_ord)| {
                        *eff_ord <= day_ord && (*exp_ord < 0 || day_ord <= *exp_ord)
                    })
                    .map(|(value, _, _)| value.clone())
                    .collect()
            })
            .unwrap_or_default();
        if values.is_empty() {
            vec!["*".to_string()]
        } else {
            values
        }
    }

    fn check_8071(
        &self,
        crew_idx: usize,
        fixed: &[usize],
        candidate: &[usize],
        crew_id: &str,
        out: &mut Vec<String>,
    ) {
        if self.roster_property_rules.is_empty() {
            return;
        }
        let mut activities = Vec::with_capacity(fixed.len() + candidate.len());
        for &pi in fixed.iter().chain(candidate.iter()) {
            let Some(pairing) = self.pairings.get(pi) else {
                continue;
            };
            let day_ord = pairing.day_ord;
            let bases = Self::active_qual_values(&self.crew_base_quals, crew_idx, day_ord);
            let ranks = Self::active_qual_values(&self.crew_rank_quals, crew_idx, day_ord);
            let fleets = Self::active_qual_values(&self.crew_fleet_quals, crew_idx, day_ord);
            let teams = self.crew_teams.get(crew_idx).cloned().unwrap_or_default();
            let labels = split_pipe_or_star(&pairing.label);
            let attributes = split_pipe_or_star(&pairing.attributes);
            let segment_idxs = self
                .pairing_to_8072_segments
                .get(pi)
                .map(Vec::as_slice)
                .unwrap_or(&[]);
            if !segment_idxs.is_empty() {
                // Destinations match C++ segment arrival stations, not pairing.airport.
                for &seg_idx in segment_idxs {
                    let Some(segment) = self.segments_8072.get(seg_idx) else {
                        continue;
                    };
                    activities.push(RosterPropertyActivity {
                        crew_id: crew_id.to_string(),
                        // Pairing index is 0-based, but the 8071 kernel filters on
                        // pairing_id > 0 (ground tasks carry a non-positive id in the
                        // checker binary). Offset by +1 so index-0 pairings are not
                        // silently treated as ground and dropped from per-pairing
                        // findings / anchors.
                        pairing_id: pi as i64 + 1,
                        duty_seq: segment.duty_seq,
                        segment_id: segment.segment_id,
                        start_utc: segment.start_utc,
                        end_utc: segment.end_utc,
                        bases: bases.clone(),
                        ranks: ranks.clone(),
                        fleets: fleets.clone(),
                        teams: teams.clone(),
                        labels: labels.clone(),
                        attributes: attributes.clone(),
                        override_duty_attributes: vec!["*".to_string()],
                        assignment_group: pairing.group.clone(),
                        assignment: segment.assignment.clone(),
                        qualifier: pairing.qualifier.clone(),
                        flight_number: segment.flight_number.clone(),
                        destination: segment.arr.clone(),
                        destination_country: segment.destination_country.clone(),
                        position: pairing.role.clone(),
                    });
                }
                continue;
            }
            activities.push(RosterPropertyActivity {
                crew_id: crew_id.to_string(),
                // Offset by +1 (see the segment branch above) so index-0 pairings
                // survive the kernel's pairing_id > 0 filter.
                pairing_id: pi as i64 + 1,
                duty_seq: 0,
                segment_id: pi as i64,
                start_utc: pairing.start_utc,
                end_utc: pairing.end_duty_utc,
                bases,
                ranks,
                fleets,
                teams,
                labels,
                attributes,
                override_duty_attributes: vec!["*".to_string()],
                assignment_group: pairing.group.clone(),
                assignment: pairing.assignment.clone(),
                qualifier: pairing.qualifier.clone(),
                flight_number: String::new(),
                // Empty pairing airport stays empty — do not wildcard Dest.
                destination: pairing.airport.clone(),
                destination_country: String::new(),
                position: pairing.role.clone(),
            });
        }
        let checked_window = self
            .checked_window
            .or(self.scenario_window)
            .or_else(|| self.roster_line_window_utc(crew_idx, fixed, candidate));
        let Some((checked_start, checked_end)) = checked_window else {
            return;
        };
        for rule in &self.roster_property_rules {
            for violation in check_roster_properties_row_with_country_sets(
                crew_id,
                rule,
                &activities,
                checked_start,
                checked_end,
                &self.roster_periods,
                self.application,
                Some(&self.pairing_country_sets),
            ) {
                out.push(format!(
                    "8071|period={}|unit={}|actual={}|max={}|min={}|mode={}|over={}",
                    rule.period,
                    rule.unit.as_str(),
                    violation.actual_count,
                    violation.max_times,
                    violation.min_times,
                    violation.mode.as_str(),
                    violation.over,
                ));
            }
        }
    }

    fn check_7305(
        &self,
        crew_idx: usize,
        fixed: &[usize],
        candidate: &[usize],
        crew_id: &str,
        out: &mut Vec<String>,
    ) {
        if self.rule7305_rules.is_empty() {
            return;
        }
        let mut duties = Vec::with_capacity(fixed.len() + candidate.len() + 8);
        for (pre_assigned, pairing_idxs) in [(true, fixed), (false, candidate)] {
            for &pairing_idx in pairing_idxs {
                let Some(pairing) = self.pairings.get(pairing_idx) else {
                    continue;
                };
                duties.push(Rule7305Duty {
                    activity_id: pairing_idx as i64,
                    pairing_id: Some(pairing_idx as i64),
                    start_utc: pairing.start_utc,
                    duty_end_utc: pairing.end_duty_utc,
                    rest_end_utc: pairing.end_including_rest_utc,
                    local_offset_min: self.crew_offset(crew_idx),
                    assignment: pairing.assignment.clone(),
                    assignment_group: pairing.group.clone(),
                    attributes: split_pipe_or_star(&pairing.attributes),
                    label: pairing.label.clone(),
                    is_ground: false,
                    pre_assigned,
                    phase_checked: true,
                });
            }
        }
        for (ground_idx, ground) in self
            .crew_ground
            .get(crew_idx)
            .into_iter()
            .flatten()
            .enumerate()
        {
            duties.push(Rule7305Duty {
                activity_id: -(ground_idx as i64 + 1),
                pairing_id: None,
                start_utc: ground.start_utc,
                duty_end_utc: ground.end_utc,
                rest_end_utc: ground.end_utc,
                local_offset_min: self.crew_offset(crew_idx),
                assignment: ground.assignment.clone(),
                assignment_group: ground.group.clone(),
                attributes: Vec::new(),
                label: ground.assignment.clone(),
                is_ground: true,
                pre_assigned: true,
                phase_checked: true,
            });
        }
        let base_quals = self
            .crew_base_quals
            .get(crew_idx)
            .cloned()
            .unwrap_or_default();
        let rank_quals = self
            .crew_rank_quals
            .get(crew_idx)
            .cloned()
            .unwrap_or_default();
        let position_quals = self
            .crew_position_quals
            .get(crew_idx)
            .cloned()
            .unwrap_or_default();
        let fleet_quals = self
            .crew_fleet_quals
            .get(crew_idx)
            .cloned()
            .unwrap_or_default();
        let teams = self.crew_teams.get(crew_idx).cloned().unwrap_or_default();
        let context = Rule7305CrewContext {
            base_quals,
            rank_quals,
            position_quals,
            fleet_quals,
            teams,
            assignment_group_map: self.rule7305_assignment_groups.clone(),
        };
        let (checked_start, checked_end) = self
            .scenario_window
            .or(self.checked_window)
            .unwrap_or_else(|| {
                let start = duties.iter().map(|d| d.start_utc).min().unwrap_or(0);
                let end = duties.iter().map(|d| d.rest_end_utc).max().unwrap_or(start);
                (start, end)
            });
        for rule in &self.rule7305_rules {
            for violation in check_rule7305_row(
                crew_id,
                rule,
                &duties,
                &context,
                checked_start,
                checked_end,
                self.application,
            ) {
                out.push(format!(
                    "7305|pairing={}|actual={}|limit={}|start_s={}|end_s={}|severity={}",
                    violation.pairing_id.unwrap_or(0),
                    violation.actual,
                    violation.limit,
                    violation.start_utc,
                    violation.end_utc,
                    violation.severity,
                ));
            }
        }
    }

    fn first_active_qual_value(
        quals: &[Vec<(String, i64, i64)>],
        crew_idx: usize,
        day_ord: i64,
    ) -> String {
        quals
            .get(crew_idx)
            .and_then(|rows| {
                rows.iter()
                    .find(|(_, eff_ord, exp_ord)| {
                        *eff_ord <= day_ord && (*exp_ord < 0 || day_ord <= *exp_ord)
                    })
                    .map(|(value, _, _)| value.clone())
            })
            .unwrap_or_default()
    }

    fn crew_8072_for_segment(
        &self,
        crew_idx: usize,
        segment: &Rule8072Segment,
        source: &str,
    ) -> Rule8072Crew {
        let day_ord = segment.start_utc.div_euclid(SECONDS_PER_DAY);
        Rule8072Crew {
            crew_id: crew_idx.to_string(),
            division: self
                .crew_division
                .get(crew_idx)
                .cloned()
                .unwrap_or_default(),
            acting_rank: Self::first_active_qual_value(&self.crew_rank_quals, crew_idx, day_ord),
            assignment: segment.assignment.clone(),
            assignment_group: segment.assignment_group.clone(),
            nationality: self
                .crew_nationality_8072
                .get(crew_idx)
                .cloned()
                .unwrap_or_default(),
            teams: self.crew_teams.get(crew_idx).cloned().unwrap_or_default(),
            source: source.to_string(),
            qualifications: self
                .crew_qualification_sets
                .get(crew_idx)
                .cloned()
                .unwrap_or_default(),
        }
    }

    fn format_8072_violations(&self, segments: &[Rule8072Segment]) -> Vec<String> {
        let mut out = Vec::new();
        for rule in &self.min_qual_rules {
            for violation in check_min_qual_by_fleet_rank(rule, segments, self.application) {
                out.push(format!(
                    "8072|segment={}|qualified={}|planned={}|filled={}|min={}|max={}|over={}",
                    violation.segment_id,
                    violation.qualified_count,
                    violation.planned_count,
                    violation.filled_count,
                    violation.min_limits,
                    violation.max_limits,
                    violation.over_max,
                ));
            }
        }
        out
    }

    fn check_structured_wocl(
        &self,
        crew_idx: usize,
        crew_id: &str,
        line_duties: &[CrewLineDuty],
        out: &mut Vec<String>,
    ) -> PyResult<()> {
        let crew_ctx = Rule7504CrewContext {
            base_quals: self
                .crew_base_quals
                .get(crew_idx)
                .map(|quals| {
                    quals
                        .iter()
                        .map(|(base, eff_ord, exp_ord)| BaseQual {
                            base: base.clone(),
                            eff_ord: (*eff_ord >= 0).then_some(*eff_ord),
                            exp_ord: (*exp_ord >= 0).then_some(*exp_ord),
                        })
                        .collect()
                })
                .unwrap_or_default(),
            rank_quals: self
                .crew_rank_quals
                .get(crew_idx)
                .map(|quals| {
                    quals
                        .iter()
                        .map(|(rank, eff_ord, exp_ord)| BaseQual {
                            base: rank.clone(),
                            eff_ord: (*eff_ord >= 0).then_some(*eff_ord),
                            exp_ord: (*exp_ord >= 0).then_some(*exp_ord),
                        })
                        .collect()
                })
                .unwrap_or_default(),
            fleet_quals: self
                .crew_fleet_quals
                .get(crew_idx)
                .map(|quals| {
                    quals
                        .iter()
                        .map(|(fleet, eff_ord, exp_ord)| BaseQual {
                            base: fleet.clone(),
                            eff_ord: (*eff_ord >= 0).then_some(*eff_ord),
                            exp_ord: (*exp_ord >= 0).then_some(*exp_ord),
                        })
                        .collect()
                })
                .unwrap_or_default(),
            teams: self.crew_teams.get(crew_idx).cloned().unwrap_or_default(),
        };
        let duties: Vec<Rule7504Duty> = line_duties
            .iter()
            .filter_map(|duty| {
                let pairing_idx = duty.pairing_idx?;
                let pairing = self.pairings.get(pairing_idx)?;
                Some(Rule7504Duty {
                    pairing_id: pairing_idx as i64,
                    start_utc: duty.start_utc,
                    end_duty_utc: duty.end_utc,
                    end_including_rest_utc: pairing.end_including_rest_utc,
                    day_ord: pairing.day_ord,
                    offset_min: duty.acc_offset_at_start(self.crew_offset_min[crew_idx]),
                    assignment_group: pairing.group.clone(),
                    assignment: pairing.assignment.clone(),
                    attributes: pairing.attributes.clone(),
                    is_pre_assigned: duty.is_pre_assigned,
                })
            })
            .collect();
        for row in &self.wocl_spacing_rules {
            if !row.teams.is_empty()
                && !row.teams.iter().any(|value| value == "*")
                && self.crew_teams.is_empty()
            {
                return Err(PyValueError::new_err(
                    "7504 row specifies Crew Teams but crew-team context is unavailable",
                ));
            }
            let shared_row = Rule7504Row {
                prev_assignment_groups: row.prev_assignment_groups.clone(),
                next_assignment_groups: row.next_assignment_groups.clone(),
                prev_assignments: row.prev_assignments.clone(),
                next_assignments: row.next_assignments.clone(),
                prev_attributes: row.prev_attributes.clone(),
                next_attributes: row.next_attributes.clone(),
                apply_prelabelled_attributes: row.apply_prelabelled_attributes,
                utilize_post_rest: row.utilize_post_rest,
                bases: row.bases.clone(),
                ranks: row.ranks.clone(),
                fleets: row.fleets.clone(),
                teams: row.teams.clone(),
                level: row.level.clone(),
                min_period: row.min_period,
                unit: row.unit.clone(),
                wocl_window: row.wocl_window,
            };
            for violation in check_rule7504_structured(
                crew_id,
                &shared_row,
                &crew_ctx,
                &duties,
                self.wocl_window,
                self.application,
            ) {
                out.push(format!(
                    "7504|gap_min={}|limit_min={}|pairing={}",
                    violation.actual_minutes, violation.limit_minutes, violation.pairing_id
                ));
            }
        }
        Ok(())
    }

    /// Rule 1001 Assignment Overlap gate, runs before all other numbered rules.
    fn check_overlap(
        &self,
        crew_idx: usize,
        fixed: &[usize],
        candidate: &[usize],
        crew_id: &str,
        out: &mut Vec<String>,
    ) {
        let rules: Vec<AssignmentOverlapRule> = self
            .overlap_rules
            .iter()
            .map(|r| AssignmentOverlapRule {
                group_before: r.group_before.clone(),
                assignment_before: r.assignment_before.clone(),
                rest_before: r.rest_before,
                type_before: r.type_before.clone(),
                group_after: r.group_after.clone(),
                assignment_after: r.assignment_after.clone(),
                type_after: r.type_after.clone(),
            })
            .collect();
        let mut rosters: Vec<AssignmentOverlapRoster> = Vec::new();
        let crew_offset = self.crew_offset(crew_idx);
        for (is_pa, slice) in [(true, fixed), (false, candidate)] {
            for &pi in slice {
                let p = &self.pairings[pi];
                rosters.push(AssignmentOverlapRoster {
                    id: pi as i64,
                    start_utc: p.start_utc,
                    end_duty_utc: p.end_duty_utc,
                    end_including_rest_utc: p.end_including_rest_utc,
                    assignment_group: p.group.clone(),
                    assignment: if p.is_fly {
                        "FLY".to_string()
                    } else {
                        p.group.clone()
                    },
                    assignment_type: p.assignment_type.clone(),
                    is_pre_assigned: is_pa,
                    offset_min: crew_offset,
                });
            }
        }
        if crew_idx < self.crew_ground.len() {
            for (i, g) in self.crew_ground[crew_idx].iter().enumerate() {
                let assignment_type = self
                    .crew_ground_type
                    .get(crew_idx)
                    .and_then(|row| row.get(i))
                    .cloned()
                    .unwrap_or_else(|| Self::ground_assignment_type(&g.assignment, &g.group));
                rosters.push(AssignmentOverlapRoster {
                    id: -(i as i64 + 1),
                    start_utc: g.start_utc,
                    end_duty_utc: g.end_utc,
                    end_including_rest_utc: g.end_utc,
                    assignment_group: g.group.clone(),
                    assignment: g.assignment.clone(),
                    assignment_type,
                    is_pre_assigned: true,
                    offset_min: crew_offset,
                });
            }
        }
        for v in check_assignment_overlap(crew_id, &rosters, &rules, self.do_start_grace.clone()) {
            if self.application.is_optimizer() {
                let candidate_involved = candidate
                    .iter()
                    .any(|&pi| v.before_id == pi as i64 || v.after_id == pi as i64);
                if !candidate_involved {
                    continue;
                }
            }
            out.push(v.message());
        }
    }

    #[inline]
    fn seg_crew_offset_min(&self, crew_idx: usize, si: usize) -> Option<i64> {
        self.pairing_seg_crew_offset_min
            .get(crew_idx)
            .and_then(|row| row.get(si).copied())
    }

    #[inline]
    fn seg_crew_sta_offset_min(&self, crew_idx: usize, si: usize, std_fallback: i64) -> i64 {
        self.pairing_seg_crew_sta_offset_min
            .get(crew_idx)
            .and_then(|row| row.get(si).copied())
            .unwrap_or(std_fallback)
    }

    #[inline]
    fn duty_crew_offset_min(&self, crew_idx: usize, di: usize) -> Option<i64> {
        self.pairing_duty_crew_offset_min
            .get(crew_idx)
            .and_then(|row| row.get(di).copied())
    }

    fn split_minutes_by_weights(total: i64, weights: &[i64]) -> Vec<i64> {
        if total <= 0 || weights.is_empty() {
            return Vec::new();
        }
        let total_weight: i64 = weights.iter().map(|w| (*w).max(0)).sum();
        if total_weight <= 0 {
            return Vec::new();
        }
        let mut out = Vec::with_capacity(weights.len());
        let mut allocated = 0i64;
        let mut cumulative_weight = 0i64;
        for (i, weight) in weights.iter().enumerate() {
            let minutes = if i + 1 == weights.len() {
                (total - allocated).max(0)
            } else {
                cumulative_weight += (*weight).max(0);
                let target = (((total as f64) * cumulative_weight as f64) / total_weight as f64)
                    .round() as i64;
                (target - allocated).max(0)
            };
            allocated += minutes;
            out.push(minutes.max(0));
        }
        out
    }

    fn split_weighted_duty_dp(
        &self,
        crew_idx: usize,
        di: usize,
        fallback_offset_min: i64,
    ) -> BTreeMap<i64, f64> {
        let mut daily: BTreeMap<i64, f64> = BTreeMap::new();
        if self.pairing_duty_dp_pct.is_empty() {
            let offset_min = self
                .duty_crew_offset_min(crew_idx, di)
                .unwrap_or(fallback_offset_min);
            let local = self.pairing_duty_start_utc[di] + offset_min * 60;
            let day = local.div_euclid(SECONDS_PER_DAY);
            let v = self.pairing_duty_dp_min.get(di).copied().unwrap_or(0);
            if v > 0 {
                daily.insert(day, v as f64);
            }
            return daily;
        }

        let offset_min = self
            .duty_crew_offset_min(crew_idx, di)
            .unwrap_or(fallback_offset_min);
        let start_local = self.pairing_duty_start_utc[di] + offset_min * 60;
        let end_local = self
            .pairing_duty_end_utc
            .get(di)
            .copied()
            .unwrap_or(self.pairing_duty_start_utc[di])
            + offset_min * 60;
        let total_dp_min = self.pairing_duty_dp_min.get(di).copied().unwrap_or(0);
        let dp_pct = self.pairing_duty_dp_pct.get(di).copied().unwrap_or(0.0);
        let weighted_total = ((total_dp_min as f64) * dp_pct).round() as i64;
        if weighted_total <= 0 {
            return daily;
        }
        let start_day = start_local.div_euclid(SECONDS_PER_DAY);
        let end_day = end_local.div_euclid(SECONDS_PER_DAY);
        if end_day <= start_day {
            daily.insert(start_day, weighted_total as f64);
            return daily;
        }

        let mut raw_weights: Vec<i64> = Vec::new();
        let mut days: Vec<i64> = Vec::new();
        for day in start_day..=end_day {
            let day_start = day * SECONDS_PER_DAY;
            let day_end = day_start + SECONDS_PER_DAY;
            let slice_start = start_local.max(day_start);
            let slice_end = end_local.min(day_end);
            if slice_end > slice_start {
                raw_weights.push((((slice_end - slice_start) as f64) / 60.0).round() as i64);
                days.push(day);
            }
        }
        if raw_weights.is_empty() {
            daily.insert(start_day, weighted_total as f64);
            return daily;
        }

        let raw_minutes = Self::split_minutes_by_weights(total_dp_min, &raw_weights);
        let weighted_minutes = Self::split_minutes_by_weights(weighted_total, &raw_minutes);
        for (day, minutes) in days.into_iter().zip(weighted_minutes.into_iter()) {
            if minutes > 0 {
                daily.insert(day, minutes as f64);
            }
        }
        daily
    }

    /// Build a per-local-day accumulation map for 8002 BLK (segment-level) or DP (duty-level).
    /// Day boundaries use each crew's prime base timezone (DST-aware offsets from Python).
    /// BLK: segment block split proportionally at crew-base-local midnight (SPAN).
    /// DP: each duty's weighted DP split across crew-base local days.
    fn cum_daily_map(
        &self,
        pairings: &[usize],
        crew_idx: usize,
        use_segs: bool,     // true → segment-level BLK, false → duty-level DP
        _dp_values: &[i64], // legacy call-shape; DP values now come from self.
    ) -> (BTreeMap<i64, f64>, BTreeSet<i64>) {
        let fallback_offset_min = self.crew_offset_min.get(crew_idx).copied().unwrap_or(0);
        let mut daily: BTreeMap<i64, f64> = BTreeMap::new();
        let mut days: BTreeSet<i64> = BTreeSet::new();
        for &pi in pairings {
            if use_segs && !self.pairing_seg_offsets.is_empty() {
                let s_start = self.pairing_seg_offsets[pi];
                let s_end = self.pairing_seg_offsets[pi + 1];
                for si in s_start..s_end {
                    let std_offset_min = self
                        .seg_crew_offset_min(crew_idx, si)
                        .unwrap_or(fallback_offset_min);
                    let sta_offset_min = self.seg_crew_sta_offset_min(crew_idx, si, std_offset_min);
                    let std_local = self.pairing_seg_std_utc[si] + std_offset_min * 60;
                    let sta_local = self
                        .pairing_seg_sta_utc
                        .get(si)
                        .copied()
                        .map(|t| t + sta_offset_min * 60)
                        .unwrap_or(std_local);
                    let blk_min = self.pairing_seg_blk_min.get(si).copied().unwrap_or(0) as f64;
                    let std_day = std_local.div_euclid(SECONDS_PER_DAY);
                    let sta_day = sta_local.div_euclid(SECONDS_PER_DAY);
                    if std_day == sta_day || blk_min == 0.0 {
                        *daily.entry(std_day).or_insert(0.0) += blk_min;
                        days.insert(std_day);
                    } else {
                        let total_secs = (sta_local - std_local).max(1) as f64;
                        for day in std_day..=sta_day {
                            let day_start = day * SECONDS_PER_DAY;
                            let day_end = day_start + SECONDS_PER_DAY;
                            let slice_start = std_local.max(day_start);
                            let slice_end = sta_local.min(day_end);
                            if slice_end > slice_start {
                                let frac = (slice_end - slice_start) as f64 / total_secs;
                                *daily.entry(day).or_insert(0.0) += blk_min * frac;
                                days.insert(day);
                            }
                        }
                    }
                }
            } else if !use_segs && !self.pairing_duty_offsets.is_empty() {
                let d_start = self.pairing_duty_offsets[pi];
                let d_end = self.pairing_duty_offsets[pi + 1];
                for di in d_start..d_end {
                    for (day, v) in self.split_weighted_duty_dp(crew_idx, di, fallback_offset_min) {
                        *daily.entry(day).or_insert(0.0) += v;
                        days.insert(day);
                    }
                }
            } else {
                // fallback: pairing total on pairing-start local day
                let p = &self.pairings[pi];
                let local = p.start_utc + fallback_offset_min * 60;
                let day = local.div_euclid(SECONDS_PER_DAY);
                let v = if use_segs { p.blk_min } else { p.dp_min };
                *daily.entry(day).or_insert(0.0) += v as f64;
                days.insert(day);
            }
        }
        (daily, days)
    }

    /// Rolling-window cumulative check for the legacy 8002 BLK path.
    /// BLK uses segment-level crew-base-local SPAN split.
    /// Optimizer PA-ignore: windows entirely within pre-assigned days are tolerated.
    fn check_cum_windows(
        &self,
        fixed: &[usize],
        candidate: &[usize],
        crew_idx: usize,
        crew_id: &str,
        bands: &[BlockBand],
        use_segs: bool,
        code: &str,
        out: &mut Vec<String>,
    ) {
        if bands.is_empty() {
            return;
        }
        // For BLK (use_segs=true): use the preloaded manday baseline when available.
        // It covers 365-day history so rolling windows include BLK from outside the
        // RO planning window. Falls back to PA segment computation when not provided.
        // For DP (use_segs=false): always recompute from PA duty minutes (no DP baseline yet).
        let mut daily = if use_segs && !self.crew_daily_baseline.is_empty() {
            self.crew_daily_baseline
                .get(crew_idx)
                .cloned()
                .unwrap_or_default()
        } else {
            self.cum_daily_map(fixed, crew_idx, use_segs, &self.pairing_duty_dp_min)
                .0
        };
        let (cand_daily, cand_days) =
            self.cum_daily_map(candidate, crew_idx, use_segs, &self.pairing_duty_dp_min);
        for (day, v) in cand_daily {
            *daily.entry(day).or_insert(0.0) += v;
        }
        for band in bands {
            if let Some(v) = check_max_cum_block_app(
                crew_id,
                &daily,
                band.window_days,
                band.limit_min,
                self.application,
                &cand_days,
            ) {
                out.push(format!(
                    "{code}|window_days={}|limit_h={}|actual_h={}|window_start_ord={}",
                    band.window_days,
                    format_hhmm(v.limit_minutes.trunc() as i64),
                    format_hhmm(v.actual_minutes.trunc() as i64),
                    v.window_start_ord,
                ));
            }
        }
    }

    fn duty_formula_credit_min(&self, di: usize) -> f64 {
        let blk = self.pairing_duty_blk_min.get(di).copied().unwrap_or(0) as f64;
        let dp = self.pairing_duty_dp_min.get(di).copied().unwrap_or(0) as f64;
        blk.max(dp / 2.0).max(240.0)
    }

    fn credit_daily_map(&self, idxs: &[usize], crew_idx: usize) -> BTreeMap<i64, f64> {
        let mut daily: BTreeMap<i64, f64> = BTreeMap::new();
        if self.pairing_duty_offsets.is_empty() {
            return daily;
        }
        let fallback = self.crew_offset(crew_idx);
        for &pi in idxs {
            if pi + 1 >= self.pairing_duty_offsets.len() {
                continue;
            }
            let (s, e) = (
                self.pairing_duty_offsets[pi],
                self.pairing_duty_offsets[pi + 1],
            );
            for di in s..e {
                if di >= self.pairing_duty_start_utc.len() {
                    continue;
                }
                let off = self.duty_crew_offset_min(crew_idx, di).unwrap_or(fallback);
                let day = (self.pairing_duty_start_utc[di] + off * 60).div_euclid(SECONDS_PER_DAY);
                *daily.entry(day).or_insert(0.0) += self.duty_formula_credit_min(di);
            }
        }
        daily
    }

    fn ground_credit_daily_map(&self, crew_idx: usize) -> BTreeMap<i64, f64> {
        let mut daily: BTreeMap<i64, f64> = BTreeMap::new();
        let Some(grounds) = self.crew_ground.get(crew_idx) else {
            return daily;
        };
        let off_s = self.crew_offset(crew_idx) * 60;
        for g in grounds {
            if g.is_rest {
                continue;
            }
            let day = (g.start_utc + off_s).div_euclid(SECONDS_PER_DAY);
            *daily.entry(day).or_insert(0.0) += 240.0;
        }
        daily
    }

    /// Candidate-side per-local-day metric contributions (rule 8002 full path).
    ///
    /// BH = segment SPAN split (existing `cum_daily_map`); FT ≈ the same block
    /// minutes (documented approximation — candidate pairings carry no
    /// airborne-time); DP = duty minutes on the duty-start local day;
    /// `sby_present` marks days of SBY-like pairings; `cross_tz_count` counts
    /// duties whose |arr_tz − dep_tz| ≥ 06:00 (the C++ "06:00+ time zone duty").
    /// CH is overlaid in `check_8002_full`, not here.
    fn candidate_day_metrics(&self, idxs: &[usize], crew_idx: usize) -> BTreeMap<i64, DayMetrics> {
        let mut out: BTreeMap<i64, DayMetrics> = BTreeMap::new();
        let (blk, _) = self.cum_daily_map(idxs, crew_idx, true, &[]);
        for (d, v) in blk {
            let e = out.entry(d).or_default();
            e.blh += v;
            e.ft += v;
        }
        let (dp, _) = self.cum_daily_map(idxs, crew_idx, false, &self.pairing_duty_dp_min);
        for (d, v) in dp {
            out.entry(d).or_default().dp += v;
        }
        const SBY_GROUPS: [&str; 5] = ["SBY", "RES", "CSB", "HSB", "ASB"];
        let fallback = self.crew_offset(crew_idx);
        for &pi in idxs {
            let p = &self.pairings[pi];
            if SBY_GROUPS.contains(&p.group.to_uppercase().as_str()) {
                let d = (p.start_utc + fallback * 60).div_euclid(SECONDS_PER_DAY);
                out.entry(d).or_default().sby_present = 1.0;
            }
        }
        if !self.pairing_duty_offsets.is_empty() {
            for &pi in idxs {
                let (s, e) = (
                    self.pairing_duty_offsets[pi],
                    self.pairing_duty_offsets[pi + 1],
                );
                for di in s..e {
                    let dep = self.pairing_duty_dep_tz_min.get(di).copied().unwrap_or(0);
                    let arr = self.pairing_duty_arr_tz_min.get(di).copied().unwrap_or(0);
                    if (arr - dep).abs() >= 360 {
                        let off = self
                            .pairing_duty_crew_offset_min
                            .get(crew_idx)
                            .and_then(|v| v.get(di).copied())
                            .unwrap_or(fallback);
                        let d = (self.pairing_duty_start_utc[di] + off * 60)
                            .div_euclid(SECONDS_PER_DAY);
                        out.entry(d).or_default().cross_tz_count += 1.0;
                    }
                }
            }
        }
        out
    }

    /// Rule 8002 full C++ port: every `cum_rules` row × this crew.
    /// See `rois_rule_engine::rule8002` for the faithful window/branch logic.
    ///
    /// Checked calendar window:
    /// - **Optimizer / Scenario**: `[scenario start, scenario end + 24h]`
    ///   (rule8002.cpp:87-97) — only days inside the scenario period.
    /// - **Editor / Live**: span of this roster line (manday days ∪ fixed ∪
    ///   candidate pairings ∪ ground) — as many days as the line covers.
    fn check_8002_full(
        &self,
        crew_idx: usize,
        fixed: &[usize],
        candidate: &[usize],
        crew_id: &str,
        out: &mut Vec<String>,
    ) {
        let off_s = self.crew_offset(crew_idx) * 60;
        let (cs_utc, ce_utc, scen_end_utc) = if !self.application.is_optimizer() {
            match self.roster_line_window_utc(crew_idx, fixed, candidate) {
                Some((s, e)) => (s, e, Some(e)),
                None => match (self.scenario_window, self.checked_window) {
                    (Some((s, e)), _) => (s, e + SECONDS_PER_DAY, Some(e)),
                    (None, Some((s, e))) => (s, e, None),
                    (None, None) => return,
                },
            }
        } else {
            match (self.scenario_window, self.checked_window) {
                (Some((s, e)), _) => (s, e + SECONDS_PER_DAY, Some(e)),
                (None, Some((s, e))) => (s, e, None),
                (None, None) => return, // warned at construction
            }
        };
        let cs = cs_utc + off_s;
        let ce = ce_utc + off_s;
        let scen_end_local = scen_end_utc.map(|e| e + off_s);
        let rps_local: Vec<(i64, i64)> = self
            .roster_periods
            .iter()
            .map(|&(a, b)| (a + off_s, b + off_s))
            .collect();

        let empty_q: [QualEntry; 0] = [];
        let base_q = self
            .crew_8002_base_quals
            .get(crew_idx)
            .map(Vec::as_slice)
            .unwrap_or(&empty_q);
        let rank_q = self
            .crew_8002_rank_quals
            .get(crew_idx)
            .map(Vec::as_slice)
            .unwrap_or(&empty_q);
        let fleet_q = self
            .crew_8002_fleet_quals
            .get(crew_idx)
            .map(Vec::as_slice)
            .unwrap_or(&empty_q);
        let team_q = self
            .crew_8002_team_quals
            .get(crew_idx)
            .map(Vec::as_slice)
            .unwrap_or(&empty_q);

        // Fixed/history side: multi-metric baseline > BLK-only baseline (blh/ft)
        // > computed from the fixed pairings (same precedence as the legacy path,
        // where a provided manday baseline REPLACES fixed-pairing recomputation).
        let fallback_from_fixed;
        let fallback_from_blk;
        let baseline: &BTreeMap<i64, DayMetrics> = {
            let stored = self
                .crew_daily_metrics
                .get(crew_idx)
                .filter(|m| !m.is_empty());
            if let Some(m) = stored {
                m
            } else if let Some(b) = self
                .crew_daily_baseline
                .get(crew_idx)
                .filter(|b| !b.is_empty())
            {
                let mut daily: BTreeMap<i64, DayMetrics> = BTreeMap::new();
                for (&d, &v) in b {
                    let e = daily.entry(d).or_default();
                    e.blh = v;
                    e.ft = v;
                }
                fallback_from_blk = daily;
                &fallback_from_blk
            } else {
                fallback_from_fixed = self.candidate_day_metrics(fixed, crew_idx);
                &fallback_from_fixed
            }
        };
        let cand_map = self.candidate_day_metrics(candidate, crew_idx);
        let mut cand_days: BTreeSet<i64> = cand_map.keys().copied().collect();
        let mut extra_credit: BTreeMap<i64, f64> = BTreeMap::new();
        let mut line: Vec<usize> = Vec::with_capacity(fixed.len() + candidate.len());
        line.extend_from_slice(fixed);
        line.extend_from_slice(candidate);
        for (d, v) in self.credit_daily_map(&line, crew_idx) {
            *extra_credit.entry(d).or_insert(0.0) += v;
        }
        for (d, _v) in self.credit_daily_map(candidate, crew_idx) {
            cand_days.insert(d);
        }
        for (d, v) in self.ground_credit_daily_map(crew_idx) {
            *extra_credit.entry(d).or_insert(0.0) += v;
        }
        let daily = merge_daily_with_candidate(baseline, &cand_map, &extra_credit);

        for rule in &self.cum_rules {
            if !crew_qualifies_8002(rule, &base_q, &rank_q, &fleet_q, &team_q, cs, ce) {
                continue;
            }
            for v in check_max_cumulative_row(
                crew_id,
                rule,
                &daily,
                &cand_days,
                cs,
                ce,
                &self.weekday_start_from,
                &rps_local,
                scen_end_local,
                &team_q,
                self.application,
            ) {
                let mut s = format!(
                    "8002|type={}|period={}|unit={}|limit_min={}|min_min={}|actual_min={}|win_start_s={}|win_end_s={}",
                    v.rtype.as_str(),
                    v.period,
                    v.unit.as_str(),
                    v.max_min,
                    v.min_min,
                    v.actual_min,
                    v.win_start_local_s,
                    v.win_end_local_s,
                );
                if v.cross_tz_count > 0 {
                    s.push_str(&format!("|cross_tz_count={}", v.cross_tz_count));
                }
                out.push(s);
            }
        }
    }

    fn check_8056(
        &self,
        crew_idx: usize,
        fixed: &[usize],
        candidate: &[usize],
        crew_id: &str,
        out: &mut Vec<String>,
    ) -> PyResult<()> {
        if !self.spacing_rule_rows.is_empty() {
            let crew_base = self
                .crew_base_quals
                .get(crew_idx)
                .and_then(|rows| rows.first())
                .map(|(base, _, _)| base.clone())
                .unwrap_or_default();
            let mut full_duties: Vec<Rule8056Duty> = Vec::new();
            for (is_pa, slice) in [(true, fixed), (false, candidate)] {
                for &pi in slice {
                    let p = &self.pairings[pi];
                    full_duties.push(Rule8056Duty {
                        pairing_id: pi as i64,
                        start_utc: p.start_utc,
                        end_utc: p.end_duty_utc,
                        post_rest_end_utc: p.end_including_rest_utc,
                        label: p.label.clone(),
                        assignment_group: p.group.clone(),
                        assignment: p.assignment.clone(),
                        attribute: p.attributes.clone(),
                        qualifier: p.qualifier.clone(),
                        airport: p.airport.clone(),
                        role: p.role.clone(),
                        is_requested: p.is_requested,
                        location: p.location.clone(),
                        crew_base: crew_base.clone(),
                        pre_assigned: is_pa,
                    });
                }
            }
            for (gi, ground) in self
                .crew_ground
                .get(crew_idx)
                .into_iter()
                .flatten()
                .enumerate()
            {
                full_duties.push(Rule8056Duty {
                    pairing_id: -(gi as i64 + 1),
                    start_utc: ground.start_utc,
                    end_utc: ground.end_utc,
                    post_rest_end_utc: ground.end_utc,
                    label: ground.assignment.clone(),
                    assignment_group: ground.group.clone(),
                    assignment: ground.assignment.clone(),
                    attribute: String::new(),
                    qualifier: ground.assignment.clone(),
                    airport: String::new(),
                    role: String::new(),
                    is_requested: false,
                    location: String::new(),
                    crew_base: crew_base.clone(),
                    pre_assigned: true,
                });
            }
            for rule in &self.spacing_rule_rows {
                let day_ord = full_duties
                    .iter()
                    .map(|duty| duty.start_utc.div_euclid(86_400))
                    .min()
                    .unwrap_or(0);
                if !Self::qualification_matches(
                    &rule.bases,
                    self.crew_base_quals
                        .get(crew_idx)
                        .map(Vec::as_slice)
                        .unwrap_or(&[]),
                    day_ord,
                ) || !Self::qualification_matches(
                    &rule.ranks,
                    self.crew_rank_quals
                        .get(crew_idx)
                        .map(Vec::as_slice)
                        .unwrap_or(&[]),
                    day_ord,
                ) || !Self::qualification_matches(
                    &rule.fleets,
                    self.crew_fleet_quals
                        .get(crew_idx)
                        .map(Vec::as_slice)
                        .unwrap_or(&[]),
                    day_ord,
                ) {
                    continue;
                }
                let crew_team_values = self
                    .crew_teams
                    .get(crew_idx)
                    .map(Vec::as_slice)
                    .unwrap_or(&[]);
                if !rule.teams.iter().any(|value| value == "*")
                    && !rule.teams.iter().any(|value| {
                        crew_team_values
                            .iter()
                            .any(|team| team.eq_ignore_ascii_case(value))
                    })
                {
                    continue;
                }
                let violations = check_roster_spacing_full_with_context(
                    crew_id,
                    &full_duties,
                    rule,
                    self.crew_offset(crew_idx),
                    self.local_night,
                )
                .map_err(PyValueError::new_err)?;
                for violation in violations {
                    out.push(format!(
                        "8056|pairing={}|pairing_after={}|gap_min={}|limit_min={}",
                        violation.pairing_id,
                        violation.next_pairing_id,
                        violation.actual_minutes,
                        violation.limit_minutes,
                    ));
                }
            }
            return Ok(());
        }
        // Build the crew's duty timeline: FLY pairings (fixed + candidate) PLUS the
        // crew's pre-assigned ground duties (VAC/DO/ILL …). Ground duties are always
        // pre-assigned (pa=true), so under Application::Optimizer a conflict purely
        // among pre-existing facts is tolerated; a CANDIDATE flying that conflicts with
        // a pre-assigned VAC fires (mixed pa). Ground duties use negative pairing_id (see below).
        let mut duties: Vec<RosterDuty> = Vec::new();
        let mut pa: Vec<bool> = Vec::new();
        for (is_pa, slice) in [(true, fixed), (false, candidate)] {
            for &pi in slice {
                let p = &self.pairings[pi];
                if !p.is_fly {
                    continue;
                }
                duties.push(RosterDuty {
                    pairing_id: pi as i64,
                    start_utc: p.start_utc,
                    end_utc: p.end_duty_utc,
                    label: p.label.clone(),
                    assignment_group: "FLY".to_string(),
                    assignment: "FLY".to_string(),
                });
                pa.push(is_pa);
            }
        }
        // Legacy single-number param: plain consecutive-FLY spacing over FLY only
        // (ground duties do not participate — preserves the original port's behaviour).
        if self.spacing_rules.is_empty() {
            let Some(space_h) = self.spacing_hours else {
                return Ok(());
            };
            for v in check_roster_spacing_app(crew_id, &duties, space_h, self.application, &pa) {
                out.push(format!(
                    "8056|pairing={}|pairing_after={}|gap_min={}|limit_min={}",
                    v.pairing_id, v.next_pairing_id, v.actual_minutes, v.limit_minutes,
                ));
            }
            return Ok(());
        }

        // Param-driven 8056 (workset 103): non-FLY WORK pairings (RES/SBY/SIM) join the
        // timeline with their real group so a row like `Group A=FLY|RES → …|GRD` can space
        // reserve against a pre-assigned VAC (group GRD). FLY were added above.
        for (is_pa, slice) in [(true, fixed), (false, candidate)] {
            for &pi in slice {
                let p = &self.pairings[pi];
                if p.is_fly {
                    continue;
                }
                duties.push(RosterDuty {
                    pairing_id: pi as i64,
                    start_utc: p.start_utc,
                    end_utc: p.end_duty_utc,
                    label: p.label.clone(),
                    assignment_group: p.group.clone(),
                    assignment: String::new(),
                });
                pa.push(is_pa);
            }
        }
        // Pre-assigned ground duties (VAC/DO/ILL …) join the timeline so an A→B row like
        // FLY→VAC (or RES→GRD) can space work against them. Use -(gi+1) (negative) so the
        // ID never collides with a valid pairing index (0-based dense array).
        for (gi, g) in self
            .crew_ground
            .get(crew_idx)
            .into_iter()
            .flatten()
            .enumerate()
        {
            duties.push(RosterDuty {
                pairing_id: -(gi as i64 + 1),
                start_utc: g.start_utc,
                end_utc: g.end_utc,
                label: g.assignment.clone(),
                assignment_group: g.group.clone(),
                assignment: g.assignment.clone(),
            });
            pa.push(true);
        }

        // Apply each A→B row over the timeline; dedup repeated messages.
        let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
        for r in &self.spacing_rules {
            let ga: Vec<&str> = r.group_a.iter().map(String::as_str).collect();
            let gb: Vec<&str> = r.group_b.iter().map(String::as_str).collect();
            let aa: Vec<&str> = r.assign_a.iter().map(String::as_str).collect();
            let ab: Vec<&str> = r.assign_b.iter().map(String::as_str).collect();
            for v in check_roster_spacing_grouped_app(
                crew_id,
                &duties,
                r.space_hours,
                &ga,
                &gb,
                &aa,
                &ab,
                self.application,
                &pa,
            ) {
                let msg = format!(
                    "8056|pairing={}|pairing_after={}|gap_min={}|limit_min={}",
                    v.pairing_id, v.next_pairing_id, v.actual_minutes, v.limit_minutes,
                );
                if seen.insert(msg.clone()) {
                    out.push(msg);
                }
            }
        }
        Ok(())
    }

    fn days_off_scope_matches(
        &self,
        crew_idx: usize,
        checked_start: i64,
        checked_end: i64,
        row: &DaysOffRule,
    ) -> PyResult<bool> {
        if !Self::is_wildcard_scope(&row.teams) && self.crew_teams.is_empty() {
            return Err(PyValueError::new_err(
                "7505 row specifies Crew Teams but crew-team context is unavailable",
            ));
        }
        let crew_scope = self.crew_scope_7505(crew_idx);
        Ok(!filter_days_off_rows_for_crew(
            &[ScopedDaysOffRow {
                scope: DaysOffScope {
                    bases: row.bases.clone(),
                    ranks: row.ranks.clone(),
                    fleets: row.fleets.clone(),
                    teams: row.teams.clone(),
                },
                row: row.row.clone(),
            }],
            &crew_scope,
            checked_start,
            checked_end,
        )
        .is_empty())
    }

    fn is_wildcard_scope(values: &[String]) -> bool {
        values.is_empty()
            || values
                .iter()
                .all(|value| value.trim().is_empty() || value.trim() == "*")
    }

    fn structured_scope_matches(
        &self,
        rule_code: &str,
        crew_idx: usize,
        day_ord: i64,
        bases: &[String],
        ranks: &[String],
        fleets: &[String],
        teams: &[String],
    ) -> PyResult<bool> {
        if !Self::is_wildcard_scope(teams) && self.crew_teams.get(crew_idx).is_none() {
            return Err(PyValueError::new_err(format!(
                "{rule_code} row specifies Crew Teams but crew-team context is unavailable"
            )));
        }
        let team_matches = Self::is_wildcard_scope(teams)
            || self
                .crew_teams
                .get(crew_idx)
                .map(|crew_teams| {
                    crew_teams
                        .iter()
                        .any(|team| Self::filter_matches(teams, team))
                })
                .unwrap_or(false);
        Ok(Self::qualification_matches(
            bases,
            self.crew_base_quals
                .get(crew_idx)
                .map(Vec::as_slice)
                .unwrap_or(&[]),
            day_ord,
        ) && Self::qualification_matches(
            ranks,
            self.crew_rank_quals
                .get(crew_idx)
                .map(Vec::as_slice)
                .unwrap_or(&[]),
            day_ord,
        ) && Self::qualification_matches(
            fleets,
            self.crew_fleet_quals
                .get(crew_idx)
                .map(Vec::as_slice)
                .unwrap_or(&[]),
            day_ord,
        ) && team_matches)
    }

    fn quals_7505(&self, rows: Option<&Vec<(String, i64, i64)>>) -> Vec<QualEntry> {
        rows.map(|values| {
            values
                .iter()
                .map(|(value, eff, exp)| QualEntry {
                    value: value.clone(),
                    eff_s: eff.saturating_mul(SECONDS_PER_DAY),
                    exp_s: if *exp < 0 || *exp == i64::MAX {
                        i64::MAX
                    } else {
                        exp.saturating_mul(SECONDS_PER_DAY)
                    },
                })
                .collect()
        })
        .unwrap_or_default()
    }

    fn crew_scope_7505(&self, crew_idx: usize) -> CrewScope7505 {
        let teams = self
            .crew_teams
            .get(crew_idx)
            .map(|values| {
                values
                    .iter()
                    .map(|value| QualEntry {
                        value: value.clone(),
                        eff_s: 0,
                        exp_s: i64::MAX,
                    })
                    .collect()
            })
            .unwrap_or_default();
        CrewScope7505 {
            bases: self.quals_7505(self.crew_base_quals.get(crew_idx)),
            ranks: self.quals_7505(self.crew_rank_quals.get(crew_idx)),
            fleets: self.quals_7505(self.crew_fleet_quals.get(crew_idx)),
            teams,
        }
    }

    fn check_7505_structured(
        &self,
        crew_idx: usize,
        fixed: &[usize],
        candidate: &[usize],
        crew_id: &str,
        out: &mut Vec<String>,
    ) -> PyResult<()> {
        self.check_days_off_structured(
            crew_idx,
            fixed,
            candidate,
            crew_id,
            &self.days_off_rules,
            "7505",
            out,
        )
    }

    fn check_7507_structured(
        &self,
        crew_idx: usize,
        fixed: &[usize],
        candidate: &[usize],
        crew_id: &str,
        out: &mut Vec<String>,
    ) -> PyResult<()> {
        self.check_days_off_structured(
            crew_idx,
            fixed,
            candidate,
            crew_id,
            &self.days_off_rules_7507,
            "7507",
            out,
        )
    }

    fn check_days_off_structured(
        &self,
        crew_idx: usize,
        fixed: &[usize],
        candidate: &[usize],
        crew_id: &str,
        rule_rows: &[DaysOffRule],
        rule_tag: &str,
        out: &mut Vec<String>,
    ) -> PyResult<()> {
        let Some(rp_start_ord) = self.rp_start_ord else {
            return Ok(());
        };
        let Some(rp_end_ord) = self.rp_end_ord else {
            return Ok(());
        };
        if rp_end_ord < rp_start_ord {
            return Ok(());
        }

        let mut activities: Vec<Activity7505> = Vec::new();
        let mut pre_assigned: Vec<bool> = Vec::new();
        for (is_pre_assigned, slice) in [(true, fixed), (false, candidate)] {
            for &pi in slice {
                let pairing = &self.pairings[pi];
                let code = if pairing.assignment.is_empty() {
                    pairing.group.clone()
                } else {
                    pairing.assignment.clone()
                };
                let group = pairing.group.clone();
                let duty_slice = self.pairing_duty_slice(pi);
                if duty_slice.end > duty_slice.start
                    && duty_slice.end <= self.pairing_duty_start_utc.len()
                {
                    // One activity per duty so Count Layover can synthesize middle days.
                    for flat_idx in duty_slice {
                        let duty_end = self.pairing_duty_end_utc[flat_idx];
                        activities.push(Activity7505 {
                            code: code.clone(),
                            assignment_group: group.clone(),
                            start_utc: self.pairing_duty_start_utc[flat_idx],
                            end_utc: duty_end,
                            rest_start_utc: duty_end,
                            pairing_id: Some(pi as i64),
                        });
                        pre_assigned.push(is_pre_assigned);
                    }
                } else {
                    // No duty store: whole pairing span (Y cannot synthesize gaps).
                    activities.push(Activity7505 {
                        code,
                        assignment_group: group,
                        start_utc: pairing.start_utc,
                        end_utc: pairing.end_duty_utc,
                        rest_start_utc: pairing.end_including_rest_utc,
                        pairing_id: Some(pi as i64),
                    });
                    pre_assigned.push(is_pre_assigned);
                }
            }
        }
        for ground in self.crew_ground.get(crew_idx).into_iter().flatten() {
            activities.push(Activity7505 {
                code: ground.assignment.clone(),
                assignment_group: ground.group.clone(),
                start_utc: ground.start_utc,
                end_utc: ground.end_utc,
                rest_start_utc: ground.end_utc,
                pairing_id: None,
            });
            pre_assigned.push(true);
        }

        let mut rows: Vec<DaysOffRow> = Vec::new();
        let offset = self.crew_offset(crew_idx);
        let (rp_start_utc, rp_end_utc) =
            rp_ordinal_bounds_to_local_utc(rp_start_ord, rp_end_ord, offset);
        for rule in rule_rows {
            if self.days_off_scope_matches(crew_idx, rp_start_utc, rp_end_utc, rule)? {
                rows.push(rule.row.clone());
            }
        }
        if rows.is_empty() {
            return Ok(());
        }

        for violation in check_min_days_off_app(
            crew_id,
            &activities,
            rp_start_utc,
            rp_end_utc,
            self.crew_offset(crew_idx),
            &rows,
            self.do_start_grace.do_start_min,
            self.application,
            &pre_assigned,
        ) {
            out.push(format!(
                "{rule_tag}|rp_days={}|min_days_off={}|days_off={}|period={}|unit={}",
                (rp_end_ord - rp_start_ord) + 1,
                violation.min_do,
                violation.days_off,
                violation.period,
                violation.unit,
            ));
        }
        Ok(())
    }

    /// Rule 7505 MIN # GDOs (legacy scalar fallback): the roster period must contain
    /// at least `min_days_off` calendar days with no duty. A calendar day is
    /// "working" if any pairing covers it (start..=end UTC day, so layover/middle
    /// days count as working — COUNT LAYOVER=N). Optimizer PA-ignore: a shortfall
    /// already present with the fixed rosters alone is tolerated; the candidate is
    /// flagged only when it turns an otherwise-compliant period non-compliant.
    fn check_7505(
        &self,
        fixed: &[usize],
        candidate: &[usize],
        _crew_id: &str,
        out: &mut Vec<String>,
    ) {
        let (Some(rp0), Some(rp1), Some(min_off)) =
            (self.rp_start_ord, self.rp_end_ord, self.min_days_off)
        else {
            return;
        };
        if rp1 < rp0 {
            return;
        }
        let rp_len = rp1 - rp0 + 1;

        let working = |slices: &[&[usize]]| -> BTreeSet<i64> {
            let mut days: BTreeSet<i64> = BTreeSet::new();
            for slice in slices {
                for &pi in *slice {
                    let p = &self.pairings[pi];
                    let s = p.start_utc.div_euclid(SECONDS_PER_DAY).max(rp0);
                    let e = p.end_duty_utc.div_euclid(SECONDS_PER_DAY).min(rp1);
                    let mut d = s;
                    while d <= e {
                        days.insert(d);
                        d += 1;
                    }
                }
            }
            days
        };

        let working_fixed = working(&[fixed]).len() as i64;
        let working_all = working(&[fixed, candidate]).len() as i64;
        let off_fixed = rp_len - working_fixed;
        let off_all = rp_len - working_all;

        if self.application.is_optimizer() {
            // Candidate creates the violation only if fixed alone was compliant.
            if off_fixed >= min_off && off_all < min_off {
                out.push(format!(
                    "7505|rp_days={}|min_days_off={}|days_off={}",
                    rp_len, min_off, off_all,
                ));
            }
        } else if off_all < min_off {
            out.push(format!(
                "7505|rp_days={}|min_days_off={}|days_off={}",
                rp_len, min_off, off_all,
            ));
        }
    }

    /// Rule 7501 SDFD: each rolling PERIOD-hour window must contain >= MIN LIMITS
    /// single-days-free-from-duty. Optimizer PA-ignore (168/672 rows).
    ///
    /// Work list = pairings (fixed=PA, candidate=non-PA) + non-rest ground duties
    /// (PA=true). Mirrors C++ `WorkPeriod::GetWorkPeriods`: ground duties with
    /// `is_rest=true` (leave/off type: DO, VAC, GDO, ILL, …) are excluded; working
    /// ground duties (SBY/RES/SIM/OFC/…) are included as duty periods. The combined
    /// list is sorted by start_utc as required by `build_true_rest`.
    fn check_7501(
        &self,
        crew_idx: usize,
        crew_id: &str,
        line_duties: &[CrewLineDuty],
        out: &mut Vec<String>,
    ) {
        let (Some(lnd), Some((cs, ce))) = (self.local_night, self.checked_window) else {
            return;
        };
        if (self.sdfd_rows.is_empty() && self.sdfd_rule_rows.is_empty())
            || crew_idx >= self.crew_offset_min.len()
        {
            return;
        }
        let fallback = self.crew_offset(crew_idx);
        let mut work: Vec<WorkPeriod7501> = Vec::new();
        let mut pa: Vec<bool> = Vec::new();
        let mut work_duty_idx: Vec<usize> = Vec::new();

        for (idx, d) in line_duties.iter().enumerate() {
            if d.is_rest_ground {
                continue;
            }
            work.push(WorkPeriod7501 {
                pairing_id: d.pairing_idx.map(|pi| pi as i64),
                start_utc: d.start_utc,
                end_utc: d.end_utc,
            });
            pa.push(d.is_pre_assigned);
            work_duty_idx.push(idx);
        }

        if work.is_empty() {
            return;
        }

        let leading = line_duties
            .get(work_duty_idx[0])
            .map(|d| d.acc_offset_at_start(fallback))
            .unwrap_or(fallback);

        let duty_refs: Vec<AccDutyRef> = line_duties
            .iter()
            .map(|d| AccDutyRef {
                ref_tz_min: if d.is_acclimatised() {
                    d.ref_tz_min
                } else {
                    fallback
                },
                duty_end_ref_tz_min: if d.is_acclimatised() {
                    d.duty_end_ref_tz_min
                } else {
                    fallback
                },
            })
            .collect();

        if !self.sdfd_rule_rows.is_empty() {
            let context = Rule7501CrewContext {
                base_quals: self
                    .crew_base_quals
                    .get(crew_idx)
                    .into_iter()
                    .flatten()
                    .map(|(base, eff, exp)| BaseQual {
                        base: base.clone(),
                        eff_ord: (*eff >= 0).then_some(*eff),
                        exp_ord: (*exp >= 0).then_some(*exp),
                    })
                    .collect(),
                rank_quals: self
                    .crew_rank_quals
                    .get(crew_idx)
                    .into_iter()
                    .flatten()
                    .map(|(rank, eff, exp)| BaseQual {
                        base: rank.clone(),
                        eff_ord: (*eff >= 0).then_some(*eff),
                        exp_ord: (*exp >= 0).then_some(*exp),
                    })
                    .collect(),
                fleet_quals: self
                    .crew_fleet_quals
                    .get(crew_idx)
                    .into_iter()
                    .flatten()
                    .map(|(fleet, eff, exp)| BaseQual {
                        base: fleet.clone(),
                        eff_ord: (*eff >= 0).then_some(*eff),
                        exp_ord: (*exp >= 0).then_some(*exp),
                    })
                    .collect(),
                teams: self.crew_teams.get(crew_idx).cloned().unwrap_or_default(),
            };
            for row in &self.sdfd_rule_rows {
                let window_secs = row.period_hours * 3600;
                let last_work_end = work.iter().map(|w| w.end_utc).max().unwrap_or(0);
                let trailing_rest_end = last_work_end + window_secs;
                let scan_start = if cs >= window_secs {
                    cs - window_secs
                } else {
                    0
                };
                let rest_offsets = if line_duties.iter().any(|d| d.is_acclimatised()) {
                    Some(sdfd_rest_acc_offsets(
                        &work,
                        &duty_refs,
                        &work_duty_idx,
                        leading,
                        row.duty_end_buffer_secs,
                        scan_start,
                        trailing_rest_end,
                    ))
                } else {
                    None
                };
                if let Some(v) = check_rule7501_structured(
                    crew_id,
                    row,
                    &context,
                    fallback,
                    &lnd,
                    cs,
                    ce,
                    &work,
                    self.application,
                    &pa,
                    rest_offsets.as_deref(),
                    &[],
                    None,
                ) {
                    out.push(format!(
                        "7501|row_id={}|period_h={}|min_limits={}|sdfd={}|window_start={}",
                        row.row_id,
                        row.period_hours,
                        row.min_limits,
                        v.total_sdfd,
                        v.window_start_utc,
                    ));
                }
            }
            return;
        }

        for &(period_hours, min_limits) in &self.sdfd_rows {
            let window_secs = period_hours * 3600;
            let last_work_end = work.iter().map(|w| w.end_utc).max().unwrap_or(0);
            let trailing_rest_end = last_work_end + window_secs;
            let scan_start = if cs >= window_secs {
                cs - window_secs
            } else {
                0
            };
            let rest_offsets = if line_duties.iter().any(|d| d.is_acclimatised()) {
                Some(sdfd_rest_acc_offsets(
                    &work,
                    &duty_refs,
                    &work_duty_idx,
                    leading,
                    self.sdfd_buffer_secs,
                    scan_start,
                    trailing_rest_end,
                ))
            } else {
                None
            };
            if let Some(v) = check_sdfd_rolling_app(
                crew_id,
                &work,
                fallback,
                &lnd,
                period_hours,
                "RH",
                self.sdfd_buffer_secs,
                min_limits,
                cs,
                ce,
                self.application,
                &pa,
                rest_offsets.as_deref(),
                &[],
                None,
            ) {
                out.push(format!(
                    "7501|period_h={}|min_limits={}|sdfd={}|window_start={}",
                    period_hours, min_limits, v.total_sdfd, v.window_start_utc,
                ));
            }
        }
    }

    /// Rule 7508 calendar-day SDFD: each aligned crew-base-local calendar
    /// window must contain the configured number of complete free days.
    fn check_7508(
        &self,
        crew_idx: usize,
        crew_id: &str,
        line_duties: &[CrewLineDuty],
        out: &mut Vec<String>,
    ) {
        let (Some(lnd), Some((cs, ce))) = (self.local_night, self.checked_window) else {
            return;
        };
        if self.calendar_sdfd_rule_rows.is_empty()
            || crew_idx >= self.crew_offset_min.len()
            || line_duties.is_empty()
        {
            return;
        }

        let fallback = self.crew_offset(crew_idx);
        let work: Vec<WorkPeriod7508> = line_duties
            .iter()
            .map(|d| WorkPeriod7508 {
                pairing_id: d.pairing_idx.map(|pi| pi as i64),
                start_utc: d.start_utc,
                end_utc: d.end_utc,
                first_flight_departure_utc: d.first_flight_departure_utc,
                last_flight_arrival_utc: d.last_flight_arrival_utc,
                is_rest: d.is_rest_ground,
                is_pre_assigned: d.is_pre_assigned,
                start_ref_tz_min: if d.is_acclimatised() {
                    d.ref_tz_min
                } else {
                    i64::MIN
                },
                end_ref_tz_min: if d.is_acclimatised() {
                    d.duty_end_ref_tz_min
                } else {
                    i64::MIN
                },
            })
            .collect();

        let context = Rule7508CrewContext {
            base_quals: self
                .crew_base_quals
                .get(crew_idx)
                .into_iter()
                .flatten()
                .map(|(base, eff, exp)| BaseQual {
                    base: base.clone(),
                    eff_ord: (*eff >= 0).then_some(*eff),
                    exp_ord: (*exp >= 0).then_some(*exp),
                })
                .collect(),
            rank_quals: self
                .crew_rank_quals
                .get(crew_idx)
                .into_iter()
                .flatten()
                .map(|(rank, eff, exp)| BaseQual {
                    base: rank.clone(),
                    eff_ord: (*eff >= 0).then_some(*eff),
                    exp_ord: (*exp >= 0).then_some(*exp),
                })
                .collect(),
            fleet_quals: self
                .crew_fleet_quals
                .get(crew_idx)
                .into_iter()
                .flatten()
                .map(|(fleet, eff, exp)| BaseQual {
                    base: fleet.clone(),
                    eff_ord: (*eff >= 0).then_some(*eff),
                    exp_ord: (*exp >= 0).then_some(*exp),
                })
                .collect(),
            teams: self.crew_teams.get(crew_idx).cloned().unwrap_or_default(),
        };

        for row in &self.calendar_sdfd_rule_rows {
            if let Some(v) = check_rule7508_structured(
                crew_id,
                row,
                &context,
                fallback,
                &lnd,
                cs,
                ce,
                &work,
                self.application,
            ) {
                out.push(format!(
                    "7508|row_id={}|period_h={}|min_limits={}|sdfd={}|window_start={}",
                    row.row_id, row.period_hours, row.min_limits, v.total_sdfd, v.window_start_utc,
                ));
            }
        }
    }

    /// Rules 7503 (max consecutive WOCL) and 7504 (min spacing between WOCL flight
    /// duties). Reads rule 7500 state from each `CrewLineDuty`.
    fn check_wocl(
        &self,
        crew_idx: usize,
        crew_id: &str,
        line_duties: &[CrewLineDuty],
        out: &mut Vec<String>,
    ) -> PyResult<()> {
        if crew_idx >= self.crew_offset_min.len() {
            return Ok(());
        }
        let fallback = self.crew_offset(crew_idx);

        if self.is_enabled("7503") {
            if let Some(lnd) = self.local_night {
                let mut periods: Vec<WoclWorkPeriod> = Vec::new();
                let mut pre_assigned: Vec<bool> = Vec::new();
                for d in line_duties {
                    if d.is_ground {
                        pre_assigned.push(d.is_pre_assigned);
                        periods.push(WoclWorkPeriod {
                            pairing_id: None,
                            start_utc: d.start_utc,
                            end_utc: d.end_utc,
                            offset_min: d.acc_offset_at_start(fallback),
                            is_ground: true,
                        });
                    } else if let Some(pi) = d.pairing_idx {
                        pre_assigned.push(d.is_pre_assigned);
                        periods.push(WoclWorkPeriod {
                            pairing_id: Some(pi as i64),
                            start_utc: d.start_utc,
                            end_utc: d.end_utc,
                            offset_min: d.acc_offset_at_start(fallback),
                            is_ground: !d.is_fly,
                        });
                    }
                }
                let scope_day_ord = line_duties
                    .first()
                    .map(|d| {
                        (d.start_utc + d.acc_offset_at_start(fallback) * 60)
                            .div_euclid(SECONDS_PER_DAY)
                    })
                    .unwrap_or(0);
                if !self.wocl_rules.is_empty() {
                    for row in &self.wocl_rules {
                        if self.structured_scope_matches(
                            "7503",
                            crew_idx,
                            scope_day_ord,
                            &row.bases,
                            &row.ranks,
                            &row.fleets,
                            &row.teams,
                        )? {
                            for v in check_consecutive_wocl_app(
                                crew_id,
                                &periods,
                                row.wocl_window.0,
                                row.wocl_window.1,
                                row.max_consecutive,
                                &lnd,
                                self.application,
                                &pre_assigned,
                            ) {
                                out.push(format!(
                                    "7503|count={}|max={}|pairing={}",
                                    v.count, v.max_limit, v.pairing_id
                                ));
                            }
                        }
                    }
                } else if let (Some((wstart, wend)), Some(max_consec)) =
                    (self.wocl_window, self.max_consecutive_wocl)
                {
                    for v in check_consecutive_wocl_app(
                        crew_id,
                        &periods,
                        wstart,
                        wend,
                        max_consec,
                        &lnd,
                        self.application,
                        &pre_assigned,
                    ) {
                        out.push(format!(
                            "7503|count={}|max={}|pairing={}",
                            v.count, v.max_limit, v.pairing_id
                        ));
                    }
                }
            }
        }

        if self.is_enabled("7504") && !self.wocl_spacing_rules.is_empty() {
            self.check_structured_wocl(crew_idx, crew_id, line_duties, out)?;
        } else if self.is_enabled("7504") {
            let Some((wstart, wend)) = self.wocl_window else {
                return Ok(());
            };
            if let Some(min_h) = self.wocl_spacing_hours {
                let mut duties: Vec<WoclSpacingDuty> = Vec::new();
                let mut pre_assigned: Vec<bool> = Vec::new();
                for d in line_duties
                    .iter()
                    .filter(|d| d.pairing_idx.is_some() && d.is_fly)
                {
                    duties.push(WoclSpacingDuty {
                        pairing_id: d.pairing_idx.unwrap_or(0) as i64,
                        start_utc: d.start_utc,
                        end_utc: d.end_utc,
                        offset_min: d.acc_offset_at_start(fallback),
                    });
                    pre_assigned.push(d.is_pre_assigned);
                }
                for v in check_min_space_wocl_app(
                    crew_id,
                    &duties,
                    wstart,
                    wend,
                    min_h,
                    self.application,
                    &pre_assigned,
                ) {
                    out.push(format!(
                        "7504|gap_min={}|limit_min={}|pairing={}",
                        v.actual_minutes, v.limit_minutes, v.pairing_id
                    ));
                }
            }
        }
        Ok(())
    }

    /// Rule 7506 ONE CHECKIN PER DAY: at most one "checked" (FLY) roster may check
    /// in on a crew-local calendar day. Editor kernel; pre-existing tolerance via
    /// the Python baseline-diff. Uses the crew base offset for the end station.
    fn check_7506(
        &self,
        crew_idx: usize,
        fixed: &[usize],
        candidate: &[usize],
        crew_id: &str,
        out: &mut Vec<String>,
    ) -> PyResult<()> {
        if self.one_checkin_rules.is_empty() && self.one_checkin_groups.is_none() {
            return Ok(());
        }
        if crew_idx >= self.crew_offset_min.len() {
            return Ok(());
        }
        let offset = self.crew_offset_min[crew_idx];
        let mut idxs: Vec<usize> = fixed.iter().chain(candidate.iter()).copied().collect();
        idxs.sort_by_key(|&pi| self.pairings[pi].start_utc);
        let structured_assignments = !self.one_checkin_rules.is_empty();
        let mut rosters: Vec<CheckinRoster> = idxs
            .iter()
            .map(|&pi| {
                let p = &self.pairings[pi];
                CheckinRoster {
                    duty: if structured_assignments {
                        if p.assignment.is_empty() {
                            if p.group.is_empty() {
                                if p.is_fly {
                                    "FLY".to_string()
                                } else {
                                    "GND".to_string()
                                }
                            } else {
                                p.group.clone()
                            }
                        } else {
                            p.assignment.to_uppercase()
                        }
                    } else if p.group.is_empty() {
                        if p.is_fly {
                            "FLY".to_string()
                        } else {
                            "GND".to_string()
                        }
                    } else {
                        p.group.clone()
                    },
                    start_utc: p.start_utc,
                    rest_start_utc: p.end_duty_utc,
                    end_offset_min: offset,
                }
            })
            .collect();
        if let Some(grounds) = self.crew_ground.get(crew_idx) {
            for g in grounds {
                let duty = if !g.assignment.is_empty() {
                    g.assignment.to_uppercase()
                } else if !g.group.is_empty() {
                    g.group.to_uppercase()
                } else {
                    continue;
                };
                rosters.push(CheckinRoster {
                    duty,
                    start_utc: g.start_utc,
                    rest_start_utc: g.end_utc,
                    end_offset_min: offset,
                });
            }
        }
        let scope_day_ord = rosters
            .first()
            .map(|roster| (roster.start_utc + offset * 60).div_euclid(SECONDS_PER_DAY))
            .unwrap_or(0);
        if !self.one_checkin_rules.is_empty() {
            for row in &self.one_checkin_rules {
                if self.structured_scope_matches(
                    "7506",
                    crew_idx,
                    scope_day_ord,
                    &row.bases,
                    &row.ranks,
                    &row.fleets,
                    &row.teams,
                )? {
                    let raw = row.assignments.join("|");
                    for v in check_single_daily_checkin(crew_id, &rosters, &row.assignments, &raw) {
                        out.push(format!(
                            "7506|local_day_start={}|groups={}",
                            v.local_day_start_utc, v.checked_groups_raw
                        ));
                    }
                }
            }
        } else if let Some(groups) = &self.one_checkin_groups {
            let raw = groups.join("|");
            for v in check_single_daily_checkin(crew_id, &rosters, groups, &raw) {
                out.push(format!(
                    "7506|local_day_start={}|groups={}",
                    v.local_day_start_utc, v.checked_groups_raw
                ));
            }
        }
        Ok(())
    }

    /// Rule 8004 BASIC COMPETENCY (BASE): a roster's base must be covered by one of
    /// the crew's base-validity windows over the roster span. Optimizer PA-ignore.
    fn check_8004(
        &self,
        crew_idx: usize,
        fixed: &[usize],
        candidate: &[usize],
        crew_id: &str,
        out: &mut Vec<String>,
    ) {
        let Some(grace) = self.base_grace_days else {
            return;
        };
        if crew_idx >= self.crew_base_quals.len() {
            return;
        }
        let quals: Vec<BaseQual> = self.crew_base_quals[crew_idx]
            .iter()
            .map(|(base, eff, exp)| BaseQual {
                base: base.clone(),
                eff_ord: Some(*eff),
                exp_ord: Some(*exp),
            })
            .collect();
        if quals.is_empty() {
            return;
        }
        let mut rosters: Vec<BaseRoster> = Vec::new();
        let mut pa: Vec<bool> = Vec::new();
        // Crew's chronological activity chain (pairings + ground/SIM duties) for the
        // location-continuity exemption's chain-walk (see
        // rois_rule_engine::check_base_competency_app doc). Built from the same fixed +
        // candidate pairings checked above, plus the crew's ground duties (SIM sessions
        // etc.), since a real closed loop out of/back to base commonly threads through
        // non-flying ground activity.
        let mut activities: Vec<BaseActivity> = Vec::new();
        for (is_pa, slice) in [(true, fixed), (false, candidate)] {
            for &pi in slice {
                let p = &self.pairings[pi];
                rosters.push(BaseRoster {
                    pairing_id: pi as i64,
                    base: p.base.clone(),
                    start_ord: p.start_utc.div_euclid(SECONDS_PER_DAY),
                    end_ord: p.end_duty_utc.div_euclid(SECONDS_PER_DAY),
                });
                activities.push(BaseActivity {
                    pairing_id: Some(pi as i64),
                    start_utc: p.start_utc,
                    end_utc: p.end_duty_utc,
                    start_station: p.start_station.clone(),
                    end_station: p.end_station.clone(),
                });
                pa.push(is_pa);
            }
        }
        for g in self.crew_ground.get(crew_idx).into_iter().flatten() {
            activities.push(BaseActivity {
                pairing_id: None,
                start_utc: g.start_utc,
                end_utc: g.end_utc,
                start_station: g.station.clone(),
                end_station: g.station.clone(),
            });
        }
        for v in check_base_competency_app(
            crew_id,
            &rosters,
            &quals,
            grace,
            self.application,
            &pa,
            &activities,
        ) {
            out.push(format!("8004|pairing={}|base={}", v.pairing_id, v.base));
        }
    }

    /// Rule 8030 PILOT AGE: per physical flight (`flt_id`), at most `age_max_number` crew of
    /// `age_division` may be >= `age_limit` years old at flight start. Complement is
    /// the mutable flight COF (`crew_on_flight_8030`, including prior commits) plus
    /// the candidate when not already present. Same flt_id across pairings merges.
    fn check_8030(
        &self,
        crew_idx: usize,
        candidate: &[usize],
        crew_id: &str,
        out: &mut Vec<String>,
    ) {
        let Some(division) = &self.age_division else {
            return;
        };
        if crew_idx >= self.crew_division.len() {
            return;
        }
        let mut seen_flights = BTreeSet::new();
        let mut flights: Vec<AgeFlight> = Vec::new();
        for &pi in candidate {
            for &fi in &self.pairings[pi].flight_idxs {
                if !seen_flights.insert(fi) {
                    continue;
                }
                flights.push(self.age_flight_for_flight(fi, pi, crew_idx, crew_id));
            }
        }
        // Candidate flights are not entirely pre-assigned → checked.
        let pa = vec![false; flights.len()];
        for v in check_pilot_age_app(
            &flights,
            division,
            self.age_limit,
            self.age_max_number,
            self.application,
            &pa,
        ) {
            // Only surface breaches involving the candidate crew.
            if v.crew_id == crew_id {
                out.push(format!(
                    "8030|pairing={}|flight={}|age={}|limit={}|over_age_count={}",
                    v.pairing_id, v.flight_id, v.age_years, v.age_limit, v.over_age_count,
                ));
            }
        }
    }

    /// Build one AgeFlight for `flight_idx` from mutable COF + optional candidate on `pairing_idx`.
    fn age_flight_for_flight(
        &self,
        flight_idx: usize,
        pairing_idx: usize,
        crew_idx: usize,
        crew_id: &str,
    ) -> AgeFlight {
        let mut crew: Vec<FlightCrew> = self.crew_on_flight_8030[flight_idx]
            .iter()
            .filter(|&&j| j != crew_idx)
            .filter(|&&j| j < self.crew_division.len() && j < self.crew_birth_ord.len())
            .map(|&j| FlightCrew {
                crew_id: j.to_string(),
                division: self.crew_division[j].clone(),
                birth_ord: self.crew_birth_ord[j],
                pairing_id: 0,
            })
            .collect();
        if crew_idx < self.crew_division.len() && crew_idx < self.crew_birth_ord.len() {
            crew.push(FlightCrew {
                crew_id: crew_id.to_string(),
                division: self.crew_division[crew_idx].clone(),
                birth_ord: self.crew_birth_ord[crew_idx],
                pairing_id: pairing_idx as i64,
            });
        }
        AgeFlight {
            flight_id: self.flight_ids_8030[flight_idx],
            start_ord: self.flight_start_ord_8030[flight_idx],
            crew,
        }
    }

    fn format_8030_violations_for_candidate(
        &self,
        flights: &[AgeFlight],
        crew_id: &str,
    ) -> Vec<String> {
        let Some(division) = &self.age_division else {
            return Vec::new();
        };
        let pa = vec![false; flights.len()];
        let mut out = Vec::new();
        for v in check_pilot_age_app(
            flights,
            division,
            self.age_limit,
            self.age_max_number,
            self.application,
            &pa,
        ) {
            if v.crew_id == crew_id {
                out.push(format!(
                    "8030|pairing={}|flight={}|age={}|limit={}|over_age_count={}",
                    v.pairing_id, v.flight_id, v.age_years, v.age_limit, v.over_age_count,
                ));
            }
        }
        out
    }
}

fn preparse_dated_quals(n_crew: usize, rows: &[Vec<(String, i64, i64)>]) -> Vec<Vec<QualEntry>> {
    if rows.is_empty() {
        return vec![Vec::new(); n_crew];
    }
    rows.iter()
        .map(|crew| {
            crew.iter()
                .map(|(value, eff, exp)| qual_entry_from_ord(value.clone(), *eff, *exp))
                .collect()
        })
        .collect()
}

fn preparse_team_quals(n_crew: usize, teams: &[Vec<String>]) -> Vec<Vec<QualEntry>> {
    if teams.is_empty() {
        return vec![Vec::new(); n_crew];
    }
    teams
        .iter()
        .map(|crew| crew.iter().cloned().map(team_qual_entry).collect())
        .collect()
}

impl Engine {
    fn crew_id_7509(&self, crew_idx: usize) -> String {
        self.crew_ids
            .get(crew_idx)
            .cloned()
            .unwrap_or_else(|| crew_idx.to_string())
    }

    fn format_7509_violations_for_candidate(
        &self,
        crew_idx: usize,
        pairing_idxs: &[usize],
    ) -> Vec<String> {
        let crew_id = self.crew_id_7509(crew_idx);
        if !self
            .avoid_co_pairing_rules
            .iter()
            .any(|rule| rule.crew_a == crew_id || rule.crew_b == crew_id)
        {
            return Vec::new();
        }
        let mut out = Vec::new();
        for &pairing_idx in pairing_idxs {
            let pairing = &self.pairings[pairing_idx];
            for &flight_idx in &pairing.flight_idxs {
                let mut members = self.crew_on_flight_7509[flight_idx].clone();
                members.push(Rule7509Member {
                    flight_id: self.flight_ids_8030[flight_idx],
                    crew_id: crew_id.clone(),
                    pairing_id: pairing_idx as i64,
                    pairing_start_utc: pairing.start_utc,
                    pairing_end_utc: pairing.end_duty_utc,
                    source_is_pa: false,
                });
                for violation in
                    check_avoid_co_pairing(&self.avoid_co_pairing_rules, &members, self.application)
                {
                    if violation.crew_id == crew_id && violation.pairing_id == pairing_idx as i64 {
                        out.push(format!(
                            "7509|row={}|crew={}|paired_crew={}|pairing={}|flight={}",
                            violation.param_index,
                            violation.crew_id,
                            violation.paired_crew_id,
                            violation.pairing_id,
                            violation.flight_id,
                        ));
                    }
                }
            }
        }
        out.sort();
        out.dedup();
        out
    }

    fn crew_id_7510(&self, crew_idx: usize) -> String {
        self.crew_ids
            .get(crew_idx)
            .cloned()
            .unwrap_or_else(|| crew_idx.to_string())
    }

    fn rows_7510_for_pairings(
        &self,
        crew_idx: usize,
        pairing_idxs: &[usize],
    ) -> Vec<Rule7510CrewFlight> {
        let crew_id = self.crew_id_7510(crew_idx);
        let mut rows = Vec::new();
        for &pairing_idx in pairing_idxs {
            let Some(pairing) = self.pairings.get(pairing_idx) else {
                continue;
            };
            for &segment_idx in self
                .pairing_to_8072_segments
                .get(pairing_idx)
                .map(Vec::as_slice)
                .unwrap_or(&[])
            {
                let Some(segment) = self.segments_8072.get(segment_idx) else {
                    continue;
                };
                let day_ord = segment.start_utc.div_euclid(SECONDS_PER_DAY);
                rows.push(Rule7510CrewFlight {
                    crew_id: crew_id.clone(),
                    flight_id: segment.flight_id,
                    pairing_id: pairing_idx as i64,
                    duty_seq: segment.duty_seq,
                    seg_seq: segment.seg_seq,
                    start_utc: segment.start_utc,
                    end_utc: segment.end_utc,
                    bases: active_7510_qual_values(&self.crew_base_quals, crew_idx, day_ord),
                    ranks: active_7510_qual_values(&self.crew_rank_quals, crew_idx, day_ord),
                    fleets: active_7510_qual_values(&self.crew_fleet_quals, crew_idx, day_ord),
                    teams: active_7510_team_values(
                        &self.crew_team_quals,
                        &self.crew_teams,
                        crew_idx,
                        segment.start_utc,
                        segment.end_utc,
                    ),
                    attributes: if segment.attributes.is_empty() {
                        split_pipe_or_star(&pairing.attributes)
                    } else {
                        segment.attributes.clone()
                    },
                    assignment: segment.assignment.clone(),
                    assignment_group: segment.assignment_group.clone(),
                });
            }
        }
        rows
    }

    fn rows_7510_for_lines(&self, lines: &[(usize, Vec<usize>)]) -> Vec<Rule7510CrewFlight> {
        let candidates: BTreeMap<usize, &[usize]> = lines
            .iter()
            .map(|(crew_idx, pairing_idxs)| (*crew_idx, pairing_idxs.as_slice()))
            .collect();
        let mut rows = Vec::new();

        for crew_idx in 0..self.crew_fixed.len() {
            let mut pairing_idxs = self.crew_fixed[crew_idx].clone();
            if let Some(extra) = candidates.get(&crew_idx) {
                pairing_idxs.extend(extra.iter().copied());
            }
            let mut crew_rows = self
                .crew_7510_seed_rows
                .get(crew_idx)
                .cloned()
                .unwrap_or_default();
            crew_rows.extend(self.rows_7510_for_pairings(crew_idx, &pairing_idxs));
            rows.extend(crew_rows);
        }

        rows
    }

    fn rows_7510_for_pairing_state(&self, pairing_state: &[Vec<usize>]) -> Vec<Rule7510CrewFlight> {
        let mut rows = Vec::new();
        for crew_idx in 0..self.crew_fixed.len() {
            let mut crew_rows = self
                .crew_7510_seed_rows
                .get(crew_idx)
                .cloned()
                .unwrap_or_default();
            crew_rows.extend(
                self.rows_7510_for_pairings(
                    crew_idx,
                    pairing_state
                        .get(crew_idx)
                        .map(Vec::as_slice)
                        .unwrap_or(&[]),
                ),
            );
            rows.extend(crew_rows);
        }
        rows
    }

    fn format_7510_violation(violation: &Rule7510Violation, param: &Rule7510Param) -> String {
        format!(
            "7510|row={}|flight={}|crew={}|count={}|min={}|max={}|over={}",
            violation.row_index,
            violation.flight_id,
            violation.crew_id,
            violation.actual_count,
            param.min_limits,
            param.max_limits,
            violation.over_max,
        )
    }
}

#[pymethods]
impl Engine {
    /// Construct from parallel arrays (one entry per dense pairing index) plus the
    /// crew fixed-roster indices and rule params. Empty args build an empty store
    /// with all rules disabled — preserves the bare `Engine()` contract.
    #[new]
    #[pyo3(signature = (
        pairing_start_utc = Vec::new(),
        pairing_end_utc = Vec::new(),
        pairing_blk_min = Vec::new(),
        crew_fixed_pairings = Vec::new(),
        crew_ids = Vec::new(),
        block_bands = Vec::new(),
        pairing_is_fly = Vec::new(),
        pairing_label = Vec::new(),
        spacing_hours = None,
        rp_start_ord = None,
        rp_end_ord = None,
        min_days_off = None,
        days_off_rules = Vec::new(),
        days_off_rules_7507 = Vec::new(),
        pairing_dp_min = Vec::new(),
        crew_offset_min = Vec::new(),
        local_night = None,
        sdfd_rows = Vec::new(),
        sdfd_rule_rows = Vec::new(),
        calendar_sdfd_rule_rows = Vec::new(),
        sdfd_buffer_secs = 0,
        checked_window = None,
        wocl_window = None,
        max_consecutive_wocl = None,
        wocl_rules = Vec::new(),
        wocl_spacing_hours = None,
        wocl_spacing_rules = Vec::new(),
        acc_stay_period_rows = Vec::new(),
        acc_stay_per_min = None,
        acc_adjust_min = None,
        pairing_dep_tz_min = Vec::new(),
        pairing_arr_tz_min = Vec::new(),
        pairing_duty_offsets = Vec::new(),
        pairing_duty_start_utc = Vec::new(),
        pairing_duty_end_utc = Vec::new(),
        pairing_duty_first_flight_departure_utc = Vec::new(),
        pairing_duty_last_flight_arrival_utc = Vec::new(),
        pairing_duty_dep_tz_min = Vec::new(),
        pairing_duty_arr_tz_min = Vec::new(),
        pairing_duty_dp_min = Vec::new(),
        pairing_duty_blk_min = Vec::new(),
        pairing_duty_dp_pct = Vec::new(),
        pairing_seg_offsets = Vec::new(),
        pairing_seg_std_utc = Vec::new(),
        pairing_seg_sta_utc = Vec::new(),
        pairing_seg_blk_min = Vec::new(),
        pairing_seg_crew_offset_min = Vec::new(),
        pairing_seg_crew_sta_offset_min = Vec::new(),
        pairing_duty_crew_offset_min = Vec::new(),
        crew_ground_tz_min = Vec::new(),
        one_checkin_groups = None,
        one_checkin_rules = Vec::new(),
        pairing_base = Vec::new(),
        pairing_start_station = Vec::new(),
        pairing_end_station = Vec::new(),
        crew_base_quals = Vec::new(),
        base_grace_days = None,
        crew_division = Vec::new(),
        crew_birth_ord = Vec::new(),
        age_division = None,
        age_limit = 65,
        age_max_number = 1,
        crew_ground_start = Vec::new(),
        crew_ground_end = Vec::new(),
        crew_ground_assignment = Vec::new(),
        crew_ground_group = Vec::new(),
        crew_ground_is_rest = Vec::new(),
        crew_ground_type = Vec::new(),
        crew_ground_station = Vec::new(),
        overlap_rules = Vec::new(),
        spacing_rules = Vec::new(),
        spacing_rule_rows = Vec::new(),
        crew_teams = Vec::new(),
        crew_team_quals = Vec::new(),
        pairing_assignment_group = Vec::new(),
        pairing_assignment = Vec::new(),
        pairing_attributes = Vec::new(),
        pairing_assignment_type = Vec::new(),
        pairing_qualifier = Vec::new(),
        pairing_airport = Vec::new(),
        pairing_role = Vec::new(),
        pairing_is_requested = Vec::new(),
        pairing_location = Vec::new(),
        pairing_end_including_rest_utc = Vec::new(),
        application = "optimizer".to_string(),
        enabled_functions = Vec::new(),
        crew_daily_baseline = Vec::new(),
        cum_rules = Vec::new(),
        crew_rank_quals = Vec::new(),
        crew_fleet_quals = Vec::new(),
        crew_daily_metrics = Vec::new(),
        roster_periods = Vec::new(),
        scenario_window = None,
        weekday_start_from = "SUN".to_string(),
        pairing_duty_credit_min = Vec::new(),
        roster_property_rule_rows = Vec::new(),
        min_qual_rule_rows = Vec::new(),
        pairing_8072_segments = Vec::new(),
        crew_qualification_sets = Vec::new(),
        crew_nationality = Vec::new(),
        rule7305_rows = Vec::new(),
        crew_position_quals = Vec::new(),
        rule7305_assignment_groups = Vec::new(),
        do_start_min = 0,
        do_start_assignments = None,
        do_start_groups = None,
        cof_flight_crew = Vec::new(),
        rule7509_rows = Vec::new(),
        cof_flight_members_7509 = Vec::new(),
        cof_flight_7510_rows = Vec::new(),
        rule7510_rows = Vec::new(),
    ))]
    #[allow(clippy::too_many_arguments)]
    fn new(
        pairing_start_utc: Vec<i64>,
        pairing_end_utc: Vec<i64>,
        pairing_blk_min: Vec<i64>,
        crew_fixed_pairings: Vec<Vec<i64>>,
        crew_ids: Vec<String>,
        block_bands: Vec<(i64, f64)>,
        pairing_is_fly: Vec<bool>,
        pairing_label: Vec<String>,
        spacing_hours: Option<f64>,
        rp_start_ord: Option<i64>,
        rp_end_ord: Option<i64>,
        min_days_off: Option<i64>,
        days_off_rules: Vec<DaysOffRuleInput>,
        days_off_rules_7507: Vec<DaysOffRuleInput7507>,
        pairing_dp_min: Vec<i64>,
        crew_offset_min: Vec<i64>,
        local_night: Option<(i64, i64, i64)>,
        sdfd_rows: Vec<(i64, i64)>,
        sdfd_rule_rows: Vec<SdfdRuleInput>,
        calendar_sdfd_rule_rows: Vec<CalendarSdfdRuleInput>,
        sdfd_buffer_secs: i64,
        checked_window: Option<(i64, i64)>,
        wocl_window: Option<(i64, i64)>,
        max_consecutive_wocl: Option<i64>,
        #[allow(clippy::type_complexity)] wocl_rules: Vec<WoclRuleInput>,
        wocl_spacing_hours: Option<i64>,
        #[allow(clippy::type_complexity)] wocl_spacing_rules: Vec<WoclSpacingRuleInput>,
        acc_stay_period_rows: Vec<(i64, i64, i64, i64)>,
        acc_stay_per_min: Option<i64>,
        acc_adjust_min: Option<i64>,
        pairing_dep_tz_min: Vec<i64>,
        pairing_arr_tz_min: Vec<i64>,
        pairing_duty_offsets: Vec<i64>,
        pairing_duty_start_utc: Vec<i64>,
        pairing_duty_end_utc: Vec<i64>,
        pairing_duty_first_flight_departure_utc: Vec<i64>,
        pairing_duty_last_flight_arrival_utc: Vec<i64>,
        pairing_duty_dep_tz_min: Vec<i64>,
        pairing_duty_arr_tz_min: Vec<i64>,
        pairing_duty_dp_min: Vec<i64>,
        pairing_duty_blk_min: Vec<i64>,
        pairing_duty_dp_pct: Vec<f64>,
        pairing_seg_offsets: Vec<i64>,
        pairing_seg_std_utc: Vec<i64>,
        pairing_seg_sta_utc: Vec<i64>,
        pairing_seg_blk_min: Vec<i64>,
        pairing_seg_crew_offset_min: Vec<Vec<i64>>,
        pairing_seg_crew_sta_offset_min: Vec<Vec<i64>>,
        pairing_duty_crew_offset_min: Vec<Vec<i64>>,
        crew_ground_tz_min: Vec<Vec<i64>>,
        one_checkin_groups: Option<Vec<String>>,
        #[allow(clippy::type_complexity)] one_checkin_rules: Vec<OneCheckinRuleInput>,
        pairing_base: Vec<String>,
        pairing_start_station: Vec<String>,
        pairing_end_station: Vec<String>,
        crew_base_quals: Vec<Vec<(String, i64, i64)>>,
        base_grace_days: Option<i64>,
        crew_division: Vec<String>,
        crew_birth_ord: Vec<i64>,
        age_division: Option<String>,
        age_limit: i64,
        age_max_number: i64,
        crew_ground_start: Vec<Vec<i64>>,
        crew_ground_end: Vec<Vec<i64>>,
        crew_ground_assignment: Vec<Vec<String>>,
        crew_ground_group: Vec<Vec<String>>,
        crew_ground_is_rest: Vec<Vec<bool>>,
        crew_ground_type: Vec<Vec<String>>,
        crew_ground_station: Vec<Vec<String>>,
        overlap_rules: Vec<(
            Vec<String>,
            Vec<String>,
            bool,
            Vec<String>,
            Vec<String>,
            Vec<String>,
            Vec<String>,
        )>,
        spacing_rules: Vec<(Vec<String>, Vec<String>, Vec<String>, Vec<String>, f64)>,
        spacing_rule_rows: Vec<HashMap<String, String>>,
        crew_teams: Vec<Vec<String>>,
        crew_team_quals: Vec<Vec<(String, i64, i64)>>,
        pairing_assignment_group: Vec<String>,
        pairing_assignment: Vec<String>,
        pairing_attributes: Vec<String>,
        pairing_assignment_type: Vec<String>,
        pairing_qualifier: Vec<String>,
        pairing_airport: Vec<String>,
        pairing_role: Vec<String>,
        pairing_is_requested: Vec<bool>,
        pairing_location: Vec<String>,
        pairing_end_including_rest_utc: Vec<i64>,
        application: String,
        enabled_functions: Vec<String>,
        crew_daily_baseline: Vec<Vec<(i64, f64)>>,
        // One 8002 row = nested tuple (PyO3 tuple arity caps at 12):
        //   ((bases, ranks, fleets, teams),               — pipe-split qual lists
        //    (period, unit, max_min, min_min, type),      — window + limits
        //    (int_lo, int_hi, aug_lo, aug_hi, aloft_lo, aloft_hi),  — (-1,-1) = "*"
        //    has_sby_or_fly,                              — -1=*, 0=N, 1=Y
        //    reduction_min_per_duty)
        #[allow(clippy::type_complexity)] cum_rules: Vec<(
            (Vec<String>, Vec<String>, Vec<String>, Vec<String>),
            (i64, String, i64, i64, String),
            (i64, i64, i64, i64, i64, i64),
            i64,
            i64,
        )>,
        crew_rank_quals: Vec<Vec<(String, i64, i64)>>,
        crew_fleet_quals: Vec<Vec<(String, i64, i64)>>,
        crew_daily_metrics: Vec<Vec<(i64, Vec<f64>)>>,
        roster_periods: Vec<(i64, i64)>,
        scenario_window: Option<(i64, i64)>,
        weekday_start_from: String,
        pairing_duty_credit_min: Vec<i64>,
        roster_property_rule_rows: Vec<HashMap<String, String>>,
        min_qual_rule_rows: Vec<HashMap<String, String>>,
        pairing_8072_segments: Vec<HashMap<String, String>>,
        crew_qualification_sets: Vec<Vec<String>>,
        crew_nationality: Vec<String>,
        rule7305_rows: Vec<Vec<String>>,
        crew_position_quals: Vec<Vec<(String, i64, i64)>>,
        rule7305_assignment_groups: Vec<(String, String)>,
        do_start_min: i64,
        do_start_assignments: Option<String>,
        do_start_groups: Option<String>,
        // (flight_id, crew_idx) from CrewOnFlight — seeds 8030 + 8072 mutable COF.
        cof_flight_crew: Vec<(i64, i64)>,
        rule7509_rows: Vec<(String, String, String, String)>,
        cof_flight_members_7509: Vec<(i64, i64, i64, i64, i64, bool)>,
        cof_flight_7510_rows: Vec<HashMap<String, String>>,
        rule7510_rows: Vec<HashMap<String, String>>,
    ) -> PyResult<Self> {
        let application = parse_application(&application)?;
        let n = pairing_start_utc.len();
        if !crew_ids.is_empty() && crew_ids.len() != crew_fixed_pairings.len() {
            return Err(PyValueError::new_err(format!(
                "crew_ids must be empty or length {} (crews), got {}",
                crew_fixed_pairings.len(),
                crew_ids.len()
            )));
        }

        // Inject extras stored by set_next_engine_extras() (if called before this Engine
        // construction). Must happen before the i64→usize offset conversion and validation
        // so the existing checks see the correct values. Only fills empty defaults.
        let (
            pairing_duty_offsets,
            pairing_duty_start_utc,
            pairing_duty_end_utc,
            pairing_duty_first_flight_departure_utc,
            pairing_duty_last_flight_arrival_utc,
            pairing_duty_dep_tz_min,
            pairing_duty_arr_tz_min,
            pairing_duty_dp_min,
            pairing_duty_blk_min,
            pairing_duty_dp_pct,
            pairing_duty_crew_offset_min,
            pairing_seg_offsets,
            pairing_seg_std_utc,
            pairing_seg_sta_utc,
            pairing_seg_blk_min,
            pairing_seg_crew_offset_min,
            pairing_seg_crew_sta_offset_min,
            crew_daily_baseline,
            crew_ground_is_rest,
            crew_daily_metrics,
            pairing_duty_credit_min,
            extras_do_start,
            extras_do_start_assignments,
            extras_do_start_groups,
        ) = match NEXT_EXTRAS.lock().unwrap().take() {
            Some(e) => (
                if pairing_duty_offsets.is_empty() {
                    e.pairing_duty_offsets
                } else {
                    pairing_duty_offsets
                },
                if pairing_duty_start_utc.is_empty() {
                    e.pairing_duty_start_utc
                } else {
                    pairing_duty_start_utc
                },
                if pairing_duty_end_utc.is_empty() {
                    e.pairing_duty_end_utc
                } else {
                    pairing_duty_end_utc
                },
                if pairing_duty_first_flight_departure_utc.is_empty() {
                    e.pairing_duty_first_flight_departure_utc
                } else {
                    pairing_duty_first_flight_departure_utc
                },
                if pairing_duty_last_flight_arrival_utc.is_empty() {
                    e.pairing_duty_last_flight_arrival_utc
                } else {
                    pairing_duty_last_flight_arrival_utc
                },
                if pairing_duty_dep_tz_min.is_empty() {
                    e.pairing_duty_dep_tz_min
                } else {
                    pairing_duty_dep_tz_min
                },
                if pairing_duty_arr_tz_min.is_empty() {
                    e.pairing_duty_arr_tz_min
                } else {
                    pairing_duty_arr_tz_min
                },
                if pairing_duty_dp_min.is_empty() {
                    e.pairing_duty_dp_min
                } else {
                    pairing_duty_dp_min
                },
                if pairing_duty_blk_min.is_empty() {
                    e.pairing_duty_blk_min
                } else {
                    pairing_duty_blk_min
                },
                if pairing_duty_dp_pct.is_empty() {
                    e.pairing_duty_dp_pct
                } else {
                    pairing_duty_dp_pct
                },
                if pairing_duty_crew_offset_min.is_empty() {
                    e.pairing_duty_crew_offset_min
                } else {
                    pairing_duty_crew_offset_min
                },
                if pairing_seg_offsets.is_empty() {
                    e.pairing_seg_offsets
                } else {
                    pairing_seg_offsets
                },
                if pairing_seg_std_utc.is_empty() {
                    e.pairing_seg_std_utc
                } else {
                    pairing_seg_std_utc
                },
                if pairing_seg_sta_utc.is_empty() {
                    e.pairing_seg_sta_utc
                } else {
                    pairing_seg_sta_utc
                },
                if pairing_seg_blk_min.is_empty() {
                    e.pairing_seg_blk_min
                } else {
                    pairing_seg_blk_min
                },
                if pairing_seg_crew_offset_min.is_empty() {
                    e.pairing_seg_crew_offset_min
                } else {
                    pairing_seg_crew_offset_min
                },
                if pairing_seg_crew_sta_offset_min.is_empty() {
                    e.pairing_seg_crew_sta_offset_min
                } else {
                    pairing_seg_crew_sta_offset_min
                },
                if crew_daily_baseline.is_empty() {
                    e.crew_daily_baseline
                } else {
                    crew_daily_baseline
                },
                if crew_ground_is_rest.is_empty() {
                    e.crew_ground_is_rest
                } else {
                    crew_ground_is_rest
                },
                if crew_daily_metrics.is_empty() {
                    e.crew_daily_metrics
                } else {
                    crew_daily_metrics
                },
                if pairing_duty_credit_min.is_empty() {
                    e.pairing_duty_credit_min
                } else {
                    pairing_duty_credit_min
                },
                e.do_start_min,
                e.do_start_assignments,
                e.do_start_groups,
            ),
            None => (
                pairing_duty_offsets,
                pairing_duty_start_utc,
                pairing_duty_end_utc,
                pairing_duty_first_flight_departure_utc,
                pairing_duty_last_flight_arrival_utc,
                pairing_duty_dep_tz_min,
                pairing_duty_arr_tz_min,
                pairing_duty_dp_min,
                pairing_duty_blk_min,
                pairing_duty_dp_pct,
                pairing_duty_crew_offset_min,
                pairing_seg_offsets,
                pairing_seg_std_utc,
                pairing_seg_sta_utc,
                pairing_seg_blk_min,
                pairing_seg_crew_offset_min,
                pairing_seg_crew_sta_offset_min,
                crew_daily_baseline,
                crew_ground_is_rest,
                crew_daily_metrics,
                pairing_duty_credit_min,
                None,
                None,
                None,
            ),
        };
        let resolved_do_start_grace = build_do_start_grace(
            extras_do_start.unwrap_or(do_start_min),
            extras_do_start_assignments
                .as_deref()
                .or(do_start_assignments.as_deref()),
            extras_do_start_groups
                .as_deref()
                .or(do_start_groups.as_deref()),
        );

        if pairing_end_utc.len() != n || pairing_blk_min.len() != n {
            return Err(PyValueError::new_err(format!(
                "pairing_* arrays must be equal length: starts={}, ends={}, blk={}",
                n,
                pairing_end_utc.len(),
                pairing_blk_min.len(),
            )));
        }
        if !pairing_is_fly.is_empty() && pairing_is_fly.len() != n {
            return Err(PyValueError::new_err(format!(
                "pairing_is_fly must be empty or length {n}, got {}",
                pairing_is_fly.len()
            )));
        }
        if !pairing_label.is_empty() && pairing_label.len() != n {
            return Err(PyValueError::new_err(format!(
                "pairing_label must be empty or length {n}, got {}",
                pairing_label.len()
            )));
        }
        if !pairing_dp_min.is_empty() && pairing_dp_min.len() != n {
            return Err(PyValueError::new_err(format!(
                "pairing_dp_min must be empty or length {n}, got {}",
                pairing_dp_min.len()
            )));
        }
        if !pairing_base.is_empty() && pairing_base.len() != n {
            return Err(PyValueError::new_err(format!(
                "pairing_base must be empty or length {n}, got {}",
                pairing_base.len()
            )));
        }
        if !pairing_start_station.is_empty() && pairing_start_station.len() != n {
            return Err(PyValueError::new_err(format!(
                "pairing_start_station must be empty or length {n}, got {}",
                pairing_start_station.len()
            )));
        }
        if !pairing_end_station.is_empty() && pairing_end_station.len() != n {
            return Err(PyValueError::new_err(format!(
                "pairing_end_station must be empty or length {n}, got {}",
                pairing_end_station.len()
            )));
        }
        if !pairing_assignment_type.is_empty() && pairing_assignment_type.len() != n {
            return Err(PyValueError::new_err(format!(
                "pairing_assignment_type must be empty or length {n}, got {}",
                pairing_assignment_type.len()
            )));
        }
        if !pairing_assignment.is_empty() && pairing_assignment.len() != n {
            return Err(PyValueError::new_err(format!(
                "pairing_assignment must be empty or length {n}, got {}",
                pairing_assignment.len()
            )));
        }
        if !pairing_attributes.is_empty() && pairing_attributes.len() != n {
            return Err(PyValueError::new_err(format!(
                "pairing_attributes must be empty or length {n}, got {}",
                pairing_attributes.len()
            )));
        }
        for (name, values) in [
            ("pairing_qualifier", pairing_qualifier.len()),
            ("pairing_airport", pairing_airport.len()),
            ("pairing_role", pairing_role.len()),
            ("pairing_is_requested", pairing_is_requested.len()),
            ("pairing_location", pairing_location.len()),
        ] {
            if values != 0 && values != n {
                return Err(PyValueError::new_err(format!(
                    "{name} must be empty or length {n}, got {values}"
                )));
            }
        }
        if !pairing_end_including_rest_utc.is_empty() && pairing_end_including_rest_utc.len() != n {
            return Err(PyValueError::new_err(format!(
                "pairing_end_including_rest_utc must be empty or length {n}, got {}",
                pairing_end_including_rest_utc.len()
            )));
        }
        if !crew_teams.is_empty() && crew_teams.len() != crew_fixed_pairings.len() {
            return Err(PyValueError::new_err(format!(
                "crew_teams must be empty or length {} (crews), got {}",
                crew_fixed_pairings.len(),
                crew_teams.len()
            )));
        }
        if !crew_team_quals.is_empty() && crew_team_quals.len() != crew_fixed_pairings.len() {
            return Err(PyValueError::new_err(format!(
                "crew_team_quals must be empty or length {} (crews), got {}",
                crew_fixed_pairings.len(),
                crew_team_quals.len()
            )));
        }
        if !crew_qualification_sets.is_empty()
            && crew_qualification_sets.len() != crew_fixed_pairings.len()
        {
            return Err(PyValueError::new_err(format!(
                "crew_qualification_sets must be empty or length {} (crews), got {}",
                crew_fixed_pairings.len(),
                crew_qualification_sets.len()
            )));
        }
        if !crew_nationality.is_empty() && crew_nationality.len() != crew_fixed_pairings.len() {
            return Err(PyValueError::new_err(format!(
                "crew_nationality must be empty or length {} (crews), got {}",
                crew_fixed_pairings.len(),
                crew_nationality.len()
            )));
        }
        if !pairing_dep_tz_min.is_empty() && pairing_dep_tz_min.len() != n {
            return Err(PyValueError::new_err(format!(
                "pairing_dep_tz_min must be empty or length {n}, got {}",
                pairing_dep_tz_min.len()
            )));
        }
        if !pairing_arr_tz_min.is_empty() && pairing_arr_tz_min.len() != n {
            return Err(PyValueError::new_err(format!(
                "pairing_arr_tz_min must be empty or length {n}, got {}",
                pairing_arr_tz_min.len()
            )));
        }
        let pairing_duty_offsets: Vec<usize> = pairing_duty_offsets
            .into_iter()
            .map(|x| if x < 0 { 0usize } else { x as usize })
            .collect();
        if !pairing_duty_offsets.is_empty() && pairing_duty_offsets.len() != n + 1 {
            return Err(PyValueError::new_err(format!(
                "pairing_duty_offsets must be empty or length {} (pairings+1), got {}",
                n + 1,
                pairing_duty_offsets.len()
            )));
        }
        let pd_total = pairing_duty_offsets.last().copied().unwrap_or(0);
        for (name, arr) in [
            ("pairing_duty_start_utc", pairing_duty_start_utc.len()),
            ("pairing_duty_end_utc", pairing_duty_end_utc.len()),
            ("pairing_duty_dep_tz_min", pairing_duty_dep_tz_min.len()),
            ("pairing_duty_arr_tz_min", pairing_duty_arr_tz_min.len()),
        ] {
            if !pairing_duty_offsets.is_empty() && arr != pd_total {
                return Err(PyValueError::new_err(format!(
                    "{name} length {arr} != pairing duty count {pd_total}"
                )));
            }
        }
        for (name, arr) in [
            (
                "pairing_duty_first_flight_departure_utc",
                pairing_duty_first_flight_departure_utc.len(),
            ),
            (
                "pairing_duty_last_flight_arrival_utc",
                pairing_duty_last_flight_arrival_utc.len(),
            ),
        ] {
            if arr != 0 && arr != pd_total {
                return Err(PyValueError::new_err(format!(
                    "{name} length {arr} != pairing duty count {pd_total}"
                )));
            }
        }
        if pairing_duty_dp_min.len() != 0 && pairing_duty_dp_min.len() != pd_total {
            return Err(PyValueError::new_err(format!(
                "pairing_duty_dp_min length {} != pairing duty count {pd_total}",
                pairing_duty_dp_min.len()
            )));
        }
        if !pairing_duty_blk_min.is_empty() && pairing_duty_blk_min.len() != pd_total {
            return Err(PyValueError::new_err(format!(
                "pairing_duty_blk_min length {} != pairing duty count {pd_total}",
                pairing_duty_blk_min.len()
            )));
        }
        if pairing_duty_dp_pct.len() != 0 && pairing_duty_dp_pct.len() != pd_total {
            return Err(PyValueError::new_err(format!(
                "pairing_duty_dp_pct length {} != pairing duty count {pd_total}",
                pairing_duty_dp_pct.len()
            )));
        }
        let pairing_seg_offsets: Vec<usize> = pairing_seg_offsets
            .into_iter()
            .map(|x| if x < 0 { 0usize } else { x as usize })
            .collect();
        if !pairing_seg_offsets.is_empty() && pairing_seg_offsets.len() != n + 1 {
            return Err(PyValueError::new_err(format!(
                "pairing_seg_offsets must be empty or length {} (pairings+1), got {}",
                n + 1,
                pairing_seg_offsets.len()
            )));
        }
        let ps_total = pairing_seg_offsets.last().copied().unwrap_or(0);
        for (name, arr) in [
            ("pairing_seg_std_utc", pairing_seg_std_utc.len()),
            ("pairing_seg_blk_min", pairing_seg_blk_min.len()),
        ] {
            if !pairing_seg_offsets.is_empty() && arr != ps_total {
                return Err(PyValueError::new_err(format!(
                    "{name} length {arr} != segment count {ps_total}"
                )));
            }
        }
        if !pairing_seg_sta_utc.is_empty() && pairing_seg_sta_utc.len() != ps_total {
            return Err(PyValueError::new_err(format!(
                "pairing_seg_sta_utc length {} != segment count {ps_total}",
                pairing_seg_sta_utc.len()
            )));
        }
        if !pairing_seg_crew_offset_min.is_empty() {
            if pairing_seg_crew_offset_min.len() != crew_fixed_pairings.len() {
                return Err(PyValueError::new_err(format!(
                    "pairing_seg_crew_offset_min must be empty or length {} (crews), got {}",
                    crew_fixed_pairings.len(),
                    pairing_seg_crew_offset_min.len()
                )));
            }
            for (c, row) in pairing_seg_crew_offset_min.iter().enumerate() {
                if !pairing_seg_offsets.is_empty() && row.len() != ps_total {
                    return Err(PyValueError::new_err(format!(
                        "pairing_seg_crew_offset_min[{c}] length {} != segment count {ps_total}",
                        row.len()
                    )));
                }
            }
        }
        if !pairing_seg_crew_sta_offset_min.is_empty() {
            if pairing_seg_crew_sta_offset_min.len() != crew_fixed_pairings.len() {
                return Err(PyValueError::new_err(format!(
                    "pairing_seg_crew_sta_offset_min must be empty or length {} (crews), got {}",
                    crew_fixed_pairings.len(),
                    pairing_seg_crew_sta_offset_min.len()
                )));
            }
            for (c, row) in pairing_seg_crew_sta_offset_min.iter().enumerate() {
                if !pairing_seg_offsets.is_empty() && row.len() != ps_total {
                    return Err(PyValueError::new_err(format!(
                        "pairing_seg_crew_sta_offset_min[{c}] length {} != segment count {ps_total}",
                        row.len()
                    )));
                }
            }
        }
        if !pairing_duty_crew_offset_min.is_empty() {
            if pairing_duty_crew_offset_min.len() != crew_fixed_pairings.len() {
                return Err(PyValueError::new_err(format!(
                    "pairing_duty_crew_offset_min must be empty or length {} (crews), got {}",
                    crew_fixed_pairings.len(),
                    pairing_duty_crew_offset_min.len()
                )));
            }
            for (c, row) in pairing_duty_crew_offset_min.iter().enumerate() {
                if !pairing_duty_offsets.is_empty() && row.len() != pd_total {
                    return Err(PyValueError::new_err(format!(
                        "pairing_duty_crew_offset_min[{c}] length {} != duty count {pd_total}",
                        row.len()
                    )));
                }
            }
        }
        let mut pairings: Vec<PairingRec> = (0..n)
            .map(|i| {
                let is_fly = pairing_is_fly.get(i).copied().unwrap_or(false);
                let group = pairing_assignment_group.get(i).cloned().unwrap_or_default();
                let assignment_type = pairing_assignment_type
                    .get(i)
                    .filter(|s| !s.trim().is_empty())
                    .cloned()
                    .unwrap_or_else(|| Engine::pairing_assignment_type(&group, is_fly));
                PairingRec {
                    start_utc: pairing_start_utc[i],
                    end_duty_utc: pairing_end_utc[i],
                    end_including_rest_utc: pairing_end_including_rest_utc
                        .get(i)
                        .copied()
                        .unwrap_or(pairing_end_utc[i]),
                    blk_min: pairing_blk_min[i],
                    dp_min: pairing_dp_min.get(i).copied().unwrap_or(0),
                    day_ord: pairing_start_utc[i].div_euclid(SECONDS_PER_DAY),
                    is_fly,
                    group: group.clone(),
                    assignment: pairing_assignment.get(i).cloned().unwrap_or_else(|| {
                        if is_fly {
                            "FLY".to_string()
                        } else {
                            group.clone()
                        }
                    }),
                    attributes: pairing_attributes.get(i).cloned().unwrap_or_default(),
                    label: pairing_label.get(i).cloned().unwrap_or_default(),
                    base: pairing_base.get(i).cloned().unwrap_or_default(),
                    start_station: pairing_start_station.get(i).cloned().unwrap_or_default(),
                    end_station: pairing_end_station.get(i).cloned().unwrap_or_default(),
                    assignment_type,
                    qualifier: pairing_qualifier.get(i).cloned().unwrap_or_default(),
                    airport: pairing_airport.get(i).cloned().unwrap_or_default(),
                    role: pairing_role.get(i).cloned().unwrap_or_default(),
                    is_requested: pairing_is_requested.get(i).copied().unwrap_or(false),
                    location: pairing_location.get(i).cloned().unwrap_or_default(),
                    flight_idxs: Vec::new(),
                }
            })
            .collect();

        let wocl_rules = wocl_rules
            .into_iter()
            .enumerate()
            .map(
                |(
                    index,
                    ((bases, ranks, fleets, teams), (wocl_start, wocl_end, max_consecutive)),
                )| {
                    if !(0..=1440).contains(&wocl_start) || !(0..=1440).contains(&wocl_end) {
                        return Err(PyValueError::new_err(format!(
                            "7503 row {index} WOCL minutes must be between 0 and 1440, got \
                             start={wocl_start}, end={wocl_end}"
                        )));
                    }
                    if max_consecutive < 0 {
                        return Err(PyValueError::new_err(format!(
                            "7503 row {index} max_consecutive must be non-negative, got \
                             {max_consecutive}"
                        )));
                    }
                    Ok(WoclRule {
                        bases,
                        ranks,
                        fleets,
                        teams,
                        wocl_window: (wocl_start, wocl_end),
                        max_consecutive,
                    })
                },
            )
            .collect::<PyResult<Vec<_>>>()?;

        let one_checkin_rules = one_checkin_rules
            .into_iter()
            .map(
                |((bases, ranks, fleets, teams), assignments)| OneCheckinRule {
                    bases,
                    ranks,
                    fleets,
                    teams,
                    assignments,
                },
            )
            .collect::<Vec<_>>();

        let wocl_spacing_rules = wocl_spacing_rules
            .into_iter()
            .map(
                |(
                    (
                        prev_assignment_groups,
                        next_assignment_groups,
                        prev_assignments,
                        next_assignments,
                        prev_attributes,
                        next_attributes,
                    ),
                    (apply_prelabelled_attributes, utilize_post_rest),
                    (bases, ranks, fleets, teams),
                    (level, min_period, unit),
                    (wocl_window, _max_consecutive_wocl),
                )| {
                    let level = level.trim().to_uppercase();
                    let unit = unit.trim().to_uppercase();
                    if !matches!(level.as_str(), "D" | "P") {
                        return Err(PyValueError::new_err(format!(
                            "7504 level must be D or P, got {level:?}"
                        )));
                    }
                    if !matches!(unit.as_str(), "RH" | "CD") {
                        return Err(PyValueError::new_err(format!(
                            "7504 unit must be RH or CD, got {unit:?}"
                        )));
                    }
                    if min_period < 0 {
                        return Err(PyValueError::new_err(format!(
                            "7504 min_period must be non-negative, got {min_period}"
                        )));
                    }
                    Ok(WoclSpacingRule {
                        prev_assignment_groups,
                        next_assignment_groups,
                        prev_assignments,
                        next_assignments,
                        prev_attributes,
                        next_attributes,
                        apply_prelabelled_attributes,
                        utilize_post_rest,
                        bases,
                        ranks,
                        fleets,
                        teams,
                        level,
                        min_period,
                        unit,
                        wocl_window,
                    })
                },
            )
            .collect::<PyResult<Vec<_>>>()?;

        let mut crew_fixed: Vec<Vec<usize>> = Vec::with_capacity(crew_fixed_pairings.len());
        for (c, fixed) in crew_fixed_pairings.iter().enumerate() {
            let mut v = Vec::with_capacity(fixed.len());
            for &pi in fixed {
                if pi < 0 || pi as usize >= n {
                    return Err(PyValueError::new_err(format!(
                        "crew {c} fixed pairing index {pi} out of range 0..{n}"
                    )));
                }
                v.push(pi as usize);
            }
            crew_fixed.push(v);
        }

        let to_bands = |v: Vec<(i64, f64)>| -> Vec<BlockBand> {
            v.into_iter()
                .map(|(window_days, limit_min)| BlockBand {
                    window_days,
                    limit_min,
                })
                .collect()
        };

        if !crew_offset_min.is_empty() && crew_offset_min.len() != crew_fixed.len() {
            return Err(PyValueError::new_err(format!(
                "crew_offset_min must be empty or length {} (crews), got {}",
                crew_fixed.len(),
                crew_offset_min.len()
            )));
        }

        // Invert fixed rosters → per-flight mutable crew complement (rule 8030).
        // Flight keys come from 8072 segment flight_id when present; otherwise one
        // synthetic non-merging flight per pairing.
        let mut flight_id_to_idx: BTreeMap<i64, usize> = BTreeMap::new();
        let mut flight_ids_8030: Vec<i64> = Vec::new();
        let mut flight_start_ord_8030: Vec<i64> = Vec::new();
        let mut pairing_flight_idxs: Vec<Vec<usize>> = vec![Vec::new(); n];

        let mut segments_8072 = Vec::with_capacity(pairing_8072_segments.len());
        let mut pairing_to_8072_segments: Vec<Vec<usize>> = vec![Vec::new(); n];
        for row in pairing_8072_segments {
            let (pairing_idx, segment) = parse_8072_segment(row)?;
            if pairing_idx >= n {
                return Err(PyValueError::new_err(format!(
                    "8072 pairing_idx {pairing_idx} out of range 0..{n}"
                )));
            }
            let segment_idx = segments_8072.len();
            pairing_to_8072_segments[pairing_idx].push(segment_idx);
            let start_ord = segment.start_utc.div_euclid(SECONDS_PER_DAY);
            let fid = if segment.flight_id > 0 {
                segment.flight_id
            } else {
                // Non-merging local key unique to this segment row.
                -(segment_idx as i64 + 1)
            };
            let flight_idx = if let Some(&existing) = flight_id_to_idx.get(&fid) {
                if start_ord < flight_start_ord_8030[existing] {
                    flight_start_ord_8030[existing] = start_ord;
                }
                existing
            } else {
                let idx = flight_ids_8030.len();
                flight_id_to_idx.insert(fid, idx);
                flight_ids_8030.push(fid);
                flight_start_ord_8030.push(start_ord);
                idx
            };
            if !pairing_flight_idxs[pairing_idx].contains(&flight_idx) {
                pairing_flight_idxs[pairing_idx].push(flight_idx);
            }

            segments_8072.push(segment);
        }

        let mut pairing_country_sets: BTreeMap<i64, BTreeSet<String>> = BTreeMap::new();
        for segment in &segments_8072 {
            let country = segment.destination_country.trim();
            if !country.is_empty() {
                // Align with the check_8071 activity pairing_id (0-based index + 1)
                // so the kernel's pairing_id > 0 filter does not drop index-0 pairings.
                pairing_country_sets
                    .entry(segment.pairing_id + 1)
                    .or_default()
                    .insert(country.to_ascii_uppercase());
            }
        }

        // Pairings with no segment rows still need a synthetic flight for 8030.
        for pi in 0..n {
            if pairing_flight_idxs[pi].is_empty() {
                let fid = -(10_000 + pi as i64);
                let day_ord = pairing_start_utc[pi].div_euclid(SECONDS_PER_DAY);
                let idx = if let Some(&existing) = flight_id_to_idx.get(&fid) {
                    existing
                } else {
                    let idx = flight_ids_8030.len();
                    flight_id_to_idx.insert(fid, idx);
                    flight_ids_8030.push(fid);
                    flight_start_ord_8030.push(day_ord);
                    idx
                };
                pairing_flight_idxs[pi].push(idx);
            }
            pairings[pi].flight_idxs = pairing_flight_idxs[pi].clone();
        }

        let mut crew_on_segment_8072: Vec<Vec<usize>> = vec![Vec::new(); segments_8072.len()];
        for (crew_idx, fixed) in crew_fixed.iter().enumerate() {
            for &pairing_idx in fixed {
                if let Some(segment_idxs) = pairing_to_8072_segments.get(pairing_idx) {
                    for &segment_idx in segment_idxs {
                        crew_on_segment_8072[segment_idx].push(crew_idx);
                    }
                }
            }
        }

        let mut crew_on_flight_8030: Vec<Vec<usize>> = vec![Vec::new(); flight_ids_8030.len()];
        for (j, fixed) in crew_fixed.iter().enumerate() {
            for &pi in fixed {
                for &fi in &pairing_flight_idxs[pi] {
                    if !crew_on_flight_8030[fi].contains(&j) {
                        crew_on_flight_8030[fi].push(j);
                    }
                }
            }
        }

        // Seed mutable 8030/8072 COF from CrewOnFlight (cross-base / P+C mates).
        let ncrew_bound = crew_fixed.len();
        for &(flight_id, crew_idx_i64) in &cof_flight_crew {
            if crew_idx_i64 < 0 {
                continue;
            }
            let crew_idx = crew_idx_i64 as usize;
            if crew_idx >= ncrew_bound {
                continue;
            }
            if let Some(&fi) = flight_id_to_idx.get(&flight_id) {
                if !crew_on_flight_8030[fi].contains(&crew_idx) {
                    crew_on_flight_8030[fi].push(crew_idx);
                }
            }
            for (segment_idx, segment) in segments_8072.iter().enumerate() {
                if segment.flight_id == flight_id
                    && !crew_on_segment_8072[segment_idx].contains(&crew_idx)
                {
                    crew_on_segment_8072[segment_idx].push(crew_idx);
                }
            }
        }

        // Build the 7509 complement with the pairing span and PA provenance that
        // the legacy `(flight_id, crew_idx)` 8030 seed intentionally omits.
        let mut crew_on_flight_7509: Vec<Vec<Rule7509Member>> =
            vec![Vec::new(); flight_ids_8030.len()];
        for (crew_idx, fixed) in crew_fixed.iter().enumerate() {
            for &pairing_idx in fixed {
                let pairing = &pairings[pairing_idx];
                for &flight_idx in &pairing.flight_idxs {
                    crew_on_flight_7509[flight_idx].push(Rule7509Member {
                        flight_id: flight_ids_8030[flight_idx],
                        crew_id: crew_ids
                            .get(crew_idx)
                            .cloned()
                            .unwrap_or_else(|| crew_idx.to_string()),
                        pairing_id: pairing_idx as i64,
                        pairing_start_utc: pairing.start_utc,
                        pairing_end_utc: pairing.end_duty_utc,
                        source_is_pa: true,
                    });
                }
            }
        }
        for (
            flight_id,
            crew_idx_i64,
            pairing_id,
            pairing_start_utc,
            pairing_end_utc,
            source_is_pa,
        ) in cof_flight_members_7509
        {
            if crew_idx_i64 < 0 || crew_idx_i64 as usize >= crew_fixed.len() {
                continue;
            }
            let Some(&flight_idx) = flight_id_to_idx.get(&flight_id) else {
                continue;
            };
            crew_on_flight_7509[flight_idx].push(Rule7509Member {
                flight_id,
                crew_id: crew_ids
                    .get(crew_idx_i64 as usize)
                    .cloned()
                    .unwrap_or_else(|| crew_idx_i64.to_string()),
                pairing_id,
                pairing_start_utc,
                pairing_end_utc,
                source_is_pa,
            });
        }

        let crew_7510_pairings = crew_fixed.clone();
        let crew_7510_seed_rows = build_7510_seed_rows(
            &cof_flight_crew,
            &cof_flight_7510_rows,
            &segments_8072,
            &crew_ids,
            &crew_team_quals,
            &crew_teams,
            &crew_base_quals,
            &crew_rank_quals,
            &crew_fleet_quals,
            crew_fixed.len(),
        );

        // Per-crew pre-assigned ground duties (rule 8056 grouped vs VAC/DO/ILL …).
        let ncrew = crew_fixed.len();
        let mut crew_ground: Vec<Vec<GroundDuty>> = Vec::with_capacity(ncrew);
        for c in 0..ncrew {
            let starts = crew_ground_start.get(c);
            let ends = crew_ground_end.get(c);
            let asgs = crew_ground_assignment.get(c);
            let grps = crew_ground_group.get(c);
            let rests = crew_ground_is_rest.get(c);
            let stations = crew_ground_station.get(c);
            let m = starts.map(Vec::len).unwrap_or(0);
            let mut v = Vec::with_capacity(m);
            for i in 0..m {
                v.push(GroundDuty {
                    start_utc: starts.and_then(|s| s.get(i).copied()).unwrap_or(0),
                    end_utc: ends.and_then(|s| s.get(i).copied()).unwrap_or(0),
                    assignment: asgs.and_then(|s| s.get(i).cloned()).unwrap_or_default(),
                    group: grps.and_then(|s| s.get(i).cloned()).unwrap_or_default(),
                    is_rest: rests.and_then(|s| s.get(i).copied()).unwrap_or(false),
                    station: stations.and_then(|s| s.get(i).cloned()).unwrap_or_default(),
                });
            }
            crew_ground.push(v);
        }
        if !crew_ground_tz_min.is_empty() && crew_ground_tz_min.len() != ncrew {
            return Err(PyValueError::new_err(format!(
                "crew_ground_tz_min must be empty or length {ncrew}, got {}",
                crew_ground_tz_min.len()
            )));
        }
        for (c, tzs) in crew_ground_tz_min.iter().enumerate() {
            let m = crew_ground.get(c).map(Vec::len).unwrap_or(0);
            if !tzs.is_empty() && tzs.len() != m {
                return Err(PyValueError::new_err(format!(
                    "crew_ground_tz_min[{c}] must be empty or length {m}, got {}",
                    tzs.len()
                )));
            }
        }
        if !crew_ground_type.is_empty() && crew_ground_type.len() != ncrew {
            return Err(PyValueError::new_err(format!(
                "crew_ground_type must be empty or length {ncrew}, got {}",
                crew_ground_type.len()
            )));
        }
        for (c, types) in crew_ground_type.iter().enumerate() {
            let m = crew_ground.get(c).map(Vec::len).unwrap_or(0);
            if !types.is_empty() && types.len() != m {
                return Err(PyValueError::new_err(format!(
                    "crew_ground_type[{c}] must be empty or length {m}, got {}",
                    types.len()
                )));
            }
        }
        if !crew_ground_station.is_empty() && crew_ground_station.len() != ncrew {
            return Err(PyValueError::new_err(format!(
                "crew_ground_station must be empty or length {ncrew}, got {}",
                crew_ground_station.len()
            )));
        }
        for (c, stations) in crew_ground_station.iter().enumerate() {
            let m = crew_ground.get(c).map(Vec::len).unwrap_or(0);
            if !stations.is_empty() && stations.len() != m {
                return Err(PyValueError::new_err(format!(
                    "crew_ground_station[{c}] must be empty or length {m}, got {}",
                    stations.len()
                )));
            }
        }
        let overlap_rules: Vec<OverlapRuleParam> = overlap_rules
            .into_iter()
            .map(
                |(
                    group_before,
                    assignment_before,
                    rest_before,
                    type_before,
                    group_after,
                    assignment_after,
                    type_after,
                )| OverlapRuleParam {
                    group_before,
                    assignment_before,
                    rest_before,
                    type_before,
                    group_after,
                    assignment_after,
                    type_after,
                },
            )
            .collect();
        let spacing_rules: Vec<SpacingRule> = spacing_rules
            .into_iter()
            .map(
                |(group_a, group_b, assign_a, assign_b, space_hours)| SpacingRule {
                    group_a,
                    group_b,
                    assign_a,
                    assign_b,
                    space_hours,
                },
            )
            .collect();
        let spacing_rule_rows = spacing_rule_rows
            .into_iter()
            .map(parse_rule8056_row)
            .collect::<PyResult<Vec<_>>>()?;
        let mut engine_warnings: Vec<String> = Vec::new();
        let mut roster_property_rules = Vec::with_capacity(roster_property_rule_rows.len());
        for (row_index, row) in roster_property_rule_rows.into_iter().enumerate() {
            let rule = parse_rule8071_row(row)?;
            if let Some(warning) = &rule.country_warning {
                engine_warnings.push(format!("8071 row {row_index}: {warning}"));
            }
            roster_property_rules.push(rule);
        }
        let min_qual_rules = min_qual_rule_rows
            .into_iter()
            .map(parse_rule8072_row)
            .collect::<PyResult<Vec<_>>>()?;
        let rule7510_params = rule7510_rows
            .into_iter()
            .map(parse_rule7510_row)
            .collect::<PyResult<Vec<_>>>()?;
        let rule7305_rules = rule7305_rows
            .into_iter()
            .map(|row| {
                let refs: Vec<&str> = row.iter().map(String::as_str).collect();
                Rule7305::from_cells(&refs).map_err(PyValueError::new_err)
            })
            .collect::<PyResult<Vec<_>>>()?;

        let days_off_rules: Vec<DaysOffRule> = days_off_rules
            .into_iter()
            .map(
                |(
                    (bases, ranks, fleets, teams),
                    (
                        do_codes,
                        min_do,
                        period,
                        unit,
                        (rp_days_lower, rp_days_upper),
                        count_post_rest,
                        count_blank,
                        count_layover,
                        leave_codes,
                        (leave_days_lower, leave_days_upper),
                    ),
                )| DaysOffRule {
                    bases,
                    ranks,
                    fleets,
                    teams,
                    row: DaysOffRow {
                        min_do,
                        do_codes,
                        leave_codes,
                        count_blank,
                        count_layover,
                        count_post_rest,
                        rp_days_lower,
                        rp_days_upper,
                        leave_days_lower,
                        leave_days_upper,
                        period,
                        unit,
                        fly_days_lower: 0,
                        fly_days_upper: i64::MAX,
                        fly_assignments: Vec::new(),
                        reserve_days_lower: 0,
                        reserve_days_upper: i64::MAX,
                        reserve_assignments: Vec::new(),
                    },
                },
            )
            .collect();
        let days_off_rules_7507: Vec<DaysOffRule> = days_off_rules_7507
            .into_iter()
            .map(
                |(
                    (bases, ranks, fleets, teams),
                    (
                        do_codes,
                        min_do,
                        period,
                        unit,
                        (rp_days_lower, rp_days_upper),
                        count_post_rest,
                        count_blank,
                        count_layover,
                        leave_codes,
                        (leave_days_lower, leave_days_upper),
                        ((fly_days_lower, fly_days_upper), fly_assignments),
                        ((reserve_days_lower, reserve_days_upper), reserve_assignments),
                    ),
                )| {
                    let fly_assignments = if fly_assignments.is_empty()
                        || fly_assignments.iter().any(|c| c.trim() == "*")
                    {
                        Vec::new()
                    } else {
                        fly_assignments
                    };
                    let reserve_assignments = if reserve_assignments.is_empty()
                        || reserve_assignments.iter().any(|c| c.trim() == "*")
                    {
                        Vec::new()
                    } else {
                        reserve_assignments
                    };
                    DaysOffRule {
                        bases,
                        ranks,
                        fleets,
                        teams,
                        row: DaysOffRow {
                            min_do,
                            do_codes,
                            leave_codes,
                            count_blank,
                            count_layover,
                            count_post_rest,
                            rp_days_lower,
                            rp_days_upper,
                            leave_days_lower,
                            leave_days_upper,
                            period,
                            unit,
                            fly_days_lower,
                            fly_days_upper,
                            fly_assignments,
                            reserve_days_lower,
                            reserve_days_upper,
                            reserve_assignments,
                        },
                    }
                },
            )
            .collect();
        let sdfd_rule_rows: Vec<Rule7501Row> = sdfd_rule_rows
            .into_iter()
            .map(
                |(
                    row_id,
                    (bases, ranks, fleets, teams),
                    (period_hours, unit, duty_end_buffer_secs, min_limits),
                )| Rule7501Row {
                    row_id,
                    bases,
                    ranks,
                    fleets,
                    teams,
                    period_hours,
                    unit,
                    duty_end_buffer_secs,
                    min_limits,
                },
            )
            .collect();
        let calendar_sdfd_rule_rows: Vec<Rule7508Row> = calendar_sdfd_rule_rows
            .into_iter()
            .map(
                |(
                    row_id,
                    (bases, ranks, fleets, teams),
                    (
                        period_hours,
                        unit,
                        duty_report,
                        duty_release,
                        duty_end_buffer_secs,
                        min_limits,
                        count_layover,
                    ),
                )| Rule7508Row {
                    row_id,
                    bases,
                    ranks,
                    fleets,
                    teams,
                    period_hours,
                    unit,
                    duty_report,
                    duty_release,
                    duty_end_buffer_secs,
                    min_limits,
                    count_layover,
                },
            )
            .collect();

        // ── rule 8002 full-port inputs ────────────────────────────────────
        let mut avoid_co_pairing_rules = Vec::new();
        for (row_index, (crew_a, crew_b, eff_date, exp_date)) in
            rule7509_rows.into_iter().enumerate()
        {
            let cells = [
                crew_a.as_str(),
                crew_b.as_str(),
                eff_date.as_str(),
                exp_date.as_str(),
            ];
            if let Some(rule) = Rule7509Param::from_cells(&cells) {
                avoid_co_pairing_rules.push(rule.with_row_index(row_index));
            } else {
                engine_warnings.push(format!(
                    "7509 row {row_index}: invalid crew pair or effective date range — row skipped"
                ));
            }
        }
        let band = |lo: i64, hi: i64| -> Option<(i64, i64)> {
            if lo < 0 && hi < 0 {
                None
            } else {
                Some((lo.max(0), hi.max(0)))
            }
        };
        let mut parsed_cum_rules: Vec<CumRule8002> = Vec::with_capacity(cum_rules.len());
        for (i, row) in cum_rules.into_iter().enumerate() {
            let (
                (bases, ranks, fleets, teams),
                (period, unit_s, max_min, min_min, type_s),
                (int_lo, int_hi, aug_lo, aug_hi, aloft_lo, aloft_hi),
                sby_flag,
                reduction,
            ) = row;
            let unit = CumUnit::parse(&unit_s).ok_or_else(|| {
                PyValueError::new_err(format!("cum_rules[{i}]: unknown unit {unit_s:?}"))
            })?;
            let rtype = CumType::parse(&type_s).ok_or_else(|| {
                PyValueError::new_err(format!(
                    "cum_rules[{i}]: unsupported type {type_s:?} (supported: BH/DP/FT/CH; \
                     drivers must warn-and-drop the other C++ types)"
                ))
            })?;
            if !(teams.is_empty() || (teams.len() == 1 && (teams[0] == "*" || teams[0].is_empty())))
                && crew_teams.is_empty()
            {
                engine_warnings.push(format!(
                    "8002 row {i}: teams={teams:?} gated but no crew-team data exists — the row will never fire"
                ));
            }
            if rtype == CumType::Ft {
                engine_warnings.push(format!(
                    "8002 row {i}: FT candidate contribution is approximated by segment \
                     block minutes (no airborne-time source for candidate pairings)"
                ));
            }
            parsed_cum_rules.push(CumRule8002 {
                bases,
                ranks,
                fleets,
                teams,
                period,
                unit,
                max_min,
                min_min,
                rtype,
                int_oper_band: band(int_lo, int_hi),
                aug_oper_band: band(aug_lo, aug_hi),
                duty_aloft_band: band(aloft_lo, aloft_hi),
                has_sby_or_fly: match sby_flag {
                    0 => Some(false),
                    1 => Some(true),
                    _ => None,
                },
                reduction_min_per_duty: reduction.max(0),
            });
        }
        if !parsed_cum_rules.is_empty() {
            if crew_daily_metrics.is_empty() {
                engine_warnings.push(
                    "8002 cum_rules active without crew_daily_metrics — history metrics \
                     degrade to the BLK-only crew_daily_baseline (non-BLK history = 0)"
                        .to_string(),
                );
            }
            if scenario_window.is_none() && checked_window.is_none() {
                engine_warnings.push(
                    "8002 cum_rules active without scenario_window/checked_window — \
                     the checked span cannot be derived, cum_rules are skipped"
                        .to_string(),
                );
            }
            if parsed_cum_rules.iter().any(|r| r.rtype == CumType::Ch)
                && pairing_duty_offsets.is_empty()
            {
                engine_warnings.push(
                    "8002 CH row(s) active without pairing duty arrays — formula credit \
                     for flying duties = 0 (ground still counted)"
                        .to_string(),
                );
            }
        }
        for (name, quals) in [
            ("crew_rank_quals", &crew_rank_quals),
            ("crew_fleet_quals", &crew_fleet_quals),
        ] {
            if !quals.is_empty() && quals.len() != crew_fixed.len() {
                return Err(PyValueError::new_err(format!(
                    "{name} must be empty or length {} (crews), got {}",
                    crew_fixed.len(),
                    quals.len()
                )));
            }
        }
        if !crew_position_quals.is_empty() && crew_position_quals.len() != crew_fixed.len() {
            return Err(PyValueError::new_err(format!(
                "crew_position_quals must be empty or length {} (crews), got {}",
                crew_fixed.len(),
                crew_position_quals.len()
            )));
        }
        if !crew_daily_metrics.is_empty() && crew_daily_metrics.len() != crew_fixed.len() {
            return Err(PyValueError::new_err(format!(
                "crew_daily_metrics must be empty or length {} (crews), got {}",
                crew_fixed.len(),
                crew_daily_metrics.len()
            )));
        }
        let n_crew = crew_fixed.len();
        let crew_8002_base_quals = preparse_dated_quals(n_crew, &crew_base_quals);
        let crew_8002_rank_quals = preparse_dated_quals(n_crew, &crew_rank_quals);
        let crew_8002_fleet_quals = preparse_dated_quals(n_crew, &crew_fleet_quals);
        let crew_8002_team_quals = preparse_team_quals(n_crew, &crew_teams);
        let mut crew_daily_metrics_maps: Vec<BTreeMap<i64, DayMetrics>> =
            Vec::with_capacity(crew_daily_metrics.len());
        for (c, rows) in crew_daily_metrics.into_iter().enumerate() {
            let mut m: BTreeMap<i64, DayMetrics> = BTreeMap::new();
            for (ord, vals) in rows {
                if vals.len() != 9 {
                    return Err(PyValueError::new_err(format!(
                        "crew_daily_metrics[{c}] day {ord}: expected 9 metric values \
                         (MANDAY_METRICS order), got {}",
                        vals.len()
                    )));
                }
                let mut dm = m.remove(&ord).unwrap_or_default();
                dm.add(&DayMetrics::from_slice(&vals));
                m.insert(ord, dm);
            }
            crew_daily_metrics_maps.push(m);
        }
        if !pairing_duty_credit_min.is_empty() && pairing_duty_credit_min.len() != pd_total {
            return Err(PyValueError::new_err(format!(
                "pairing_duty_credit_min length {} != pairing duty count {pd_total}",
                pairing_duty_credit_min.len()
            )));
        }

        let engine = Engine {
            pairings,
            crew_fixed,
            block_bands: to_bands(block_bands),
            spacing_hours,
            spacing_rules,
            spacing_rule_rows,
            crew_teams,
            overlap_rules,
            crew_ground,
            rp_start_ord,
            rp_end_ord,
            min_days_off,
            days_off_rules,
            days_off_rules_7507,
            crew_offset_min,
            local_night: local_night.map(|(start_min, end_min, min_rest_secs)| LocalNightDef {
                start_min,
                end_min,
                min_rest_secs,
            }),
            do_start_grace: resolved_do_start_grace,
            sdfd_rows,
            sdfd_rule_rows,
            calendar_sdfd_rule_rows,
            sdfd_buffer_secs,
            checked_window,
            wocl_window,
            max_consecutive_wocl,
            wocl_rules,
            wocl_spacing_hours,
            wocl_spacing_rules,
            acc_stay_per_min,
            acc_adjust_min,
            _acc_stay_period_rows: acc_stay_period_rows,
            pairing_dep_tz_min,
            pairing_arr_tz_min,
            pairing_duty_offsets,
            pairing_duty_start_utc,
            pairing_duty_end_utc,
            pairing_duty_first_flight_departure_utc,
            pairing_duty_last_flight_arrival_utc,
            pairing_duty_dep_tz_min,
            pairing_duty_arr_tz_min,
            pairing_duty_dp_min,
            pairing_duty_blk_min,
            pairing_duty_dp_pct,
            pairing_seg_offsets,
            pairing_seg_std_utc,
            pairing_seg_sta_utc,
            pairing_seg_blk_min,
            pairing_seg_crew_offset_min,
            pairing_seg_crew_sta_offset_min,
            pairing_duty_crew_offset_min,
            crew_ground_tz_min,
            crew_ground_type,
            one_checkin_groups,
            one_checkin_rules,
            crew_base_quals,
            base_grace_days,
            crew_division,
            crew_birth_ord,
            flight_ids_8030,
            flight_start_ord_8030,
            crew_on_flight_8030,
            age_division,
            age_limit,
            age_max_number,
            crew_ids,
            avoid_co_pairing_rules,
            crew_on_flight_7509,
            rule7510_params,
            crew_team_quals,
            crew_7510_pairings,
            crew_7510_seed_rows,
            application,
            enabled_functions: enabled_functions.into_iter().collect(),
            crew_daily_baseline: crew_daily_baseline
                .into_iter()
                .map(|rows| rows.into_iter().collect())
                .collect(),
            cum_rules: parsed_cum_rules,
            crew_rank_quals,
            crew_fleet_quals,
            crew_daily_metrics: crew_daily_metrics_maps,
            crew_8002_base_quals,
            crew_8002_rank_quals,
            crew_8002_fleet_quals,
            crew_8002_team_quals,
            roster_periods,
            scenario_window,
            weekday_start_from,
            pairing_duty_credit_min,
            roster_property_rules,
            min_qual_rules,
            segments_8072,
            pairing_to_8072_segments,
            pairing_country_sets,
            crew_qualification_sets,
            crew_nationality_8072: crew_nationality,
            crew_on_segment_8072,
            rule7305_rules,
            crew_position_quals,
            rule7305_assignment_groups,
            engine_warnings,
        };
        Ok(engine)
    }

    fn can_add_pairing_8072(&self, crew_idx: i64, pairing_idx: i64) -> PyResult<Vec<String>> {
        if crew_idx < 0 || crew_idx as usize >= self.crew_fixed.len() {
            return Err(PyValueError::new_err(format!(
                "crew_idx {crew_idx} out of range 0..{}",
                self.crew_fixed.len()
            )));
        }
        if pairing_idx < 0 || pairing_idx as usize >= self.pairings.len() {
            return Err(PyValueError::new_err(format!(
                "pairing_idx {pairing_idx} out of range 0..{}",
                self.pairings.len()
            )));
        }
        if !self.is_enabled("8072") || self.min_qual_rules.is_empty() {
            return Ok(Vec::new());
        }
        let crew_idx = crew_idx as usize;
        let pairing_idx = pairing_idx as usize;
        let mut segments = Vec::new();
        for &segment_idx in self
            .pairing_to_8072_segments
            .get(pairing_idx)
            .map(Vec::as_slice)
            .unwrap_or(&[])
        {
            let mut segment = self.segments_8072[segment_idx].clone();
            for &existing_crew_idx in &self.crew_on_segment_8072[segment_idx] {
                segment
                    .crews
                    .push(self.crew_8072_for_segment(existing_crew_idx, &segment, "CR"));
            }
            if !self.crew_on_segment_8072[segment_idx].contains(&crew_idx) {
                segment
                    .crews
                    .push(self.crew_8072_for_segment(crew_idx, &segment, "CR"));
            }
            segments.push(segment);
        }
        Ok(self.format_8072_violations(&segments))
    }

    fn commit_pairing_8072(&mut self, crew_idx: i64, pairing_idx: i64) -> PyResult<()> {
        if crew_idx < 0 || crew_idx as usize >= self.crew_fixed.len() {
            return Err(PyValueError::new_err(format!(
                "crew_idx {crew_idx} out of range 0..{}",
                self.crew_fixed.len()
            )));
        }
        if pairing_idx < 0 || pairing_idx as usize >= self.pairings.len() {
            return Err(PyValueError::new_err(format!(
                "pairing_idx {pairing_idx} out of range 0..{}",
                self.pairings.len()
            )));
        }
        let crew_idx = crew_idx as usize;
        let pairing_idx = pairing_idx as usize;
        for &segment_idx in self
            .pairing_to_8072_segments
            .get(pairing_idx)
            .map(Vec::as_slice)
            .unwrap_or(&[])
        {
            if !self.crew_on_segment_8072[segment_idx].contains(&crew_idx) {
                self.crew_on_segment_8072[segment_idx].push(crew_idx);
            }
        }
        Ok(())
    }

    fn rollback_pairing_8072(&mut self, crew_idx: i64, pairing_idx: i64) -> PyResult<()> {
        if crew_idx < 0 || crew_idx as usize >= self.crew_fixed.len() {
            return Err(PyValueError::new_err(format!(
                "crew_idx {crew_idx} out of range 0..{}",
                self.crew_fixed.len()
            )));
        }
        if pairing_idx < 0 || pairing_idx as usize >= self.pairings.len() {
            return Err(PyValueError::new_err(format!(
                "pairing_idx {pairing_idx} out of range 0..{}",
                self.pairings.len()
            )));
        }
        let crew_idx = crew_idx as usize;
        let pairing_idx = pairing_idx as usize;
        for &segment_idx in self
            .pairing_to_8072_segments
            .get(pairing_idx)
            .map(Vec::as_slice)
            .unwrap_or(&[])
        {
            self.crew_on_segment_8072[segment_idx].retain(|&idx| idx != crew_idx);
        }
        Ok(())
    }

    /// Rule 8030 incremental complement: trial-add candidate onto mutable flight COF.
    fn can_add_pairing_8030(&self, crew_idx: i64, pairing_idx: i64) -> PyResult<Vec<String>> {
        if crew_idx < 0 || crew_idx as usize >= self.crew_fixed.len() {
            return Err(PyValueError::new_err(format!(
                "crew_idx {crew_idx} out of range 0..{}",
                self.crew_fixed.len()
            )));
        }
        if pairing_idx < 0 || pairing_idx as usize >= self.pairings.len() {
            return Err(PyValueError::new_err(format!(
                "pairing_idx {pairing_idx} out of range 0..{}",
                self.pairings.len()
            )));
        }
        if !self.is_enabled("8030") || self.age_division.is_none() || self.crew_birth_ord.is_empty()
        {
            return Ok(Vec::new());
        }
        let crew_idx = crew_idx as usize;
        let pairing_idx = pairing_idx as usize;
        let crew_id = crew_idx.to_string();
        let flights: Vec<AgeFlight> = self.pairings[pairing_idx]
            .flight_idxs
            .iter()
            .map(|&fi| self.age_flight_for_flight(fi, pairing_idx, crew_idx, &crew_id))
            .collect();
        Ok(self.format_8030_violations_for_candidate(&flights, &crew_id))
    }

    fn commit_pairing_8030(&mut self, crew_idx: i64, pairing_idx: i64) -> PyResult<()> {
        if crew_idx < 0 || crew_idx as usize >= self.crew_fixed.len() {
            return Err(PyValueError::new_err(format!(
                "crew_idx {crew_idx} out of range 0..{}",
                self.crew_fixed.len()
            )));
        }
        if pairing_idx < 0 || pairing_idx as usize >= self.pairings.len() {
            return Err(PyValueError::new_err(format!(
                "pairing_idx {pairing_idx} out of range 0..{}",
                self.pairings.len()
            )));
        }
        let crew_idx = crew_idx as usize;
        let pairing_idx = pairing_idx as usize;
        for &fi in &self.pairings[pairing_idx].flight_idxs {
            if !self.crew_on_flight_8030[fi].contains(&crew_idx) {
                self.crew_on_flight_8030[fi].push(crew_idx);
            }
        }
        Ok(())
    }

    fn rollback_pairing_8030(&mut self, crew_idx: i64, pairing_idx: i64) -> PyResult<()> {
        if crew_idx < 0 || crew_idx as usize >= self.crew_fixed.len() {
            return Err(PyValueError::new_err(format!(
                "crew_idx {crew_idx} out of range 0..{}",
                self.crew_fixed.len()
            )));
        }
        if pairing_idx < 0 || pairing_idx as usize >= self.pairings.len() {
            return Err(PyValueError::new_err(format!(
                "pairing_idx {pairing_idx} out of range 0..{}",
                self.pairings.len()
            )));
        }
        let crew_idx = crew_idx as usize;
        let pairing_idx = pairing_idx as usize;
        for &fi in &self.pairings[pairing_idx].flight_idxs {
            self.crew_on_flight_8030[fi].retain(|&idx| idx != crew_idx);
        }
        Ok(())
    }

    /// Rule 7509 incremental complement: trial-add candidate onto physical-flight COF.
    fn can_add_pairing_7509(&self, crew_idx: i64, pairing_idx: i64) -> PyResult<Vec<String>> {
        if crew_idx < 0 || crew_idx as usize >= self.crew_fixed.len() {
            return Err(PyValueError::new_err(format!(
                "crew_idx {crew_idx} out of range 0..{}",
                self.crew_fixed.len()
            )));
        }
        if pairing_idx < 0 || pairing_idx as usize >= self.pairings.len() {
            return Err(PyValueError::new_err(format!(
                "pairing_idx {pairing_idx} out of range 0..{}",
                self.pairings.len()
            )));
        }
        if !self.is_enabled("7509") || self.avoid_co_pairing_rules.is_empty() {
            return Ok(Vec::new());
        }
        Ok(self.format_7509_violations_for_candidate(crew_idx as usize, &[pairing_idx as usize]))
    }

    fn commit_pairing_7509(&mut self, crew_idx: i64, pairing_idx: i64) -> PyResult<()> {
        if crew_idx < 0 || crew_idx as usize >= self.crew_fixed.len() {
            return Err(PyValueError::new_err(format!(
                "crew_idx {crew_idx} out of range 0..{}",
                self.crew_fixed.len()
            )));
        }
        if pairing_idx < 0 || pairing_idx as usize >= self.pairings.len() {
            return Err(PyValueError::new_err(format!(
                "pairing_idx {pairing_idx} out of range 0..{}",
                self.pairings.len()
            )));
        }
        let crew_idx = crew_idx as usize;
        let pairing_idx = pairing_idx as usize;
        let crew_id = self.crew_id_7509(crew_idx);
        let pairing = &self.pairings[pairing_idx];
        for &flight_idx in &pairing.flight_idxs {
            if !self.crew_on_flight_7509[flight_idx].iter().any(|member| {
                member.crew_id == crew_id
                    && member.pairing_id == pairing_idx as i64
                    && !member.source_is_pa
            }) {
                self.crew_on_flight_7509[flight_idx].push(Rule7509Member {
                    flight_id: self.flight_ids_8030[flight_idx],
                    crew_id: crew_id.clone(),
                    pairing_id: pairing_idx as i64,
                    pairing_start_utc: pairing.start_utc,
                    pairing_end_utc: pairing.end_duty_utc,
                    source_is_pa: false,
                });
            }
        }
        Ok(())
    }

    fn rollback_pairing_7509(&mut self, crew_idx: i64, pairing_idx: i64) -> PyResult<()> {
        if crew_idx < 0 || crew_idx as usize >= self.crew_fixed.len() {
            return Err(PyValueError::new_err(format!(
                "crew_idx {crew_idx} out of range 0..{}",
                self.crew_fixed.len()
            )));
        }
        if pairing_idx < 0 || pairing_idx as usize >= self.pairings.len() {
            return Err(PyValueError::new_err(format!(
                "pairing_idx {pairing_idx} out of range 0..{}",
                self.pairings.len()
            )));
        }
        let crew_id = self.crew_id_7509(crew_idx as usize);
        let pairing_id = pairing_idx;
        for members in &mut self.crew_on_flight_7509 {
            members.retain(|member| {
                !(member.crew_id == crew_id
                    && member.pairing_id == pairing_id
                    && !member.source_is_pa)
            });
        }
        Ok(())
    }

    /// Rule 7510 incremental complement: trial-add one candidate pairing against
    /// the full current roster state and reject any candidate-owned violations.
    fn can_add_pairing_7510(&self, crew_idx: i64, pairing_idx: i64) -> PyResult<Vec<String>> {
        if crew_idx < 0 || crew_idx as usize >= self.crew_fixed.len() {
            return Err(PyValueError::new_err(format!(
                "crew_idx {crew_idx} out of range 0..{}",
                self.crew_fixed.len()
            )));
        }
        if pairing_idx < 0 || pairing_idx as usize >= self.pairings.len() {
            return Err(PyValueError::new_err(format!(
                "pairing_idx {pairing_idx} out of range 0..{}",
                self.pairings.len()
            )));
        }
        if !self.is_enabled("7510") || self.rule7510_params.is_empty() {
            return Ok(Vec::new());
        }

        let crew_idx = crew_idx as usize;
        let pairing_idx = pairing_idx as usize;
        let mut pairing_state = self.crew_7510_pairings.clone();
        if let Some(pairings) = pairing_state.get_mut(crew_idx) {
            if !pairings.contains(&pairing_idx) {
                pairings.push(pairing_idx);
            }
        }

        let checked_window = self
            .scenario_window
            .or(self.checked_window)
            .unwrap_or((0, 0));
        let candidate_crew_id = self.crew_id_7510(crew_idx);
        let violations = check_green_on_green(
            &self.rule7510_params,
            &self.rows_7510_for_pairing_state(&pairing_state),
            checked_window.0,
            checked_window.1,
        );

        Ok(violations
            .into_iter()
            .filter(|violation| violation.crew_id == candidate_crew_id)
            .filter_map(|violation| {
                let param = self
                    .rule7510_params
                    .iter()
                    .find(|param| param.row_index == violation.row_index)?;
                Some(format!(
                    "7510|row={}|flight={}|crew={}|count={}|min={}|max={}|over=true",
                    violation.row_index,
                    violation.flight_id,
                    violation.crew_id,
                    violation.actual_count,
                    param.min_limits,
                    param.max_limits,
                ))
            })
            .collect())
    }

    fn commit_pairing_7510(&mut self, crew_idx: i64, pairing_idx: i64) -> PyResult<()> {
        if crew_idx < 0 || crew_idx as usize >= self.crew_fixed.len() {
            return Err(PyValueError::new_err(format!(
                "crew_idx {crew_idx} out of range 0..{}",
                self.crew_fixed.len()
            )));
        }
        if pairing_idx < 0 || pairing_idx as usize >= self.pairings.len() {
            return Err(PyValueError::new_err(format!(
                "pairing_idx {pairing_idx} out of range 0..{}",
                self.pairings.len()
            )));
        }
        let crew_idx = crew_idx as usize;
        let pairing_idx = pairing_idx as usize;
        if !self.crew_7510_pairings[crew_idx].contains(&pairing_idx) {
            self.crew_7510_pairings[crew_idx].push(pairing_idx);
        }
        Ok(())
    }

    fn rollback_pairing_7510(&mut self, crew_idx: i64, pairing_idx: i64) -> PyResult<()> {
        if crew_idx < 0 || crew_idx as usize >= self.crew_fixed.len() {
            return Err(PyValueError::new_err(format!(
                "crew_idx {crew_idx} out of range 0..{}",
                self.crew_fixed.len()
            )));
        }
        if pairing_idx < 0 || pairing_idx as usize >= self.pairings.len() {
            return Err(PyValueError::new_err(format!(
                "pairing_idx {pairing_idx} out of range 0..{}",
                self.pairings.len()
            )));
        }
        let crew_idx = crew_idx as usize;
        let pairing_idx = pairing_idx as usize;
        if self.crew_fixed[crew_idx].contains(&pairing_idx) {
            return Ok(());
        }
        if let Some(pos) = self.crew_7510_pairings[crew_idx]
            .iter()
            .rposition(|&value| value == pairing_idx)
        {
            self.crew_7510_pairings[crew_idx].remove(pos);
        }
        Ok(())
    }

    /// Rule 7510 final/batch check. Each tuple is `(crew_idx, candidate_pairing_idxs)`;
    /// fixed roster pairings are included automatically for every engine crew.
    fn check_all_7510(&self, lines: Vec<(i64, Vec<i64>)>) -> PyResult<Vec<String>> {
        if !self.is_enabled("7510") || self.rule7510_params.is_empty() {
            return Ok(Vec::new());
        }

        let mut normalized = Vec::with_capacity(lines.len());
        for (crew_idx, pairing_idxs) in lines {
            if crew_idx < 0 || crew_idx as usize >= self.crew_fixed.len() {
                return Err(PyValueError::new_err(format!(
                    "crew_idx {crew_idx} out of range 0..{}",
                    self.crew_fixed.len()
                )));
            }
            let mut candidate = Vec::with_capacity(pairing_idxs.len());
            for pairing_idx in pairing_idxs {
                if pairing_idx < 0 || pairing_idx as usize >= self.pairings.len() {
                    return Err(PyValueError::new_err(format!(
                        "pairing index {pairing_idx} out of range 0..{}",
                        self.pairings.len()
                    )));
                }
                candidate.push(pairing_idx as usize);
            }
            normalized.push((crew_idx as usize, candidate));
        }

        let checked_window = self
            .scenario_window
            .or(self.checked_window)
            .unwrap_or((0, 0));
        let violations = check_green_on_green(
            &self.rule7510_params,
            &self.rows_7510_for_lines(&normalized),
            checked_window.0,
            checked_window.1,
        );
        Ok(violations
            .iter()
            .filter_map(|violation| {
                let param = self
                    .rule7510_params
                    .iter()
                    .find(|param| param.row_index == violation.row_index)?;
                Some(Self::format_7510_violation(violation, param))
            })
            .collect())
    }

    /// Hot path: evaluate one candidate line and return its violations as strings.
    fn check_line(&self, crew_idx: i64, pairing_idxs: Vec<i64>) -> PyResult<Vec<String>> {
        if crew_idx < 0 || crew_idx as usize >= self.crew_fixed.len() {
            return Err(PyValueError::new_err(format!(
                "crew_idx {crew_idx} out of range 0..{}",
                self.crew_fixed.len()
            )));
        }
        let mut candidate: Vec<usize> = Vec::with_capacity(pairing_idxs.len());
        for &pi in &pairing_idxs {
            if pi < 0 || pi as usize >= self.pairings.len() {
                return Err(PyValueError::new_err(format!(
                    "pairing index {pi} out of range 0..{}",
                    self.pairings.len()
                )));
            }
            candidate.push(pi as usize);
        }

        let fixed = &self.crew_fixed[crew_idx as usize];
        let crew_id = crew_idx.to_string();
        let mut out: Vec<String> = Vec::new();
        if self.is_enabled("1001") {
            self.check_overlap(crew_idx as usize, fixed, &candidate, &crew_id, &mut out);
        }
        if self.is_enabled("8002") {
            if !self.cum_rules.is_empty() {
                // Full C++ port path: per-row qualification matching, all window
                // units, min limits, band filters (supersedes the legacy bands).
                self.check_8002_full(crew_idx as usize, fixed, &candidate, &crew_id, &mut out);
            } else {
                self.check_cum_windows(
                    fixed,
                    &candidate,
                    crew_idx as usize,
                    &crew_id,
                    &self.block_bands,
                    true,
                    "8002",
                    &mut out,
                );
            }
        }
        if self.is_enabled("8056") {
            self.check_8056(crew_idx as usize, fixed, &candidate, &crew_id, &mut out)?;
        }
        let mut line_duties = self.build_line_duties(crew_idx as usize, fixed, &candidate);
        self.run_acclimatisation_7500(&mut line_duties);
        if self.is_enabled("7501") {
            self.check_7501(crew_idx as usize, &crew_id, &line_duties, &mut out);
        }
        if self.is_enabled("7508") {
            self.check_7508(crew_idx as usize, &crew_id, &line_duties, &mut out);
        }
        if self.is_enabled("7503") || self.is_enabled("7504") {
            self.check_wocl(crew_idx as usize, &crew_id, &line_duties, &mut out)?;
        }
        if self.is_enabled("7505") {
            if !self.days_off_rules.is_empty() {
                self.check_7505_structured(
                    crew_idx as usize,
                    fixed,
                    &candidate,
                    &crew_id,
                    &mut out,
                )?;
            } else {
                self.check_7505(fixed, &candidate, &crew_id, &mut out);
            }
        }
        if self.is_enabled("7507") && !self.days_off_rules_7507.is_empty() {
            self.check_7507_structured(crew_idx as usize, fixed, &candidate, &crew_id, &mut out)?;
        }
        if self.is_enabled("7506") {
            self.check_7506(crew_idx as usize, fixed, &candidate, &crew_id, &mut out)?;
        }
        if self.is_enabled("8004") {
            self.check_8004(crew_idx as usize, fixed, &candidate, &crew_id, &mut out);
        }
        if self.is_enabled("8030") {
            self.check_8030(crew_idx as usize, &candidate, &crew_id, &mut out);
        }
        if self.is_enabled("7509") {
            out.extend(self.format_7509_violations_for_candidate(crew_idx as usize, &candidate));
        }
        if self.is_enabled("8071") {
            self.check_8071(crew_idx as usize, fixed, &candidate, &crew_id, &mut out);
        }
        if self.is_enabled("7305") {
            self.check_7305(crew_idx as usize, fixed, &candidate, &crew_id, &mut out);
        }
        Ok(out)
    }

    #[getter]
    fn n_pairings(&self) -> usize {
        self.pairings.len()
    }

    #[getter]
    fn n_crews(&self) -> usize {
        self.crew_fixed.len()
    }

    #[getter]
    fn n_rules(&self) -> usize {
        let mut n = 1usize; // overlap always on
        if self.is_enabled("8002") && !self.cum_rules.is_empty() {
            n += 1;
        }
        if self.is_enabled("8002") && self.cum_rules.is_empty() && !self.block_bands.is_empty() {
            n += 1;
        }
        if self.is_enabled("8056")
            && (self.spacing_hours.is_some() || !self.spacing_rules.is_empty())
        {
            n += 1;
        }
        if self.is_enabled("7505")
            && self.rp_start_ord.is_some()
            && self.rp_end_ord.is_some()
            && (!self.days_off_rules.is_empty() || self.min_days_off.is_some())
        {
            n += 1;
        }
        if self.is_enabled("7507")
            && self.rp_start_ord.is_some()
            && self.rp_end_ord.is_some()
            && !self.days_off_rules_7507.is_empty()
        {
            n += 1;
        }
        if self.is_enabled("7501")
            && self.local_night.is_some()
            && (!self.sdfd_rows.is_empty() || !self.sdfd_rule_rows.is_empty())
            && self.checked_window.is_some()
        {
            n += 1;
        }
        if self.is_enabled("7508")
            && self.local_night.is_some()
            && !self.calendar_sdfd_rule_rows.is_empty()
            && self.checked_window.is_some()
        {
            n += 1;
        }
        if self.is_enabled("7500")
            && self.acc_stay_per_min.is_some()
            && self.acc_adjust_min.is_some()
        {
            n += 1;
        }
        if self.is_enabled("7503")
            && ((!self.wocl_rules.is_empty())
                || (self.wocl_window.is_some() && self.max_consecutive_wocl.is_some()))
        {
            n += 1;
        }
        if self.is_enabled("7504")
            && self.wocl_window.is_some()
            && (self.wocl_spacing_hours.is_some() || !self.wocl_spacing_rules.is_empty())
        {
            n += 1;
        }
        if self.is_enabled("7506")
            && (!self.one_checkin_rules.is_empty() || self.one_checkin_groups.is_some())
        {
            n += 1;
        }
        if self.is_enabled("8004")
            && self.base_grace_days.is_some()
            && !self.crew_base_quals.is_empty()
        {
            n += 1;
        }
        if self.is_enabled("8030") && self.age_division.is_some() && !self.crew_birth_ord.is_empty()
        {
            n += 1;
        }
        if self.is_enabled("7509") && !self.avoid_co_pairing_rules.is_empty() {
            n += 1;
        }
        if self.is_enabled("7510") && !self.rule7510_params.is_empty() {
            n += 1;
        }
        if self.is_enabled("8071") && !self.roster_property_rules.is_empty() {
            n += 1;
        }
        n
    }

    fn __repr__(&self) -> String {
        let app = if self.application.is_optimizer() {
            "optimizer"
        } else {
            "editor"
        };
        format!(
            "Engine(phase=2, app={}, pairings={}, crews={}, rules={})",
            app,
            self.pairings.len(),
            self.crew_fixed.len(),
            self.n_rules(),
        )
    }

    /// Per-calendar-day BLK (block minutes), SPAN split using the crew's local timezone.
    ///
    /// `pairing_idxs`: dense-array indices for the crew's full line (same format as
    ///   `check_line` — negative or out-of-range indices are silently skipped).
    /// `crew_idx`: crew index whose prime-base timezone defines local calendar days.
    ///
    /// Returns a dict `{day_ord: blk_min}` where `day_ord` is the number of days
    /// since the Unix epoch (1970-01-01); convert to a Python `date` with
    /// `date(1970,1,1) + timedelta(days=day_ord)`.
    fn daily_blk(
        &self,
        pairing_idxs: Vec<i64>,
        crew_idx: i64,
    ) -> std::collections::HashMap<i64, f64> {
        let idxs: Vec<usize> = pairing_idxs
            .into_iter()
            .filter(|&i| i >= 0 && (i as usize) < self.pairings.len())
            .map(|i| i as usize)
            .collect();
        let crew_idx = if crew_idx < 0 { 0 } else { crew_idx as usize };
        let (daily, _) = self.cum_daily_map(&idxs, crew_idx, true, &[]);
        daily.into_iter().collect()
    }

    /// Per-calendar-day DP (duty-period minutes), attributed to duty-start local day.
    fn daily_dp(
        &self,
        pairing_idxs: Vec<i64>,
        crew_idx: i64,
    ) -> std::collections::HashMap<i64, f64> {
        let idxs: Vec<usize> = pairing_idxs
            .into_iter()
            .filter(|&i| i >= 0 && (i as usize) < self.pairings.len())
            .map(|i| i as usize)
            .collect();
        let crew_idx = if crew_idx < 0 { 0 } else { crew_idx as usize };
        let (daily, _) = self.cum_daily_map(&idxs, crew_idx, false, &self.pairing_duty_dp_min);
        daily.into_iter().collect()
    }

    /// Per-calendar-day CH: whole-duty formula on report's crew-base local day,
    /// plus 240 min per non-rest ground on that crew-base start day.
    fn daily_credit(
        &self,
        pairing_idxs: Vec<i64>,
        crew_idx: i64,
    ) -> std::collections::HashMap<i64, f64> {
        let idxs: Vec<usize> = pairing_idxs
            .into_iter()
            .filter(|&i| i >= 0 && (i as usize) < self.pairings.len())
            .map(|i| i as usize)
            .collect();
        let crew_idx = if crew_idx < 0 { 0 } else { crew_idx as usize };
        let mut daily = self.credit_daily_map(&idxs, crew_idx);
        for (d, v) in self.ground_credit_daily_map(crew_idx) {
            *daily.entry(d).or_insert(0.0) += v;
        }
        daily.into_iter().collect()
    }

    /// Degraded-mode notes collected at construction (missing metrics baseline,
    /// gated-team rows that can never fire, FT approximation, …).
    fn warnings(&self) -> Vec<String> {
        self.engine_warnings.clone()
    }
}

/// Per-duty acclimatisation reference timezone (minutes from UTC), given parallel
/// duty arrays in chronological order.
///
/// Mirrors the internal Rust `acc_duty_refs()` used by Rule 7500 inside `check_line`.
/// Returns `[ref_tz_min, ...]` — one value per duty, same length as `starts_utc`.
#[pyfunction]
#[pyo3(signature = (starts_utc, ends_utc, dep_tz_min, arr_tz_min, stay_per_min=1440, adjust_min=60, first_flight_departures_utc=Vec::new(), last_flight_arrivals_utc=Vec::new()))]
fn acc_duty_refs_from_arrays(
    starts_utc: Vec<i64>,
    ends_utc: Vec<i64>,
    dep_tz_min: Vec<i64>,
    arr_tz_min: Vec<i64>,
    stay_per_min: i64,
    adjust_min: i64,
    first_flight_departures_utc: Vec<i64>,
    last_flight_arrivals_utc: Vec<i64>,
) -> Vec<i64> {
    let len = starts_utc
        .len()
        .min(ends_utc.len())
        .min(dep_tz_min.len())
        .min(arr_tz_min.len());
    let duties: Vec<AccDuty> = (0..len)
        .map(|i| AccDuty {
            start_utc: starts_utc[i],
            end_utc: ends_utc[i],
            first_flight_departure_utc: first_flight_departures_utc
                .get(i)
                .copied()
                .unwrap_or(starts_utc[i]),
            last_flight_arrival_utc: last_flight_arrivals_utc
                .get(i)
                .copied()
                .unwrap_or(ends_utc[i]),
            dep_tz_min: dep_tz_min[i],
            arr_tz_min: arr_tz_min[i],
        })
        .collect();
    acc_duty_refs(&duties, stay_per_min, adjust_min)
        .into_iter()
        .map(|r| r.ref_tz_min)
        .collect()
}

/// Store extra arrays for the *next* `Engine()` construction (consumed once).
///
/// Called by the PBS solver wrapper before invoking the snapshot's `run_solver.py`.
/// The next `Engine.__new__()` merges these values into any empty kwargs — no
/// monkey-patching of Python objects required.
#[pyfunction]
#[allow(clippy::too_many_arguments)]
#[pyo3(signature = (
    crew_daily_baseline = Vec::new(),
    pairing_seg_offsets = Vec::new(),
    pairing_seg_std_utc = Vec::new(),
    pairing_seg_sta_utc = Vec::new(),
    pairing_seg_blk_min = Vec::new(),
    pairing_seg_crew_offset_min = Vec::new(),
    pairing_seg_crew_sta_offset_min = Vec::new(),
    pairing_duty_offsets = Vec::new(),
    pairing_duty_start_utc = Vec::new(),
    pairing_duty_end_utc = Vec::new(),
    pairing_duty_first_flight_departure_utc = Vec::new(),
    pairing_duty_last_flight_arrival_utc = Vec::new(),
    pairing_duty_dep_tz_min = Vec::new(),
    pairing_duty_arr_tz_min = Vec::new(),
    pairing_duty_dp_min = Vec::new(),
    pairing_duty_blk_min = Vec::new(),
    pairing_duty_dp_pct = Vec::new(),
    pairing_duty_crew_offset_min = Vec::new(),
    crew_ground_is_rest = Vec::new(),
    crew_daily_metrics = Vec::new(),
    pairing_duty_credit_min = Vec::new(),
    do_start_min = None,
    do_start_assignments = None,
    do_start_groups = None,
))]
fn set_next_engine_extras(
    crew_daily_baseline: Vec<Vec<(i64, f64)>>,
    pairing_seg_offsets: Vec<i64>,
    pairing_seg_std_utc: Vec<i64>,
    pairing_seg_sta_utc: Vec<i64>,
    pairing_seg_blk_min: Vec<i64>,
    pairing_seg_crew_offset_min: Vec<Vec<i64>>,
    pairing_seg_crew_sta_offset_min: Vec<Vec<i64>>,
    pairing_duty_offsets: Vec<i64>,
    pairing_duty_start_utc: Vec<i64>,
    pairing_duty_end_utc: Vec<i64>,
    pairing_duty_first_flight_departure_utc: Vec<i64>,
    pairing_duty_last_flight_arrival_utc: Vec<i64>,
    pairing_duty_dep_tz_min: Vec<i64>,
    pairing_duty_arr_tz_min: Vec<i64>,
    pairing_duty_dp_min: Vec<i64>,
    pairing_duty_blk_min: Vec<i64>,
    pairing_duty_dp_pct: Vec<f64>,
    pairing_duty_crew_offset_min: Vec<Vec<i64>>,
    crew_ground_is_rest: Vec<Vec<bool>>,
    crew_daily_metrics: Vec<Vec<(i64, Vec<f64>)>>,
    pairing_duty_credit_min: Vec<i64>,
    do_start_min: Option<i64>,
    do_start_assignments: Option<String>,
    do_start_groups: Option<String>,
) {
    *NEXT_EXTRAS.lock().unwrap() = Some(EngineExtras {
        crew_daily_baseline,
        pairing_seg_offsets,
        pairing_seg_std_utc,
        pairing_seg_sta_utc,
        pairing_seg_blk_min,
        pairing_seg_crew_offset_min,
        pairing_seg_crew_sta_offset_min,
        pairing_duty_offsets,
        pairing_duty_start_utc,
        pairing_duty_end_utc,
        pairing_duty_first_flight_departure_utc,
        pairing_duty_last_flight_arrival_utc,
        pairing_duty_dep_tz_min,
        pairing_duty_arr_tz_min,
        pairing_duty_dp_min,
        pairing_duty_blk_min,
        pairing_duty_dp_pct,
        pairing_duty_crew_offset_min,
        crew_ground_is_rest,
        crew_daily_metrics,
        pairing_duty_credit_min,
        do_start_min,
        do_start_assignments,
        do_start_groups,
    });
}

#[pymodule]
fn rois_rule_engine_rs(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_class::<Engine>()?;
    m.add_function(wrap_pyfunction!(acc_duty_refs_from_arrays, m)?)?;
    m.add_function(wrap_pyfunction!(set_next_engine_extras, m)?)?;
    m.add("__version__", env!("CARGO_PKG_VERSION"))?;
    // Explicit __all__ so `from rois_rule_engine_rs import *` picks up free functions too.
    m.add(
        "__all__",
        vec![
            "Engine",
            "acc_duty_refs_from_arrays",
            "set_next_engine_extras",
            "__version__",
        ],
    )?;
    Ok(())
}
