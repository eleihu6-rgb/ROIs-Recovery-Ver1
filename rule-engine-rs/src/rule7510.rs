//! Rule 7510 — Green-on-Green.
//!
//! For each matching crew, mark only the first N matching physical flights in
//! roster-line order. Each marked flight's green-crew count must fall inside
//! the configured min/max band.

use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rule7510Param {
    pub row_index: usize,
    pub bases: Vec<String>,
    pub ranks: Vec<String>,
    pub fleets: Vec<String>,
    pub crew_teams: Vec<String>,
    pub attributes: Vec<String>,
    pub assignments: Vec<String>,
    pub assignment_groups: Vec<String>,
    pub initial_sectors: i64,
    pub min_limits: i32,
    pub max_limits: i32,
}

impl Rule7510Param {
    pub fn from_cells(cells: &[&str]) -> Result<Self, String> {
        if cells.len() != 10 {
            return Err(format!("rule 7510 expects 10 cells, got {}", cells.len()));
        }
        let initial_sectors = parse_non_negative_i64(cells[7], "Initial Sectors")?;
        let min_limits = parse_non_negative_i32(cells[8], "Min Limits")?;
        let max_limits = parse_non_negative_i32(cells[9], "Max Limits")?;
        if min_limits > max_limits {
            return Err("Min Limits cannot exceed Max Limits".to_string());
        }
        Ok(Self {
            row_index: 0,
            bases: split_list(cells[0]),
            ranks: split_list(cells[1]),
            fleets: split_list(cells[2]),
            crew_teams: split_list(cells[3]),
            attributes: split_list(cells[4]),
            assignments: split_list(cells[5]),
            assignment_groups: split_list(cells[6]),
            initial_sectors,
            min_limits,
            max_limits,
        })
    }

    pub fn with_row_index(mut self, row_index: usize) -> Self {
        self.row_index = row_index;
        self
    }

    fn matches(&self, row: &Rule7510CrewFlight, group_map: &[(String, String)]) -> bool {
        matches_any(&self.bases, &row.bases)
            && matches_any(&self.ranks, &row.ranks)
            && matches_any(&self.fleets, &row.fleets)
            && matches_any(&self.crew_teams, &row.teams)
            && matches_any(&self.attributes, &row.attributes)
            && matches_one(&self.assignments, &row.assignment)
            && crate::group_or_mapped_matches(
                &self.assignment_groups,
                &row.assignment_group,
                &row.assignment,
                group_map,
            )
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rule7510CrewFlight {
    pub crew_id: String,
    pub flight_id: i64,
    pub pairing_id: i64,
    pub duty_seq: i64,
    pub seg_seq: i64,
    pub start_utc: i64,
    pub end_utc: i64,
    pub bases: Vec<String>,
    pub ranks: Vec<String>,
    pub fleets: Vec<String>,
    pub teams: Vec<String>,
    pub attributes: Vec<String>,
    pub assignment: String,
    pub assignment_group: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rule7510Violation {
    pub row_index: usize,
    pub crew_id: String,
    pub pairing_id: i64,
    pub duty_seq: i64,
    pub seg_seq: i64,
    pub flight_id: i64,
    pub start_utc: i64,
    pub end_utc: i64,
    pub actual_count: i32,
    pub limit_value: i32,
    pub over_max: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rule7510Mark {
    pub row_index: usize,
    pub row: Rule7510CrewFlight,
}

pub fn mark_green_on_green(
    params: &[Rule7510Param],
    flights: &[Rule7510CrewFlight],
) -> Vec<Rule7510Mark> {
    mark_green_on_green_with_group_map(params, flights, &[])
}

/// Same as [`mark_green_on_green`], plus the (assignment, assignment_group) many-to-many map
/// so Assignment Groups also matches a flight row whose specific assignment code is mapped
/// into the filtered group (see [`crate::group_or_mapped_matches`]).
pub fn mark_green_on_green_with_group_map(
    params: &[Rule7510Param],
    flights: &[Rule7510CrewFlight],
    group_map: &[(String, String)],
) -> Vec<Rule7510Mark> {
    let mut out = Vec::new();

    for param in params {
        if param.initial_sectors <= 0 {
            continue;
        }

        let mut by_crew: BTreeMap<String, BTreeMap<i64, Rule7510CrewFlight>> = BTreeMap::new();
        for row in flights.iter().filter(|row| {
            row.assignment_group.eq_ignore_ascii_case("FLY") && param.matches(row, group_map)
        }) {
            let crew_id = row.crew_id.trim();
            if crew_id.is_empty() || row.flight_id <= 0 {
                continue;
            }
            by_crew
                .entry(crew_id.to_string())
                .or_default()
                .entry(row.flight_id)
                .and_modify(|existing| {
                    if flight_order_key(row) < flight_order_key(existing) {
                        *existing = row.clone();
                    }
                })
                .or_insert_with(|| row.clone());
        }

        let marked_crew_flights: BTreeSet<(String, i64)> = by_crew
            .into_iter()
            .flat_map(|(crew_id, crew_rows)| {
                let mut ordered: Vec<Rule7510CrewFlight> = crew_rows.values().cloned().collect();
                ordered.sort_by_key(flight_order_key);
                ordered
                    .into_iter()
                    .take(param.initial_sectors as usize)
                    .map(move |row| (crew_id.clone(), row.flight_id))
                    .collect::<Vec<_>>()
            })
            .collect();

        let mut counted: BTreeMap<(String, i64), Rule7510CrewFlight> = BTreeMap::new();
        for row in flights.iter().filter(|row| param.matches(row, group_map)) {
            let crew_id = row.crew_id.trim();
            if crew_id.is_empty() || row.flight_id <= 0 {
                continue;
            }
            let crew_id = crew_id.to_string();
            if !marked_crew_flights.contains(&(crew_id.clone(), row.flight_id)) {
                continue;
            }
            counted
                .entry((crew_id, row.flight_id))
                .and_modify(|existing| {
                    if flight_order_key(row) < flight_order_key(existing) {
                        *existing = row.clone();
                    }
                })
                .or_insert_with(|| row.clone());
        }

        for row in counted.into_values() {
            out.push(Rule7510Mark {
                row_index: param.row_index,
                row,
            });
        }
    }

    out.sort_by(|a, b| {
        (
            a.row_index,
            a.row.start_utc,
            a.row.flight_id,
            &a.row.crew_id,
            a.row.pairing_id,
            a.row.duty_seq,
            a.row.seg_seq,
        )
            .cmp(&(
                b.row_index,
                b.row.start_utc,
                b.row.flight_id,
                &b.row.crew_id,
                b.row.pairing_id,
                b.row.duty_seq,
                b.row.seg_seq,
            ))
    });
    out
}

pub fn check_green_on_green(
    params: &[Rule7510Param],
    flights: &[Rule7510CrewFlight],
    checked_start_utc: i64,
    checked_end_utc: i64,
) -> Vec<Rule7510Violation> {
    check_green_on_green_with_group_map(params, flights, checked_start_utc, checked_end_utc, &[])
}

/// Same as [`check_green_on_green`], plus the (assignment, assignment_group) many-to-many
/// map — see [`mark_green_on_green_with_group_map`].
pub fn check_green_on_green_with_group_map(
    params: &[Rule7510Param],
    flights: &[Rule7510CrewFlight],
    checked_start_utc: i64,
    checked_end_utc: i64,
    group_map: &[(String, String)],
) -> Vec<Rule7510Violation> {
    let mut out = Vec::new();

    for param in params {
        let marks = mark_green_on_green_with_group_map(
            std::slice::from_ref(param),
            flights,
            group_map,
        );
        let mut marked_by_flight: BTreeMap<i64, Vec<Rule7510CrewFlight>> = BTreeMap::new();
        for mark in marks {
            marked_by_flight
                .entry(mark.row.flight_id)
                .or_default()
                .push(mark.row);
        }

        for (_flight_id, mut marked) in marked_by_flight {
            marked.sort_by_key(|row| {
                (
                    row.start_utc,
                    row.flight_id,
                    row.crew_id.clone(),
                    row.pairing_id,
                )
            });
            let actual = marked.len() as i32;
            let over_max = actual > param.max_limits;
            let under_min = actual < param.min_limits;
            if !over_max && !under_min {
                continue;
            }
            let limit_value = if over_max {
                param.max_limits
            } else {
                param.min_limits
            };
            for row in marked {
                if !in_checked_window(row.start_utc, checked_start_utc, checked_end_utc) {
                    continue;
                }
                out.push(Rule7510Violation {
                    row_index: param.row_index,
                    crew_id: row.crew_id,
                    pairing_id: row.pairing_id,
                    duty_seq: row.duty_seq,
                    seg_seq: row.seg_seq,
                    flight_id: row.flight_id,
                    start_utc: row.start_utc,
                    end_utc: row.end_utc,
                    actual_count: actual,
                    limit_value,
                    over_max,
                });
            }
        }
    }

    out.sort_by(|a, b| {
        (
            a.row_index,
            a.start_utc,
            a.flight_id,
            &a.crew_id,
            a.pairing_id,
            a.duty_seq,
            a.seg_seq,
        )
            .cmp(&(
                b.row_index,
                b.start_utc,
                b.flight_id,
                &b.crew_id,
                b.pairing_id,
                b.duty_seq,
                b.seg_seq,
            ))
    });
    out
}

fn flight_order_key(row: &Rule7510CrewFlight) -> (i64, i64, i64, i64, i64) {
    (
        row.start_utc,
        row.flight_id,
        row.pairing_id,
        row.duty_seq,
        row.seg_seq,
    )
}

fn in_checked_window(start_utc: i64, checked_start_utc: i64, checked_end_utc: i64) -> bool {
    (checked_start_utc <= 0 || start_utc >= checked_start_utc)
        && (checked_end_utc <= 0 || start_utc < checked_end_utc)
}

fn split_list(raw: &str) -> Vec<String> {
    let values: Vec<String> = raw
        .split(['|', ','])
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

fn wildcard(values: &[String]) -> bool {
    values
        .iter()
        .all(|value| value.trim().is_empty() || value.trim() == "*")
}

fn matches_one(filters: &[String], actual: &str) -> bool {
    wildcard(filters)
        || filters.iter().any(|filter| {
            let filter = filter.trim();
            filter == "*" || filter.eq_ignore_ascii_case(actual.trim())
        })
}

fn matches_any(filters: &[String], actual_values: &[String]) -> bool {
    wildcard(filters)
        || actual_values.iter().any(|actual| {
            let actual = actual.trim();
            !actual.is_empty() && actual != "*" && matches_one(filters, actual)
        })
}

fn parse_non_negative_i64(raw: &str, name: &str) -> Result<i64, String> {
    let value = raw
        .trim()
        .parse::<i64>()
        .map_err(|_| format!("{name} must be an integer, got {raw:?}"))?;
    if value < 0 {
        Err(format!("{name} must be non-negative, got {value}"))
    } else {
        Ok(value)
    }
}

fn parse_non_negative_i32(raw: &str, name: &str) -> Result<i32, String> {
    let value = raw
        .trim()
        .parse::<i32>()
        .map_err(|_| format!("{name} must be an integer, got {raw:?}"))?;
    if value < 0 {
        Err(format!("{name} must be non-negative, got {value}"))
    } else {
        Ok(value)
    }
}

pub fn split_7510_list(raw: &str) -> Vec<String> {
    split_list(raw)
}
