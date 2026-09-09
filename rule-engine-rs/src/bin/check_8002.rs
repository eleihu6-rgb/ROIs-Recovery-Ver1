//! Live check for rule 8002 (MAX_CUM_BLOCK).
//!
//! Reads roster block time on stdin as TSV — one row per flight segment:
//!     crew_id <TAB> YYYY-MM-DD <TAB> block_minutes
//! Groups by crew, sums block minutes per calendar day, and flags any crew whose worst
//! rolling `--window-days` window exceeds `--limit-hours`.
//!
//! Usage:
//!     check-8002 [--window-days 28] [--limit-hours 40] [--top 15]
//!
//! Dependency-free: the DB read happens upstream (node → TSV), the rule lives here in Rust.

use std::collections::BTreeMap;
use std::io::{self, Read};

use rois_rule_engine::{
    format_ord, parse_date_ord,
    rules::rule8002::{check_max_cum_block, Violation},
};

fn arg_value(args: &[String], flag: &str) -> Option<String> {
    args.iter()
        .position(|a| a == flag)
        .and_then(|i| args.get(i + 1).cloned())
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let window_days: i64 = arg_value(&args, "--window-days")
        .and_then(|v| v.parse().ok())
        .unwrap_or(28);
    let limit_hours: f64 = arg_value(&args, "--limit-hours")
        .and_then(|v| v.parse().ok())
        .unwrap_or(40.0);
    let top: usize = arg_value(&args, "--top")
        .and_then(|v| v.parse().ok())
        .unwrap_or(15);
    let limit_minutes = limit_hours * 60.0;

    let mut input = String::new();
    io::stdin().read_to_string(&mut input).expect("read stdin");

    // crew_id -> (date_ord -> block_minutes)
    let mut by_crew: BTreeMap<String, BTreeMap<i64, f64>> = BTreeMap::new();
    let mut parsed_rows = 0usize;
    let mut skipped = 0usize;
    for line in input.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let mut it = line.split('\t');
        let (crew, date, mins) = match (it.next(), it.next(), it.next()) {
            (Some(c), Some(d), Some(m)) => (c, d, m),
            _ => {
                skipped += 1;
                continue;
            }
        };
        let ord = match parse_date_ord(date) {
            Some(o) => o,
            None => {
                skipped += 1;
                continue;
            }
        };
        let minutes: f64 = match mins.parse() {
            Ok(v) => v,
            Err(_) => {
                skipped += 1;
                continue;
            }
        };
        *by_crew
            .entry(crew.to_string())
            .or_default()
            .entry(ord)
            .or_insert(0.0) += minutes;
        parsed_rows += 1;
    }

    let total_crew = by_crew.len();
    // Measure pure rule-evaluation time (excludes stdin read / parse).
    let t0 = std::time::Instant::now();
    let mut violations: Vec<Violation> = Vec::new();
    for (crew, daily) in &by_crew {
        if let Some(v) = check_max_cum_block(crew, daily, window_days, limit_minutes) {
            violations.push(v);
        }
    }
    let eval_elapsed = t0.elapsed();
    violations.sort_by(|a, b| b.actual_minutes.partial_cmp(&a.actual_minutes).unwrap());

    // --emit-tsv: one violation per line (crew, window start/end, actual minutes) for
    // piping into rule_violation. Suppresses the human report.
    if args.iter().any(|a| a == "--emit-tsv") {
        for v in &violations {
            println!(
                "{}\t{}\t{}\t{:.0}",
                v.crew_id,
                format_ord(v.window_start_ord),
                format_ord(v.window_end_ord()),
                v.actual_minutes
            );
        }
        eprintln!(
            "emitted {} violations ({} crew evaluated in {:.3} ms)",
            violations.len(),
            total_crew,
            eval_elapsed.as_secs_f64() * 1000.0
        );
        return;
    }

    println!("─────────────────────────────────────────────────────────────");
    println!(" Rule 8002 (MAX_CUM_BLOCK) — Rust engine");
    println!(
        " limit: {:.0}h block in any rolling {}-calendar-day window",
        limit_hours, window_days
    );
    println!("─────────────────────────────────────────────────────────────");
    println!(" segments read : {}", parsed_rows);
    if skipped > 0 {
        println!(" rows skipped  : {} (unparseable)", skipped);
    }
    println!(" crew evaluated: {}", total_crew);
    println!(
        " rule eval time: {:.3} ms  ({:.1} µs/crew)",
        eval_elapsed.as_secs_f64() * 1000.0,
        if total_crew > 0 {
            eval_elapsed.as_micros() as f64 / total_crew as f64
        } else {
            0.0
        }
    );
    println!(
        " crew VIOLATING: {}  ({:.1}%)",
        violations.len(),
        if total_crew > 0 {
            100.0 * violations.len() as f64 / total_crew as f64
        } else {
            0.0
        }
    );
    println!("─────────────────────────────────────────────────────────────");

    if violations.is_empty() {
        println!(
            " No violations: no crew exceeds {:.0}h in any {}-day window.",
            limit_hours, window_days
        );
    } else {
        println!(
            " Top {} by worst-window block hours:",
            top.min(violations.len())
        );
        println!(
            "   {:<12} {:>10} {:>10}   {}",
            "crew", "actual", "limit", "worst window"
        );
        for v in violations.iter().take(top) {
            println!(
                "   {:<12} {:>9.1}h {:>9.0}h   {} … {}",
                v.crew_id,
                v.actual_hours(),
                v.limit_hours(),
                format_ord(v.window_start_ord),
                format_ord(v.window_end_ord()),
            );
        }
    }
    println!("─────────────────────────────────────────────────────────────");
}
