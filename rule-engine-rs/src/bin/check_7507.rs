//! Live check for rule 7507 (MIN # GDOs IN A RP + fly/reserve day filters).
//!
//! Same stdin contract as check-7505, with an extended structured `R` line:
//!   R <TAB> bases <TAB> ranks <TAB> fleets <TAB> teams <TAB> min_do
//!     <TAB> rp_lo <TAB> rp_hi <TAB> leave_lo <TAB> leave_hi <TAB> do_codes(csv)
//!     <TAB> leave_codes(csv) <TAB> count_blank(0/1) <TAB> count_post_rest(0/1)
//!     <TAB> period <TAB> unit
//!     <TAB> fly_lo <TAB> fly_hi <TAB> fly_codes(csv)
//!     <TAB> reserve_lo <TAB> reserve_hi <TAB> reserve_codes(csv)
//!     [<TAB> count_layover(0/1)]
//!
//! Usage:
//!     check-7507 --rp-start <secs> --rp-end <secs> [--offset 0] [--do-start-min 0] [--top 15] [--emit-tsv]

use std::io::{self, Read};

use rois_rule_engine::rules::rule7507::{
    check_min_days_off, filter_days_off_rows_for_crew, parse_check_7505_input, MinDaysOffViolation,
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
fn main() {
    let args: Vec<String> = std::env::args().collect();
    let rp_start = arg_i64(&args, "--rp-start", 0);
    let rp_end = arg_i64(&args, "--rp-end", 0);
    let offset = arg_i64(&args, "--offset", 0);
    let do_start_min = arg_i64(&args, "--do-start-min", 0);
    let top: usize = arg_value(&args, "--top")
        .and_then(|v| v.parse().ok())
        .unwrap_or(15);
    if rp_start == 0 || rp_end == 0 {
        eprintln!("check-7507: --rp-start and --rp-end (epoch seconds) are required");
        std::process::exit(2);
    }

    let mut input = String::new();
    io::stdin().read_to_string(&mut input).expect("read stdin");

    let parsed_input = parse_check_7505_input(&input);
    let parsed = parsed_input.by_crew.values().map(Vec::len).sum::<usize>();
    let skipped = parsed_input.skipped;

    let total_crew = parsed_input.by_crew.len();
    let t0 = std::time::Instant::now();
    let mut violations: Vec<MinDaysOffViolation> = Vec::new();
    for (crew, acts) in &parsed_input.by_crew {
        let empty_scope = Default::default();
        let crew_scope = parsed_input.crew_scopes.get(crew).unwrap_or(&empty_scope);
        let rows = filter_days_off_rows_for_crew(&parsed_input.rows, crew_scope, rp_start, rp_end);
        if rows.is_empty() {
            continue;
        }
        violations.extend(check_min_days_off(
            crew,
            acts,
            rp_start,
            rp_end,
            offset,
            &rows,
            do_start_min,
        ));
    }
    let eval = t0.elapsed();
    violations.sort_by_key(|v| (v.days_off - v.min_do, v.crew_id.clone()));

    if args.iter().any(|a| a == "--emit-tsv") {
        for v in &violations {
            println!(
                "{}\t{}\t{}\t{}\t{}\t{}\t{}",
                v.crew_id, v.rp_start_utc, v.rp_end_utc, v.days_off, v.min_do, v.period, v.unit
            );
        }
        eprintln!(
            "emitted {} violations across {} crew ({} crew evaluated in {:.3} ms)",
            violations.len(),
            violations.len(),
            total_crew,
            eval.as_secs_f64() * 1000.0,
        );
        return;
    }

    println!("─────────────────────────────────────────────────────────────");
    println!(" Rule 7507 (MIN # GDOs + fly/reserve filters) — Rust engine");
    println!(
        " band rows: {}   RP days: {}",
        parsed_input.rows.len(),
        (rp_end - rp_start) / 86_400
    );
    println!("─────────────────────────────────────────────────────────────");
    println!(" activities read: {}", parsed);
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
        " crew VIOLATING : {}   (days off < required MIN DO)",
        violations.len()
    );
    println!("─────────────────────────────────────────────────────────────");
    if violations.is_empty() {
        println!(" No violations: every crew met its required days off.");
    } else {
        println!(
            " Worst {} (fewest days off vs. required):",
            top.min(violations.len())
        );
        println!("   {:<12} {:>8} {:>8}", "crew", "daysOff", "minDO");
        for v in violations.iter().take(top) {
            println!("   {:<12} {:>8} {:>8}", v.crew_id, v.days_off, v.min_do);
        }
    }
    println!("─────────────────────────────────────────────────────────────");
}
