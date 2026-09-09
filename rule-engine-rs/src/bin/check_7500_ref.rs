//! Bounded batch calculator for rule 7500 crew-specific duty Ref timezones.
//!
//! Input is TSV, one duty per line:
//!   crew_id <TAB> pairing_id <TAB> duty_seq <TAB> start_secs <TAB> end_secs
//!     <TAB> dep_tz_min <TAB> arr_tz_min
//! or, with flight-boundary stay inputs:
//!   crew_id <TAB> pairing_id <TAB> duty_seq <TAB> start_secs <TAB> end_secs
//!     <TAB> first_flight_departure_secs <TAB> last_flight_arrival_secs
//!     <TAB> dep_tz_min <TAB> arr_tz_min
//!
//! With `--emit-tsv`, output is TSV, one result per input row:
//!   crew_id <TAB> pairing_id <TAB> duty_seq <TAB> ref_tz_min <TAB> duty_end_ref_tz_min
//!
//! Duties are grouped by crew and sorted by UTC start/end before calling the shared
//! `acc_duty_refs()` implementation. The stay and adjustment values are supplied by
//! the caller because they come from the active 7500 rule parameters.

use std::io::{self, BufRead};

use rois_rule_engine::{acc_duty_refs_for_crew_duties, AccDuty, AccDutyInput};

fn arg_value(args: &[String], flag: &str) -> Option<String> {
    args.iter()
        .position(|arg| arg == flag)
        .and_then(|index| args.get(index + 1).cloned())
}

fn arg_i64(args: &[String], flag: &str, default: i64) -> i64 {
    arg_value(args, flag)
        .and_then(|value| value.parse().ok())
        .unwrap_or(default)
}

fn parse_row(line: &str) -> Result<AccDutyInput, String> {
    let columns: Vec<&str> = line.split('\t').collect();
    if columns.len() != 7 && columns.len() != 9 {
        return Err(format!(
            "expected 7 or 9 tab-separated columns, got {}",
            columns.len()
        ));
    }
    if columns[0].is_empty() {
        return Err("crew_id must not be empty".to_string());
    }

    let parse = |name: &str, value: &str| {
        value
            .parse::<i64>()
            .map_err(|_| format!("{name} must be an integer"))
    };

    Ok(AccDutyInput {
        crew_id: columns[0].to_string(),
        pairing_id: parse("pairing_id", columns[1])?,
        duty_seq: parse("duty_seq", columns[2])?,
        duty: {
            let start_utc = parse("start_secs", columns[3])?;
            let end_utc = parse("end_secs", columns[4])?;
            let first_flight_departure_utc = if columns.len() == 9 {
                parse("first_flight_departure_secs", columns[5])?
            } else {
                start_utc
            };
            let last_flight_arrival_utc = if columns.len() == 9 {
                parse("last_flight_arrival_secs", columns[6])?
            } else {
                end_utc
            };
            let dep_tz_col = if columns.len() == 9 { 7 } else { 5 };
            let arr_tz_col = if columns.len() == 9 { 8 } else { 6 };
            AccDuty {
                start_utc,
                end_utc,
                first_flight_departure_utc,
                last_flight_arrival_utc,
                dep_tz_min: parse("dep_tz_min", columns[dep_tz_col])?,
                arr_tz_min: parse("arr_tz_min", columns[arr_tz_col])?,
            }
        },
    })
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let stay_per_min = arg_i64(&args, "--stay-per-min", 1_440);
    let adjust_min = arg_i64(&args, "--adjust-min", 60);
    let emit_tsv = args.iter().any(|arg| arg == "--emit-tsv");
    if !emit_tsv {
        eprintln!("check-7500-ref: --emit-tsv is required");
        std::process::exit(2);
    }

    let stdin = io::stdin();
    let mut inputs = Vec::new();
    for (line_number, line) in stdin.lock().lines().enumerate() {
        let line = match line {
            Ok(line) if !line.trim().is_empty() => line,
            Ok(_) => continue,
            Err(error) => {
                eprintln!(
                    "check-7500-ref: failed reading line {}: {error}",
                    line_number + 1
                );
                std::process::exit(2);
            }
        };
        match parse_row(&line) {
            Ok(input) => inputs.push(input),
            Err(error) => {
                eprintln!(
                    "check-7500-ref: invalid TSV on line {}: {error}",
                    line_number + 1
                );
                std::process::exit(2);
            }
        }
    }

    let results = acc_duty_refs_for_crew_duties(&inputs, stay_per_min, adjust_min);
    for result in results {
        println!(
            "{}\t{}\t{}\t{}\t{}",
            result.crew_id,
            result.pairing_id,
            result.duty_seq,
            result.ref_tz_min,
            result.duty_end_ref_tz_min
        );
    }
}
