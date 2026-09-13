//! Live check for rule 8071 roster-property count rows.
//!
//! Reads tagged TSV on stdin:
//!   C <TAB> checked_start_utc <TAB> checked_end_utc
//!   R <TAB> rule_idx <TAB> 17 legacy, 18 current, or 19 new rule cells...
//!   A <TAB> crew <TAB> pairing <TAB> duty_seq <TAB> segment_id <TAB> start_utc <TAB> end_utc
//!     <TAB> bases <TAB> ranks <TAB> fleets <TAB> teams <TAB> labels <TAB> attrs
//!     <TAB> override_attrs <TAB> assignment_group <TAB> assignment <TAB> qualifier <TAB> flight
//!     <TAB> destination <TAB> position (legacy)
//!     or <TAB> destination <TAB> destination_country <TAB> position
//!   P <TAB> rp_start_utc <TAB> rp_end_utc
//!   G <TAB> assignment <TAB> assignment_group (Assignment Group Map row; an "Assignment
//!     Groups" filter also matches an activity whose `assignment` code is mapped to that
//!     group, not just via its literal assignment_group column)
//!
//! --emit-tsv prints:
//!   V <TAB> crew <TAB> rule_idx <TAB> anchor_pairing_id <TAB> window_start
//!     <TAB> window_end <TAB> actual <TAB> max <TAB> min <TAB> mode <TAB> over

use std::collections::BTreeMap;
use std::io::{self, Read};

use rois_rule_engine::{
    rules::rule8071::{
        check_roster_properties_row_with_group_map, derive_pairing_countries,
        RosterPropertyActivity, Rule8071,
    },
    Application,
};

fn split_list(raw: &str) -> Vec<String> {
    let raw = raw.trim();
    if raw.is_empty() || raw == "*" {
        return vec!["*".to_string()];
    }
    let values: Vec<String> = raw
        .split('|')
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect();
    if values.is_empty() {
        vec!["*".to_string()]
    } else {
        values
    }
}

fn split_activity_teams(raw: &str) -> Vec<String> {
    if raw.trim().is_empty() {
        Vec::new()
    } else {
        split_list(raw)
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let emit_tsv = args.iter().any(|arg| arg == "--emit-tsv");
    let app = if args.iter().any(|arg| arg == "--optimizer") {
        Application::Optimizer
    } else {
        Application::Editor
    };

    let mut input = String::new();
    io::stdin().read_to_string(&mut input).expect("read stdin");

    let mut checked: Option<(i64, i64)> = None;
    let mut rules: BTreeMap<i64, Rule8071> = BTreeMap::new();
    let mut activities_by_crew: BTreeMap<String, Vec<RosterPropertyActivity>> = BTreeMap::new();
    let mut activity_count = 0usize;
    let mut roster_periods: Vec<(i64, i64)> = Vec::new();
    let mut group_map: Vec<(String, String)> = Vec::new();
    let mut skipped = 0usize;

    for line in input.lines() {
        let line = line.strip_suffix('\r').unwrap_or(line);
        if line.is_empty() {
            continue;
        }
        let cols: Vec<&str> = line.split('\t').collect();
        match cols.first().copied() {
            Some("C") if cols.len() >= 3 => {
                let (Ok(start), Ok(end)) = (cols[1].parse::<i64>(), cols[2].parse::<i64>()) else {
                    skipped += 1;
                    continue;
                };
                checked = Some((start, end));
            }
            Some("R") if cols.len() >= 19 => {
                let Ok(idx) = cols[1].parse::<i64>() else {
                    skipped += 1;
                    continue;
                };
                match Rule8071::from_cells(&cols[2..]) {
                    Ok(rule) => {
                        if let Some(warning) = &rule.country_warning {
                            eprintln!("8071 row {idx}: {warning}");
                        }
                        rules.insert(idx, rule);
                    }
                    Err(err) => {
                        eprintln!("skip R row {idx}: {err}");
                        skipped += 1;
                    }
                }
            }
            Some("A") if cols.len() >= 19 => {
                let (Ok(pairing_id), Ok(duty_seq), Ok(segment_id), Ok(start_utc), Ok(end_utc)) = (
                    cols[2].parse::<i64>(),
                    cols[3].parse::<i64>(),
                    cols[4].parse::<i64>(),
                    cols[5].parse::<i64>(),
                    cols[6].parse::<i64>(),
                ) else {
                    skipped += 1;
                    continue;
                };
                let crew_id = cols[1].to_string();
                let has_assignment = cols.len() >= 21;
                let qualifier_idx = if has_assignment { 16 } else { 15 };
                let flight_idx = if has_assignment { 17 } else { 16 };
                let destination_idx = if has_assignment { 18 } else { 17 };
                let (destination_country, position) = if has_assignment {
                    (cols[19].trim().to_string(), cols[20].trim().to_string())
                } else if cols.len() >= 20 {
                    (cols[18].trim().to_string(), cols[19].trim().to_string())
                } else {
                    (String::new(), cols[18].trim().to_string())
                };
                let activity = RosterPropertyActivity {
                    crew_id: crew_id.clone(),
                    pairing_id,
                    duty_seq,
                    segment_id,
                    start_utc,
                    end_utc,
                    bases: split_list(cols[7]),
                    ranks: split_list(cols[8]),
                    fleets: split_list(cols[9]),
                    teams: split_activity_teams(cols[10]),
                    labels: split_list(cols[11]),
                    attributes: split_list(cols[12]),
                    override_duty_attributes: split_list(cols[13]),
                    assignment_group: cols[14].trim().to_string(),
                    assignment: if has_assignment {
                        cols[15].trim().to_string()
                    } else {
                        "*".to_string()
                    },
                    qualifier: cols[qualifier_idx].trim().to_string(),
                    flight_number: cols[flight_idx].trim().to_string(),
                    destination: cols[destination_idx].trim().to_string(),
                    destination_country,
                    position,
                };
                activities_by_crew
                    .entry(crew_id)
                    .or_default()
                    .push(activity);
                activity_count += 1;
            }
            Some("P") if cols.len() >= 3 => {
                let (Ok(start), Ok(end)) = (cols[1].parse::<i64>(), cols[2].parse::<i64>()) else {
                    skipped += 1;
                    continue;
                };
                roster_periods.push((start, end));
            }
            Some("G") if cols.len() >= 3 => {
                group_map.push((cols[1].trim().to_string(), cols[2].trim().to_string()));
            }
            _ => skipped += 1,
        }
    }

    let Some((checked_start, checked_end)) = checked else {
        eprintln!("missing C config line; nothing checked");
        return;
    };

    let t0 = std::time::Instant::now();
    let mut violations = Vec::new();
    for (crew, crew_activities) in &activities_by_crew {
        let pairing_countries = derive_pairing_countries(crew_activities);
        for (idx, rule) in &rules {
            for violation in check_roster_properties_row_with_group_map(
                crew,
                rule,
                crew_activities,
                checked_start,
                checked_end,
                &roster_periods,
                app,
                Some(&pairing_countries),
                &group_map,
            ) {
                violations.push((crew.clone(), *idx, violation));
            }
        }
    }
    let elapsed = t0.elapsed();
    violations
        .sort_by(|a, b| (&a.0, a.1, a.2.window_start_utc).cmp(&(&b.0, b.1, b.2.window_start_utc)));

    if emit_tsv {
        for (crew, idx, violation) in &violations {
            println!(
                "V\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}",
                crew,
                idx,
                violation.anchor_pairing_id,
                violation.window_start_utc,
                violation.window_end_utc,
                violation.actual_count,
                violation.max_times,
                violation.min_times,
                violation.mode.as_str(),
                violation.over,
            );
        }
        eprintln!(
            "emitted {} violations across {} crew ({} activity rows, {} rule rows, {} skipped, {:.3} ms)",
            violations.len(),
            activities_by_crew.len(),
            activity_count,
            rules.len(),
            skipped,
            elapsed.as_secs_f64() * 1000.0,
        );
        return;
    }

    println!("Rule 8071 roster-property check");
    println!("crew          : {}", activities_by_crew.len());
    println!("activity rows : {}", activity_count);
    println!("rule rows     : {}", rules.len());
    println!("violations    : {}", violations.len());
    if skipped > 0 {
        println!("skipped rows   : {}", skipped);
    }
    println!("elapsed ms    : {:.3}", elapsed.as_secs_f64() * 1000.0);
}
