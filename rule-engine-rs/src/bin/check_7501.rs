//! Live check for rule 7501 (SINGLE DAY FREE FROM DUTY).
//!
//! Reads work periods on stdin as TSV — one row per duty (FLY pairing or ground task):
//!     crew_id <TAB> pairing_id|'' <TAB> start_utc_secs <TAB> end_utc_secs <TAB> offset_min
//! Groups by crew, scans each crew's rolling PERIOD-hour windows and reports the worst
//! (lowest SDFD count) window that falls below MIN LIMITS — editor-mode semantics, matching
//! the C++ `LimitSingleDayFreeFromDutyForCARSRule`. The local-night band comes from rule
//! 2014 (passed via --night-* flags), so config drives the engine.
//!
//! Per crew: checked_start = first duty start rounded down to the hour; checked_end =
//! --checked-end-secs (the scenario / roster-period end) so trailing idle rest is scanned.
//!
//! Usage:
//!     check-7501 --checked-end-secs N [--min-limits 3] [--period-hours 168] [--unit RH]
//!                [--buffer-min 30] [--night-start-min 1320] [--night-end-min 480]
//!                [--min-rest-min 480] [--top 15] [--emit-tsv]
//!                [--focus-start-secs S1 [--focus-end-secs E1] ...]
//!                [--focus-crew-ids C1,C2]
//!
//! --emit-tsv prints one violation per line for piping into rule_violation:
//!     crew <TAB> window_start_secs <TAB> window_end_secs <TAB> total_sdfd <TAB> min_limits
//!          <TAB> period_hours <TAB> unit <TAB> trigger_pairing_id|''
//!
//! Dependency-free: the DB read happens upstream (node → TSV), the rule lives in Rust.

use std::collections::BTreeMap;
use std::io::{self, Read};

use rois_rule_engine::rules::rule7501::{
    check_rule7501_structured, check_sdfd_rolling_app, LocalNightDef, Rule7501CrewContext,
    Rule7501Row, WorkPeriod7501,
};
use rois_rule_engine::{Application, BaseQual};

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
    let mut values = Vec::new();
    for (i, arg) in args.iter().enumerate() {
        if arg == flag {
            if let Some(v) = args.get(i + 1).and_then(|s| s.parse().ok()) {
                values.push(v);
            }
        }
    }
    values
}

fn parse_focus_intervals(args: &[String]) -> Vec<(i64, i64)> {
    let focus_starts = all_arg_i64(args, "--focus-start-secs");
    let focus_ends = all_arg_i64(args, "--focus-end-secs");
    if focus_starts.len() != focus_ends.len() {
        eprintln!(
            "error: --focus-start-secs ({}) and --focus-end-secs ({}) must appear in equal pairs",
            focus_starts.len(),
            focus_ends.len()
        );
        std::process::exit(2);
    }
    focus_starts.into_iter().zip(focus_ends).collect()
}

fn rd_hour(secs: i64) -> i64 {
    secs - secs.rem_euclid(3600)
}

fn split_filter(value: &str) -> Vec<String> {
    value
        .split(['|', ','])
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .map(str::to_string)
        .collect()
}

fn parse_ord(value: &str) -> Option<i64> {
    value
        .trim()
        .parse::<i64>()
        .ok()
        .and_then(|ord| (ord >= 0).then_some(ord))
}

fn is_structured_input(input: &str) -> bool {
    input
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .any(|line| matches!(line.split('\t').next(), Some("R" | "D" | "Q" | "T")))
}

type StructuredInput = (
    Vec<Rule7501Row>,
    BTreeMap<String, (i64, Vec<WorkPeriod7501>)>,
    BTreeMap<String, Rule7501CrewContext>,
    usize,
);

fn parse_structured(input: &str) -> StructuredInput {
    let mut rows = Vec::new();
    let mut duties: BTreeMap<String, (i64, Vec<WorkPeriod7501>)> = BTreeMap::new();
    let mut contexts: BTreeMap<String, Rule7501CrewContext> = BTreeMap::new();
    let mut skipped = 0usize;

    for raw in input.lines() {
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        let cols: Vec<&str> = line.split('\t').collect();
        match cols.first().copied() {
            Some("R") if cols.len() >= 10 => {
                let parsed = (
                    cols[6].parse::<i64>(),
                    cols[8].parse::<i64>(),
                    cols[9].parse::<i64>(),
                );
                let (Ok(period_hours), Ok(buffer_min), Ok(min_limits)) = parsed else {
                    skipped += 1;
                    continue;
                };
                rows.push(Rule7501Row {
                    row_id: cols[1].parse::<usize>().unwrap_or(rows.len()),
                    bases: split_filter(cols[2]),
                    ranks: split_filter(cols[3]),
                    fleets: split_filter(cols[4]),
                    teams: split_filter(cols[5]),
                    period_hours,
                    unit: cols[7].trim().to_uppercase(),
                    duty_end_buffer_secs: buffer_min * 60,
                    min_limits,
                });
            }
            Some("D") if cols.len() >= 6 => {
                let parsed = (
                    cols[3].parse::<i64>(),
                    cols[4].parse::<i64>(),
                    cols[5].parse::<i64>(),
                );
                let (Ok(start_utc), Ok(end_utc), Ok(offset_min)) = parsed else {
                    skipped += 1;
                    continue;
                };
                let pairing_id = cols[2].trim().parse::<i64>().unwrap_or(0);
                let entry = duties
                    .entry(cols[1].to_string())
                    .or_insert((offset_min, Vec::new()));
                entry.0 = offset_min;
                entry.1.push(WorkPeriod7501 {
                    pairing_id: (pairing_id > 0).then_some(pairing_id),
                    start_utc,
                    end_utc,
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

/// Pick the pairing that "triggers" this window: a pairing-bearing duty overlapping the
/// window (latest-ending), else the pairing whose span is NEAREST the window (by time gap).
/// Cumulative/roster-level rules must attach to a real pairing or the gantt drops the row, so
/// any crew with at least one FLY pairing gets one.
fn trigger_pairing(work: &[WorkPeriod7501], ws: i64, we: i64) -> Option<i64> {
    let mut best_overlap: Option<&WorkPeriod7501> = None;
    let mut nearest: Option<(&WorkPeriod7501, i64)> = None;
    for wp in work {
        if wp.pairing_id.is_none() {
            continue;
        }
        if wp.end_utc > ws && wp.start_utc < we {
            if best_overlap.map_or(true, |b| wp.end_utc > b.end_utc) {
                best_overlap = Some(wp);
            }
        }
        // Distance from the pairing span to the window (0 if it overlaps).
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
    let period_hours = arg_i64(&args, "--period-hours", 168);
    let min_limits = arg_i64(&args, "--min-limits", 3);
    let unit = arg_value(&args, "--unit").unwrap_or_else(|| "RH".to_string());
    let buffer_secs = arg_i64(&args, "--buffer-min", 30) * 60;
    let lnd = LocalNightDef {
        start_min: arg_i64(&args, "--night-start-min", 22 * 60),
        end_min: arg_i64(&args, "--night-end-min", 8 * 60),
        min_rest_secs: arg_i64(&args, "--min-rest-min", 8 * 60) * 60,
    };
    let checked_end = arg_i64(&args, "--checked-end-secs", 0);
    let top = arg_i64(&args, "--top", 15) as usize;
    let emit = args.iter().any(|a| a == "--emit-tsv");
    let focus = parse_focus_intervals(&args);
    let focus_crew_ids = arg_value(&args, "--focus-crew-ids").map(|value| split_filter(&value));

    let mut input = String::new();
    io::stdin().read_to_string(&mut input).expect("read stdin");

    if is_structured_input(&input) {
        let (rows, mut by_crew, contexts, skipped) = parse_structured(&input);
        let total_crew = by_crew.len();
        let t0 = std::time::Instant::now();
        let mut violations = Vec::new();
        for work_entry in by_crew.values_mut() {
            work_entry.1.sort_by_key(|w| (w.start_utc, w.end_utc));
        }
        for row in &rows {
            for (crew, (offset_min, work)) in &by_crew {
                let context = contexts.get(crew).cloned().unwrap_or_default();
                let checked_start = work
                    .iter()
                    .map(|duty| duty.start_utc)
                    .min()
                    .map(rd_hour)
                    .unwrap_or(0);
                if let Some(v) = check_rule7501_structured(
                    crew,
                    row,
                    &context,
                    *offset_min,
                    &lnd,
                    checked_start,
                    checked_end,
                    work,
                    Application::Editor,
                    &[],
                    None,
                    &focus,
                    focus_crew_ids.as_deref(),
                ) {
                    let trigger = trigger_pairing(work, v.window_start_utc, v.window_end_utc);
                    violations.push((row.row_id, crew.clone(), v, trigger));
                }
            }
        }
        violations.sort_by_key(|(_, _, violation, _)| violation.total_sdfd);
        let eval_ms = t0.elapsed().as_secs_f64() * 1000.0;
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
                "emitted {} rule-row violations across {} crew ({} structured rows, {} skipped; {:.3} ms)",
                violations.len(),
                total_crew,
                rows.len(),
                skipped,
                eval_ms,
            );
            return;
        }
        let violating_crew = violations
            .iter()
            .map(|(_, crew, _, _)| crew)
            .collect::<std::collections::BTreeSet<_>>()
            .len();
        println!(
            "structured rows: {}  crew evaluated: {}  skipped: {}",
            rows.len(),
            total_crew,
            skipped
        );
        println!(
            " crew VIOLATING: {}  violations: {}",
            violating_crew,
            violations.len()
        );
        return;
    }

    // crew_id -> (offset_min, work periods)
    let mut by_crew: BTreeMap<String, (i64, Vec<WorkPeriod7501>)> = BTreeMap::new();
    let mut parsed = 0usize;
    let mut skipped = 0usize;
    for line in input.lines() {
        let line = line.trim_end_matches(['\r', '\n']);
        if line.trim().is_empty() {
            continue;
        }
        let mut it = line.split('\t');
        let (crew, pid, start, end, off) =
            match (it.next(), it.next(), it.next(), it.next(), it.next()) {
                (Some(c), Some(p), Some(s), Some(e), Some(o)) => (c, p, s, e, o),
                _ => {
                    skipped += 1;
                    continue;
                }
            };
        let (start_utc, end_utc, offset_min) =
            match (start.parse::<i64>(), end.parse::<i64>(), off.parse::<i64>()) {
                (Ok(s), Ok(e), Ok(o)) => (s, e, o),
                _ => {
                    skipped += 1;
                    continue;
                }
            };
        let pairing_id = pid.trim().parse::<i64>().ok();
        let entry = by_crew
            .entry(crew.to_string())
            .or_insert((offset_min, Vec::new()));
        entry.0 = offset_min;
        entry.1.push(WorkPeriod7501 {
            pairing_id,
            start_utc,
            end_utc,
        });
        parsed += 1;
    }

    let total_crew = by_crew.len();
    let t0 = std::time::Instant::now();
    let mut violations: Vec<(String, rois_rule_engine::SdfdViolation, Option<i64>)> = Vec::new();
    for (crew, (offset_min, work)) in &mut by_crew {
        work.sort_by_key(|w| (w.start_utc, w.end_utc));
        let checked_start = rd_hour(work.iter().map(|w| w.start_utc).min().unwrap());
        if let Some(v) = check_sdfd_rolling_app(
            crew,
            work,
            *offset_min,
            &lnd,
            period_hours,
            &unit,
            buffer_secs,
            min_limits,
            checked_start,
            checked_end,
            Application::Editor,
            &[],
            None,
            &focus,
            focus_crew_ids.as_deref(),
        ) {
            let trig = trigger_pairing(work, v.window_start_utc, v.window_end_utc);
            violations.push((crew.clone(), v, trig));
        }
    }
    let eval_ms = t0.elapsed().as_secs_f64() * 1000.0;
    // Worst (lowest SDFD count) first.
    violations.sort_by_key(|(_, v, _)| v.total_sdfd);

    if emit {
        for (crew, v, trig) in &violations {
            println!(
                "{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}",
                crew,
                v.window_start_utc,
                v.window_end_utc,
                v.total_sdfd,
                v.min_limits,
                v.period_hours,
                v.unit,
                trig.map(|p| p.to_string()).unwrap_or_default(),
            );
        }
        eprintln!(
            "emitted {} crew violations ({} crew evaluated in {:.3} ms; minLimits={}, period={}{})",
            violations.len(),
            total_crew,
            eval_ms,
            min_limits,
            period_hours,
            unit,
        );
        return;
    }

    println!("─────────────────────────────────────────────────────────────");
    println!(" Rule 7501 (SINGLE DAY FREE FROM DUTY) — Rust engine");
    println!(
        " limit: ≥ {} SDFD per rolling {}{} ; local night {:02}:{:02}–{:02}:{:02}, min {}h",
        min_limits,
        period_hours,
        unit,
        lnd.start_min / 60,
        lnd.start_min % 60,
        lnd.end_min / 60,
        lnd.end_min % 60,
        lnd.min_rest_secs / 3600,
    );
    println!("─────────────────────────────────────────────────────────────");
    println!(" work periods : {}", parsed);
    if skipped > 0 {
        println!(" rows skipped : {} (unparseable)", skipped);
    }
    println!(" crew evaluated: {}", total_crew);
    println!(" rule eval time: {:.3} ms", eval_ms);
    println!(
        " crew VIOLATING: {}  ({:.1}%)",
        violations.len(),
        if total_crew > 0 {
            100.0 * violations.len() as f64 / total_crew as f64
        } else {
            0.0
        },
    );
    println!("─────────────────────────────────────────────────────────────");
    if violations.is_empty() {
        println!(
            " No violations: every crew clears {} SDFD per {}{}.",
            min_limits, period_hours, unit
        );
    } else {
        println!(
            " Worst {} crew (fewest SDFD in a {}h window):",
            top.min(violations.len()),
            period_hours
        );
        println!(
            "   {:<12} {:>5}   {}",
            "crew", "sdfd", "worst window (UTC secs)"
        );
        for (crew, v, _) in violations.iter().take(top) {
            println!(
                "   {:<12} {:>5}   [{}, {}]",
                crew, v.total_sdfd, v.window_start_utc, v.window_end_utc
            );
        }
    }
    println!("─────────────────────────────────────────────────────────────");
}
