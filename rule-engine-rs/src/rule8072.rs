//! Rule 8072 — minimum/maximum qualified crew per fleet/rank segment.
//!
//! This checker is intentionally std-only so it can be reused by the standalone
//! ruletool binary path.

use std::collections::BTreeSet;

use crate::Application;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rule8072 {
    pub flight_fleets: Vec<String>,
    pub flight_assignment_groups: Vec<String>,
    pub crew_teams: String,
    pub crew_nationality: String,
    pub destination_countries: String,
    pub acting_ranks: Vec<String>,
    pub flight_compositions: Vec<String>,
    pub required_qualifications: String,
    pub attributes: String,
    pub dep: Vec<String>,
    pub arr: Vec<String>,
    pub min_limits: i32,
    pub max_limits: i32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rule8072Crew {
    pub crew_id: String,
    pub division: String,
    pub acting_rank: String,
    pub assignment: String,
    pub assignment_group: String,
    pub nationality: String,
    pub teams: Vec<String>,
    pub source: String,
    pub qualifications: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rule8072Segment {
    pub segment_id: i64,
    pub pairing_id: i64,
    pub duty_seq: i64,
    pub seg_seq: i64,
    pub flight_id: i64,
    pub flight_number: String,
    pub flight_date: String,
    pub start_utc: i64,
    pub end_utc: i64,
    pub fleet: String,
    pub dep: String,
    pub arr: String,
    pub assignment: String,
    pub assignment_group: String,
    pub composition: String,
    pub attributes: Vec<String>,
    pub destination_country: String,
    pub planned_by_rank: Vec<(String, i32)>,
    pub filled_by_rank: Vec<(String, i32)>,
    pub crews: Vec<Rule8072Crew>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rule8072Evaluation {
    pub qualified_count: i32,
    pub planned_count: i32,
    pub filled_count: i32,
    pub owner_crew_id: String,
    pub acting_rank_label: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rule8072Violation {
    pub crew_id: String,
    pub pairing_id: i64,
    pub segment_id: i64,
    pub duty_seq: i64,
    pub start_utc: i64,
    pub end_utc: i64,
    pub flight_number: String,
    pub fleet: String,
    pub acting_rank: String,
    pub required_qualifications: String,
    pub qualified_count: i32,
    pub planned_count: i32,
    pub filled_count: i32,
    pub min_limits: i32,
    pub max_limits: i32,
    pub over_max: bool,
}

impl Rule8072 {
    pub fn from_cells(cells: &[&str]) -> Result<Rule8072, String> {
        if cells.len() != 13 {
            return Err(format!("rule 8072 expects 13 cells, got {}", cells.len()));
        }

        Ok(Rule8072 {
            flight_fleets: split_list(cells[0]),
            flight_assignment_groups: split_list(cells[1]),
            crew_teams: normalize_expr(cells[2]),
            crew_nationality: normalize_expr(cells[3]),
            destination_countries: normalize_expr(cells[4]),
            acting_ranks: split_list(cells[5]),
            flight_compositions: split_list(cells[6]),
            required_qualifications: normalize_expr(cells[7]),
            attributes: normalize_expr(cells[8]),
            dep: split_list(cells[9]),
            arr: split_list(cells[10]),
            min_limits: parse_limit(cells[11], 0),
            max_limits: parse_limit(cells[12], i32::MAX),
        })
    }

    pub fn count_qualified(&self, segment: &Rule8072Segment) -> Rule8072Evaluation {
        if !self.segment_matches(segment) {
            return Rule8072Evaluation {
                qualified_count: 0,
                planned_count: 0,
                filled_count: 0,
                owner_crew_id: String::new(),
                acting_rank_label: acting_rank_label(&self.acting_ranks),
            };
        }

        let qualified: Vec<&Rule8072Crew> = segment
            .crews
            .iter()
            .filter(|crew| self.crew_matches(crew))
            .collect();
        let owner_crew_id = qualified
            .first()
            .map(|crew| crew.crew_id.clone())
            .or_else(|| segment.crews.first().map(|crew| crew.crew_id.clone()))
            .unwrap_or_default();

        Rule8072Evaluation {
            qualified_count: qualified.len() as i32,
            planned_count: count_rank_pairs(&segment.planned_by_rank, &self.acting_ranks),
            filled_count: self.count_filled(segment),
            owner_crew_id,
            acting_rank_label: acting_rank_label(&self.acting_ranks),
        }
    }

    fn segment_matches(&self, segment: &Rule8072Segment) -> bool {
        matches_list(&self.flight_fleets, &segment.fleet)
            && (matches_list(&self.flight_assignment_groups, &segment.assignment_group)
                || matches_list(&self.flight_assignment_groups, &segment.assignment))
            && matches_expr(
                &self.destination_countries,
                &[segment.destination_country.clone()],
            )
            && matches_list(&self.flight_compositions, &segment.composition)
            && matches_expr(&self.attributes, &segment.attributes)
            && matches_list(&self.dep, &segment.dep)
            && matches_list(&self.arr, &segment.arr)
    }

    fn crew_matches(&self, crew: &Rule8072Crew) -> bool {
        self.crew_matches_rank_group(crew)
            && matches_expr(&self.crew_nationality, &[crew.nationality.clone()])
            && matches_expr(&self.crew_teams, &crew.teams)
            && crew_has_required_qualifications(&self.required_qualifications, &crew.qualifications)
    }

    fn crew_matches_rank_group(&self, crew: &Rule8072Crew) -> bool {
        matches_list(&self.acting_ranks, &crew.acting_rank)
            && (matches_list(&self.flight_assignment_groups, &crew.assignment_group)
                || matches_list(&self.flight_assignment_groups, &crew.assignment))
    }

    fn count_filled(&self, segment: &Rule8072Segment) -> i32 {
        segment
            .crews
            .iter()
            .filter(|crew| self.crew_matches_rank_group(crew))
            .count() as i32
    }
}

pub fn check_min_qual_by_fleet_rank(
    rule: &Rule8072,
    segments: &[Rule8072Segment],
    app: Application,
) -> Vec<Rule8072Violation> {
    let mut out = Vec::new();
    for segment in segments {
        if !rule.segment_matches(segment) {
            continue;
        }

        let eval = rule.count_qualified(segment);
        let over_max = eval.qualified_count > rule.max_limits;
        let under_min = rule.min_limits > 0 && eval.qualified_count < rule.min_limits;
        if over_max
            && app.is_optimizer()
            && qualified_sources(rule, segment)
                .iter()
                .all(|source| source.as_str() == "PA")
        {
            continue;
        }
        if under_min
            && eval.planned_count > 0
            && eval.planned_count - eval.filled_count >= rule.min_limits - eval.qualified_count
        {
            continue;
        }

        if over_max || under_min {
            out.push(Rule8072Violation {
                crew_id: eval.owner_crew_id,
                pairing_id: segment.pairing_id,
                segment_id: segment.segment_id,
                duty_seq: segment.duty_seq,
                start_utc: segment.start_utc,
                end_utc: segment.end_utc,
                flight_number: segment.flight_number.clone(),
                fleet: segment.fleet.clone(),
                acting_rank: eval.acting_rank_label,
                required_qualifications: rule.required_qualifications.clone(),
                qualified_count: eval.qualified_count,
                planned_count: eval.planned_count,
                filled_count: eval.filled_count,
                min_limits: rule.min_limits,
                max_limits: rule.max_limits,
                over_max,
            });
        }
    }
    out
}

fn split_list(raw: &str) -> Vec<String> {
    let raw = raw.trim();
    if raw.is_empty() || raw == "*" {
        return vec!["*".to_string()];
    }
    let values: Vec<String> = raw
        .split('|')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect();
    if values.is_empty() {
        vec!["*".to_string()]
    } else {
        values
    }
}

fn normalize_expr(raw: &str) -> String {
    let raw = raw.trim();
    if raw.is_empty() {
        "*".to_string()
    } else {
        raw.to_string()
    }
}

fn parse_limit(raw: &str, default_value: i32) -> i32 {
    let raw = raw.trim();
    if raw.is_empty() || raw == "*" {
        default_value
    } else {
        raw.parse::<i32>().unwrap_or(default_value)
    }
}

fn matches_list(values: &[String], actual: &str) -> bool {
    values.is_empty() || values.iter().any(|value| value == "*" || value == actual)
}

fn matches_expr(raw: &str, actual_values: &[String]) -> bool {
    let raw = raw.trim();
    if raw.is_empty() || raw == "*" {
        return true;
    }

    if let Some(inner) = raw
        .strip_prefix("!(")
        .and_then(|value| value.strip_suffix(')'))
    {
        let excluded = expr_values(inner);
        return !actual_values
            .iter()
            .any(|actual| excluded.iter().any(|value| value == actual));
    }

    let included = expr_values(raw);
    actual_values
        .iter()
        .any(|actual| included.iter().any(|value| value == actual))
}

fn expr_values(raw: &str) -> Vec<String> {
    raw.split('|')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect()
}

fn crew_has_required_qualifications(raw: &str, qualifications: &[String]) -> bool {
    let raw = raw.trim();
    if raw.is_empty() || raw == "*" {
        return true;
    }
    let qual_set: BTreeSet<&str> = qualifications.iter().map(String::as_str).collect();
    raw.split('|')
        .map(str::trim)
        .filter(|alternative| !alternative.is_empty())
        .any(|alternative| {
            alternative
                .split('+')
                .map(str::trim)
                .filter(|term| !term.is_empty())
                .all(|term| qual_set.contains(term))
        })
}

fn count_rank_pairs(pairs: &[(String, i32)], acting_ranks: &[String]) -> i32 {
    pairs
        .iter()
        .filter(|(rank, _)| matches_list(acting_ranks, rank))
        .map(|(_, count)| *count)
        .sum()
}

fn acting_rank_label(acting_ranks: &[String]) -> String {
    if acting_ranks.is_empty() {
        "*".to_string()
    } else {
        acting_ranks.join("|")
    }
}

fn qualified_sources(rule: &Rule8072, segment: &Rule8072Segment) -> Vec<String> {
    segment
        .crews
        .iter()
        .filter(|crew| rule.crew_matches(crew))
        .map(|crew| crew.source.clone())
        .collect()
}
