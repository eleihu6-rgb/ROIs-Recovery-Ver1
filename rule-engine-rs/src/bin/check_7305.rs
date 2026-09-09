//! Live/Scenario batch checker for rule 7305.
//!
//! Input:
//!   C <TAB> checked_start_utc <TAB> checked_end_utc <TAB> application
//!   R <TAB> row_index <TAB> 12 positional rule cells
//!   Q <TAB> crew <TAB> B|R|F|P <TAB> value <TAB> eff_ord <TAB> exp_ord
//!   T <TAB> crew <TAB> team
//!   G <TAB> assignment <TAB> assignment_group
//!   D <TAB> crew <TAB> activity_id <TAB> pairing_id <TAB> start <TAB> duty_end
//!     <TAB> rest_end <TAB> local_offset <TAB> assignment <TAB> group
//!     <TAB> attributes <TAB> label <TAB> pre_assigned <TAB> phase_checked <TAB> is_ground
//!
//! Output with --emit-tsv:
//!   V <TAB> crew <TAB> row_index <TAB> pairing_id <TAB> start <TAB> end
//!     <TAB> actual <TAB> limit <TAB> severity <TAB> message

use std::collections::BTreeMap;
use std::io::{self, Read};

use rois_rule_engine::rules::rule7305::{
    check_rule7305_row, Rule7305, Rule7305CrewContext, Rule7305Duty,
};
use rois_rule_engine::Application;

fn parse_bool(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "1" | "true" | "t" | "yes" | "y"
    )
}

fn parse_i64(value: &str, tag: &str, field: &str) -> Result<i64, String> {
    value
        .trim()
        .parse::<i64>()
        .map_err(|_| format!("{tag} {field} must be an integer, got {value:?}"))
}

fn parse_application(value: &str) -> Result<Application, String> {
    match value.trim().to_ascii_lowercase().as_str() {
        "editor" | "live" => Ok(Application::Editor),
        "optimizer" | "ro" => Ok(Application::Optimizer),
        other => Err(format!(
            "C application must be editor or optimizer, got {other:?}"
        )),
    }
}

fn clean(value: &str) -> String {
    value.replace(['\t', '\n', '\r'], " ")
}

fn main() {
    if let Err(error) = run() {
        eprintln!("check-7305: {error}");
        std::process::exit(2);
    }
}

fn run() -> Result<(), String> {
    let args: Vec<String> = std::env::args().collect();
    let emit_tsv = args.iter().any(|arg| arg == "--emit-tsv");
    let per_crew_window = args.iter().any(|arg| arg == "--per-crew-window");
    let default_application = if args.iter().any(|arg| arg == "--optimizer") {
        Application::Optimizer
    } else {
        Application::Editor
    };

    let mut input = String::new();
    io::stdin()
        .read_to_string(&mut input)
        .map_err(|error| format!("cannot read stdin: {error}"))?;

    let mut checked_window = None;
    let mut application = default_application;
    let mut rules: BTreeMap<usize, Rule7305> = BTreeMap::new();
    let mut crews: BTreeMap<String, Rule7305CrewContext> = BTreeMap::new();
    let mut duties: BTreeMap<String, Vec<Rule7305Duty>> = BTreeMap::new();
    let mut assignment_groups = Vec::new();

    for (line_no, raw) in input.lines().enumerate() {
        let line = raw.strip_suffix('\r').unwrap_or(raw);
        if line.trim().is_empty() {
            continue;
        }
        let cols: Vec<&str> = line.split('\t').collect();
        match cols.first().copied() {
            Some("C") if cols.len() >= 3 => {
                let start = parse_i64(cols[1], "C", "checked_start_utc")?;
                let end = parse_i64(cols[2], "C", "checked_end_utc")?;
                if end < start {
                    return Err("C checked_end_utc must be >= checked_start_utc".to_string());
                }
                checked_window = Some((start, end));
                if let Some(value) = cols.get(3) {
                    application = parse_application(value)?;
                }
            }
            Some("R") if cols.len() == 14 => {
                let index = parse_i64(cols[1], "R", "row_index")?;
                if index < 0 {
                    return Err(format!("R row_index must be non-negative, got {index}"));
                }
                let rule = Rule7305::from_cells(&cols[2..14])
                    .map_err(|error| format!("line {}: {error}", line_no + 1))?;
                rules.insert(index as usize, rule);
            }
            Some("Q") if cols.len() >= 6 => {
                let crew = cols[1].to_string();
                let dimension = cols[2].trim().to_ascii_uppercase();
                let value = cols[3].trim().to_string();
                let eff = parse_i64(cols[4], "Q", "eff_ord")?;
                let exp = parse_i64(cols[5], "Q", "exp_ord")?;
                if crew.is_empty() || value.is_empty() {
                    return Err(format!(
                        "line {}: Q crew and value are required",
                        line_no + 1
                    ));
                }
                let context = crews.entry(crew).or_default();
                match dimension.as_str() {
                    "B" | "BASE" => context.base_quals.push((value, eff, exp)),
                    "R" | "RANK" => context.rank_quals.push((value, eff, exp)),
                    "F" | "FLEET" => context.fleet_quals.push((value, eff, exp)),
                    "P" | "POSITION" => context.position_quals.push((value, eff, exp)),
                    other => return Err(format!("Q dimension must be B/R/F/P, got {other:?}")),
                }
            }
            Some("T") if cols.len() >= 3 => {
                crews
                    .entry(cols[1].to_string())
                    .or_default()
                    .teams
                    .push(cols[2].trim().to_string());
            }
            Some("G") if cols.len() >= 3 => {
                assignment_groups.push((cols[1].trim().to_string(), cols[2].trim().to_string()));
            }
            Some("D") if cols.len() >= 15 => {
                let crew = cols[1].to_string();
                let activity_id = parse_i64(cols[2], "D", "activity_id")?;
                let pairing_raw = parse_i64(cols[3], "D", "pairing_id")?;
                let duty = Rule7305Duty {
                    activity_id,
                    pairing_id: (pairing_raw > 0).then_some(pairing_raw),
                    start_utc: parse_i64(cols[4], "D", "start_utc")?,
                    duty_end_utc: parse_i64(cols[5], "D", "duty_end_utc")?,
                    rest_end_utc: parse_i64(cols[6], "D", "rest_end_utc")?,
                    local_offset_min: parse_i64(cols[7], "D", "local_offset_min")?,
                    assignment: cols[8].trim().to_string(),
                    assignment_group: cols[9].trim().to_string(),
                    attributes: cols[10]
                        .split('|')
                        .filter(|value| !value.trim().is_empty())
                        .map(|value| value.trim().to_string())
                        .collect(),
                    label: cols[11].trim().to_string(),
                    pre_assigned: parse_bool(cols[12]),
                    phase_checked: parse_bool(cols[13]),
                    is_ground: parse_bool(cols[14]),
                };
                duties.entry(crew).or_default().push(duty);
            }
            Some(tag) => {
                return Err(format!(
                    "line {}: unknown or malformed tag {tag:?}",
                    line_no + 1
                ))
            }
            None => return Err(format!("line {} is empty", line_no + 1)),
        }
    }

    let (checked_start, checked_end) = if per_crew_window {
        checked_window.unwrap_or((0, 0))
    } else {
        checked_window.ok_or_else(|| "missing C checked window row".to_string())?
    };
    for context in crews.values_mut() {
        context.assignment_group_map = assignment_groups.clone();
    }
    let fallback_context = Rule7305CrewContext {
        assignment_group_map: assignment_groups,
        ..Rule7305CrewContext::default()
    };
    let mut output = Vec::new();
    for (crew_id, crew_duties) in &duties {
        let context = crews.get(crew_id).unwrap_or(&fallback_context);
        let (window_start, window_end) = if per_crew_window {
            (
                crew_duties
                    .iter()
                    .map(|duty| duty.start_utc)
                    .min()
                    .unwrap_or(0),
                crew_duties
                    .iter()
                    .map(|duty| duty.duty_end_utc)
                    .max()
                    .unwrap_or(0),
            )
        } else {
            (checked_start, checked_end)
        };
        for (row_index, rule) in &rules {
            for violation in check_rule7305_row(
                crew_id,
                rule,
                crew_duties,
                context,
                window_start,
                window_end,
                application,
            ) {
                output.push((*row_index, violation));
            }
        }
    }
    output.sort_by_key(|(row_index, violation)| {
        (
            violation.crew_id.clone(),
            *row_index,
            violation.start_utc,
            violation.activity_id,
        )
    });

    if emit_tsv {
        for (row_index, violation) in output {
            println!(
                "V\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}",
                clean(&violation.crew_id),
                row_index,
                violation.pairing_id.unwrap_or(0),
                violation.start_utc,
                violation.end_utc,
                violation.actual,
                violation.limit,
                violation.severity,
                clean(&violation.message),
            );
        }
    } else {
        println!(
            "Rule 7305: {} crew, {} rule rows, {} violation rows",
            duties.len(),
            rules.len(),
            output.len()
        );
    }
    Ok(())
}
