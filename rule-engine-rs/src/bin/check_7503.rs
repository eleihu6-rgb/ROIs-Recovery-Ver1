//! Live check for rule 7503 (LIMITS OF CONSECUTIVE WOCLs).
//!
//! Reads work periods on stdin as TSV — one row per (crew, duty/ground roster):
//!     crew_id <TAB> pairing_id|'' <TAB> start_secs <TAB> end_secs <TAB> offset_min <TAB> is_ground(0/1)
//! `offset_min` is the crew's acclimatisation TZ (rule 7500's ref TZ; the crew base TZ in the
//! live port — see the 7500 note in lib.rs). Groups by crew, orders each crew's periods, and
//! flags every run of consecutive WOCL duties whose size exceeds `--max-consecutive`.
//!
//! Usage:
//!     check-7503 [--wocl-start-min 120] [--wocl-end-min 359] [--max-consecutive 2]
//!                [--night-start-min 1320] [--night-end-min 480] [--min-rest-min 480]
//!                [--top 15] [--emit-tsv]
//!
//! --emit-tsv prints one violation per line for piping into rule_violation:
//!     crew <TAB> pairing_id <TAB> start_secs <TAB> end_secs <TAB> count
//!
//! Dependency-free: the DB read happens upstream (node → TSV), the rule lives here in Rust.

use std::collections::BTreeMap;
use std::io::{self, Read};

use rois_rule_engine::rules::crew_scope::{
    matches_scope, parse_qualification_ord, split_filter, CrewScope,
};
use rois_rule_engine::rules::rule7503::{
    check_consecutive_wocl, LocalNightDef, WoclViolation, WoclWorkPeriod,
};
use rois_rule_engine::BaseQual;

fn arg_value(args: &[String], flag: &str) -> Option<String> {
    args.iter()
        .position(|a| a == flag)
        .and_then(|i| args.get(i + 1).cloned())
}

fn arg_i64(args: &[String], flag: &str, default: i64) -> i64 {
    arg_value(args, flag)
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

#[derive(Debug)]
struct StructuredRow {
    bases: Vec<String>,
    ranks: Vec<String>,
    fleets: Vec<String>,
    teams: Vec<String>,
    start: i64,
    end: i64,
    max: i64,
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
    let mut duties: BTreeMap<String, Vec<WoclWorkPeriod>> = BTreeMap::new();
    let mut scopes: BTreeMap<String, CrewScope> = BTreeMap::new();
    let mut skipped = 0usize;
    for raw in input.lines() {
        let cols: Vec<&str> = raw.trim().split('\t').collect();
        match cols.first().copied() {
            Some("R") if cols.len() >= 8 => {
                let parsed = (cols[5].parse(), cols[6].parse(), cols[7].parse());
                let (Ok(start), Ok(end), Ok(max)) = parsed else {
                    skipped += 1;
                    continue;
                };
                rules.push(StructuredRow {
                    bases: split_filter(cols[1]),
                    ranks: split_filter(cols[2]),
                    fleets: split_filter(cols[3]),
                    teams: split_filter(cols[4]),
                    start,
                    end,
                    max,
                });
            }
            Some("D") if cols.len() >= 7 => {
                let parsed = (
                    cols[3].parse::<i64>(),
                    cols[4].parse::<i64>(),
                    cols[5].parse::<i64>(),
                    cols[6].parse::<i64>(),
                );
                let (Ok(start), Ok(end), Ok(offset), Ok(is_ground)) = parsed else {
                    skipped += 1;
                    continue;
                };
                duties
                    .entry(cols[1].to_string())
                    .or_default()
                    .push(WoclWorkPeriod {
                        pairing_id: cols[2].parse().ok(),
                        start_utc: start,
                        end_utc: end,
                        offset_min: offset,
                        is_ground: is_ground == 1,
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
    let night = LocalNightDef {
        start_min: arg_i64(args, "--night-start-min", 1320),
        end_min: arg_i64(args, "--night-end-min", 480),
        min_rest_secs: arg_i64(args, "--min-rest-min", 480) * 60,
    };
    let mut violations = Vec::new();
    for rule in &rules {
        for (crew, periods) in &duties {
            let Some(first) = periods.first() else {
                continue;
            };
            let context = scopes.get(crew).cloned().unwrap_or_default();
            if !matches_scope(
                &rule.bases,
                &rule.ranks,
                &rule.fleets,
                &rule.teams,
                &context,
                (first.start_utc + first.offset_min * 60).div_euclid(86_400),
            ) {
                continue;
            }
            violations.extend(check_consecutive_wocl(
                crew, periods, rule.start, rule.end, rule.max, &night,
            ));
        }
    }
    violations.sort_by(|a, b| b.count.cmp(&a.count).then(a.crew_id.cmp(&b.crew_id)));
    if args.iter().any(|arg| arg == "--emit-tsv") {
        for violation in &violations {
            println!(
                "{}\t{}\t{}\t{}\t{}",
                violation.crew_id,
                violation.pairing_id,
                violation.start_utc,
                violation.end_utc,
                violation.count
            );
        }
    } else {
        println!(
            "structured rows: {}  work periods: {}  skipped: {}",
            rules.len(),
            duties.values().map(Vec::len).sum::<usize>(),
            skipped
        );
        println!(
            " crew VIOLATING: {}",
            violations
                .iter()
                .map(|v| v.crew_id.as_str())
                .collect::<std::collections::BTreeSet<_>>()
                .len()
        );
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let wocl_start = arg_i64(&args, "--wocl-start-min", 120);
    let wocl_end = arg_i64(&args, "--wocl-end-min", 359);
    let max_consecutive = arg_i64(&args, "--max-consecutive", 2);
    let lnd = LocalNightDef {
        start_min: arg_i64(&args, "--night-start-min", 1320),
        end_min: arg_i64(&args, "--night-end-min", 480),
        min_rest_secs: arg_i64(&args, "--min-rest-min", 480) * 60,
    };
    let top: usize = arg_value(&args, "--top")
        .and_then(|v| v.parse().ok())
        .unwrap_or(15);

    let mut input = String::new();
    io::stdin().read_to_string(&mut input).expect("read stdin");
    if structured_input(&input) {
        run_structured(&input, &args);
        return;
    }

    let mut by_crew: BTreeMap<String, Vec<WoclWorkPeriod>> = BTreeMap::new();
    let mut parsed = 0usize;
    let mut skipped = 0usize;
    for line in input.lines() {
        let line = line.trim_end_matches(['\r', '\n']);
        if line.trim().is_empty() {
            continue;
        }
        let cols: Vec<&str> = line.split('\t').collect();
        if cols.len() < 6 {
            skipped += 1;
            continue;
        }
        let (start, end, off) = match (
            cols[2].parse::<i64>(),
            cols[3].parse::<i64>(),
            cols[4].parse::<i64>(),
        ) {
            (Ok(s), Ok(e), Ok(o)) => (s, e, o),
            _ => {
                skipped += 1;
                continue;
            }
        };
        let is_ground = cols[5] == "1";
        let pairing_id = cols[1].parse::<i64>().ok();
        by_crew
            .entry(cols[0].to_string())
            .or_default()
            .push(WoclWorkPeriod {
                pairing_id,
                start_utc: start,
                end_utc: end,
                offset_min: off,
                is_ground,
            });
        parsed += 1;
    }

    let total_crew = by_crew.len();
    let t0 = std::time::Instant::now();
    let mut violations: Vec<WoclViolation> = Vec::new();
    for (crew, periods) in &by_crew {
        violations.extend(check_consecutive_wocl(
            crew,
            periods,
            wocl_start,
            wocl_end,
            max_consecutive,
            &lnd,
        ));
    }
    let eval = t0.elapsed();
    violations.sort_by(|a, b| b.count.cmp(&a.count).then(a.crew_id.cmp(&b.crew_id)));

    let violating_crew: std::collections::BTreeSet<&str> =
        violations.iter().map(|v| v.crew_id.as_str()).collect();

    if args.iter().any(|a| a == "--emit-tsv") {
        for v in &violations {
            println!(
                "{}\t{}\t{}\t{}\t{}",
                v.crew_id, v.pairing_id, v.start_utc, v.end_utc, v.count
            );
        }
        eprintln!(
            "emitted {} violations across {} crew ({} crew evaluated in {:.3} ms)",
            violations.len(),
            violating_crew.len(),
            total_crew,
            eval.as_secs_f64() * 1000.0,
        );
        return;
    }

    println!("─────────────────────────────────────────────────────────────");
    println!(" Rule 7503 (LIMITS OF CONSECUTIVE WOCLs) — Rust engine");
    println!(
        " limit: at most {} consecutive WOCL duties (WOCL {}–{} local)",
        max_consecutive,
        fmt_min(wocl_start),
        fmt_min(wocl_end)
    );
    println!("─────────────────────────────────────────────────────────────");
    println!(" work periods read : {}", parsed);
    if skipped > 0 {
        println!(" rows skipped      : {} (unparseable)", skipped);
    }
    println!(" crew evaluated    : {}", total_crew);
    println!(
        " rule eval time    : {:.3} ms  ({:.1} µs/crew)",
        eval.as_secs_f64() * 1000.0,
        if total_crew > 0 {
            eval.as_micros() as f64 / total_crew as f64
        } else {
            0.0
        }
    );
    println!(
        " crew VIOLATING    : {}   violations: {}",
        violating_crew.len(),
        violations.len()
    );
    println!("─────────────────────────────────────────────────────────────");

    if violations.is_empty() {
        println!(
            " No violations: no crew exceeds {} consecutive WOCL duties.",
            max_consecutive
        );
    } else {
        println!(" Top {} longest WOCL runs:", top.min(violations.len()));
        println!("   {:<12} {:>5}   {:>10}", "crew", "count", "pairing");
        for v in violations.iter().take(top) {
            println!("   {:<12} {:>5}   {:>10}", v.crew_id, v.count, v.pairing_id);
        }
    }
    println!("─────────────────────────────────────────────────────────────");
}

fn fmt_min(min: i64) -> String {
    format!("{:02}:{:02}", min / 60, min % 60)
}
