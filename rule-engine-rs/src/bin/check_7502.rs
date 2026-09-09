//! Credit-hours calculator for rule 7502 (CALCULATION OF CREDIT HOURS).
//!
//! Reads roster activities on stdin as TSV — one row per activity:
//!     crew_id <TAB> assignment_group <TAB> blk_minutes <TAB> dp_minutes
//! Computes per-activity credit via the F8 7502/002 ruleset (FLY→FT, GND→DP,
//! DO|LO|LEA|SBY→MinCH) and sums credit per crew. This is a CALC rule — it reports
//! credit-hour totals and emits NO violations.
//!
//! Usage:
//!     check-7502 [--ft-ratio 1.0] [--dp-ratio 0.5] [--min-ch-minutes 240] [--top 15] [--emit-tsv]
//!
//! --emit-tsv prints one crew per line:
//!     crew <TAB> total_credit_min <TAB> fly_credit_min <TAB> gnd_credit_min <TAB> other_credit_min <TAB> activities
//!
//! Dependency-free: the DB read happens upstream (node → TSV), the rule lives here in Rust.

use std::collections::BTreeMap;
use std::io::{self, Read};

use rois_rule_engine::rules::rule7502::{credit_for_activity, f8_credit_ruleset};

fn arg_value(args: &[String], flag: &str) -> Option<String> {
    args.iter()
        .position(|a| a == flag)
        .and_then(|i| args.get(i + 1).cloned())
}

#[derive(Default, Clone)]
struct CrewCredit {
    total: i64,
    fly: i64,
    ground: i64, // everything non-FLY (ground duty + off/leave/standby)
    activities: i64,
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let ft_ratio: f64 = arg_value(&args, "--ft-ratio")
        .and_then(|v| v.parse().ok())
        .unwrap_or(1.0);
    let dp_ratio: f64 = arg_value(&args, "--dp-ratio")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0.5);
    let min_ch: i64 = arg_value(&args, "--min-ch-minutes")
        .and_then(|v| v.parse().ok())
        .unwrap_or(240);
    let top: usize = arg_value(&args, "--top")
        .and_then(|v| v.parse().ok())
        .unwrap_or(15);
    let rules = f8_credit_ruleset(ft_ratio, dp_ratio, min_ch);

    let mut input = String::new();
    io::stdin().read_to_string(&mut input).expect("read stdin");

    let mut by_crew: BTreeMap<String, CrewCredit> = BTreeMap::new();
    let mut parsed_rows = 0usize;
    let mut skipped = 0usize;
    let mut unmatched = 0usize;

    let t0 = std::time::Instant::now();
    for line in input.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let mut it = line.split('\t');
        let (crew, group, blk, dp) = match (it.next(), it.next(), it.next(), it.next()) {
            (Some(c), Some(g), Some(b), Some(d)) => (c, g, b, d),
            _ => {
                skipped += 1;
                continue;
            }
        };
        let (blk_min, dp_min) = match (blk.parse::<i64>(), dp.parse::<i64>()) {
            (Ok(b), Ok(d)) => (b, d),
            _ => {
                skipped += 1;
                continue;
            }
        };
        match credit_for_activity(group, blk_min, dp_min, &rules) {
            Some(credit) => {
                let e = by_crew.entry(crew.to_string()).or_default();
                e.total += credit;
                e.activities += 1;
                if group == "FLY" {
                    e.fly += credit;
                } else {
                    e.ground += credit;
                }
                parsed_rows += 1;
            }
            None => unmatched += 1,
        }
    }
    let eval_elapsed = t0.elapsed();
    let total_crew = by_crew.len();

    if args.iter().any(|a| a == "--emit-tsv") {
        for (crew, c) in &by_crew {
            println!(
                "{}\t{}\t{}\t{}\t{}",
                crew, c.total, c.fly, c.ground, c.activities
            );
        }
        eprintln!(
            "computed credit for {} crew ({} activities, {} unmatched) in {:.3} ms",
            total_crew,
            parsed_rows,
            unmatched,
            eval_elapsed.as_secs_f64() * 1000.0,
        );
        return;
    }

    let mut ranked: Vec<(&String, &CrewCredit)> = by_crew.iter().collect();
    ranked.sort_by(|a, b| b.1.total.cmp(&a.1.total));
    let grand_total: i64 = by_crew.values().map(|c| c.total).sum();

    println!("─────────────────────────────────────────────────────────────");
    println!(" Rule 7502 (CALCULATION OF CREDIT HOURS) — Rust engine [CALC rule]");
    println!(
        " params: FLY×{:.2} (FT), GND×{:.2} (DP), DO|LO|LEA|SBY = {}min floor; default floor 240",
        ft_ratio, dp_ratio, min_ch
    );
    println!("─────────────────────────────────────────────────────────────");
    println!(
        " activities   : {}{}",
        parsed_rows,
        if skipped > 0 {
            format!("  ({} skipped)", skipped)
        } else {
            String::new()
        }
    );
    println!(" crew credited : {}", total_crew);
    println!(
        " calc time     : {:.3} ms  ({:.1} µs/crew)",
        eval_elapsed.as_secs_f64() * 1000.0,
        if total_crew > 0 {
            eval_elapsed.as_micros() as f64 / total_crew as f64
        } else {
            0.0
        }
    );
    println!(
        " total credit  : {:.1} h  (avg {:.1} h/crew)",
        grand_total as f64 / 60.0,
        if total_crew > 0 {
            grand_total as f64 / 60.0 / total_crew as f64
        } else {
            0.0
        }
    );
    println!("─────────────────────────────────────────────────────────────");
    println!(" Top {} crew by credit hours:", top.min(ranked.len()));
    println!(
        "   {:<12} {:>10} {:>9} {:>9}   {}",
        "crew", "credit", "fly", "ground", "acts"
    );
    for (crew, c) in ranked.iter().take(top) {
        println!(
            "   {:<12} {:>9.1}h {:>8.1}h {:>8.1}h   {}",
            crew,
            c.total as f64 / 60.0,
            c.fly as f64 / 60.0,
            c.ground as f64 / 60.0,
            c.activities
        );
    }
    println!("─────────────────────────────────────────────────────────────");
}
