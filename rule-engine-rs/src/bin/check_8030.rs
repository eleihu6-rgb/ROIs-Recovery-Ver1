//! Live check for rule 8030 (PILOT AGE).
//!
//! Reads crew-on-flight rows on stdin as TSV — one row per (crew, flight):
//!     flt_id <TAB> pairing_id <TAB> start_date <TAB> crew_id <TAB> division <TAB> birth_date
//! where start_date / birth_date are `YYYY-MM-DD`. Rows are grouped by `flt_id` (physical
//! flight COF — the same flight may appear on different pairings). For each flight it
//! counts crew of `--division` whose age at the flight start is ≥ `--age-limit`; if that
//! count exceeds `--max-number` every such crew is flagged (attributed to their pairing_id).
//!
//! Usage:
//!     check-8030 [--division P] [--age-limit 35] [--max-number 1] [--top 15] [--emit-tsv]
//!
//! --emit-tsv prints one violation per line for piping into rule_violation:
//!     crew <TAB> pairing_id <TAB> flt_id <TAB> age_years <TAB> over_age_count
//!
//! Dependency-free: the DB read happens upstream (node → TSV), the rule lives here in Rust.

use std::collections::BTreeMap;
use std::io::{self, Read};

use rois_rule_engine::{
    parse_date_ord,
    rules::rule8030::{check_pilot_age, AgeFlight, AgeViolation, FlightCrew},
};

fn arg_value(args: &[String], flag: &str) -> Option<String> {
    args.iter()
        .position(|a| a == flag)
        .and_then(|i| args.get(i + 1).cloned())
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let division = arg_value(&args, "--division").unwrap_or_else(|| "P".to_string());
    let age_limit: i64 = arg_value(&args, "--age-limit")
        .and_then(|v| v.parse().ok())
        .unwrap_or(35);
    let max_number: i64 = arg_value(&args, "--max-number")
        .and_then(|v| v.parse().ok())
        .unwrap_or(1);
    let top: usize = arg_value(&args, "--top")
        .and_then(|v| v.parse().ok())
        .unwrap_or(15);

    let mut input = String::new();
    io::stdin().read_to_string(&mut input).expect("read stdin");

    // flt_id -> (start_ord, crew[]). Dedup crew per flight (same crew may appear via
    // multiple pairing_segment rows for the same flt_id).
    let mut by_flight: BTreeMap<i64, (i64, Vec<FlightCrew>)> = BTreeMap::new();
    let mut parsed_rows = 0usize;
    let mut skipped = 0usize;
    for line in input.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let mut it = line.split('\t');
        let (fid, pid, start, crew, div, birth) = match (
            it.next(),
            it.next(),
            it.next(),
            it.next(),
            it.next(),
            it.next(),
        ) {
            (Some(f), Some(p), Some(s), Some(c), Some(d), Some(b)) => (f, p, s, c, d, b),
            _ => {
                skipped += 1;
                continue;
            }
        };
        let (flight_id, pairing_id, start_ord, birth_ord) = match (
            fid.parse::<i64>(),
            pid.parse::<i64>(),
            parse_date_ord(start),
            parse_date_ord(birth),
        ) {
            (Ok(f), Ok(p), Some(s), Some(b)) => (f, p, s, b),
            _ => {
                skipped += 1;
                continue;
            }
        };
        let entry = by_flight
            .entry(flight_id)
            .or_insert((start_ord, Vec::new()));
        // Keep the earliest start seen for the flight.
        if start_ord < entry.0 {
            entry.0 = start_ord;
        }
        if entry.1.iter().any(|c| c.crew_id == crew) {
            continue; // already counted this crew on this flight
        }
        entry.1.push(FlightCrew {
            crew_id: crew.to_string(),
            division: div.to_string(),
            birth_ord,
            pairing_id,
        });
        parsed_rows += 1;
    }

    let flights: Vec<AgeFlight> = by_flight
        .into_iter()
        .map(|(flight_id, (start_ord, crew))| AgeFlight {
            flight_id,
            start_ord,
            crew,
        })
        .collect();
    let total_flights = flights.len();

    let t0 = std::time::Instant::now();
    let mut violations: Vec<AgeViolation> =
        check_pilot_age(&flights, &division, age_limit, max_number);
    let eval_elapsed = t0.elapsed();
    // Oldest first.
    violations.sort_by(|a, b| b.age_years.cmp(&a.age_years));

    let violating_crew: std::collections::BTreeSet<&str> =
        violations.iter().map(|v| v.crew_id.as_str()).collect();
    let firing_flights: std::collections::BTreeSet<i64> =
        violations.iter().map(|v| v.flight_id).collect();

    if args.iter().any(|a| a == "--emit-tsv") {
        for v in &violations {
            println!(
                "{}\t{}\t{}\t{}\t{}",
                v.crew_id, v.pairing_id, v.flight_id, v.age_years, v.over_age_count
            );
        }
        eprintln!(
            "emitted {} violations across {} crew / {} flights ({} flights evaluated in {:.3} ms)",
            violations.len(),
            violating_crew.len(),
            firing_flights.len(),
            total_flights,
            eval_elapsed.as_secs_f64() * 1000.0,
        );
        return;
    }

    println!("─────────────────────────────────────────────────────────────");
    println!(" Rule 8030 (PILOT AGE) — Rust engine");
    println!(
        " limit: at most {} crew of division {} aged ≥ {} per flight (flt_id)",
        max_number, division, age_limit
    );
    println!("─────────────────────────────────────────────────────────────");
    println!(" crew-on-flight rows : {}", parsed_rows);
    if skipped > 0 {
        println!(" rows skipped        : {} (unparseable)", skipped);
    }
    println!(" flights evaluated   : {}", total_flights);
    println!(
        " rule eval time      : {:.3} ms  ({:.1} µs/flight)",
        eval_elapsed.as_secs_f64() * 1000.0,
        if total_flights > 0 {
            eval_elapsed.as_micros() as f64 / total_flights as f64
        } else {
            0.0
        }
    );
    println!(
        " flights FIRING      : {}   crew VIOLATING: {}   violations: {}",
        firing_flights.len(),
        violating_crew.len(),
        violations.len(),
    );
    println!("─────────────────────────────────────────────────────────────");

    if violations.is_empty() {
        println!(
            " No violations: no flight carries > {} crew of division {} aged ≥ {}.",
            max_number, division, age_limit
        );
    } else {
        println!(" Top {} oldest violating crew:", top.min(violations.len()));
        println!(
            "   {:<12} {:>4}   {:>8}   {:>8}   {}",
            "crew", "age", "flight", "pairing", "on-flight count"
        );
        for v in violations.iter().take(top) {
            println!(
                "   {:<12} {:>4}   {:>8}   {:>8}   {}",
                v.crew_id, v.age_years, v.flight_id, v.pairing_id, v.over_age_count,
            );
        }
    }
    println!("─────────────────────────────────────────────────────────────");
}
