//! Live check for rule 1001 (ASSIGNMENT OVERLAP).
//!
//! Reads two row types on stdin:
//!   R <TAB> group_before <TAB> assignment_before <TAB> rest_before <TAB> type_before
//!     <TAB> group_after <TAB> assignment_after <TAB> type_after
//!   A <TAB> crew_id <TAB> id <TAB> pairing_id <TAB> start_secs <TAB> end_duty_secs
//!     <TAB> end_including_rest_secs <TAB> assignment_group <TAB> assignment <TAB> assignment_type
//!     [<TAB> offset_min]
//!
//! Each R row is a prohibition (Before/After filters + Rest Before).
//! Rest Before=Y → Before end = duty_end; N → rest_end.
//! Filter match + window ∩ After duty → 1001; filter match without window hit
//! → allow; empty rules / unmatched filters → fail-closed.
//!
//! --do-start-min = rule 2015 DO Start (minutes past local midnight); 0 = no FLY→After grace.
//! --do-start-assignments / --do-start-groups = rule 2015 pipe-separated filters (1001 only).
//! Both filter lists empty after parse → grace off (same as do_start_min=0 for 1001).
//!
//! --emit-tsv prints:
//!   crew <TAB> pairing_id <TAB> before_id <TAB> after_id <TAB> overlap_start
//!     <TAB> overlap_end <TAB> before_assignment <TAB> after_assignment

use std::collections::BTreeMap;
use std::io::{self, Read};

use rois_rule_engine::rules::rule1001::{
    check_assignment_overlap, AssignmentOverlapRoster, AssignmentOverlapRule, DoStartGrace1001,
};

fn split_filter(raw: &str) -> Vec<String> {
    raw.split('|')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty() && s != "*")
        .collect()
}

fn yes(raw: &str) -> bool {
    matches!(
        raw.trim().to_uppercase().as_str(),
        "Y" | "YES" | "1" | "TRUE"
    )
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let top: usize = args
        .iter()
        .position(|a| a == "--top")
        .and_then(|i| args.get(i + 1))
        .and_then(|v| v.parse().ok())
        .unwrap_or(15);
    let do_start_min: i64 = args
        .iter()
        .position(|a| a == "--do-start-min")
        .and_then(|i| args.get(i + 1))
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    let do_start_assignments = args
        .iter()
        .position(|a| a == "--do-start-assignments")
        .and_then(|i| args.get(i + 1))
        .map(|s| split_filter(s))
        .unwrap_or_default();
    let do_start_groups = args
        .iter()
        .position(|a| a == "--do-start-groups")
        .and_then(|i| args.get(i + 1))
        .map(|s| split_filter(s))
        .unwrap_or_default();
    let do_start_grace = DoStartGrace1001 {
        do_start_min,
        assignments: do_start_assignments,
        groups: do_start_groups,
    };

    let mut input = String::new();
    io::stdin().read_to_string(&mut input).expect("read stdin");

    let mut rules: Vec<AssignmentOverlapRule> = Vec::new();
    let mut by_crew: BTreeMap<String, Vec<AssignmentOverlapRoster>> = BTreeMap::new();
    let mut pairing_by_roster: BTreeMap<(String, i64), i64> = BTreeMap::new();
    let mut skipped = 0usize;
    let mut roster_rows = 0usize;

    for line in input.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let cols: Vec<&str> = line.split('\t').collect();
        match cols.first().copied() {
            // 8 cols: R + 7 filter fields (Overlap column removed).
            Some("R") if cols.len() >= 8 => rules.push(AssignmentOverlapRule {
                group_before: split_filter(cols[1]),
                assignment_before: split_filter(cols[2]),
                rest_before: yes(cols[3]),
                type_before: split_filter(cols[4]),
                group_after: split_filter(cols[5]),
                assignment_after: split_filter(cols[6]),
                type_after: split_filter(cols[7]),
            }),
            Some("A") if cols.len() >= 10 => {
                let parsed = (
                    cols[2].parse::<i64>(),
                    cols[3].parse::<i64>(),
                    cols[4].parse::<i64>(),
                    cols[5].parse::<i64>(),
                    cols[6].parse::<i64>(),
                );
                let (Ok(id), Ok(pairing_id), Ok(start), Ok(end_duty), Ok(end_rest)) = parsed else {
                    skipped += 1;
                    continue;
                };
                let crew = cols[1].to_string();
                let offset_min = cols
                    .get(10)
                    .and_then(|v| v.parse::<i64>().ok())
                    .unwrap_or(0);
                pairing_by_roster.insert((crew.clone(), id), pairing_id);
                by_crew
                    .entry(crew)
                    .or_default()
                    .push(AssignmentOverlapRoster {
                        id,
                        start_utc: start,
                        end_duty_utc: end_duty,
                        end_including_rest_utc: end_rest,
                        assignment_group: cols[7].to_string(),
                        assignment: cols[8].to_string(),
                        assignment_type: cols[9].to_string(),
                        is_pre_assigned: false,
                        offset_min,
                    });
                roster_rows += 1;
            }
            _ => skipped += 1,
        }
    }

    let t0 = std::time::Instant::now();
    let mut violations = Vec::new();
    for (crew, rosters) in &by_crew {
        for v in check_assignment_overlap(crew, rosters, &rules, do_start_grace.clone()) {
            let before_pairing = pairing_by_roster
                .get(&(crew.clone(), v.before_id))
                .copied()
                .unwrap_or(0);
            let after_pairing = pairing_by_roster
                .get(&(crew.clone(), v.after_id))
                .copied()
                .unwrap_or(0);
            let anchor_pairing = if after_pairing > 0 {
                after_pairing
            } else {
                before_pairing
            };
            violations.push((v, anchor_pairing));
        }
    }
    let eval = t0.elapsed();
    violations.sort_by_key(|(v, p)| {
        (
            v.crew_id.clone(),
            v.overlap_start_utc,
            *p,
            v.before_id,
            v.after_id,
        )
    });

    if args.iter().any(|a| a == "--emit-tsv") {
        for (v, pairing_id) in &violations {
            println!(
                "{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}",
                v.crew_id,
                pairing_id,
                v.before_id,
                v.after_id,
                v.overlap_start_utc,
                v.overlap_end_utc,
                v.before_assignment,
                v.after_assignment,
            );
        }
        return;
    }

    eprintln!(
        "check-1001: {} roster rows, {} crews, {} rules, {} violations, skipped={}, eval={:?}",
        roster_rows,
        by_crew.len(),
        rules.len(),
        violations.len(),
        skipped,
        eval
    );
    for (v, pairing_id) in violations.iter().take(top) {
        eprintln!(
            "  crew={} pairing={} before={} after={} {}..{} {}/{}",
            v.crew_id,
            pairing_id,
            v.before_id,
            v.after_id,
            v.overlap_start_utc,
            v.overlap_end_utc,
            v.before_assignment,
            v.after_assignment,
        );
    }
}
