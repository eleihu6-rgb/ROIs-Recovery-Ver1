//! Live/Scenario batch checker for Rule 7509 Avoid Co-pairing.
//!
//! Input TSV:
//!   R <tab> row_index <tab> crew_a <tab> crew_b <tab> eff_date <tab> exp_date
//!   M <tab> flight_id <tab> crew_id <tab> pairing_id <tab> start_utc <tab> end_utc <tab> source_is_pa
//!
//! Output with `--emit-tsv`:
//!   V <tab> row_index <tab> crew_id <tab> paired_crew_id <tab> pairing_id <tab> flight_id

use std::io::{self, Read};

use rois_rule_engine::{check_avoid_co_pairing, Application, Rule7509Member, Rule7509Param};

fn usage() -> ! {
    eprintln!("usage: check-7509 [--application editor|optimizer] [--emit-tsv]");
    std::process::exit(2);
}

fn parse_i64(raw: &str, field: &str, line_no: usize) -> Option<i64> {
    match raw.parse::<i64>() {
        Ok(value) => Some(value),
        Err(_) => {
            eprintln!("check-7509: line {line_no}: invalid {field} {raw:?}; skipped");
            None
        }
    }
}

fn parse_pa(raw: &str, line_no: usize) -> Option<bool> {
    match raw.trim().to_ascii_uppercase().as_str() {
        "Y" | "YES" | "TRUE" | "1" => Some(true),
        "N" | "NO" | "FALSE" | "0" => Some(false),
        _ => {
            eprintln!("check-7509: line {line_no}: invalid source_is_pa {raw:?}; skipped");
            None
        }
    }
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut application = Application::Editor;
    let mut emit_tsv = false;
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--emit-tsv" => emit_tsv = true,
            "--application" => {
                i += 1;
                application = match args.get(i).map(String::as_str) {
                    Some("editor") => Application::Editor,
                    Some("optimizer") => Application::Optimizer,
                    _ => usage(),
                };
            }
            "--help" | "-h" => usage(),
            _ => usage(),
        }
        i += 1;
    }

    let mut input = String::new();
    io::stdin()
        .read_to_string(&mut input)
        .expect("read check-7509 stdin");
    let mut params = Vec::new();
    let mut members = Vec::new();

    for (line_offset, raw_line) in input.lines().enumerate() {
        let line_no = line_offset + 1;
        let cols: Vec<&str> = raw_line.split('\t').collect();
        if cols.is_empty() || cols[0].trim().is_empty() {
            continue;
        }
        match cols[0] {
            "R" if cols.len() == 6 => {
                let Some(row_index) = parse_i64(cols[1], "row_index", line_no) else {
                    continue;
                };
                if row_index < 0 {
                    eprintln!("check-7509: line {line_no}: negative row_index; skipped");
                    continue;
                }
                match Rule7509Param::from_cells(&cols[2..6]) {
                    Some(param) => params.push(param.with_row_index(row_index as usize)),
                    None => {
                        eprintln!("check-7509: line {line_no}: invalid 7509 parameter row; skipped")
                    }
                }
            }
            "M" if cols.len() == 7 => {
                let (Some(flight_id), Some(pairing_id), Some(start), Some(end), Some(source_is_pa)) = (
                    parse_i64(cols[1], "flight_id", line_no),
                    parse_i64(cols[3], "pairing_id", line_no),
                    parse_i64(cols[4], "pairing_start_utc", line_no),
                    parse_i64(cols[5], "pairing_end_utc", line_no),
                    parse_pa(cols[6], line_no),
                ) else {
                    continue;
                };
                members.push(Rule7509Member {
                    flight_id,
                    crew_id: cols[2].trim().to_string(),
                    pairing_id,
                    pairing_start_utc: start,
                    pairing_end_utc: end,
                    source_is_pa,
                });
            }
            "R" | "M" => eprintln!("check-7509: line {line_no}: malformed row; skipped"),
            _ => eprintln!("check-7509: line {line_no}: unknown row type; skipped"),
        }
    }

    let violations = check_avoid_co_pairing(&params, &members, application);
    if emit_tsv {
        for violation in violations {
            println!(
                "V\t{}\t{}\t{}\t{}\t{}",
                violation.param_index,
                violation.crew_id,
                violation.paired_crew_id,
                violation.pairing_id,
                violation.flight_id,
            );
        }
    } else {
        println!("Rule 7509 violations: {}", violations.len());
    }
}
