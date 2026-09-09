//! Live/Scenario batch checker for rule 7508 calendar-day SDFD.
//!
//! Structured TSV stdin:
//!   R row_id bases ranks fleets teams period_hours unit duty_report duty_release buffer_min min_limits
//!     [<TAB> count_layover(0/1)]   (optional trailing; default 1 = Y)
//!   D crew pairing_id start_utc end_utc first_flight_departure last_flight_arrival base_offset start_ref end_ref is_rest is_pa
//!   Q crew BASE|RANK|FLEET value eff_ord exp_ord
//!   T crew team
//!
//! `--emit-tsv` output:
//!   row_id crew window_start window_end total_sdfd min_limits period_hours unit trigger_pairing

use std::collections::BTreeMap;
use std::io::{self, Read};

use rois_rule_engine::rules::rule7508::{
    check_rule7508_structured_focused, Rule7508CrewContext, Rule7508Row, WorkPeriod7508,
};
use rois_rule_engine::{Application, BaseQual, LocalNightDef};

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

fn all_arg_i64(args: &[String], flag: &str) -> Vec<i64> {
    args.iter()
        .enumerate()
        .filter_map(|(i, arg)| {
            (arg == flag)
                .then(|| args.get(i + 1))
                .flatten()
                .and_then(|value| value.parse().ok())
        })
        .collect()
}

fn parse_focus_intervals(args: &[String]) -> Vec<(i64, i64)> {
    let starts = all_arg_i64(args, "--focus-start-secs");
    let ends = all_arg_i64(args, "--focus-end-secs");
    if starts.len() != ends.len() {
        eprintln!(
            "error: --focus-start-secs ({}) and --focus-end-secs ({}) must appear in equal pairs",
            starts.len(),
            ends.len()
        );
        std::process::exit(2);
    }
    starts.into_iter().zip(ends).collect()
}

fn split_filter(value: &str) -> Vec<String> {
    value
        .split(['|', ','])
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .map(str::to_string)
        .collect()
}

fn parse_bool(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "1" | "true" | "t" | "y" | "yes"
    )
}

fn parse_ord(value: &str) -> Option<i64> {
    value
        .trim()
        .parse::<i64>()
        .ok()
        .and_then(|ord| (ord >= 0).then_some(ord))
}

type Parsed = (
    Vec<Rule7508Row>,
    BTreeMap<String, (i64, Vec<WorkPeriod7508>)>,
    BTreeMap<String, Rule7508CrewContext>,
    usize,
);

fn parse_structured(input: &str) -> Parsed {
    let mut rows = Vec::new();
    let mut duties: BTreeMap<String, (i64, Vec<WorkPeriod7508>)> = BTreeMap::new();
    let mut contexts: BTreeMap<String, Rule7508CrewContext> = BTreeMap::new();
    let mut skipped = 0usize;

    for raw in input.lines() {
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        let cols: Vec<&str> = line.split('\t').collect();
        match cols.first().copied() {
            Some("R") if cols.len() >= 10 => {
                let has_report_release = cols.len() >= 12;
                let buffer_idx = if has_report_release { 10 } else { 8 };
                let min_idx = if has_report_release { 11 } else { 9 };
                let parsed = (
                    cols[6].parse::<i64>(),
                    cols[buffer_idx].parse::<i64>(),
                    cols[min_idx].parse::<i64>(),
                );
                let (Ok(period_hours), Ok(buffer_min), Ok(min_limits)) = parsed else {
                    skipped += 1;
                    continue;
                };
                rows.push(Rule7508Row {
                    row_id: cols[1].parse::<usize>().unwrap_or(rows.len()),
                    bases: split_filter(cols[2]),
                    ranks: split_filter(cols[3]),
                    fleets: split_filter(cols[4]),
                    teams: split_filter(cols[5]),
                    period_hours,
                    unit: cols[7].trim().to_uppercase(),
                    duty_report: !has_report_release || parse_bool(cols[8]),
                    duty_release: !has_report_release || parse_bool(cols[9]),
                    duty_end_buffer_secs: buffer_min * 60,
                    min_limits,
                    count_layover: cols.len() < 13 || parse_bool(cols[12]),
                });
            }
            // 10 legacy columns:
            //   D crew pairing start end base_off start_ref end_ref is_rest is_pa
            // 12 columns:
            //   D crew pairing start end first_flight_departure last_flight_arrival base_off start_ref end_ref is_rest is_pa
            Some("D") if cols.len() >= 10 => {
                let has_flight_bounds = cols.len() >= 12;
                let base_idx = if has_flight_bounds { 7 } else { 5 };
                let start_ref_idx = if has_flight_bounds { 8 } else { 6 };
                let end_ref_idx = if has_flight_bounds { 9 } else { 7 };
                let rest_idx = if has_flight_bounds { 10 } else { 8 };
                let pa_idx = if has_flight_bounds { 11 } else { 9 };
                let parsed = (
                    cols[3].parse::<i64>(),
                    cols[4].parse::<i64>(),
                    cols[base_idx].parse::<i64>(),
                    cols[start_ref_idx].parse::<i64>(),
                    cols[end_ref_idx].parse::<i64>(),
                );
                let (Ok(start_utc), Ok(end_utc), Ok(base_offset), Ok(start_ref), Ok(end_ref)) =
                    parsed
                else {
                    skipped += 1;
                    continue;
                };
                let pairing_id = cols[2].trim().parse::<i64>().unwrap_or(0);
                let entry = duties
                    .entry(cols[1].to_string())
                    .or_insert((base_offset, Vec::new()));
                entry.0 = base_offset;
                entry.1.push(WorkPeriod7508 {
                    pairing_id: (pairing_id > 0).then_some(pairing_id),
                    start_utc,
                    end_utc,
                    first_flight_departure_utc: if has_flight_bounds {
                        cols[5].parse::<i64>().unwrap_or(start_utc)
                    } else {
                        start_utc
                    },
                    last_flight_arrival_utc: if has_flight_bounds {
                        cols[6].parse::<i64>().unwrap_or(end_utc)
                    } else {
                        end_utc
                    },
                    is_rest: parse_bool(cols[rest_idx]),
                    is_pre_assigned: parse_bool(cols[pa_idx]),
                    start_ref_tz_min: start_ref,
                    end_ref_tz_min: end_ref,
                });
            }
            Some("Q") if cols.len() >= 6 => {
                let crew = cols[1].to_string();
                let qual = BaseQual {
                    base: cols[3].to_string(),
                    eff_ord: parse_ord(cols[4]),
                    exp_ord: parse_ord(cols[5]),
                };
                let context = contexts.entry(crew).or_default();
                match cols[2].trim().to_uppercase().as_str() {
                    "BASE" => context.base_quals.push(qual),
                    "RANK" => context.rank_quals.push(qual),
                    "FLEET" => context.fleet_quals.push(qual),
                    _ => skipped += 1,
                }
            }
            Some("T") if cols.len() >= 3 => {
                contexts
                    .entry(cols[1].to_string())
                    .or_default()
                    .teams
                    .push(cols[2].to_string());
            }
            _ => skipped += 1,
        }
    }
    (rows, duties, contexts, skipped)
}

fn trigger_pairing(work: &[WorkPeriod7508], ws: i64, we: i64) -> Option<i64> {
    let mut best_overlap: Option<&WorkPeriod7508> = None;
    let mut nearest: Option<(&WorkPeriod7508, i64)> = None;
    for wp in work {
        if wp.pairing_id.is_none() {
            continue;
        }
        if wp.end_utc > ws && wp.start_utc < we {
            if best_overlap.map_or(true, |b| wp.end_utc > b.end_utc) {
                best_overlap = Some(wp);
            }
        }
        let gap = if wp.end_utc <= ws {
            ws - wp.end_utc
        } else if wp.start_utc >= we {
            wp.start_utc - we
        } else {
            0
        };
        if nearest.map_or(true, |(_, g)| gap < g) {
            nearest = Some((wp, gap));
        }
    }
    best_overlap
        .or(nearest.map(|(wp, _)| wp))
        .and_then(|wp| wp.pairing_id)
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let lnd = LocalNightDef {
        start_min: arg_i64(&args, "--night-start-min", 22 * 60),
        end_min: arg_i64(&args, "--night-end-min", 8 * 60),
        min_rest_secs: arg_i64(&args, "--min-rest-min", 8 * 60) * 60,
    };
    let checked_start = arg_i64(&args, "--checked-start-secs", 0);
    let checked_end = arg_i64(&args, "--checked-end-secs", 0);
    let emit = args.iter().any(|a| a == "--emit-tsv");
    let focus_intervals = parse_focus_intervals(&args);
    let focus_crew_ids = arg_value(&args, "--focus-crew-ids").map(|value| split_filter(&value));

    if checked_start <= 0 || checked_end <= checked_start {
        eprintln!("check-7508: --checked-start-secs and --checked-end-secs are required");
        std::process::exit(2);
    }

    let mut input = String::new();
    io::stdin().read_to_string(&mut input).expect("read stdin");
    let (rows, mut by_crew, contexts, skipped) = parse_structured(&input);
    let mut violations = Vec::new();
    for entry in by_crew.values_mut() {
        entry.1.sort_by_key(|w| (w.start_utc, w.end_utc));
    }
    for row in &rows {
        for (crew, (base_offset, work)) in &by_crew {
            if let Some(ids) = focus_crew_ids.as_deref() {
                if !ids.iter().any(|id| id == crew) {
                    continue;
                }
            }
            let context = contexts.get(crew).cloned().unwrap_or_default();
            if let Some(v) = check_rule7508_structured_focused(
                crew,
                row,
                &context,
                *base_offset,
                &lnd,
                checked_start,
                checked_end,
                work,
                Application::Editor,
                &focus_intervals,
                focus_crew_ids.as_deref(),
            ) {
                let trigger = trigger_pairing(work, v.window_start_utc, v.window_end_utc);
                violations.push((row.row_id, crew.clone(), v, trigger));
            }
        }
    }
    violations
        .sort_by_key(|(_, _, violation, _)| (violation.total_sdfd, violation.window_start_utc));
    if emit {
        for (row_id, crew, v, trigger) in &violations {
            println!(
                "{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}",
                row_id,
                crew,
                v.window_start_utc,
                v.window_end_utc,
                v.total_sdfd,
                v.min_limits,
                v.period_hours,
                v.unit,
                trigger.map(|p| p.to_string()).unwrap_or_default(),
            );
        }
        eprintln!(
            "emitted {} 7508 violations across {} crew ({} rows, {} skipped)",
            violations.len(),
            by_crew.len(),
            rows.len(),
            skipped,
        );
    } else {
        println!(
            "rows: {} crew: {} skipped: {} violations: {}",
            rows.len(),
            by_crew.len(),
            skipped,
            violations.len(),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::parse_structured;

    #[test]
    fn accepts_ten_column_duty_lines() {
        let input = "\
R\t0\t*\t*\t*\t*\t168\tRH\t0\t1
D\tC1\t100\t1000\t2000\t-360\t-360\t-360\t0\t1
D\tC1\t0\t3000\t4000\t-360\t-360\t-360\t1\t1
";
        let (rows, duties, _, skipped) = parse_structured(input);
        assert_eq!(rows.len(), 1);
        assert_eq!(skipped, 0);
        let work = &duties.get("C1").expect("crew").1;
        assert_eq!(work.len(), 2);
        assert_eq!(work[0].pairing_id, Some(100));
        assert!(!work[0].is_rest);
        assert!(work[1].is_rest);
    }

    #[test]
    fn skips_nine_column_duty_lines() {
        let input = "\
R\t0\t*\t*\t*\t*\t168\tRH\t0\t1
D\tC1\t100\t1000\t2000\t-360\t-360\t-360\t0
";
        let (_, duties, _, skipped) = parse_structured(input);
        assert_eq!(skipped, 1);
        assert!(duties.is_empty());
    }
}
