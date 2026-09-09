//! Rule 7508 — F8 calendar-day variant of Single Day Free From Duty.
//!
//! The parameter table is intentionally the same shape as rule 7501. 7508
//! interprets `168 RH` and `672 RH` as 7 and 28 crew-base-local calendar days.

use std::collections::{BTreeMap, BTreeSet};

use crate::{Application, BaseQual, LocalNightDef};

const SECONDS_PER_DAY: i64 = 86_400;

#[derive(Debug, Clone)]
pub struct Rule7508Row {
    pub row_id: usize,
    pub bases: Vec<String>,
    pub ranks: Vec<String>,
    pub fleets: Vec<String>,
    pub teams: Vec<String>,
    pub period_hours: i64,
    pub unit: String,
    pub duty_report: bool,
    pub duty_release: bool,
    pub duty_end_buffer_secs: i64,
    pub min_limits: i64,
    /// Count Layover=Y keeps duty-level granularity: a layover inside a pairing
    /// can satisfy the free day. N fuses every pairing into one solid work block
    /// so only rest between pairings can satisfy it.
    pub count_layover: bool,
}

#[derive(Debug, Clone, Default)]
pub struct Rule7508CrewContext {
    pub base_quals: Vec<BaseQual>,
    pub rank_quals: Vec<BaseQual>,
    pub fleet_quals: Vec<BaseQual>,
    pub teams: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct WorkPeriod7508 {
    pub pairing_id: Option<i64>,
    pub start_utc: i64,
    pub end_utc: i64,
    pub first_flight_departure_utc: i64,
    pub last_flight_arrival_utc: i64,
    /// true for complete/off/leave/rest ground duties; false for duty.
    pub is_rest: bool,
    pub is_pre_assigned: bool,
    /// Rule 7500 ref timezone at duty start. `i64::MIN` means unavailable.
    pub start_ref_tz_min: i64,
    /// Rule 7500 ref timezone at duty end/rest start. `i64::MIN` means unavailable.
    pub end_ref_tz_min: i64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CalendarSdfdViolation {
    pub crew_id: String,
    pub window_start_utc: i64,
    pub window_end_utc: i64,
    pub total_sdfd: i64,
    pub min_limits: i64,
    pub period_hours: i64,
    pub unit: String,
}

impl CalendarSdfdViolation {
    pub fn message(&self) -> String {
        format!(
            "Single day free from duty ({}) must be at least {} in {} {}.",
            self.total_sdfd, self.min_limits, self.period_hours, self.unit
        )
    }
}

pub fn rule7508_day_ord(utc_secs: i64, offset_min: i64) -> i64 {
    (utc_secs + offset_min * 60).div_euclid(SECONDS_PER_DAY)
}

fn local_midnight_utc(day_ord: i64, offset_min: i64) -> i64 {
    day_ord * SECONDS_PER_DAY - offset_min * 60
}

fn local_night_band(day_ord: i64, offset_min: i64, lnd: &LocalNightDef) -> (i64, i64) {
    let start = local_midnight_utc(day_ord, offset_min) + lnd.start_min * 60;
    let end = if lnd.end_min <= lnd.start_min {
        local_midnight_utc(day_ord + 1, offset_min) + lnd.end_min * 60
    } else {
        local_midnight_utc(day_ord, offset_min) + lnd.end_min * 60
    };
    (start, end)
}

fn overlaps(a0: i64, a1: i64, b0: i64, b1: i64) -> bool {
    a1 > b0 && a0 < b1
}

fn ref_or(default_offset: i64, value: i64) -> i64 {
    if value == i64::MIN {
        default_offset
    } else {
        value
    }
}

fn flexible_night_fits(
    band: (i64, i64),
    rest_start: i64,
    rest_end: i64,
    min_rest_secs: i64,
) -> bool {
    let avail_start = band.0.max(rest_start);
    let avail_end = band.1.min(rest_end);
    avail_end - avail_start >= min_rest_secs
}

fn scope_matches(row: &Rule7508Row, crew: &Rule7508CrewContext, day_ord: i64) -> bool {
    qual_scope_matches(&row.bases, &crew.base_quals, day_ord)
        && qual_scope_matches(&row.ranks, &crew.rank_quals, day_ord)
        && qual_scope_matches(&row.fleets, &crew.fleet_quals, day_ord)
        && team_scope_matches(&row.teams, &crew.teams)
}

fn qual_scope_matches(filters: &[String], quals: &[BaseQual], day_ord: i64) -> bool {
    if filters.is_empty() || filters.iter().any(|value| value.trim() == "*") {
        return true;
    }
    quals.iter().any(|qual| {
        filter_matches(filters, &qual.base)
            && qual.eff_ord.unwrap_or(i64::MIN) <= day_ord
            && qual.exp_ord.unwrap_or(i64::MAX) >= day_ord
    })
}

fn team_scope_matches(filters: &[String], teams: &[String]) -> bool {
    if filters.is_empty() || filters.iter().any(|value| value.trim() == "*") {
        return true;
    }
    teams.iter().any(|team| filter_matches(filters, team))
}

fn filter_matches(filters: &[String], value: &str) -> bool {
    filters.iter().any(|filter| {
        let filter = filter.trim();
        filter.is_empty() || filter == "*" || filter.eq_ignore_ascii_case(value)
    })
}

fn merge_intervals(mut intervals: Vec<(i64, i64)>) -> Vec<(i64, i64)> {
    intervals.retain(|(s, e)| e > s);
    intervals.sort_by_key(|&(s, e)| (s, e));
    let mut merged: Vec<(i64, i64)> = Vec::new();
    for (s, e) in intervals {
        if let Some(last) = merged.last_mut() {
            if s <= last.1 {
                last.1 = last.1.max(e);
                continue;
            }
        }
        merged.push((s, e));
    }
    merged
}

/// Count Layover=N: fuse all non-rest duties of the same pairing into a single
/// solid block so layover days inside the pairing can never be a free day.
///
/// The merged block keeps the raw duty boundaries (min start / max end plus min
/// first-flight departure / max last-flight arrival) so the existing
/// `work_start_7508` / `work_end_7508` Duty Report / Release / Buffer semantics
/// apply at the pairing edges; buffers of interior duties are absorbed by the
/// span. Rest ground duties and pairing-less duties pass through unchanged.
fn merge_pairing_spans(work: &[WorkPeriod7508]) -> Vec<WorkPeriod7508> {
    let mut out: Vec<WorkPeriod7508> = Vec::with_capacity(work.len());
    let mut groups: BTreeMap<i64, Vec<&WorkPeriod7508>> = BTreeMap::new();
    let mut first_seen: Vec<i64> = Vec::new();
    for duty in work {
        let Some(pid) = duty.pairing_id.filter(|_| !duty.is_rest) else {
            out.push(duty.clone());
            continue;
        };
        if !groups.contains_key(&pid) {
            first_seen.push(pid);
        }
        groups.entry(pid).or_default().push(duty);
    }
    for pid in first_seen {
        let mut group = groups.remove(&pid).expect("pid recorded in first_seen");
        group.sort_by_key(|d| (d.start_utc, d.end_utc));
        let first = group.first().expect("group is never empty");
        let last = group.last().expect("group is never empty");
        out.push(WorkPeriod7508 {
            pairing_id: Some(pid),
            start_utc: group
                .iter()
                .map(|d| d.start_utc)
                .min()
                .unwrap_or(first.start_utc),
            end_utc: group
                .iter()
                .map(|d| d.end_utc)
                .max()
                .unwrap_or(last.end_utc),
            first_flight_departure_utc: group
                .iter()
                .map(|d| d.first_flight_departure_utc)
                .min()
                .unwrap_or(first.first_flight_departure_utc),
            last_flight_arrival_utc: group
                .iter()
                .map(|d| d.last_flight_arrival_utc)
                .max()
                .unwrap_or(last.last_flight_arrival_utc),
            is_rest: false,
            is_pre_assigned: group.iter().all(|d| d.is_pre_assigned),
            start_ref_tz_min: first.start_ref_tz_min,
            end_ref_tz_min: last.end_ref_tz_min,
        });
    }
    out
}

/// Max seconds a rest block may miss at the start and/or end of a local calendar
/// day and still count as covering that day. Absorbs airline day-boundary encodings
/// such as `[00:00, 23:59:59]`, `[00:00, 23:59:00]`, or `[00:01, next 00:00)`.
/// Mid-day holes are never forgiven.
const REST_DAY_COVER_SLACK_SECS: i64 = 60;

fn rest_covers_day(rest_intervals: &[(i64, i64)], day_start: i64, day_end: i64) -> bool {
    let mut cursor = day_start;
    let mut started = false;
    for &(s, e) in rest_intervals {
        let s = s.max(day_start);
        let e = e.min(day_end);
        if e <= s {
            continue;
        }
        if !started {
            if s > day_start + REST_DAY_COVER_SLACK_SECS {
                return false;
            }
            started = true;
            cursor = e;
        } else {
            if s > cursor {
                return false; // mid-day hole
            }
            cursor = cursor.max(e);
        }
        if cursor + REST_DAY_COVER_SLACK_SECS >= day_end {
            return true;
        }
    }
    false
}

fn period_to_days(period_hours: i64, unit: &str) -> Option<i64> {
    if unit != "RH" || period_hours <= 0 || period_hours % 24 != 0 {
        return None;
    }
    Some(period_hours / 24)
}

fn work_start_7508(row: &Rule7508Row, duty: &WorkPeriod7508) -> i64 {
    if row.duty_report {
        duty.start_utc
    } else {
        duty.first_flight_departure_utc
    }
}

/// Raw duty-end boundary without the Duty End Buffer. Used to decide whether a
/// duty occupies a local calendar day; the buffer only delays the rest start
/// (see `work_end_7508`) and must not push a duty across the local midnight.
fn work_end_raw_7508(row: &Rule7508Row, duty: &WorkPeriod7508) -> i64 {
    if row.duty_release {
        duty.end_utc
    } else {
        duty.last_flight_arrival_utc
    }
}

fn work_end_7508(row: &Rule7508Row, duty: &WorkPeriod7508) -> i64 {
    work_end_raw_7508(row, duty) + row.duty_end_buffer_secs
}

#[allow(clippy::too_many_arguments)]
pub fn check_rule7508_structured(
    crew_id: &str,
    row: &Rule7508Row,
    crew: &Rule7508CrewContext,
    base_offset_min: i64,
    local_night: &LocalNightDef,
    checked_start_utc: i64,
    checked_end_utc: i64,
    work: &[WorkPeriod7508],
    app: Application,
) -> Option<CalendarSdfdViolation> {
    check_rule7508_structured_focused(
        crew_id,
        row,
        crew,
        base_offset_min,
        local_night,
        checked_start_utc,
        checked_end_utc,
        work,
        app,
        &[],
        None,
    )
}

#[allow(clippy::too_many_arguments)]
pub fn check_rule7508_structured_focused(
    crew_id: &str,
    row: &Rule7508Row,
    crew: &Rule7508CrewContext,
    base_offset_min: i64,
    local_night: &LocalNightDef,
    checked_start_utc: i64,
    checked_end_utc: i64,
    work: &[WorkPeriod7508],
    app: Application,
    focus_intervals: &[(i64, i64)],
    focus_crew_ids: Option<&[String]>,
) -> Option<CalendarSdfdViolation> {
    let window_days = period_to_days(row.period_hours, &row.unit)?;
    if row.min_limits <= 0 || work.is_empty() || checked_end_utc <= checked_start_utc {
        return None;
    }
    let first_day = work
        .iter()
        .map(|duty| rule7508_day_ord(duty.start_utc, base_offset_min))
        .min()
        .unwrap_or(0);
    if !scope_matches(row, crew, first_day) {
        return None;
    }

    let fused;
    let work: &[WorkPeriod7508] = if row.count_layover {
        work
    } else {
        fused = merge_pairing_spans(work);
        &fused
    };

    let mut sorted = work.to_vec();
    sorted.sort_by_key(|d| (d.start_utc, d.end_utc));
    let raw_work = sorted
        .iter()
        .filter(|d| !d.is_rest)
        .map(|d| (work_start_7508(row, d), work_end_raw_7508(row, d), d))
        .collect::<Vec<_>>();
    let work_intervals = merge_intervals(
        raw_work
            .iter()
            .map(|(s, e, _)| (*s, *e))
            .collect::<Vec<_>>(),
    );

    let checked_start_day = rule7508_day_ord(checked_start_utc, base_offset_min);
    let checked_end_day = rule7508_day_ord(checked_end_utc - 1, base_offset_min);
    let scan_start_day = checked_start_day - window_days - 2;
    let scan_end_day = checked_end_day + window_days + 2;
    let mut qualifying_days = BTreeSet::new();

    for day in scan_start_day..=scan_end_day {
        let day_start = local_midnight_utc(day, base_offset_min);
        let day_end = day_start + SECONDS_PER_DAY;
        if work_intervals
            .iter()
            .any(|&(s, e)| overlaps(s, e, day_start, day_end))
        {
            continue;
        }

        let touched = sorted
            .iter()
            .filter(|d| {
                if d.is_rest {
                    overlaps(d.start_utc, d.end_utc, day_start, day_end)
                } else {
                    overlaps(
                        work_start_7508(row, d),
                        work_end_raw_7508(row, d),
                        day_start,
                        day_end,
                    )
                }
            })
            .collect::<Vec<_>>();
        if !touched.is_empty() {
            if touched.iter().any(|d| !d.is_rest) {
                continue;
            }
            let rest_intervals = merge_intervals(
                touched
                    .iter()
                    .map(|d| (d.start_utc, d.end_utc))
                    .collect::<Vec<_>>(),
            );
            if !rest_covers_day(&rest_intervals, day_start, day_end) {
                continue;
            }
        }

        let prev = sorted
            .iter()
            .filter(|d| !d.is_rest && work_end_raw_7508(row, d) <= day_start)
            .max_by_key(|d| work_end_raw_7508(row, d));
        let next = sorted
            .iter()
            .filter(|d| !d.is_rest && work_start_7508(row, d) >= day_end)
            .min_by_key(|d| work_start_7508(row, d));
        let rest_start = prev
            .map(|d| work_end_7508(row, d))
            .unwrap_or(checked_start_utc - row.period_hours * 3600);
        let rest_end = next
            .map(|d| work_start_7508(row, d))
            .unwrap_or(checked_end_utc + row.period_hours * 3600);
        if rest_end <= rest_start {
            continue;
        }
        let prev_offset = prev
            .map(|d| ref_or(base_offset_min, d.end_ref_tz_min))
            .unwrap_or(base_offset_min);
        let next_offset = next
            .map(|d| ref_or(base_offset_min, d.start_ref_tz_min))
            .unwrap_or(base_offset_min);
        let prev_band = local_night_band(day - 1, prev_offset, local_night);
        let next_band = local_night_band(day, next_offset, local_night);
        if flexible_night_fits(prev_band, rest_start, rest_end, local_night.min_rest_secs)
            && flexible_night_fits(next_band, rest_start, rest_end, local_night.min_rest_secs)
        {
            qualifying_days.insert(day);
        }
    }

    let mut violating_windows = Vec::new();
    for ws_day in (checked_start_day - window_days + 1)..=checked_end_day {
        let we_day = ws_day + window_days;
        let ws = local_midnight_utc(ws_day, base_offset_min);
        let we = local_midnight_utc(we_day, base_offset_min);
        if we <= checked_start_utc || ws >= checked_end_utc {
            continue;
        }
        let has_work = work_intervals.iter().any(|&(s, e)| overlaps(s, e, ws, we));
        if !has_work {
            continue;
        }
        let count = qualifying_days.range(ws_day..we_day).count() as i64;
        if count >= row.min_limits {
            continue;
        }
        if app.is_optimizer() && (row.period_hours == 168 || row.period_hours == 672) {
            let has_non_pa = raw_work
                .iter()
                .any(|(s, e, d)| !d.is_pre_assigned && overlaps(*s, *e, ws, we));
            if !has_non_pa {
                continue;
            }
        }
        violating_windows.push((count, ws));
    }

    let crew_focus_intervals = match focus_crew_ids {
        Some(ids) if !ids.is_empty() && !ids.iter().any(|id| id == crew_id) => &[][..],
        _ => focus_intervals,
    };
    let focused_worst = if crew_focus_intervals.is_empty() {
        None
    } else {
        violating_windows
            .iter()
            .filter(|&&(_, ws)| {
                crew_focus_intervals
                    .iter()
                    .any(|&(f0, f1)| overlaps(ws, ws + window_days * SECONDS_PER_DAY, f0, f1))
            })
            .min_by_key(|&&(count, ws)| (count, ws))
            .copied()
    };
    let worst = if !crew_focus_intervals.is_empty() {
        focused_worst
    } else {
        focused_worst.or_else(|| {
            violating_windows
                .iter()
                .min_by_key(|&&(count, ws)| (count, ws))
                .copied()
        })
    };

    worst.map(|(total_sdfd, window_start_utc)| CalendarSdfdViolation {
        crew_id: crew_id.to_string(),
        window_start_utc,
        window_end_utc: window_start_utc + window_days * SECONDS_PER_DAY,
        total_sdfd,
        min_limits: row.min_limits,
        period_hours: row.period_hours,
        unit: row.unit.clone(),
    })
}
