//! Live check for rule 7506/002 (ONE CHECKIN PER DAY).
//!
//! Reads one roster per line on stdin as TSV (already in chronological order, or sorted
//! here by start):
//!     crew_id <TAB> duty <TAB> start_secs <TAB> rest_start_secs <TAB> end_offset_min
//!
//! Groups by crew and flags any two CONSECUTIVE checked rosters (duty ∈ --checked-groups)
//! whose START local-days are equal — i.e. a crew checking in twice on one local day.
//!
//! Usage:
//!     check-7506 [--checked-groups FLY] [--top 15] [--emit-tsv]
//!
//! --emit-tsv prints one violation per line for piping into rule_violation:
//!     crew <TAB> local_day_start <TAB> viol_start <TAB> viol_end <TAB> checked_groups_raw
//!
//! Dependency-free: the DB read happens upstream (node → TSV), the rule lives in Rust.

use std::collections::BTreeMap;
use std::io::{self, Read};

use rois_rule_engine::rules::crew_scope::{
    matches_scope, parse_qualification_ord, split_filter, CrewScope,
};
use rois_rule_engine::rules::rule7506::{
    check_single_daily_checkin, CheckinRoster, CheckinViolation,
};
use rois_rule_engine::BaseQual;

fn arg_value(args: &[String], flag: &str) -> Option<String> {
    args.iter()
        .position(|a| a == flag)
        .and_then(|i| args.get(i + 1).cloned())
}

#[derive(Debug)]
struct StructuredRow {
    bases: Vec<String>,
    ranks: Vec<String>,
    fleets: Vec<String>,
    teams: Vec<String>,
    assignments: Vec<String>,
    raw_assignments: String,
}

fn structured_input(input: &str) -> bool {
    input
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .any(|line| matches!(line.split('\t').next(), Some("R" | "D" | "Q" | "T")))
}

fn run_structured(input: &str, args: &[String]) {
    let mut rules = Vec::new();
    let mut rosters: BTreeMap<String, Vec<CheckinRoster>> = BTreeMap::new();
    let mut scopes: BTreeMap<String, CrewScope> = BTreeMap::new();
    let mut skipped = 0usize;
    for raw in input.lines() {
        let cols: Vec<&str> = raw.trim().split('\t').collect();
        match cols.first().copied() {
            Some("R") if cols.len() >= 6 => {
                let raw_assignments = cols[5].trim().to_string();
                let assignments = split_filter(&raw_assignments)
                    .into_iter()
                    .map(|value| value.to_uppercase())
                    .collect::<Vec<_>>();
                if assignments.is_empty() {
                    skipped += 1;
                    continue;
                }
                rules.push(StructuredRow {
                    bases: split_filter(cols[1]),
                    ranks: split_filter(cols[2]),
                    fleets: split_filter(cols[3]),
                    teams: split_filter(cols[4]),
                    assignments,
                    raw_assignments,
                });
            }
            Some("D") if cols.len() >= 6 => {
                let parsed = (cols[3].parse(), cols[4].parse(), cols[5].parse());
                let (Ok(start), Ok(rest_start), Ok(offset)) = parsed else {
                    skipped += 1;
                    continue;
                };
                rosters
                    .entry(cols[1].to_string())
                    .or_default()
                    .push(CheckinRoster {
                        duty: cols[2].trim().to_uppercase(),
                        start_utc: start,
                        rest_start_utc: rest_start,
                        end_offset_min: offset,
                    });
            }
            Some("Q") if cols.len() >= 6 => {
                let context = scopes.entry(cols[1].to_string()).or_default();
                let qual = BaseQual {
                    base: cols[3].to_string(),
                    eff_ord: parse_qualification_ord(cols[4]),
                    exp_ord: parse_qualification_ord(cols[5]),
                };
                match cols[2].trim().to_uppercase().as_str() {
                    "B" | "BASE" => context.bases.push(qual),
                    "R" | "RANK" => context.ranks.push(qual),
                    "F" | "FLEET" => context.fleets.push(qual),
                    _ => skipped += 1,
                }
            }
            Some("T") if cols.len() >= 3 => {
                scopes
                    .entry(cols[1].to_string())
                    .or_default()
                    .teams
                    .push(cols[2].to_string());
            }
            _ => skipped += 1,
        }
    }
    let mut violations = Vec::new();
    for rule in &rules {
        for (crew, entries) in &rosters {
            let Some(first) = entries.first() else {
                continue;
            };
            let context = scopes.get(crew).cloned().unwrap_or_default();
            if !matches_scope(
                &rule.bases,
                &rule.ranks,
                &rule.fleets,
                &rule.teams,
                &context,
                (first.start_utc + first.end_offset_min * 60).div_euclid(86_400),
            ) {
                continue;
            }
            let selected: Vec<CheckinRoster> = entries
                .iter()
                .filter(|entry| {
                    rule.assignments.iter().any(|assignment| {
                        assignment == "*" || assignment.eq_ignore_ascii_case(&entry.duty)
                    })
                })
                .cloned()
                .collect();
            if selected.is_empty() {
                continue;
            }
            let checked_groups = if rule.assignments.iter().any(|value| value == "*") {
                selected
                    .iter()
                    .map(|entry| entry.duty.clone())
                    .collect::<std::collections::BTreeSet<_>>()
                    .into_iter()
                    .collect()
            } else {
                rule.assignments.clone()
            };
            violations.extend(check_single_daily_checkin(
                crew,
                &selected,
                &checked_groups,
                &rule.raw_assignments,
            ));
        }
    }
    violations.sort_by_key(|v| (v.crew_id.clone(), v.local_day_start_utc));
    if args.iter().any(|arg| arg == "--emit-tsv") {
        for violation in &violations {
            println!(
                "{}\t{}\t{}\t{}\t{}",
                violation.crew_id,
                violation.local_day_start_utc,
                violation.viol_start_utc,
                violation.viol_end_utc,
                violation.checked_groups_raw
            );
        }
    } else {
        println!(
            "structured rows: {}  rosters: {}  skipped: {}",
            rules.len(),
            rosters.values().map(Vec::len).sum::<usize>(),
            skipped
        );
        println!(" violations: {}", violations.len());
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let top: usize = arg_value(&args, "--top")
        .and_then(|v| v.parse().ok())
        .unwrap_or(15);
    let checked_raw = arg_value(&args, "--checked-groups").unwrap_or_else(|| "FLY".to_string());
    let checked_groups: Vec<String> = checked_raw
        .split('|')
        .map(|s| s.trim().to_uppercase())
        .filter(|s| !s.is_empty())
        .collect();

    let mut input = String::new();
    io::stdin().read_to_string(&mut input).expect("read stdin");
    if structured_input(&input) {
        run_structured(&input, &args);
        return;
    }

    let mut by_crew: BTreeMap<String, Vec<CheckinRoster>> = BTreeMap::new();
    let mut parsed = 0usize;
    let mut skipped = 0usize;
    for line in input.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let c: Vec<&str> = line.split('\t').collect();
        if c.len() < 5 {
            skipped += 1;
            continue;
        }
        match (
            c[2].parse::<i64>(),
            c[3].parse::<i64>(),
            c[4].parse::<i64>(),
        ) {
            (Ok(s), Ok(r), Ok(off)) => {
                by_crew
                    .entry(c[0].to_string())
                    .or_default()
                    .push(CheckinRoster {
                        duty: c[1].to_uppercase(),
                        start_utc: s,
                        rest_start_utc: r,
                        end_offset_min: off,
                    });
                parsed += 1;
            }
            _ => skipped += 1,
        }
    }

    let total_crew = by_crew.len();
    let t0 = std::time::Instant::now();
    let mut violations: Vec<CheckinViolation> = Vec::new();
    for (crew, rosters) in &mut by_crew {
        rosters.sort_by_key(|r| (r.start_utc, r.rest_start_utc));
        violations.extend(check_single_daily_checkin(
            crew,
            rosters,
            &checked_groups,
            &checked_raw,
        ));
    }
    let eval = t0.elapsed();
    violations.sort_by_key(|v| (v.crew_id.clone(), v.local_day_start_utc));

    let crew_violating = violations
        .iter()
        .map(|v| v.crew_id.clone())
        .collect::<std::collections::BTreeSet<_>>()
        .len();

    if args.iter().any(|a| a == "--emit-tsv") {
        for v in &violations {
            println!(
                "{}\t{}\t{}\t{}\t{}",
                v.crew_id,
                v.local_day_start_utc,
                v.viol_start_utc,
                v.viol_end_utc,
                v.checked_groups_raw
            );
        }
        eprintln!(
            "emitted {} violations across {} crew ({} crew evaluated in {:.3} ms)",
            violations.len(),
            crew_violating,
            total_crew,
            eval.as_secs_f64() * 1000.0,
        );
        return;
    }

    println!("─────────────────────────────────────────────────────────────");
    println!(" Rule 7506/002 (ONE CHECKIN PER DAY) — Rust engine");
    println!(" checked groups : {}", checked_raw);
    println!("─────────────────────────────────────────────────────────────");
    println!(" rosters read   : {}", parsed);
    if skipped > 0 {
        println!(" rows skipped   : {}", skipped);
    }
    println!(" crew evaluated : {}", total_crew);
    println!(
        " rule eval time : {:.3} ms  ({:.1} µs/crew)",
        eval.as_secs_f64() * 1000.0,
        if total_crew > 0 {
            eval.as_micros() as f64 / total_crew as f64
        } else {
            0.0
        }
    );
    println!(
        " violations     : {}   across {} crew",
        violations.len(),
        crew_violating
    );
    println!("─────────────────────────────────────────────────────────────");
    if violations.is_empty() {
        println!(" No violations: every crew checks in at most once per local day.");
    } else {
        println!(" First {}:", top.min(violations.len()));
        println!("   {:<12} {:>14}", "crew", "localDayStart");
        for v in violations.iter().take(top) {
            println!("   {:<12} {:>14}", v.crew_id, v.local_day_start_utc);
        }
    }
    println!("─────────────────────────────────────────────────────────────");
}
