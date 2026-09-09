//! Shared scope matching for structured rule inputs.

use crate::{parse_date_ord, BaseQual};

#[derive(Debug, Clone, Default)]
pub struct CrewScope {
    pub bases: Vec<BaseQual>,
    pub ranks: Vec<BaseQual>,
    pub fleets: Vec<BaseQual>,
    pub teams: Vec<String>,
}

pub fn split_filter(value: &str) -> Vec<String> {
    value
        .split(['|', ','])
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .map(str::to_string)
        .collect()
}

pub fn parse_qualification_ord(value: &str) -> Option<i64> {
    let value = value.trim();
    if value.is_empty() || value == "-1" {
        return None;
    }
    value.parse::<i64>().ok().or_else(|| parse_date_ord(value))
}

fn wildcard(filters: &[String]) -> bool {
    filters.is_empty()
        || filters
            .iter()
            .all(|value| value.trim().is_empty() || value.trim() == "*")
}

fn filter_matches(filters: &[String], value: &str) -> bool {
    filters.iter().any(|filter| {
        let filter = filter.trim();
        filter.is_empty() || filter == "*" || filter.eq_ignore_ascii_case(value)
    })
}

fn qualifications_match(filters: &[String], quals: &[BaseQual], day_ord: i64) -> bool {
    wildcard(filters)
        || quals.iter().any(|qual| {
            filter_matches(filters, &qual.base)
                && qual.eff_ord.unwrap_or(i64::MIN) <= day_ord
                && qual.exp_ord.unwrap_or(i64::MAX) >= day_ord
        })
}

fn teams_match(filters: &[String], teams: &[String]) -> bool {
    wildcard(filters) || teams.iter().any(|team| filter_matches(filters, team))
}

pub fn matches_scope(
    bases: &[String],
    ranks: &[String],
    fleets: &[String],
    teams: &[String],
    context: &CrewScope,
    day_ord: i64,
) -> bool {
    qualifications_match(bases, &context.bases, day_ord)
        && qualifications_match(ranks, &context.ranks, day_ord)
        && qualifications_match(fleets, &context.fleets, day_ord)
        && teams_match(teams, &context.teams)
}
