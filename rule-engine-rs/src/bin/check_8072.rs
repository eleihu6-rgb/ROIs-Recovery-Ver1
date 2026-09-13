//! Live check for rule 8072 segment qualification counts.
//!
//! Input:
//! R <idx> <13 param cells>
//! S <segment fields>
//! C <segment_id> <crew fields>
//! G <assignment> <assignment_group> (Assignment Group Map row; a "Flight Assignment
//!   Groups" filter also matches a segment/crew whose `assignment` code is mapped to that
//!   group, not just via its literal assignment_group column or a literal code in the list)
//! Output:
//! V <idx> <crew_id> <pairing_id> <segment_id> <duty_seq> <start_utc> <end_utc>
//!   <flight_number> <fleet> <acting_rank> <qualified> <planned> <filled> <min> <max> <over>

use rois_rule_engine::{
    rules::rule8072::{
        check_min_qual_by_fleet_rank_with_group_map, Rule8072, Rule8072Crew, Rule8072Segment,
    },
    Application,
};
use std::collections::{BTreeMap, BTreeSet};
use std::io::{self, Read};

fn split_list(raw: &str) -> Vec<String> {
    raw.split('|')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

fn main() {
    let emit_tsv = std::env::args().any(|a| a == "--emit-tsv");
    if !emit_tsv {
        eprintln!("usage: check-8072 --emit-tsv");
        std::process::exit(2);
    }
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).expect("read stdin");

    let mut rules: BTreeMap<usize, Rule8072> = BTreeMap::new();
    let mut segments: BTreeMap<i64, Rule8072Segment> = BTreeMap::new();
    let mut segment_rule_idx: BTreeMap<i64, BTreeSet<usize>> = BTreeMap::new();
    let mut group_map: Vec<(String, String)> = Vec::new();

    for raw in input.lines() {
        let line = raw.strip_suffix('\r').unwrap_or(raw);
        if line.is_empty() {
            continue;
        }
        let cols: Vec<&str> = line.split('\t').collect();
        match cols.first().copied() {
            Some("R") if cols.len() >= 15 => {
                let idx: usize = cols[1].parse().expect("rule idx");
                let rule = Rule8072::from_cells(&cols[2..15]).expect("rule row");
                rules.insert(idx, rule);
            }
            Some("S") if cols.len() >= 21 => {
                let segment_id: i64 = cols[1].parse().expect("segment id");
                let planned_by_rank = cols[18]
                    .split('|')
                    .filter_map(|p| {
                        let (rank, value) = p.split_once(':')?;
                        Some((rank.to_string(), value.parse::<i32>().ok()?))
                    })
                    .collect();
                let filled_by_rank = cols[19]
                    .split('|')
                    .filter_map(|p| {
                        let (rank, value) = p.split_once(':')?;
                        Some((rank.to_string(), value.parse::<i32>().ok()?))
                    })
                    .collect();
                segments.insert(
                    segment_id,
                    Rule8072Segment {
                        segment_id,
                        pairing_id: cols[2].parse().unwrap_or(0),
                        duty_seq: cols[3].parse().unwrap_or(0),
                        seg_seq: cols[4].parse().unwrap_or(0),
                        flight_id: cols[5].parse().unwrap_or(0),
                        flight_number: cols[6].to_string(),
                        flight_date: cols[7].to_string(),
                        start_utc: cols[8].parse().unwrap_or(0),
                        end_utc: cols[9].parse().unwrap_or(0),
                        fleet: cols[10].to_string(),
                        dep: cols[11].to_string(),
                        arr: cols[12].to_string(),
                        assignment: cols[13].to_string(),
                        assignment_group: cols[14].to_string(),
                        composition: cols[15].to_string(),
                        attributes: split_list(cols[16]),
                        destination_country: cols[17].to_string(),
                        planned_by_rank,
                        filled_by_rank,
                        crews: Vec::new(),
                    },
                );
                for idx in split_list(cols[20])
                    .into_iter()
                    .filter_map(|v| v.parse::<usize>().ok())
                {
                    segment_rule_idx.entry(segment_id).or_default().insert(idx);
                }
            }
            Some("C") if cols.len() >= 11 => {
                let segment_id: i64 = cols[1].parse().expect("crew segment id");
                if let Some(seg) = segments.get_mut(&segment_id) {
                    seg.crews.push(Rule8072Crew {
                        crew_id: cols[2].to_string(),
                        division: cols[3].to_string(),
                        acting_rank: cols[4].to_string(),
                        assignment: cols[5].to_string(),
                        assignment_group: cols[6].to_string(),
                        nationality: cols[7].to_string(),
                        teams: split_list(cols[8]),
                        source: cols[9].to_string(),
                        qualifications: split_list(cols[10]),
                    });
                }
            }
            Some("G") if cols.len() >= 3 => {
                group_map.push((cols[1].trim().to_string(), cols[2].trim().to_string()));
            }
            _ => {}
        }
    }

    let segment_values: Vec<Rule8072Segment> = segments.values().cloned().collect();
    for (idx, rule) in rules {
        let filtered: Vec<Rule8072Segment> = segment_values
            .iter()
            .filter(|s| {
                segment_rule_idx
                    .get(&s.segment_id)
                    .map_or(true, |set| set.contains(&idx))
            })
            .cloned()
            .collect();
        for v in check_min_qual_by_fleet_rank_with_group_map(
            &rule,
            &filtered,
            Application::Editor,
            &group_map,
        ) {
            println!(
                "V\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}",
                idx,
                v.crew_id,
                v.pairing_id,
                v.segment_id,
                v.duty_seq,
                v.start_utc,
                v.end_utc,
                v.flight_number,
                v.fleet,
                v.acting_rank,
                v.qualified_count,
                v.planned_count,
                v.filled_count,
                v.min_limits,
                v.max_limits,
                if v.over_max { 1 } else { 0 }
            );
        }
    }
}
