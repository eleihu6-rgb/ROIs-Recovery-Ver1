//! Live check for rule 8004 (BASIC COMPETENCY — BASE).
//!
//! Reads three row types on stdin as TSV, grouped by crew_id:
//!     R <TAB> crew_id <TAB> pairing_id <TAB> base <TAB> start_date <TAB> end_date   (roster)
//!     Q <TAB> crew_id <TAB> base <TAB> eff_date|- <TAB> exp_date|-                  (crew_base qual)
//!     A <TAB> crew_id <TAB> pairing_id|- <TAB> start_utc <TAB> end_utc <TAB> start_station <TAB> end_station
//!         (chronological activity chain for the location-continuity closed-loop exemption;
//!          pairing_id `-` for ground/SIM/non-pairing activity)
//! where dates are `YYYY-MM-DD` and `-` marks an open-ended (null) eff/exp. For each crew
//! it flags every roster whose (non-empty/non-'*') base is not covered by a crew_base qual
//! with eff ≤ roster_start and exp(+grace) > roster_end, unless the roster sits inside a
//! genuine closed loop back to a qualified base (see `check_base_competency_app`).
//!
//! Usage:
//!     check-8004 [--grace-days 0] [--top 15] [--emit-tsv]
//!
//! --emit-tsv prints one violation per line for piping into rule_violation:
//!     crew <TAB> pairing_id <TAB> base
//!
//! Dependency-free: the DB read happens upstream (node → TSV), the rule lives here in Rust.

use std::collections::BTreeMap;
use std::io::{self, Read};

use rois_rule_engine::{
    parse_date_ord,
    rules::rule8004::{
        check_base_competency_app, BaseActivity, BaseQual, BaseRoster, CompetencyViolation,
    },
    Application,
};

fn arg_value(args: &[String], flag: &str) -> Option<String> {
    args.iter()
        .position(|a| a == flag)
        .and_then(|i| args.get(i + 1).cloned())
}

fn opt_ord(s: &str) -> Option<i64> {
    if s == "-" || s.is_empty() {
        None
    } else {
        parse_date_ord(s)
    }
}

fn opt_pairing_id(s: &str) -> Option<i64> {
    if s == "-" || s.is_empty() {
        None
    } else {
        s.parse().ok()
    }
}

#[derive(Default)]
struct CrewData {
    rosters: Vec<BaseRoster>,
    quals: Vec<BaseQual>,
    activities: Vec<BaseActivity>,
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let grace_days: i64 = arg_value(&args, "--grace-days")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    let top: usize = arg_value(&args, "--top")
        .and_then(|v| v.parse().ok())
        .unwrap_or(15);

    let mut input = String::new();
    io::stdin().read_to_string(&mut input).expect("read stdin");

    let mut by_crew: BTreeMap<String, CrewData> = BTreeMap::new();
    let mut roster_rows = 0usize;
    let mut qual_rows = 0usize;
    let mut activity_rows = 0usize;
    let mut skipped = 0usize;
    for line in input.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let cols: Vec<&str> = line.split('\t').collect();
        match cols.first().copied() {
            Some("R") if cols.len() >= 6 => {
                let (pid, start, end) = match (
                    cols[2].parse::<i64>(),
                    parse_date_ord(cols[4]),
                    parse_date_ord(cols[5]),
                ) {
                    (Ok(p), Some(s), Some(e)) => (p, s, e),
                    _ => {
                        skipped += 1;
                        continue;
                    }
                };
                by_crew
                    .entry(cols[1].to_string())
                    .or_default()
                    .rosters
                    .push(BaseRoster {
                        pairing_id: pid,
                        base: cols[3].to_string(),
                        start_ord: start,
                        end_ord: end,
                    });
                roster_rows += 1;
            }
            Some("Q") if cols.len() >= 5 => {
                by_crew
                    .entry(cols[1].to_string())
                    .or_default()
                    .quals
                    .push(BaseQual {
                        base: cols[2].to_string(),
                        eff_ord: opt_ord(cols[3]),
                        exp_ord: opt_ord(cols[4]),
                    });
                qual_rows += 1;
            }
            Some("A") if cols.len() >= 7 => {
                let (start_utc, end_utc) = match (cols[3].parse::<i64>(), cols[4].parse::<i64>()) {
                    (Ok(s), Ok(e)) => (s, e),
                    _ => {
                        skipped += 1;
                        continue;
                    }
                };
                by_crew
                    .entry(cols[1].to_string())
                    .or_default()
                    .activities
                    .push(BaseActivity {
                        pairing_id: opt_pairing_id(cols[2]),
                        start_utc,
                        end_utc,
                        start_station: cols[5].to_string(),
                        end_station: cols[6].to_string(),
                    });
                activity_rows += 1;
            }
            _ => {
                skipped += 1;
            }
        }
    }

    let total_crew = by_crew.len();
    let t0 = std::time::Instant::now();
    let mut violations: Vec<CompetencyViolation> = Vec::new();
    for (crew, data) in &by_crew {
        violations.extend(check_base_competency_app(
            crew,
            &data.rosters,
            &data.quals,
            grace_days,
            Application::Editor,
            &[],
            &data.activities,
        ));
    }
    let eval_elapsed = t0.elapsed();
    violations.sort_by(|a, b| {
        a.crew_id
            .cmp(&b.crew_id)
            .then(a.pairing_id.cmp(&b.pairing_id))
    });

    let violating_crew: std::collections::BTreeSet<&str> =
        violations.iter().map(|v| v.crew_id.as_str()).collect();

    if args.iter().any(|a| a == "--emit-tsv") {
        for v in &violations {
            println!("{}\t{}\t{}", v.crew_id, v.pairing_id, v.base);
        }
        eprintln!(
            "emitted {} violations across {} crew ({} crew evaluated in {:.3} ms)",
            violations.len(),
            violating_crew.len(),
            total_crew,
            eval_elapsed.as_secs_f64() * 1000.0,
        );
        return;
    }

    println!("─────────────────────────────────────────────────────────────");
    println!(" Rule 8004 (BASIC COMPETENCY — BASE) — Rust engine");
    println!(" check: each roster's base must be a valid crew_base during the roster span");
    println!("─────────────────────────────────────────────────────────────");
    println!(
        " rosters read  : {}   quals read: {}   activities read: {}",
        roster_rows, qual_rows, activity_rows
    );
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
        " crew VIOLATING: {}   violations: {}",
        violating_crew.len(),
        violations.len(),
    );
    println!("─────────────────────────────────────────────────────────────");

    if violations.is_empty() {
        println!(" No violations: every roster's base is covered by a crew_base.");
    } else {
        println!(
            " Top {} base-competency violations:",
            top.min(violations.len())
        );
        println!("   {:<12} {:>8}   {}", "crew", "pairing", "missing base");
        for v in violations.iter().take(top) {
            println!("   {:<12} {:>8}   {}", v.crew_id, v.pairing_id, v.base);
        }
    }
    println!("─────────────────────────────────────────────────────────────");
}
