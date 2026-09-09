//! Shared Rule 7509 Avoid Co-pairing contract used by PBS, Live, and Scenario.

use std::collections::{BTreeMap, BTreeSet};

use crate::{civil_from_days, parse_date_ord, Application};

const SECONDS_PER_DAY: i64 = 86_400;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rule7509Param {
    pub row_index: usize,
    pub crew_a: String,
    pub crew_b: String,
    pub eff_start_ord: i64,
    pub exp_end_ord: i64,
}

impl Rule7509Param {
    /// Parse the four cells from the 7509 parameter table.
    ///
    /// Invalid rows, reversed ranges, and self-pairs return `None`; callers that
    /// need diagnostics can report the original row index before skipping it.
    pub fn from_cells(cells: &[&str]) -> Option<Self> {
        if cells.len() != 4 {
            return None;
        }
        let crew_a = cells[0].trim().to_string();
        let crew_b = cells[1].trim().to_string();
        if crew_a.is_empty() || crew_b.is_empty() || crew_a == crew_b {
            return None;
        }
        let parse_strict_date = |value: &str| {
            let ord = parse_date_ord(value)?;
            let year = value.get(0..4)?.parse::<i64>().ok()?;
            let month = value.get(5..7)?.parse::<i64>().ok()?;
            let day = value.get(8..10)?.parse::<i64>().ok()?;
            (civil_from_days(ord) == (year, month, day)).then_some(ord)
        };
        let eff_start_ord = parse_strict_date(cells[2].trim())?;
        let exp_end_ord = parse_strict_date(cells[3].trim())?;
        if exp_end_ord < eff_start_ord {
            return None;
        }
        Some(Self {
            row_index: 0,
            crew_a,
            crew_b,
            eff_start_ord,
            exp_end_ord,
        })
    }

    pub fn with_row_index(mut self, row_index: usize) -> Self {
        self.row_index = row_index;
        self
    }

    #[inline]
    fn matches_pair(&self, left: &str, right: &str) -> bool {
        (self.crew_a == left && self.crew_b == right)
            || (self.crew_a == right && self.crew_b == left)
    }

    #[inline]
    fn overlaps_pairing(&self, start_utc: i64, end_utc: i64) -> bool {
        let effective_start = self.eff_start_ord * SECONDS_PER_DAY;
        let effective_end = (self.exp_end_ord + 1) * SECONDS_PER_DAY - 1;
        start_utc <= effective_end && end_utc >= effective_start
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rule7509Member {
    pub flight_id: i64,
    pub crew_id: String,
    pub pairing_id: i64,
    pub pairing_start_utc: i64,
    pub pairing_end_utc: i64,
    pub source_is_pa: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rule7509Violation {
    pub param_index: usize,
    pub crew_id: String,
    pub paired_crew_id: String,
    pub pairing_id: i64,
    pub flight_id: i64,
}

#[derive(Debug, Clone)]
struct FlightMember {
    crew_id: String,
    pairing_id: i64,
    pairing_start_utc: i64,
    pairing_end_utc: i64,
    source_is_pa: bool,
}

/// Check forbidden crew pairs at physical-flight grain.
pub fn check_avoid_co_pairing(
    params: &[Rule7509Param],
    members: &[Rule7509Member],
    application: Application,
) -> Vec<Rule7509Violation> {
    let mut out = Vec::new();

    for param in params {
        let mut by_flight: BTreeMap<i64, BTreeMap<String, FlightMember>> = BTreeMap::new();
        for member in members {
            if member.pairing_end_utc < member.pairing_start_utc
                || !param.overlaps_pairing(member.pairing_start_utc, member.pairing_end_utc)
            {
                continue;
            }
            if member.crew_id.trim().is_empty() {
                continue;
            }
            let flight = by_flight.entry(member.flight_id).or_default();
            flight
                .entry(member.crew_id.trim().to_string())
                .and_modify(|existing| {
                    existing.pairing_id = existing.pairing_id.min(member.pairing_id);
                    existing.pairing_start_utc =
                        existing.pairing_start_utc.min(member.pairing_start_utc);
                    existing.pairing_end_utc = existing.pairing_end_utc.max(member.pairing_end_utc);
                    existing.source_is_pa &= member.source_is_pa;
                })
                .or_insert_with(|| FlightMember {
                    crew_id: member.crew_id.trim().to_string(),
                    pairing_id: member.pairing_id,
                    pairing_start_utc: member.pairing_start_utc,
                    pairing_end_utc: member.pairing_end_utc,
                    source_is_pa: member.source_is_pa,
                });
        }

        for (flight_id, crew_by_id) in by_flight {
            let crew: Vec<&FlightMember> = crew_by_id.values().collect();
            let mut emitted_pairs = BTreeSet::new();
            for left_idx in 0..crew.len() {
                for right_idx in (left_idx + 1)..crew.len() {
                    let left = crew[left_idx];
                    let right = crew[right_idx];
                    if !param.matches_pair(&left.crew_id, &right.crew_id) {
                        continue;
                    }
                    if application.is_optimizer() && left.source_is_pa && right.source_is_pa {
                        continue;
                    }
                    let pair_key = (left.crew_id.clone(), right.crew_id.clone());
                    if !emitted_pairs.insert(pair_key) {
                        continue;
                    }
                    out.push(Rule7509Violation {
                        param_index: param.row_index,
                        crew_id: left.crew_id.clone(),
                        paired_crew_id: right.crew_id.clone(),
                        pairing_id: left.pairing_id,
                        flight_id,
                    });
                    out.push(Rule7509Violation {
                        param_index: param.row_index,
                        crew_id: right.crew_id.clone(),
                        paired_crew_id: left.crew_id.clone(),
                        pairing_id: right.pairing_id,
                        flight_id,
                    });
                }
            }
        }
    }

    out.sort_by(|a, b| {
        (
            a.param_index,
            a.flight_id,
            &a.crew_id,
            &a.paired_crew_id,
            a.pairing_id,
        )
            .cmp(&(
                b.param_index,
                b.flight_id,
                &b.crew_id,
                &b.paired_crew_id,
                b.pairing_id,
            ))
    });
    out
}
