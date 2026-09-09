//! Live calculator for rule 7272/001 (CALCULATE DP OF THE RESERVES).
//!
//! A DEFINITION / CALC rule — it computes each reserve roster's standby duty-period (DP) and
//! emits NO violations (like 7502). Reads reserve rosters on stdin as TSV, one per roster:
//!     crew_id <TAB> qualifier <TAB> start_secs <TAB> rest_start_secs
//!       <TAB> notification_secs <TAB> next_report_secs
//! (notification/next_report = 0 when there is no callout → the regular-standby path).
//!
//! Params via CLI (the F8 defaults match param_json): --assignments SBY,PRAM,PRPM,RES
//!   --rate 0.33 --offset-min 0 --sby-limit-min 0 --notify-limit-min 0
//!
//! Usage:
//!     check-7272 [--assignments …] [--rate 0.33] [--offset-min 0] [--top 15] [--emit-tsv]
//! --emit-tsv prints one line per matched reserve: crew <TAB> dp_minutes
//! Dependency-free: the DB read happens upstream (node → TSV).

use std::collections::BTreeMap;
use std::io::{self, Read};

use rois_rule_engine::rules::rule7272::{
    calc_standby_dp, standby_dp_minutes, StandbyDpParam, StandbyRoster,
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
fn arg_f64(args: &[String], flag: &str, default: f64) -> f64 {
    arg_value(args, flag)
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let assignments: Vec<String> = arg_value(&args, "--assignments")
        .unwrap_or_else(|| "SBY,PRAM,PRPM,RES".to_string())
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    let param = StandbyDpParam {
        assignments,
        offset_min: arg_i64(&args, "--offset-min", 0),
        rate: arg_f64(&args, "--rate", 0.33),
        sby_limit_min: arg_i64(&args, "--sby-limit-min", 0),
        notify_limit_min: arg_i64(&args, "--notify-limit-min", 0),
    };
    let top: usize = arg_value(&args, "--top")
        .and_then(|v| v.parse().ok())
        .unwrap_or(15);

    let mut input = String::new();
    io::stdin().read_to_string(&mut input).expect("read stdin");

    let params = [param.clone()];
    let mut parsed = 0usize;
    let mut skipped = 0usize;
    let mut matched = 0usize;
    let mut total_dp_min: i64 = 0;
    let mut by_crew: BTreeMap<String, i64> = BTreeMap::new();
    let mut rows: Vec<(String, i64)> = Vec::new(); // (crew, dp_minutes)

    for line in input.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let c: Vec<&str> = line.split('\t').collect();
        if c.len() < 4 {
            skipped += 1;
            continue;
        }
        let (start, rest, notify, report) = (
            c[2].parse::<i64>(),
            c[3].parse::<i64>(),
            c.get(4).and_then(|x| x.parse::<i64>().ok()).unwrap_or(0),
            c.get(5).and_then(|x| x.parse::<i64>().ok()).unwrap_or(0),
        );
        let (start, rest) = match (start, rest) {
            (Ok(s), Ok(r)) => (s, r),
            _ => {
                skipped += 1;
                continue;
            }
        };
        parsed += 1;
        let roster = StandbyRoster {
            crew_id: c[0].to_string(),
            qualifier: c[1].to_string(),
            start_utc: start,
            rest_start_utc: rest,
            notification_utc: notify,
            next_report_utc: report,
        };
        let dp_secs = calc_standby_dp(&roster, &params);
        if dp_secs < 0 {
            continue; // qualifier not a standby assignment — not a reserve roster.
        }
        matched += 1;
        let dp_min = standby_dp_minutes(dp_secs);
        total_dp_min += dp_min;
        *by_crew.entry(roster.crew_id.clone()).or_insert(0) += dp_min;
        rows.push((roster.crew_id, dp_min));
    }

    if args.iter().any(|a| a == "--emit-tsv") {
        for (crew, dp_min) in &rows {
            println!("{}\t{}", crew, dp_min);
        }
        eprintln!(
            "emitted {} reserve DPs across {} crew",
            matched,
            by_crew.len()
        );
        return;
    }

    let mut longest: Vec<(String, i64)> = rows.clone();
    longest.sort_by(|a, b| b.1.cmp(&a.1));

    let hh = |m: i64| format!("{}:{:02}", m / 60, m % 60);
    println!("─────────────────────────────────────────────────────────────");
    println!(" Rule 7272/001 (CALCULATE DP OF THE RESERVES) — Rust engine [CALC]");
    println!(
        " assignments: {:?}  rate: {}  offset: {} min",
        param.assignments, param.rate, param.offset_min
    );
    println!("─────────────────────────────────────────────────────────────");
    println!(" reserve rosters read : {}", parsed);
    if skipped > 0 {
        println!(" rows skipped         : {}", skipped);
    }
    println!(" reserve rosters DP'd : {}", matched);
    println!(" crew with reserves   : {}", by_crew.len());
    println!(
        " total reserve DP     : {} ({} h)",
        hh(total_dp_min),
        total_dp_min / 60
    );
    println!(" violations           : 0  (CALC / Definition rule — emits no violations)");
    println!("─────────────────────────────────────────────────────────────");
    if !longest.is_empty() {
        println!(" Longest {} reserve DPs:", top.min(longest.len()));
        println!("   {:<12} {:>10}", "crew", "DP");
        for (crew, dp_min) in longest.iter().take(top) {
            println!("   {:<12} {:>10}", crew, hh(*dp_min));
        }
    }
    println!("─────────────────────────────────────────────────────────────");
}
