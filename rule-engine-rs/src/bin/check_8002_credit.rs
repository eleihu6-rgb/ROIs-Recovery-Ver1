//! 8002/006 standalone CREDIT-HOUR BAND check (4th row: Type=CH, 1 CM, 75:00/65:00).
//!
//! Reads roster activities on stdin as TSV — one row per activity:
//!     crew_id <TAB> credit_minutes <TAB> YYYY-MM-DD
//! Per-activity credit is computed upstream (node, data-driven from the assignment
//! fixed_credit factors — flight → block×ft; ground → fixed_credit_min only; the same
//! model 7502 uses). This binary sums credit per crew per
//! CALENDAR MONTH, prorates the band by availability (active days / days in month), and
//! warns when the monthly credit is above Max or below Min.
//!
//! Usage:
//!     check-8002-credit [--min-hours 65] [--max-hours 75] [--top 15] [--emit-tsv]
//!
//! --emit-tsv prints one violation per line for piping into rule_violation:
//!     crew <TAB> month <TAB> credit_min <TAB> min_pro <TAB> max_pro <TAB> over(1|0)
//!          <TAB> active_days <TAB> days_in_month

use std::collections::BTreeMap;
use std::io::{self, Read};

use rois_rule_engine::{
    format_hhmm,
    rules::rule8002::{check_credit_band, days_in_month, CreditBandViolation},
};

fn arg_value(args: &[String], flag: &str) -> Option<String> {
    args.iter()
        .position(|a| a == flag)
        .and_then(|i| args.get(i + 1).cloned())
}

#[derive(Default)]
struct MonthAcc {
    credit: i64,
    active_days: std::collections::BTreeSet<i64>, // day-of-month (or ordinal) for availability
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let min_hours: f64 = arg_value(&args, "--min-hours")
        .and_then(|v| v.parse().ok())
        .unwrap_or(65.0);
    let max_hours: f64 = arg_value(&args, "--max-hours")
        .and_then(|v| v.parse().ok())
        .unwrap_or(75.0);
    let top: usize = arg_value(&args, "--top")
        .and_then(|v| v.parse().ok())
        .unwrap_or(15);
    let raw_min = (min_hours * 60.0).round() as i64;
    let raw_max = (max_hours * 60.0).round() as i64;

    let mut input = String::new();
    io::stdin().read_to_string(&mut input).expect("read stdin");

    // (crew, "YYYY-MM") -> accumulator
    let mut acc: BTreeMap<(String, String), MonthAcc> = BTreeMap::new();
    let mut parsed = 0usize;
    let mut skipped = 0usize;
    for line in input.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        // TSV: crew <TAB> credit_minutes <TAB> YYYY-MM-DD. Credit is pre-computed upstream
        // (node, data-driven from the assignment fixed_credit_min factor — same
        // model 7502 uses). One row per roster activity (credit 0 marks an active day only).
        let mut it = line.split('\t');
        let (crew, credit, day) = match (it.next(), it.next(), it.next()) {
            (Some(c), Some(cr), Some(d)) => (c, cr, d),
            _ => {
                skipped += 1;
                continue;
            }
        };
        let credit_min: i64 = match credit.parse() {
            Ok(v) => v,
            Err(_) => {
                skipped += 1;
                continue;
            }
        };
        if day.len() < 10 {
            skipped += 1;
            continue;
        }
        let month = day[0..7].to_string(); // YYYY-MM
        let dom: i64 = day[8..10].parse().unwrap_or(0);
        let e = acc.entry((crew.to_string(), month)).or_default();
        e.credit += credit_min;
        e.active_days.insert(dom);
        parsed += 1;
    }

    let t0 = std::time::Instant::now();
    let mut viols: Vec<CreditBandViolation> = Vec::new();
    let mut active_days_of: Vec<(String, i64, i64)> = Vec::new(); // crew, active, dim — for report
    for ((crew, month), a) in &acc {
        let y: i64 = month[0..4].parse().unwrap_or(2026);
        let m: i64 = month[5..7].parse().unwrap_or(1);
        let dim = days_in_month(y, m);
        let factor = (a.active_days.len() as f64 / dim as f64).min(1.0);
        active_days_of.push((crew.clone(), a.active_days.len() as i64, dim));
        if let Some(v) = check_credit_band(crew, month, a.credit, raw_min, raw_max, factor) {
            viols.push(v);
        }
    }
    let eval = t0.elapsed();
    let total_crew_months = acc.len();
    viols.sort_by(|a, b| b.credit_minutes.cmp(&a.credit_minutes));

    if args.iter().any(|a| a == "--emit-tsv") {
        let dim_map: std::collections::HashMap<String, (i64, i64)> = active_days_of
            .iter()
            .map(|(c, ad, dm)| (c.clone(), (*ad, *dm)))
            .collect();
        for v in &viols {
            let (ad, dm) = dim_map.get(&v.crew_id).copied().unwrap_or((0, 30));
            println!(
                "{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}",
                v.crew_id,
                v.month,
                v.credit_minutes,
                v.min_minutes,
                v.max_minutes,
                if v.over { 1 } else { 0 },
                ad,
                dm,
            );
        }
        eprintln!(
            "emitted {} credit-band warnings over {} crew-months in {:.3} ms",
            viols.len(),
            total_crew_months,
            eval.as_secs_f64() * 1000.0,
        );
        return;
    }

    let over = viols.iter().filter(|v| v.over).count();
    let under = viols.len() - over;
    println!("─────────────────────────────────────────────────────────────");
    println!(" Rule 8002/006 — CREDIT-HOUR BAND (Type=CH, 1 CM) — Rust engine");
    println!(
        " band: credit must be within {:.0}:00 … {:.0}:00 per calendar month (prorated)",
        min_hours, max_hours
    );
    println!("─────────────────────────────────────────────────────────────");
    println!(
        " activities    : {}{}",
        parsed,
        if skipped > 0 {
            format!("  ({} skipped)", skipped)
        } else {
            String::new()
        }
    );
    println!(" crew-months    : {}", total_crew_months);
    println!(" eval time      : {:.3} ms", eval.as_secs_f64() * 1000.0);
    println!(
        " WARNINGS       : {}  ({} over max, {} under min)",
        viols.len(),
        over,
        under
    );
    println!("─────────────────────────────────────────────────────────────");
    println!(" Top {} by monthly credit:", top.min(viols.len()));
    println!(
        "   {:<12} {:<8} {:>9} {:>9} {:>9}   {}",
        "crew", "month", "credit", "min", "max", "bound"
    );
    for v in viols.iter().take(top) {
        println!(
            "   {:<12} {:<8} {:>9} {:>9} {:>9}   {}",
            v.crew_id,
            v.month,
            format_hhmm(v.credit_minutes),
            format_hhmm(v.min_minutes),
            format_hhmm(v.max_minutes),
            if v.over { "OVER max" } else { "under min" }
        );
    }
    println!("─────────────────────────────────────────────────────────────");
}
