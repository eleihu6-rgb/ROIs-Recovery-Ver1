//! Live check for rule 8056 (ROSTER SPACING).
//!
//! Reads structured TSV on stdin:
//!     R <TAB> full rule-8056 parameter row
//!     D <TAB> one duty with full matching context
//!     Q <TAB> one crew B/R/F effective-dated qualification row
//!     T <TAB> one crew team row
//!
//! Usage:
//!     check-8056 [--top 15] [--emit-tsv]
//!
//! --emit-tsv prints one violation per line for piping into rule_violation:
//!     crew <TAB> pairing_id <TAB> gap_start_secs <TAB> gap_end_secs <TAB> actual
//!          <TAB> current_label <TAB> next_label

use std::collections::BTreeMap;
use std::io::{self, Read};

use rois_rule_engine::{
    format_hhmm,
    rules::rule8056::{check_roster_spacing_full_with_context, Rule8056Duty, Rule8056Rule},
    BaseQual, SpacingViolation,
};

#[derive(Debug, Clone)]
struct TaggedViolation {
    rule_index: usize,
    violation: SpacingViolation,
}

#[derive(Debug, Clone)]
struct ParsedDuty {
    duty: Rule8056Duty,
    offset_min: i64,
}

#[derive(Debug, Clone, Default)]
struct CrewContext {
    bases: Vec<BaseQual>,
    ranks: Vec<BaseQual>,
    fleets: Vec<BaseQual>,
    teams: Vec<String>,
}

fn arg_value(args: &[String], flag: &str) -> Option<String> {
    args.iter()
        .position(|a| a == flag)
        .and_then(|i| args.get(i + 1).cloned())
}

fn split_filter(value: &str) -> Vec<String> {
    value
        .split(['|', ','])
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .map(str::to_string)
        .collect()
}

fn parse_bool(value: &str, default: bool) -> bool {
    match value.trim().to_uppercase().as_str() {
        "Y" | "YES" | "TRUE" | "1" => true,
        "N" | "NO" | "FALSE" | "0" => false,
        _ => default,
    }
}

fn parse_optional_bool(value: &str) -> Option<bool> {
    let value = value.trim();
    if value.is_empty() || value == "*" {
        None
    } else {
        Some(parse_bool(value, false))
    }
}

fn parse_ord(value: &str) -> Option<i64> {
    value
        .trim()
        .parse::<i64>()
        .ok()
        .and_then(|ord| (ord >= 0).then_some(ord))
}

fn filter_matches(filters: &[String], value: &str) -> bool {
    filters.is_empty()
        || filters.iter().any(|filter| {
            let filter = filter.trim();
            filter.is_empty() || filter == "*" || filter.eq_ignore_ascii_case(value)
        })
}

fn qual_scope_matches(filters: &[String], quals: &[BaseQual], day_ord: i64) -> bool {
    if filters.is_empty() || filters.iter().any(|value| value.trim() == "*") {
        return true;
    }
    quals.iter().any(|qual| {
        filter_matches(filters, qual.base.as_str())
            && qual.eff_ord.unwrap_or(i64::MIN) <= day_ord
            && qual.exp_ord.unwrap_or(i64::MAX) >= day_ord
    })
}

fn team_scope_matches(filters: &[String], teams: &[String]) -> bool {
    if filters.is_empty() || filters.iter().any(|value| value.trim() == "*") {
        return true;
    }
    teams.iter().any(|team| filter_matches(filters, team))
}

fn scope_matches(rule: &Rule8056Rule, context: &CrewContext, day_ord: i64) -> bool {
    qual_scope_matches(&rule.bases, &context.bases, day_ord)
        && qual_scope_matches(&rule.ranks, &context.ranks, day_ord)
        && qual_scope_matches(&rule.fleets, &context.fleets, day_ord)
        && team_scope_matches(&rule.teams, &context.teams)
}

fn local_day_ord(utc_secs: i64, offset_min: i64) -> i64 {
    (utc_secs + offset_min * 60).div_euclid(86_400)
}

type ParsedInput = (
    Vec<Rule8056Rule>,
    BTreeMap<String, Vec<ParsedDuty>>,
    BTreeMap<String, CrewContext>,
    usize,
);

fn parse_structured(input: &str) -> Result<ParsedInput, String> {
    let mut rules = Vec::new();
    let mut duties: BTreeMap<String, Vec<ParsedDuty>> = BTreeMap::new();
    let mut contexts: BTreeMap<String, CrewContext> = BTreeMap::new();
    let mut skipped = 0usize;

    for raw in input.lines() {
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        let cols: Vec<&str> = line.split('\t').collect();
        match cols.first().copied() {
            Some("R") if cols.len() >= 27 => {
                let Ok(space) = cols[21].parse::<f64>() else {
                    skipped += 1;
                    continue;
                };
                rules.push(Rule8056Rule {
                    bases: split_filter(cols[1]),
                    ranks: split_filter(cols[2]),
                    fleets: split_filter(cols[3]),
                    teams: split_filter(cols[4]),
                    attribute_a: split_filter(cols[5]),
                    label_a: split_filter(cols[6]),
                    assignment_group_a: split_filter(cols[7]),
                    assignment_a: split_filter(cols[8]),
                    qualifier_a: split_filter(cols[9]),
                    airport_a: split_filter(cols[10]),
                    roles_a: split_filter(cols[11]),
                    is_requested_a: parse_optional_bool(cols[12]),
                    attribute_b: split_filter(cols[13]),
                    label_b: split_filter(cols[14]),
                    assignment_group_b: split_filter(cols[15]),
                    assignment_b: split_filter(cols[16]),
                    qualifier_b: split_filter(cols[17]),
                    airport_b: split_filter(cols[18]),
                    roles_b: split_filter(cols[19]),
                    is_requested_b: parse_optional_bool(cols[20]),
                    space,
                    unit: cols[22].trim().to_uppercase(),
                    directional: parse_bool(cols[23], true),
                    location_equal_base_a: parse_optional_bool(cols[24]),
                    location_equal_base_b: parse_optional_bool(cols[25]),
                    utilize_post_duty_rest: parse_bool(cols[26], true),
                });
            }
            Some("D") if cols.len() >= 18 => {
                let parsed = (
                    cols[2].parse::<i64>(),
                    cols[3].parse::<i64>(),
                    cols[4].parse::<i64>(),
                    cols[5].parse::<i64>(),
                    cols[17].parse::<i64>(),
                );
                let (
                    Ok(pairing_id),
                    Ok(start_utc),
                    Ok(end_utc),
                    Ok(post_rest_end_utc),
                    Ok(offset_min),
                ) = parsed
                else {
                    skipped += 1;
                    continue;
                };
                duties
                    .entry(cols[1].to_string())
                    .or_default()
                    .push(ParsedDuty {
                        duty: Rule8056Duty {
                            pairing_id,
                            start_utc,
                            end_utc,
                            post_rest_end_utc,
                            label: cols[6].to_string(),
                            assignment_group: cols[7].to_string(),
                            assignment: cols[8].to_string(),
                            attribute: cols[9].to_string(),
                            qualifier: cols[10].to_string(),
                            airport: cols[11].to_string(),
                            role: cols[12].to_string(),
                            is_requested: parse_bool(cols[13], false),
                            location: cols[14].to_string(),
                            crew_base: cols[15].to_string(),
                            pre_assigned: parse_bool(cols[16], false),
                        },
                        offset_min,
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
                    "B" | "BASE" => context.bases.push(qual),
                    "R" | "RANK" => context.ranks.push(qual),
                    "F" | "FLEET" => context.fleets.push(qual),
                    _ => skipped += 1,
                }
            }
            Some("T") if cols.len() >= 3 => contexts
                .entry(cols[1].to_string())
                .or_default()
                .teams
                .push(cols[2].to_string()),
            Some("R" | "D" | "Q" | "T") => skipped += 1,
            _ => {
                return Err(
                    "check-8056 now requires structured R/D/Q/T input; legacy TSV is unsupported"
                        .to_string(),
                );
            }
        }
    }

    Ok((rules, duties, contexts, skipped))
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let top: usize = arg_value(&args, "--top")
        .and_then(|v| v.parse().ok())
        .unwrap_or(15);

    let mut input = String::new();
    io::stdin().read_to_string(&mut input).expect("read stdin");

    let (rules, by_crew, contexts, skipped) = match parse_structured(&input) {
        Ok(parsed) => parsed,
        Err(message) => {
            eprintln!("{message}");
            std::process::exit(2);
        }
    };

    let total_crew = by_crew.len();
    let t0 = std::time::Instant::now();
    let mut violations: Vec<TaggedViolation> = Vec::new();
    for (rule_index, rule) in rules.iter().enumerate() {
        for (crew, duties) in &by_crew {
            let offset_min = duties.first().map(|duty| duty.offset_min).unwrap_or(0);
            let day_ord = duties
                .first()
                .map(|duty| local_day_ord(duty.duty.start_utc, offset_min))
                .unwrap_or(0);
            let context = contexts.get(crew).cloned().unwrap_or_default();
            if !scope_matches(rule, &context, day_ord) {
                continue;
            }
            let roster_duties: Vec<Rule8056Duty> =
                duties.iter().map(|duty| duty.duty.clone()).collect();
            match check_roster_spacing_full_with_context(
                crew,
                &roster_duties,
                rule,
                offset_min,
                None,
            ) {
                Ok(rows) => violations.extend(rows.into_iter().map(|violation| TaggedViolation {
                    rule_index,
                    violation,
                })),
                Err(message) => {
                    eprintln!("{message}");
                    std::process::exit(2);
                }
            }
        }
    }
    let eval_elapsed = t0.elapsed();
    violations.sort_by_key(|v| v.violation.actual_minutes);

    let violating_crew: std::collections::BTreeSet<&str> = violations
        .iter()
        .map(|v| v.violation.crew_id.as_str())
        .collect();

    if args.iter().any(|a| a == "--emit-tsv") {
        for v in &violations {
            let v0 = &v.violation;
            println!(
                "{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}",
                v0.crew_id,
                v0.pairing_id,
                v0.gap_start_utc,
                v0.gap_end_utc,
                v0.actual_minutes,
                v0.current_label,
                v0.next_label,
                v.rule_index,
            );
        }
        eprintln!(
            "emitted {} violations across {} crew ({} crew evaluated in {:.3} ms, structured)",
            violations.len(),
            violating_crew.len(),
            total_crew,
            eval_elapsed.as_secs_f64() * 1000.0,
        );
        return;
    }

    println!("─────────────────────────────────────────────────────────────");
    println!(" Rule 8056 (ROSTER SPACING) — Rust engine");
    println!(" structured rules: {}", rules.len());
    println!("─────────────────────────────────────────────────────────────");
    println!(
        " duties read   : {}",
        by_crew.values().map(Vec::len).sum::<usize>()
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
        " crew VIOLATING: {}  ({:.1}%)   violations: {}",
        violating_crew.len(),
        if total_crew > 0 {
            100.0 * violating_crew.len() as f64 / total_crew as f64
        } else {
            0.0
        },
        violations.len(),
    );
    println!("─────────────────────────────────────────────────────────────");

    if violations.is_empty() {
        println!(
            " No violations: every matching consecutive duty pair satisfies configured 8056 spacing."
        );
    } else {
        println!(" Top {} tightest spacings:", top.min(violations.len()));
        println!(
            "   {:<12} {:>10}   {} → {}",
            "crew", "gap", "current", "next"
        );
        for v in violations.iter().take(top) {
            let v0 = &v.violation;
            println!(
                "   {:<12} {:>10}   {} → {}",
                v0.crew_id,
                if v0.limit_minutes < 60 {
                    format!("{} CD", v0.actual_minutes)
                } else {
                    format_hhmm(v0.actual_minutes)
                },
                v0.current_label,
                v0.next_label,
            );
        }
    }
    println!("─────────────────────────────────────────────────────────────");
}
