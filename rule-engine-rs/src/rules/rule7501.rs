//! Shared Rule 7501 Single Day Free From Duty contract used by PyO3 and binaries.

use crate::{Application, BaseQual};

pub use crate::{
    check_sdfd_rolling, check_sdfd_rolling_app, LocalNightDef, SdfdViolation, WorkPeriod7501,
};

#[derive(Debug, Clone)]
pub struct Rule7501Row {
    pub row_id: usize,
    pub bases: Vec<String>,
    pub ranks: Vec<String>,
    pub fleets: Vec<String>,
    pub teams: Vec<String>,
    pub period_hours: i64,
    pub unit: String,
    pub duty_end_buffer_secs: i64,
    pub min_limits: i64,
}

#[derive(Debug, Clone, Default)]
pub struct Rule7501CrewContext {
    pub base_quals: Vec<BaseQual>,
    pub rank_quals: Vec<BaseQual>,
    pub fleet_quals: Vec<BaseQual>,
    pub teams: Vec<String>,
}

pub fn scope_matches_7501(row: &Rule7501Row, crew: &Rule7501CrewContext, day_ord: i64) -> bool {
    qual_scope_matches(&row.bases, &crew.base_quals, day_ord)
        && qual_scope_matches(&row.ranks, &crew.rank_quals, day_ord)
        && qual_scope_matches(&row.fleets, &crew.fleet_quals, day_ord)
        && team_scope_matches(&row.teams, &crew.teams)
}

pub fn rule7501_day_ord(start_utc: i64, offset_min: i64) -> i64 {
    (start_utc + offset_min * 60).div_euclid(86_400)
}

pub fn check_rule7501_structured(
    crew_id: &str,
    row: &Rule7501Row,
    crew: &Rule7501CrewContext,
    offset_min: i64,
    local_night: &LocalNightDef,
    checked_start_utc: i64,
    checked_end_utc: i64,
    work: &[WorkPeriod7501],
    app: Application,
    pre_assigned: &[bool],
    rest_acc_offsets: Option<&[i64]>,
    focus_intervals: &[(i64, i64)],
    focus_crew_ids: Option<&[String]>,
) -> Option<SdfdViolation> {
    if !scope_matches_7501(
        row,
        crew,
        work.first()
            .map(|duty| rule7501_day_ord(duty.start_utc, offset_min))
            .unwrap_or(0),
    ) {
        return None;
    }
    check_sdfd_rolling_app(
        crew_id,
        work,
        offset_min,
        local_night,
        row.period_hours,
        &row.unit,
        row.duty_end_buffer_secs,
        row.min_limits,
        checked_start_utc,
        checked_end_utc,
        app,
        pre_assigned,
        rest_acc_offsets,
        focus_intervals,
        focus_crew_ids,
    )
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
