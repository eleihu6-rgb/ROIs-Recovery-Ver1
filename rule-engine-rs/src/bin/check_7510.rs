//! Live/Scenario batch checker for Rule 7510 Green-on-Green.
//!
//! Input TSV:
//!   C <tab> checked_start_utc <tab> checked_end_utc
//!   R <tab> row_index <tab> Bases <tab> Ranks <tab> Fleets <tab> Crew Teams
//!     <tab> Attributes <tab> Assignments <tab> Assignment Groups
//!     <tab> Initial Sectors <tab> Min Limits <tab> Max Limits
//!   F <tab> crew_id <tab> flight_id <tab> pairing_id <tab> duty_seq <tab> seg_seq
//!     <tab> start_utc <tab> end_utc <tab> bases <tab> ranks <tab> fleets
//!     <tab> teams <tab> attributes <tab> assignment <tab> assignment_group
//!   G <tab> assignment <tab> assignment_group (Assignment Group Map row; an "Assignment
//!     Groups" filter also matches a flight row whose `assignment` code is mapped to that
//!     group, not just via its literal assignment_group column)
//!
//! Output with `--emit-tsv`:
//!   V <tab> row_index <tab> crew_id <tab> pairing_id <tab> duty_seq <tab>
//!     flight_id <tab> start_utc <tab> end_utc <tab> actual <tab> limit <tab> over

use std::io::{self, Read};

use rois_rule_engine::{
    check_green_on_green_with_group_map, split_7510_list, Rule7510CrewFlight, Rule7510Param,
};

fn usage() -> ! {
    eprintln!("usage: check-7510 --emit-tsv");
    std::process::exit(2);
}

fn parse_i64(raw: &str, field: &str, line_no: usize) -> Option<i64> {
    match raw.trim().parse::<i64>() {
        Ok(value) => Some(value),
        Err(_) => {
            eprintln!("check-7510: line {line_no}: invalid {field} {raw:?}; skipped");
            None
        }
    }
}

fn main() {
    let emit_tsv = std::env::args().skip(1).any(|arg| arg == "--emit-tsv");
    if !emit_tsv {
        usage();
    }

    let mut input = String::new();
    io::stdin()
        .read_to_string(&mut input)
        .expect("read check-7510 stdin");

    let mut checked_start_utc = 0i64;
    let mut checked_end_utc = 0i64;
    let mut params = Vec::new();
    let mut flights = Vec::new();
    let mut group_map: Vec<(String, String)> = Vec::new();

    for (line_offset, raw_line) in input.lines().enumerate() {
        let line_no = line_offset + 1;
        let line = raw_line.strip_suffix('\r').unwrap_or(raw_line);
        if line.trim().is_empty() {
            continue;
        }
        let cols: Vec<&str> = line.split('\t').collect();
        match cols.first().copied() {
            Some("C") if cols.len() == 3 => {
                let (Some(start), Some(end)) = (
                    parse_i64(cols[1], "checked_start_utc", line_no),
                    parse_i64(cols[2], "checked_end_utc", line_no),
                ) else {
                    continue;
                };
                checked_start_utc = start;
                checked_end_utc = end;
            }
            Some("R") if cols.len() == 12 => {
                let Some(row_index) = parse_i64(cols[1], "row_index", line_no) else {
                    continue;
                };
                if row_index < 0 {
                    eprintln!("check-7510: line {line_no}: negative row_index; skipped");
                    continue;
                }
                match Rule7510Param::from_cells(&cols[2..12]) {
                    Ok(param) => params.push(param.with_row_index(row_index as usize)),
                    Err(err) => eprintln!("check-7510: line {line_no}: {err}; skipped"),
                }
            }
            Some("F") if cols.len() == 15 => {
                let (
                    Some(flight_id),
                    Some(pairing_id),
                    Some(duty_seq),
                    Some(seg_seq),
                    Some(start_utc),
                    Some(end_utc),
                ) = (
                    parse_i64(cols[2], "flight_id", line_no),
                    parse_i64(cols[3], "pairing_id", line_no),
                    parse_i64(cols[4], "duty_seq", line_no),
                    parse_i64(cols[5], "seg_seq", line_no),
                    parse_i64(cols[6], "start_utc", line_no),
                    parse_i64(cols[7], "end_utc", line_no),
                )
                else {
                    continue;
                };
                flights.push(Rule7510CrewFlight {
                    crew_id: cols[1].trim().to_string(),
                    flight_id,
                    pairing_id,
                    duty_seq,
                    seg_seq,
                    start_utc,
                    end_utc,
                    bases: split_7510_list(cols[8]),
                    ranks: split_7510_list(cols[9]),
                    fleets: split_7510_list(cols[10]),
                    teams: split_7510_list(cols[11]),
                    attributes: split_7510_list(cols[12]),
                    assignment: cols[13].trim().to_string(),
                    assignment_group: cols[14].trim().to_string(),
                });
            }
            Some("G") if cols.len() >= 3 => {
                group_map.push((cols[1].trim().to_string(), cols[2].trim().to_string()));
            }
            Some("C") | Some("R") | Some("F") | Some("G") => {
                eprintln!("check-7510: line {line_no}: malformed row; skipped")
            }
            _ => eprintln!("check-7510: line {line_no}: unknown row type; skipped"),
        }
    }

    for violation in check_green_on_green_with_group_map(
        &params,
        &flights,
        checked_start_utc,
        checked_end_utc,
        &group_map,
    ) {
        println!(
            "V\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}",
            violation.row_index,
            violation.crew_id,
            violation.pairing_id,
            violation.duty_seq,
            violation.flight_id,
            violation.start_utc,
            violation.end_utc,
            violation.actual_count,
            violation.limit_value,
            if violation.over_max { 1 } else { 0 },
        );
    }
}
