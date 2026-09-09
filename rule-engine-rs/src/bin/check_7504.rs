//! Live check for rule 7504 (SPACING RULE - WOCL).
//!
//! Reads flight duties on stdin as TSV — one row per (crew, duty):
//!     crew_id <TAB> pairing_id <TAB> start_secs <TAB> end_secs <TAB> offset_min
//! `offset_min` = crew-base TZ (the WOCL window is evaluated in crew-base-local time, per the
//! 7504 gtest). Groups by crew, keeps WOCL flight duties (FDP overlaps [wocl-start,wocl-end]),
//! and flags every consecutive WOCL-duty pair whose rest gap is below `--min-period`.
//!
//! Unit (default RH):
//!   RH — gap must be ≥ min-period hours
//!   CD — gap must satisfy C++ calendar-day CheckMinRest (crew-base day boundary)
//!
//! Usage:
//!     check-7504 [--min-period 80] [--unit RH|CD] [--wocl-start-min 120] [--wocl-end-min 359] [--top 15] [--emit-tsv]
//!
//! --emit-tsv prints one violation per line for piping into rule_violation:
//!     crew <TAB> pairing_id <TAB> gap_start_secs <TAB> gap_end_secs <TAB> offset_min <TAB> actual
//! `actual` = minutes when --unit RH; calendar days when --unit CD.
//!
//! Dependency-free: the DB read happens upstream (node → TSV), the rule lives here in Rust.

use std::collections::BTreeMap;
use std::io::{self, Read};

use rois_rule_engine::{
    check_min_space_wocl, check_min_space_wocl_cd, format_hhmm,
    rules::rule7504::{check_rule7504_structured, Rule7504CrewContext, Rule7504Duty, Rule7504Row},
    Application, BaseQual, WoclSpacingDuty, WoclSpacingViolation,
};

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

fn split_filter(value: &str) -> Vec<String> {
    value
        .split(['|', ','])
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .map(str::to_string)
        .collect()
}

fn parse_bool(value: &str, default: bool) -> bool {
    match value.trim().to_uppercase().as_str() {
        "Y" | "YES" | "TRUE" | "1" => true,
        "N" | "NO" | "FALSE" | "0" => false,
        _ => default,
    }
}

fn parse_ord(value: &str) -> Option<i64> {
    value
        .trim()
        .parse::<i64>()
        .ok()
        .and_then(|ord| (ord >= 0).then_some(ord))
}

fn parse_structured(
    input: &str,
) -> (
    Vec<Rule7504Row>,
    BTreeMap<String, Vec<Rule7504Duty>>,
    BTreeMap<String, Rule7504CrewContext>,
    usize,
) {
    let mut rows = Vec::new();
    let mut duties: BTreeMap<String, Vec<Rule7504Duty>> = BTreeMap::new();
    let mut contexts: BTreeMap<String, Rule7504CrewContext> = BTreeMap::new();
    let mut skipped = 0usize;

    for raw in input.lines() {
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        let cols: Vec<&str> = line.split('\t').collect();
        match cols.first().copied() {
            Some("R") if cols.len() >= 18 => {
                let min_period = match cols[14].parse::<i64>() {
                    Ok(value) => value,
                    Err(_) => {
                        skipped += 1;
                        continue;
                    }
                };
                let wocl_start = cols[16].parse::<i64>().ok();
                let wocl_end = cols[17].parse::<i64>().ok();
                rows.push(Rule7504Row {
                    prev_assignment_groups: split_filter(cols[1]),
                    next_assignment_groups: split_filter(cols[2]),
                    prev_assignments: split_filter(cols[3]),
                    next_assignments: split_filter(cols[4]),
                    prev_attributes: split_filter(cols[5]),
                    next_attributes: split_filter(cols[6]),
                    apply_prelabelled_attributes: parse_bool(cols[7], false),
                    utilize_post_rest: parse_bool(cols[8], true),
                    bases: split_filter(cols[9]),
                    ranks: split_filter(cols[10]),
                    fleets: split_filter(cols[11]),
                    teams: split_filter(cols[12]),
                    level: cols[13].trim().to_uppercase(),
                    min_period,
                    unit: cols[15].trim().to_uppercase(),
                    wocl_window: wocl_start.zip(wocl_end),
                });
            }
            Some("D") if cols.len() >= 12 => {
                let parsed = (
                    cols[2].parse::<i64>(),
                    cols[3].parse::<i64>(),
                    cols[4].parse::<i64>(),
                    cols[5].parse::<i64>(),
                    cols[6].parse::<i64>(),
                    cols[7].parse::<i64>(),
                );
                let (
                    Ok(pairing_id),
                    Ok(start_utc),
                    Ok(end_duty_utc),
                    Ok(end_including_rest_utc),
                    Ok(day_ord),
                    Ok(offset_min),
                ) = parsed
                else {
                    skipped += 1;
                    continue;
                };
                duties
                    .entry(cols[1].to_string())
                    .or_default()
                    .push(Rule7504Duty {
                        pairing_id,
                        start_utc,
                        end_duty_utc,
                        end_including_rest_utc,
                        day_ord,
                        offset_min,
                        assignment_group: cols[8].to_string(),
                        assignment: cols[9].to_string(),
                        attributes: cols[10].to_string(),
                        is_pre_assigned: parse_bool(cols[11], false),
                    });
            }
            Some("Q") if cols.len() >= 6 => {
                let crew = cols[1].to_string();
                let qual = BaseQual {
                    base: cols[3].to_string(),
                    eff_ord: parse_ord(cols[4]),
                    exp_ord: parse_ord(cols[5]),
                };
                let context = contexts.entry(crew).or_default();
                match cols[2].trim().to_uppercase().as_str() {
                    "BASE" => context.base_quals.push(qual),
                    "RANK" => context.rank_quals.push(qual),
                    "FLEET" => context.fleet_quals.push(qual),
                    _ => skipped += 1,
                }
            }
            Some("T") if cols.len() >= 3 => {
                contexts
                    .entry(cols[1].to_string())
                    .or_default()
                    .teams
                    .push(cols[2].to_string());
            }
            _ => skipped += 1,
        }
    }

    (rows, duties, contexts, skipped)
}

fn is_structured_input(input: &str) -> bool {
    input
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .any(|line| matches!(line.split('\t').next(), Some("R" | "D" | "Q" | "T")))
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let min_period = arg_i64(&args, "--min-period", 80);
    let unit = arg_value(&args, "--unit")
        .unwrap_or_else(|| "RH".to_string())
        .trim()
        .to_uppercase();
    let wocl_start = arg_i64(&args, "--wocl-start-min", 120);
    let wocl_end = arg_i64(&args, "--wocl-end-min", 359);
    let top: usize = arg_value(&args, "--top")
        .and_then(|v| v.parse().ok())
        .unwrap_or(15);

    let mut input = String::new();
    io::stdin().read_to_string(&mut input).expect("read stdin");

    if is_structured_input(&input) {
        let (rows, by_crew, contexts, skipped) = parse_structured(&input);
        let total_crew = by_crew.len();
        let t0 = std::time::Instant::now();
        let mut violations = Vec::new();
        for row in &rows {
            for (crew, duties) in &by_crew {
                let context = contexts.get(crew).cloned().unwrap_or_default();
                violations.extend(check_rule7504_structured(
                    crew,
                    row,
                    &context,
                    duties,
                    Some((wocl_start, wocl_end)),
                    Application::Editor,
                ));
            }
        }
        let eval = t0.elapsed();
        violations.sort_by_key(|v| v.actual_minutes);
        let violating_crew: std::collections::BTreeSet<&str> =
            violations.iter().map(|v| v.crew_id.as_str()).collect();
        if args.iter().any(|a| a == "--emit-tsv") {
            for v in &violations {
                println!(
                    "{}\t{}\t{}\t{}\t{}\t{}",
                    v.crew_id,
                    v.pairing_id,
                    v.gap_start_utc,
                    v.gap_end_utc,
                    v.offset_min,
                    v.actual_minutes
                );
            }
            eprintln!(
                "emitted {} violations across {} crew ({} crew evaluated in {:.3} ms, structured, skipped={})",
                violations.len(),
                violating_crew.len(),
                total_crew,
                eval.as_secs_f64() * 1000.0,
                skipped,
            );
            return;
        }
        println!(
            "structured rows: {}  duties: {}  skipped: {}",
            rows.len(),
            by_crew.values().map(Vec::len).sum::<usize>(),
            skipped
        );
        println!(
            " crew VIOLATING: {}   violations: {}",
            violating_crew.len(),
            violations.len()
        );
        return;
    }

    let mut by_crew: BTreeMap<String, Vec<WoclSpacingDuty>> = BTreeMap::new();
    let mut parsed = 0usize;
    let mut skipped = 0usize;
    for line in input.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let cols: Vec<&str> = line.split('\t').collect();
        if cols.len() < 5 {
            skipped += 1;
            continue;
        }
        let (pid, start, end, off) = match (
            cols[1].parse::<i64>(),
            cols[2].parse::<i64>(),
            cols[3].parse::<i64>(),
            cols[4].parse::<i64>(),
        ) {
            (Ok(p), Ok(s), Ok(e), Ok(o)) => (p, s, e, o),
            _ => {
                skipped += 1;
                continue;
            }
        };
        by_crew
            .entry(cols[0].to_string())
            .or_default()
            .push(WoclSpacingDuty {
                pairing_id: pid,
                start_utc: start,
                end_utc: end,
                offset_min: off,
            });
        parsed += 1;
    }

    let total_crew = by_crew.len();
    let t0 = std::time::Instant::now();
    let mut violations: Vec<WoclSpacingViolation> = Vec::new();
    for (crew, duties) in &by_crew {
        if unit == "CD" {
            violations.extend(check_min_space_wocl_cd(
                crew, duties, wocl_start, wocl_end, min_period,
            ));
        } else {
            // Default / RH — existing hour path (unchanged).
            violations.extend(check_min_space_wocl(
                crew, duties, wocl_start, wocl_end, min_period,
            ));
        }
    }
    let eval = t0.elapsed();
    violations.sort_by_key(|v| v.actual_minutes);

    let violating_crew: std::collections::BTreeSet<&str> =
        violations.iter().map(|v| v.crew_id.as_str()).collect();

    if args.iter().any(|a| a == "--emit-tsv") {
        for v in &violations {
            println!(
                "{}\t{}\t{}\t{}\t{}\t{}",
                v.crew_id,
                v.pairing_id,
                v.gap_start_utc,
                v.gap_end_utc,
                v.offset_min,
                v.actual_minutes
            );
        }
        eprintln!(
            "emitted {} violations across {} crew ({} crew evaluated in {:.3} ms, unit={})",
            violations.len(),
            violating_crew.len(),
            total_crew,
            eval.as_secs_f64() * 1000.0,
            unit,
        );
        return;
    }

    println!("─────────────────────────────────────────────────────────────");
    println!(" Rule 7504 (SPACING RULE - WOCL) — Rust engine");
    println!(
        " limit: min {} {} rest between consecutive WOCL flight duties",
        min_period, unit
    );
    println!("─────────────────────────────────────────────────────────────");
    println!(" duties read   : {}", parsed);
    if skipped > 0 {
        println!(" rows skipped  : {} (unparseable)", skipped);
    }
    println!(" crew evaluated: {}", total_crew);
    println!(
        " rule eval time: {:.3} ms  ({:.1} µs/crew)",
        eval.as_secs_f64() * 1000.0,
        if total_crew > 0 {
            eval.as_micros() as f64 / total_crew as f64
        } else {
            0.0
        }
    );
    println!(
        " crew VIOLATING: {}   violations: {}",
        violating_crew.len(),
        violations.len()
    );
    println!("─────────────────────────────────────────────────────────────");

    if violations.is_empty() {
        println!(
            " No violations: every consecutive WOCL-duty pair is ≥ {} {} apart.",
            min_period, unit
        );
    } else {
        println!(" Top {} tightest WOCL spacings:", top.min(violations.len()));
        println!("   {:<12} {:>10}   {:>10}", "crew", "gap", "pairing");
        for v in violations.iter().take(top) {
            let gap = if unit == "CD" {
                format!("{} CD", v.actual_minutes)
            } else {
                format_hhmm(v.actual_minutes)
            };
            println!("   {:<12} {:>10}   {:>10}", v.crew_id, gap, v.pairing_id);
        }
    }
    println!("─────────────────────────────────────────────────────────────");
}
