//! Shared Rule 7305: limit maximum consecutive duty times/days.
//!
//! The implementation follows the C++ `LimitMaxConsecutiveDutyTimesForPRRule`
//! contract. Inputs are normalized so the same kernel can be used by the PBS
//! connector and the Live/Scenario batch binary.

use crate::Application;

const DAY_SECS: i64 = 86_400;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Rule7305ConsecutiveType {
    Times,
    Days,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rule7305 {
    pub bases: Vec<String>,
    pub ranks: Vec<String>,
    pub positions: Vec<String>,
    pub fleets: Vec<String>,
    pub teams: Vec<String>,
    pub assignment_groups: Vec<String>,
    pub assignments: Vec<String>,
    pub labels: Vec<String>,
    pub attributes: Vec<String>,
    pub labels_text: String,
    pub attributes_text: String,
    pub consecutive_type: Rule7305ConsecutiveType,
    pub max_consecutive: i64,
    pub severity: i32,
}

impl Rule7305 {
    pub fn from_cells(cells: &[&str]) -> Result<Self, String> {
        if cells.len() != 12 {
            return Err(format!(
                "Rule 7305 requires exactly 12 parameter cells, got {}",
                cells.len()
            ));
        }

        let labels_text = normalize_text(cells[7]);
        let attributes_text = normalize_text(cells[8]);
        let consecutive_type = match cells[9].trim().to_ascii_uppercase().as_str() {
            "T" => Rule7305ConsecutiveType::Times,
            "D" => Rule7305ConsecutiveType::Days,
            value => {
                return Err(format!(
                    "Rule 7305 Consecutive Type (T/D) must be T or D, got {value:?}"
                ))
            }
        };
        let max_consecutive = cells[10].trim().parse::<i64>().map_err(|_| {
            format!(
                "Rule 7305 Max Consecutive Times must be numeric, got {:?}",
                cells[10]
            )
        })?;
        let severity = cells[11]
            .trim()
            .parse::<i32>()
            .map_err(|_| format!("Rule 7305 Severity must be numeric, got {:?}", cells[11]))?;

        Ok(Self {
            bases: split_filter(cells[0]),
            ranks: split_filter(cells[1]),
            positions: split_filter(cells[2]),
            fleets: split_filter(cells[3]),
            teams: split_filter(cells[4]),
            assignment_groups: split_filter(cells[5]),
            assignments: split_filter(cells[6]),
            labels: split_filter(cells[7]),
            attributes: split_filter(cells[8]),
            labels_text,
            attributes_text,
            consecutive_type,
            max_consecutive,
            severity,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rule7305Duty {
    pub activity_id: i64,
    pub pairing_id: Option<i64>,
    pub start_utc: i64,
    pub duty_end_utc: i64,
    pub rest_end_utc: i64,
    pub local_offset_min: i64,
    pub assignment: String,
    pub assignment_group: String,
    pub attributes: Vec<String>,
    pub label: String,
    pub is_ground: bool,
    pub pre_assigned: bool,
    pub phase_checked: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Rule7305CrewContext {
    pub base_quals: Vec<(String, i64, i64)>,
    pub rank_quals: Vec<(String, i64, i64)>,
    pub position_quals: Vec<(String, i64, i64)>,
    pub fleet_quals: Vec<(String, i64, i64)>,
    pub teams: Vec<String>,
    pub assignment_group_map: Vec<(String, String)>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rule7305Violation {
    pub crew_id: String,
    pub activity_id: i64,
    pub pairing_id: Option<i64>,
    pub start_utc: i64,
    pub end_utc: i64,
    pub actual: i64,
    pub limit: i64,
    pub severity: i32,
    pub message: String,
}

pub fn check_rule7305_row(
    crew_id: &str,
    rule: &Rule7305,
    duties: &[Rule7305Duty],
    crew: &Rule7305CrewContext,
    checked_start_utc: i64,
    checked_end_utc: i64,
    application: Application,
) -> Vec<Rule7305Violation> {
    if duties.is_empty() || checked_end_utc < checked_start_utc {
        return Vec::new();
    }

    let checked_start_day = checked_start_utc.div_euclid(DAY_SECS);
    let checked_end_day = checked_end_utc.div_euclid(DAY_SECS);
    if !crew_scope_matches(rule, crew, checked_start_day, checked_end_day) {
        return Vec::new();
    }

    let mut ordered = duties.to_vec();
    ordered.sort_by_key(|duty| (duty.start_utc, duty.duty_end_utc, duty.activity_id));

    let mut violations = Vec::new();
    let mut run: Vec<Rule7305Duty> = Vec::new();
    let mut actual = 0_i64;

    let flush = |run: &mut Vec<Rule7305Duty>,
                 actual: &mut i64,
                 violations: &mut Vec<Rule7305Violation>| {
        if run.is_empty() {
            *actual = 0;
            return;
        }
        if *actual > rule.max_consecutive
            && (application != Application::Optimizer || run.iter().any(|duty| !duty.pre_assigned))
        {
            let first = &run[0];
            let last = run.last().expect("non-empty run");
            let first_date = format_local_ymd(first.start_utc, first.local_offset_min);
            let last_date = format_local_ymd(
                exclusive_end_utc(last.duty_end_utc, last.local_offset_min),
                last.local_offset_min,
            );
            let message = match rule.consecutive_type {
                Rule7305ConsecutiveType::Times => format!(
                    "The number of consecutive rosters ({actual}) [{first_date}, {last_date}] exceeds the threshold ({}).",
                    rule.max_consecutive
                ),
                Rule7305ConsecutiveType::Days => format!(
                    "The number of consecutive roster days ({actual}) [{first_date}, {last_date}] exceeds the threshold ({}).",
                    rule.max_consecutive
                ),
            };
            violations.push(Rule7305Violation {
                crew_id: crew_id.to_string(),
                activity_id: first.activity_id,
                pairing_id: first.pairing_id,
                start_utc: first.start_utc,
                end_utc: last.rest_end_utc,
                actual: *actual,
                limit: rule.max_consecutive,
                severity: rule.severity,
                message,
            });
        }
        run.clear();
        *actual = 0;
    };

    for duty in ordered {
        if !duty.phase_checked || !duty_matches(rule, &duty, crew) {
            flush(&mut run, &mut actual, &mut violations);
            continue;
        }

        let contribution = if let Some(previous) = run.last() {
            consecutive_contribution(rule.consecutive_type, previous, &duty)
        } else {
            Some(first_contribution(rule.consecutive_type, &duty))
        };

        if let Some(contribution) = contribution {
            run.push(duty);
            actual += contribution;
        } else {
            flush(&mut run, &mut actual, &mut violations);
            actual = first_contribution(rule.consecutive_type, &duty);
            run.push(duty);
        }
    }
    flush(&mut run, &mut actual, &mut violations);
    violations
}

fn normalize_text(value: &str) -> String {
    let value = value.trim();
    if value.is_empty() {
        "*".to_string()
    } else {
        value.to_string()
    }
}

fn split_filter(value: &str) -> Vec<String> {
    let value = value.trim();
    if value.is_empty() || value == "*" {
        return vec!["*".to_string()];
    }
    value
        .split('|')
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(ToString::to_string)
        .collect()
}

fn is_wildcard(filters: &[String]) -> bool {
    filters.is_empty()
        || filters
            .iter()
            .any(|value| value.trim().is_empty() || value.trim() == "*")
}

fn value_matches(filters: &[String], value: &str) -> bool {
    is_wildcard(filters)
        || filters
            .iter()
            .any(|filter| filter.eq_ignore_ascii_case(value.trim()))
}

fn qualification_matches(
    filters: &[String],
    qualifications: &[(String, i64, i64)],
    start_day: i64,
    end_day: i64,
) -> bool {
    if is_wildcard(filters) {
        return true;
    }
    qualifications.iter().any(|(value, eff, exp)| {
        let effective_end = if *exp < 0 { i64::MAX } else { *exp };
        value_matches(filters, value) && *eff <= start_day && end_day < effective_end
    })
}

fn crew_scope_matches(
    rule: &Rule7305,
    crew: &Rule7305CrewContext,
    start_day: i64,
    end_day: i64,
) -> bool {
    qualification_matches(&rule.bases, &crew.base_quals, start_day, end_day)
        && qualification_matches(&rule.ranks, &crew.rank_quals, start_day, end_day)
        && qualification_matches(&rule.positions, &crew.position_quals, start_day, end_day)
        && qualification_matches(&rule.fleets, &crew.fleet_quals, start_day, end_day)
        && (is_wildcard(&rule.teams)
            || crew
                .teams
                .iter()
                .any(|team| value_matches(&rule.teams, team)))
}

fn duty_matches(rule: &Rule7305, duty: &Rule7305Duty, crew: &Rule7305CrewContext) -> bool {
    if !value_matches(&rule.assignments, &duty.assignment) {
        return false;
    }
    if !assignment_group_matches(rule, duty, crew) {
        return false;
    }
    if !attribute_matches(&rule.attributes, &duty.attributes) {
        return false;
    }
    if !is_wildcard(&rule.labels) && (duty.is_ground || !value_matches(&rule.labels, &duty.label)) {
        return false;
    }
    true
}

fn assignment_group_matches(
    rule: &Rule7305,
    duty: &Rule7305Duty,
    crew: &Rule7305CrewContext,
) -> bool {
    if is_wildcard(&rule.assignment_groups) {
        return true;
    }
    if value_matches(&rule.assignment_groups, &duty.assignment_group) {
        return true;
    }
    crew.assignment_group_map.iter().any(|(assignment, group)| {
        assignment.eq_ignore_ascii_case(&duty.assignment)
            && value_matches(&rule.assignment_groups, group)
    })
}

fn attribute_matches(filters: &[String], attributes: &[String]) -> bool {
    is_wildcard(filters)
        || attributes
            .iter()
            .any(|attribute| value_matches(filters, attribute))
}

fn local_day(utc: i64, offset_min: i64) -> i64 {
    (utc + offset_min * 60).div_euclid(DAY_SECS)
}

/// If `end` falls exactly on crew-base local midnight, treat the interval as half-open
/// `[start, end)` by backing off one second (same contract as 7505 DO paint).
fn exclusive_end_utc(end_utc: i64, offset_min: i64) -> i64 {
    if (end_utc + offset_min * 60) % DAY_SECS == 0 {
        end_utc - 1
    } else {
        end_utc
    }
}

fn occupy_local_day(utc: i64, offset_min: i64) -> i64 {
    local_day(exclusive_end_utc(utc, offset_min), offset_min)
}

/// Format a UTC instant as `YYYY-MM-DD` in the duty's local (crew-base) offset.
fn format_local_ymd(utc: i64, offset_min: i64) -> String {
    ymd_from_unix_day(local_day(utc, offset_min))
}

/// Civil date from days since Unix epoch (Howard Hinnant algorithm).
fn ymd_from_unix_day(day: i64) -> String {
    let z = day + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 }.div_euclid(146_097);
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02}")
}

fn calendar_span(start_utc: i64, rest_end_utc: i64, offset_min: i64) -> i64 {
    occupy_local_day(rest_end_utc, offset_min) - local_day(start_utc, offset_min) + 1
}

fn first_contribution(kind: Rule7305ConsecutiveType, duty: &Rule7305Duty) -> i64 {
    match kind {
        Rule7305ConsecutiveType::Times => 1,
        Rule7305ConsecutiveType::Days => {
            calendar_span(duty.start_utc, duty.rest_end_utc, duty.local_offset_min)
        }
    }
}

fn consecutive_contribution(
    kind: Rule7305ConsecutiveType,
    previous: &Rule7305Duty,
    current: &Rule7305Duty,
) -> Option<i64> {
    let gap = local_day(current.start_utc, current.local_offset_min)
        - occupy_local_day(previous.rest_end_utc, previous.local_offset_min);
    match kind {
        Rule7305ConsecutiveType::Times if gap == 0 || gap == 1 => Some(1),
        Rule7305ConsecutiveType::Days if gap == 0 => Some(
            calendar_span(
                current.start_utc,
                current.rest_end_utc,
                current.local_offset_min,
            ) - 1,
        ),
        Rule7305ConsecutiveType::Days if gap == 1 => Some(calendar_span(
            current.start_utc,
            current.rest_end_utc,
            current.local_offset_min,
        )),
        _ => None,
    }
}
