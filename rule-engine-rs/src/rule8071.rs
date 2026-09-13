//! Rule 8071 — roster property count checks.
//!
//! The checker evaluates one parsed 8071 parameter row for one crew over UTC
//! calendar windows and emits violations for over-max or editor-only under-min
//! counts. It is intentionally std-only for use by the standalone ruletool
//! binaries.

use std::collections::{BTreeMap, BTreeSet};

use crate::{civil_from_days, days_from_civil, Application};

const DAY: i64 = 86_400;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Rule8071Countries {
    Disabled,
    Include(BTreeSet<String>),
    Exclude(BTreeSet<String>),
    Invalid(String),
}

impl Rule8071Countries {
    pub fn is_enabled(&self) -> bool {
        !matches!(self, Self::Disabled | Self::Invalid(_))
    }

    pub fn matches(&self, countries: &[String]) -> bool {
        match self {
            Self::Disabled | Self::Invalid(_) => true,
            Self::Include(wanted) => countries.iter().any(|country| wanted.contains(country)),
            Self::Exclude(excluded) => countries
                .iter()
                .filter(|country| !country.trim().is_empty())
                .any(|country| !excluded.contains(country)),
        }
    }

    pub fn matches_set(&self, countries: &BTreeSet<String>) -> bool {
        match self {
            Self::Disabled | Self::Invalid(_) => true,
            Self::Include(wanted) => countries.iter().any(|country| wanted.contains(country)),
            Self::Exclude(excluded) => countries.iter().any(|country| !excluded.contains(country)),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Rule8071Mode {
    Flight,
    Duty,
    Roster,
}

impl Rule8071Mode {
    pub fn parse(raw: &str) -> Rule8071Mode {
        match raw.trim().to_ascii_uppercase().as_str() {
            "F" => Rule8071Mode::Flight,
            "D" => Rule8071Mode::Duty,
            _ => Rule8071Mode::Roster,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Rule8071Mode::Flight => "F",
            Rule8071Mode::Duty => "D",
            Rule8071Mode::Roster => "R",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Rule8071Unit {
    Cd,
    Cw,
    Cm,
    Rp,
}

impl Rule8071Unit {
    pub fn parse(raw: &str) -> Option<Rule8071Unit> {
        match raw.trim().to_ascii_uppercase().as_str() {
            "CD" => Some(Rule8071Unit::Cd),
            "CW" => Some(Rule8071Unit::Cw),
            "CM" => Some(Rule8071Unit::Cm),
            "RP" => Some(Rule8071Unit::Rp),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Rule8071Unit::Cd => "CD",
            Rule8071Unit::Cw => "CW",
            Rule8071Unit::Cm => "CM",
            Rule8071Unit::Rp => "RP",
        }
    }
}

#[derive(Debug, Clone)]
pub struct Rule8071 {
    pub bases: Vec<String>,
    pub ranks: Vec<String>,
    pub fleets: Vec<String>,
    pub teams: Vec<String>,
    pub labels: Vec<String>,
    pub attributes: Vec<String>,
    pub override_duty_attributes: Vec<String>,
    pub assignment_groups: Vec<String>,
    pub assignments: Vec<String>,
    pub qualifiers: Vec<String>,
    pub flights: Vec<String>,
    pub destinations: Vec<String>,
    pub countries: Rule8071Countries,
    pub positions: Vec<String>,
    pub period: i64,
    pub unit: Rule8071Unit,
    pub max_times: f64,
    pub min_times: f64,
    pub mode: Rule8071Mode,
    pub country_warning: Option<String>,
}

impl Rule8071 {
    pub fn from_cells(cells: &[&str]) -> Result<Rule8071, String> {
        if cells.len() != 17 && cells.len() != 18 && cells.len() != 19 {
            return Err(format!(
                "rule 8071 expects 17, 18, or 19 cells, got {}",
                cells.len()
            ));
        }
        let (assignments_raw, qualifier_idx, flights_idx, destinations_idx, countries_raw, positions_idx, period_idx) = match cells.len() {
            19 => (cells[8], 9, 10, 11, cells[12], 13, 14),
            18 => ("*", 8, 9, 10, cells[11], 12, 13),
            _ => ("*", 8, 9, 10, "", 11, 12),
        };
        let period = cells[period_idx]
            .trim()
            .parse::<i64>()
            .map_err(|_| format!("invalid rule 8071 period {:?}", cells[period_idx]))?;
        let unit = Rule8071Unit::parse(cells[period_idx + 1])
            .ok_or_else(|| format!("invalid rule 8071 unit {:?}", cells[period_idx + 1]))?;
        let max_times = parse_limit(cells[period_idx + 2], 999_999.0);
        let min_times = parse_limit(cells[period_idx + 3], 0.0);
        let (countries, country_warning) = parse_countries(countries_raw);

        Ok(Rule8071 {
            bases: split_list(cells[0]),
            ranks: split_list(cells[1]),
            fleets: split_list(cells[2]),
            teams: split_list(cells[3]),
            labels: split_list(cells[4]),
            attributes: split_list(cells[5]),
            override_duty_attributes: split_list(cells[6]),
            assignment_groups: split_list(cells[7]),
            assignments: split_list(assignments_raw),
            qualifiers: split_list(cells[qualifier_idx]),
            flights: split_list(cells[flights_idx]),
            destinations: split_list(cells[destinations_idx]),
            countries,
            positions: split_list(cells[positions_idx]),
            period,
            unit,
            max_times,
            min_times,
            mode: Rule8071Mode::parse(cells[period_idx + 4]),
            country_warning,
        })
    }

    pub fn country_matches(&self, countries: &[String]) -> bool {
        self.countries.matches(countries)
    }

    pub fn scope_key(&self) -> String {
        let raw = format!(
            "{}{}:{}:{}:{}:{}",
            self.period,
            self.unit.as_str(),
            self.flights.join("|"),
            self.assignment_groups.join("|"),
            self.assignments.join("|"),
            self.mode.as_str(),
        );
        raw.chars().take(40).collect()
    }

    /// True when the row narrows on Labels / Attributes / Destinations / Countries
    /// (any is a concrete value rather than the wildcard "*"). Such rows count a
    /// specific sub-set of roster properties, so each matching pairing must be
    /// reported separately; a fully-wildcard row keeps the legacy single-finding
    /// anchor (max pairing_id) behaviour.
    pub fn is_narrowed_by_property_filters(&self) -> bool {
        !is_wildcard(&self.labels)
            || !is_wildcard(&self.attributes)
            || !is_wildcard(&self.assignments)
            || !is_wildcard(&self.destinations)
            || self.countries.is_enabled()
    }
}

#[derive(Debug, Clone)]
pub struct RosterPropertyActivity {
    pub crew_id: String,
    pub pairing_id: i64,
    pub duty_seq: i64,
    pub segment_id: i64,
    pub start_utc: i64,
    pub end_utc: i64,
    pub bases: Vec<String>,
    pub ranks: Vec<String>,
    pub fleets: Vec<String>,
    pub teams: Vec<String>,
    pub labels: Vec<String>,
    pub attributes: Vec<String>,
    pub override_duty_attributes: Vec<String>,
    pub assignment_group: String,
    pub assignment: String,
    pub qualifier: String,
    pub flight_number: String,
    pub destination: String,
    pub position: String,
    pub destination_country: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Rule8071Violation {
    pub crew_id: String,
    pub anchor_pairing_id: i64,
    pub window_start_utc: i64,
    pub window_end_utc: i64,
    pub actual_count: f64,
    pub max_times: f64,
    pub min_times: f64,
    pub mode: Rule8071Mode,
    pub over: bool,
}

/// Group each activity's destination_country by pairing_id (uppercased, de-duplicated) — the
/// `pairing_countries` shape `check_roster_properties_row_with_country_sets`'s Countries filter
/// needs. Exposed so callers that must reach the group-map-aware variant directly (it has no
/// convenience wrapper that derives this automatically) don't have to duplicate the grouping.
pub fn derive_pairing_countries(
    activities: &[RosterPropertyActivity],
) -> BTreeMap<i64, BTreeSet<String>> {
    let mut pairing_countries: BTreeMap<i64, BTreeSet<String>> = BTreeMap::new();
    for activity in activities {
        if !activity.destination_country.trim().is_empty() {
            pairing_countries
                .entry(activity.pairing_id)
                .or_default()
                .insert(activity.destination_country.trim().to_ascii_uppercase());
        }
    }
    pairing_countries
}

pub fn check_roster_properties_row(
    crew_id: &str,
    rule: &Rule8071,
    activities: &[RosterPropertyActivity],
    checked_start_utc: i64,
    checked_end_utc: i64,
    roster_periods: &[(i64, i64)],
    app: Application,
) -> Vec<Rule8071Violation> {
    let pairing_countries = derive_pairing_countries(activities);
    check_roster_properties_row_with_country_sets(
        crew_id,
        rule,
        activities,
        checked_start_utc,
        checked_end_utc,
        roster_periods,
        app,
        Some(&pairing_countries),
    )
}

pub fn check_roster_properties_row_with_country_sets(
    crew_id: &str,
    rule: &Rule8071,
    activities: &[RosterPropertyActivity],
    checked_start_utc: i64,
    checked_end_utc: i64,
    roster_periods: &[(i64, i64)],
    app: Application,
    pairing_countries: Option<&BTreeMap<i64, BTreeSet<String>>>,
) -> Vec<Rule8071Violation> {
    check_roster_properties_row_with_group_map(
        crew_id,
        rule,
        activities,
        checked_start_utc,
        checked_end_utc,
        roster_periods,
        app,
        pairing_countries,
        &[],
    )
}

/// Same as [`check_roster_properties_row_with_country_sets`], plus the (assignment,
/// assignment_group) many-to-many map so "Assignment Groups" also matches an activity whose
/// specific assignment code is mapped into the filtered group (see [`group_or_mapped_matches`]).
#[allow(clippy::too_many_arguments)]
pub fn check_roster_properties_row_with_group_map(
    crew_id: &str,
    rule: &Rule8071,
    activities: &[RosterPropertyActivity],
    checked_start_utc: i64,
    checked_end_utc: i64,
    roster_periods: &[(i64, i64)],
    app: Application,
    pairing_countries: Option<&BTreeMap<i64, BTreeSet<String>>>,
    group_map: &[(String, String)],
) -> Vec<Rule8071Violation> {
    let (matching_start_utc, matching_end_utc) = match rule.unit {
        Rule8071Unit::Cm => {
            let start = month_start(checked_start_utc);
            (
                start,
                add_months(month_start(checked_end_utc), rule.period) - 1,
            )
        }
        _ => (checked_start_utc, checked_end_utc),
    };
    let matching: Vec<&RosterPropertyActivity> = activities
        .iter()
        .filter(|activity| activity.crew_id == crew_id)
        .filter(|activity| {
            overlaps(
                activity.start_utc,
                activity.end_utc,
                matching_start_utc,
                matching_end_utc,
            )
        })
        .filter(|activity| {
            if !rule.countries.is_enabled() {
                return true;
            }
            pairing_countries
                .and_then(|sets| sets.get(&activity.pairing_id))
                .map(|countries| rule.countries.matches_set(countries))
                .unwrap_or(false)
        })
        .filter(|activity| activity_matches(rule, activity, group_map))
        .collect();

    let windows = enumerate_8071_windows(
        rule.unit,
        rule.period,
        &matching,
        checked_start_utc,
        checked_end_utc,
        roster_periods,
    );
    let first_positive_pairing = activities
        .iter()
        .filter(|activity| activity.crew_id == crew_id && activity.pairing_id > 0)
        .map(|activity| activity.pairing_id)
        .next()
        .unwrap_or(0);

    let mut out = Vec::new();
    for (w0, w1) in windows {
        if !overlaps(w0, w1, checked_start_utc, checked_end_utc) {
            continue;
        }
        let rows: Vec<&RosterPropertyActivity> = matching
            .iter()
            .copied()
            .filter(|activity| overlaps(activity.start_utc, activity.end_utc, w0, w1))
            .collect();
        let actual_count = count_rows(rule.mode, &rows);
        let over = actual_count > rule.max_times;
        let under =
            app == Application::Editor && rule.min_times > 0.0 && actual_count < rule.min_times;
        if !(over || under) {
            continue;
        }
        if rule.is_narrowed_by_property_filters() {
            // Narrowed rows count a specific property sub-set, so each matching
            // pairing is reported separately (its pairing_id becomes the anchor),
            // letting the gantt light every violation pairing rather than only the
            // max-pairing_id one. Pairing_ids are deduped for determinism.
            let pairing_ids: Vec<i64> = rows
                .iter()
                .filter(|activity| activity.pairing_id > 0)
                .map(|activity| activity.pairing_id)
                .collect::<std::collections::BTreeSet<_>>()
                .into_iter()
                .collect();
            if pairing_ids.is_empty() {
                out.push(Rule8071Violation {
                    crew_id: crew_id.to_string(),
                    anchor_pairing_id: anchor_pairing_id(&rows, first_positive_pairing),
                    window_start_utc: w0,
                    window_end_utc: w1,
                    actual_count,
                    max_times: rule.max_times,
                    min_times: rule.min_times,
                    mode: rule.mode,
                    over,
                });
            } else {
                for pairing_id in pairing_ids {
                    let pairing_rows: Vec<&RosterPropertyActivity> = rows
                        .iter()
                        .copied()
                        .filter(|activity| activity.pairing_id == pairing_id)
                        .collect();
                    out.push(Rule8071Violation {
                        crew_id: crew_id.to_string(),
                        anchor_pairing_id: pairing_id,
                        window_start_utc: w0,
                        window_end_utc: w1,
                        actual_count: count_rows(rule.mode, &pairing_rows),
                        max_times: rule.max_times,
                        min_times: rule.min_times,
                        mode: rule.mode,
                        over,
                    });
                }
            }
        } else {
            out.push(Rule8071Violation {
                crew_id: crew_id.to_string(),
                anchor_pairing_id: anchor_pairing_id(&rows, first_positive_pairing),
                window_start_utc: w0,
                window_end_utc: w1,
                actual_count,
                max_times: rule.max_times,
                min_times: rule.min_times,
                mode: rule.mode,
                over,
            });
        }
    }

    out
}

pub(crate) fn split_list(raw: &str) -> Vec<String> {
    let raw = raw.trim();
    if raw.is_empty() || raw == "*" {
        return vec!["*".to_string()];
    }
    let values: Vec<String> = raw
        .split('|')
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect();
    if values.is_empty() {
        vec!["*".to_string()]
    } else {
        values
    }
}

fn parse_limit(raw: &str, default_value: f64) -> f64 {
    let raw = raw.trim();
    if raw.is_empty() || raw == "*" {
        default_value
    } else {
        raw.parse::<f64>().unwrap_or(default_value)
    }
}

fn parse_countries(raw: &str) -> (Rule8071Countries, Option<String>) {
    let raw = raw.trim();
    if raw.is_empty() || raw == "*" {
        return (Rule8071Countries::Disabled, None);
    }
    let (exclude, body) =
        if let Some(body) = raw.strip_prefix("!(").and_then(|v| v.strip_suffix(')')) {
            (true, body)
        } else {
            (false, raw)
        };
    let separator = if exclude { '+' } else { '|' };
    let values: Option<BTreeSet<String>> = body
        .split(separator)
        .map(|value| value.trim().to_ascii_uppercase())
        .map(|value| {
            if value.len() == 2 && value.bytes().all(|b| b.is_ascii_alphabetic()) {
                Some(value)
            } else {
                None
            }
        })
        .collect();
    match values {
        Some(values) if !values.is_empty() => {
            if exclude {
                (Rule8071Countries::Exclude(values), None)
            } else {
                (Rule8071Countries::Include(values), None)
            }
        }
        _ => (
            Rule8071Countries::Invalid(raw.to_string()),
            Some(format!(
                "8071 Countries {raw:?}: invalid syntax; country filter disabled"
            )),
        ),
    }
}

fn list_matches(list: &[String], target: &str) -> bool {
    target == "*" || is_wildcard(list) || list.iter().any(|value| value == target)
}

/// Crew-team filters are membership checks: an activity with unknown/wildcard teams
/// must NOT satisfy a concrete Crew Teams row (e.g. DOMO). Empty teams also fail.
fn teams_match(rule_teams: &[String], activity_teams: &[String]) -> bool {
    if is_wildcard(rule_teams) {
        return true;
    }
    let concrete: Vec<&String> = activity_teams
        .iter()
        .filter(|team| !team.is_empty() && *team != "*")
        .collect();
    if concrete.is_empty() {
        return false;
    }
    concrete
        .iter()
        .any(|team| rule_teams.iter().any(|want| want == *team))
}

fn vector_matches(list: &[String], targets: &[String]) -> bool {
    is_wildcard(list) || targets.iter().any(|target| list_matches(list, target))
}

fn is_wildcard(list: &[String]) -> bool {
    list.is_empty() || list.iter().any(|value| value == "*")
}

fn activity_matches(
    rule: &Rule8071,
    activity: &RosterPropertyActivity,
    group_map: &[(String, String)],
) -> bool {
    vector_matches(&rule.bases, &activity.bases)
        && vector_matches(&rule.ranks, &activity.ranks)
        && vector_matches(&rule.fleets, &activity.fleets)
        && teams_match(&rule.teams, &activity.teams)
        && vector_matches(&rule.labels, &activity.labels)
        && vector_matches(&rule.attributes, &activity.attributes)
        && vector_matches(
            &rule.override_duty_attributes,
            &activity.override_duty_attributes,
        )
        && crate::group_or_mapped_matches(
            &rule.assignment_groups,
            &activity.assignment_group,
            &activity.assignment,
            group_map,
        )
        && list_matches(&rule.assignments, &activity.assignment)
        && list_matches(&rule.qualifiers, &activity.qualifier)
        && list_matches(&rule.flights, &activity.flight_number)
        && list_matches(&rule.destinations, &activity.destination)
        && list_matches(&rule.positions, &activity.position)
}

fn enumerate_8071_windows(
    unit: Rule8071Unit,
    period: i64,
    activities: &[&RosterPropertyActivity],
    checked_start_utc: i64,
    checked_end_utc: i64,
    roster_periods: &[(i64, i64)],
) -> Vec<(i64, i64)> {
    if period < 1 {
        return Vec::new();
    }
    let mut windows: BTreeMap<i64, i64> = BTreeMap::new();
    match unit {
        Rule8071Unit::Cd => {
            for activity in activities {
                if activity.start_utc < checked_start_utc || activity.start_utc > checked_end_utc {
                    continue;
                }
                let start = day_start(activity.start_utc);
                windows.entry(start).or_insert(start + period * DAY - 1);
            }
        }
        Rule8071Unit::Cw => {
            for activity in activities {
                if activity.start_utc < checked_start_utc || activity.start_utc > checked_end_utc {
                    continue;
                }
                let start = week_start_sunday(activity.start_utc);
                windows.entry(start).or_insert(start + period * 7 * DAY - 1);
            }
        }
        Rule8071Unit::Cm => {
            let mut start = month_start(checked_start_utc);
            while start <= checked_end_utc {
                windows
                    .entry(start)
                    .or_insert(add_months(start, period) - 1);
                start = add_months(start, 1);
            }
        }
        Rule8071Unit::Rp => {
            for &(start, end) in roster_periods {
                if overlaps(start, end, checked_start_utc, checked_end_utc) {
                    windows.entry(start).or_insert(end);
                }
            }
        }
    }
    windows.into_iter().collect()
}

fn count_rows(mode: Rule8071Mode, rows: &[&RosterPropertyActivity]) -> f64 {
    match mode {
        Rule8071Mode::Flight => rows.len() as f64 / 2.0,
        Rule8071Mode::Duty => rows
            .iter()
            .map(|activity| (activity.pairing_id, activity.duty_seq))
            .collect::<BTreeSet<_>>()
            .len() as f64,
        Rule8071Mode::Roster => rows
            .iter()
            .map(|activity| {
                if activity.pairing_id > 0 {
                    activity.pairing_id
                } else {
                    activity.pairing_id
                }
            })
            .collect::<BTreeSet<_>>()
            .len() as f64,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_activity_teams_do_not_match_team_scoped_rule() {
        let rule = Rule8071::from_cells(&[
            "*", "*", "*", "TEAM1", "*", "*", "*", "*", "*", "*", "*", "*", "1", "CD", "0", "0",
            "R",
        ])
        .expect("valid rule");
        let activity = RosterPropertyActivity {
            crew_id: "C1".to_string(),
            pairing_id: 7,
            duty_seq: 0,
            segment_id: 7,
            start_utc: 0,
            end_utc: 3600,
            bases: vec!["*".to_string()],
            ranks: vec!["*".to_string()],
            fleets: vec!["*".to_string()],
            teams: Vec::new(),
            labels: vec!["*".to_string()],
            attributes: vec!["*".to_string()],
            override_duty_attributes: vec!["*".to_string()],
            assignment_group: String::new(),
            assignment: "*".to_string(),
            qualifier: "*".to_string(),
            flight_number: String::new(),
            destination: String::new(),
            position: String::new(),
            destination_country: String::new(),
        };

        assert!(check_roster_properties_row(
            "C1",
            &rule,
            &[activity],
            0,
            86_399,
            &[],
            Application::Editor,
        )
        .is_empty());
    }

    #[test]
    fn wildcard_activity_teams_do_not_match_team_scoped_rule() {
        let rule = Rule8071::from_cells(&[
            "*", "*", "*", "DOMO", "*", "*", "*", "FLY", "*", "*", "GDL", "*", "1", "RP", "0", "0",
            "R",
        ])
        .expect("valid rule");
        let activity = RosterPropertyActivity {
            crew_id: "386".to_string(),
            pairing_id: 136109,
            duty_seq: 1,
            segment_id: 1,
            start_utc: 0,
            end_utc: 3600,
            bases: vec!["*".to_string()],
            ranks: vec!["*".to_string()],
            fleets: vec!["*".to_string()],
            teams: vec!["*".to_string()],
            labels: vec!["*".to_string()],
            attributes: vec!["*".to_string()],
            override_duty_attributes: vec!["*".to_string()],
            assignment_group: "FLY".to_string(),
            assignment: "*".to_string(),
            qualifier: "*".to_string(),
            flight_number: String::new(),
            destination: "GDL".to_string(),
            position: String::new(),
            destination_country: String::new(),
        };
        assert!(
            check_roster_properties_row(
                "386",
                &rule,
                &[activity],
                0,
                86_399,
                &[(0, 86_399)],
                Application::Editor,
            )
            .is_empty(),
            "activity teams=* must not satisfy Crew Teams=DOMO"
        );
    }
}

fn anchor_pairing_id(rows: &[&RosterPropertyActivity], first_positive_pairing: i64) -> i64 {
    rows.iter()
        .filter(|activity| activity.pairing_id > 0)
        .map(|activity| activity.pairing_id)
        .max()
        .unwrap_or(first_positive_pairing)
}

#[inline]
fn overlaps(a_start: i64, a_end: i64, b_start: i64, b_end: i64) -> bool {
    a_start <= b_end && a_end >= b_start
}

#[inline]
fn day_start(t: i64) -> i64 {
    t.div_euclid(DAY) * DAY
}

fn week_start_sunday(t: i64) -> i64 {
    let ord = t.div_euclid(DAY);
    let wday = (ord + 4).rem_euclid(7);
    (ord - wday) * DAY
}

fn month_start(t: i64) -> i64 {
    let (y, m, _) = civil_from_days(t.div_euclid(DAY));
    days_from_civil(y, m, 1) * DAY
}

fn add_months(t: i64, n: i64) -> i64 {
    let (y, m, d) = civil_from_days(t.div_euclid(DAY));
    let total = y * 12 + (m - 1) + n;
    let y2 = total.div_euclid(12);
    let m2 = total.rem_euclid(12) + 1;
    days_from_civil(y2, m2, d) * DAY + t.rem_euclid(DAY)
}
