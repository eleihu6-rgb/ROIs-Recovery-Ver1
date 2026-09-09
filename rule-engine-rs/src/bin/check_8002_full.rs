//! Live check for rule 8002 (MAX CUMULATIVE) — full C++ port surface.
//!
//! Exposes `rule8002::check_max_cumulative_row` (qualification matching, all
//! window units, min limits, BH band filters, hasSBYorFLY, DP cross-TZ
//! reduction; types BH/DP/FT/CH) to the live legality recheck. Everything is
//! on the crew-base-LOCAL day axis: day ordinals are days since 1970-01-01 of
//! the crew's local calendar (crew_manday_fd_daily.crew_base_dt), seconds are
//! `ord * 86400`. See src/rule8002.rs module docs for the single-offset
//! cancellation argument.
//!
//! Reads tagged rows on stdin (pipe-separated lists stay raw; `*` = wildcard):
//!   C <TAB> checked_start_s <TAB> checked_end_s <TAB> scenario_end_s <TAB> weekday_start
//!   U <TAB> rule_idx <TAB> bases <TAB> ranks <TAB> fleets <TAB> teams <TAB> period
//!     <TAB> unit <TAB> max_min <TAB> min_min <TAB> type <TAB> int_lo <TAB> int_hi
//!     <TAB> aug_lo <TAB> aug_hi <TAB> aloft_lo <TAB> aloft_hi <TAB> sby_flag <TAB> reduction_min
//!     (band -1/-1 = "*"; sby_flag -1=* 0=N 1=Y)
//!   Q <TAB> crew <TAB> dim(B|R|F|T) <TAB> value <TAB> eff_ord <TAB> exp_ord   (exp_ord<0 = open)
//!   M <TAB> crew <TAB> day_ord <TAB> blh <TAB> ft <TAB> dp <TAB> credit <TAB> sby
//!     <TAB> int_blh <TAB> aug_blh <TAB> aloft <TAB> cross_tz                  (MANDAY_METRICS order, minutes)
//!   P <TAB> rp_start_ord <TAB> rp_end_ord                                     (RP-unit rules)
//!
//! --emit-tsv prints one row per violating window:
//!   V <TAB> crew <TAB> rule_idx <TAB> type <TAB> period <TAB> unit <TAB> actual_min
//!     <TAB> max_min <TAB> min_min <TAB> win_start_s <TAB> win_end_s <TAB> over(0|1) <TAB> cross_tz
//!
//! --optimizer selects Application::Optimizer (min limits suppressed, first
//! breach per rule row); the default is Editor — the live path. In optimizer
//! mode this CLI has no candidate-day source, so cand_days is empty and every
//! window is gated off; the flag exists for parity/testing only.

use std::collections::{BTreeMap, BTreeSet};
use std::io::{self, Read};

use rois_rule_engine::{
    rules::rule8002::{
        check_max_cumulative_row, crew_qualifies_8002, CumRule8002, CumType, CumUnit, CumViolation,
        DayMetrics, QualEntry,
    },
    Application,
};

const DAY: i64 = 86_400;

fn split_list(raw: &str) -> Vec<String> {
    let raw = raw.trim();
    if raw.is_empty() || raw == "*" {
        return vec!["*".to_string()];
    }
    let v: Vec<String> = raw
        .split('|')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    if v.is_empty() {
        vec!["*".to_string()]
    } else {
        v
    }
}

fn band(lo: &str, hi: &str) -> Option<(i64, i64)> {
    let lo: i64 = lo.trim().parse().unwrap_or(-1);
    let hi: i64 = hi.trim().parse().unwrap_or(-1);
    if lo < 0 && hi < 0 {
        None
    } else {
        Some((lo.max(0), hi.max(0)))
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let top: usize = args
        .iter()
        .position(|a| a == "--top")
        .and_then(|i| args.get(i + 1))
        .and_then(|v| v.parse().ok())
        .unwrap_or(15);
    let app = if args.iter().any(|a| a == "--optimizer") {
        Application::Optimizer
    } else {
        Application::Editor
    };

    let mut input = String::new();
    io::stdin().read_to_string(&mut input).expect("read stdin");

    let mut checked: Option<(i64, i64, Option<i64>, String)> = None;
    // rule_idx → CumRule8002 (BTreeMap keeps output ordered by rule_idx).
    let mut rules: BTreeMap<i64, CumRule8002> = BTreeMap::new();
    // crew → per-dimension qual entries (B/R/F/T).
    type Quals = [Vec<QualEntry>; 4];
    let mut quals: BTreeMap<String, Quals> = BTreeMap::new();
    let mut daily: BTreeMap<String, BTreeMap<i64, DayMetrics>> = BTreeMap::new();
    let mut roster_periods: Vec<(i64, i64)> = Vec::new();
    let mut skipped = 0usize;
    let mut metric_rows = 0usize;

    for line in input.lines() {
        let line = line.trim_end();
        if line.is_empty() {
            continue;
        }
        let cols: Vec<&str> = line.split('\t').collect();
        match cols.first().copied() {
            Some("C") if cols.len() >= 5 => {
                let (Ok(cs), Ok(ce)) = (cols[1].parse::<i64>(), cols[2].parse::<i64>()) else {
                    skipped += 1;
                    continue;
                };
                let scen_end = cols[3].parse::<i64>().ok().filter(|v| *v >= 0);
                checked = Some((cs, ce, scen_end, cols[4].trim().to_string()));
            }
            Some("U") if cols.len() >= 19 => {
                let (Ok(idx), Ok(period)) = (cols[1].parse::<i64>(), cols[6].parse::<i64>()) else {
                    skipped += 1;
                    continue;
                };
                let Some(unit) = CumUnit::parse(cols[7]) else {
                    eprintln!("skip U row {idx}: unknown unit {:?}", cols[7]);
                    continue;
                };
                let Some(rtype) = CumType::parse(cols[10]) else {
                    eprintln!("skip U row {idx}: unsupported type {:?}", cols[10]);
                    continue;
                };
                rules.insert(
                    idx,
                    CumRule8002 {
                        bases: split_list(cols[2]),
                        ranks: split_list(cols[3]),
                        fleets: split_list(cols[4]),
                        teams: split_list(cols[5]),
                        period,
                        unit,
                        max_min: cols[8].trim().parse().unwrap_or(999_999),
                        min_min: cols[9].trim().parse().unwrap_or(0),
                        rtype,
                        int_oper_band: band(cols[11], cols[12]),
                        aug_oper_band: band(cols[13], cols[14]),
                        duty_aloft_band: band(cols[15], cols[16]),
                        has_sby_or_fly: match cols[17].trim() {
                            "0" => Some(false),
                            "1" => Some(true),
                            _ => None,
                        },
                        reduction_min_per_duty: cols[18].trim().parse().unwrap_or(0).max(0),
                    },
                );
            }
            Some("Q") if cols.len() >= 6 => {
                let (Ok(eff), Ok(exp)) = (cols[4].parse::<i64>(), cols[5].parse::<i64>()) else {
                    skipped += 1;
                    continue;
                };
                let dim = match cols[2].trim() {
                    "B" => 0,
                    "R" => 1,
                    "F" => 2,
                    "T" => 3,
                    _ => {
                        skipped += 1;
                        continue;
                    }
                };
                let entry = QualEntry {
                    value: cols[3].trim().to_string(),
                    eff_s: eff.saturating_mul(DAY),
                    exp_s: if exp < 0 {
                        i64::MAX
                    } else {
                        exp.saturating_mul(DAY)
                    },
                };
                quals.entry(cols[1].to_string()).or_default()[dim].push(entry);
            }
            Some("M") if cols.len() >= 12 => {
                let Ok(ord) = cols[2].parse::<i64>() else {
                    skipped += 1;
                    continue;
                };
                let mut vals = [0.0f64; 9];
                let mut ok = true;
                for (i, v) in vals.iter_mut().enumerate() {
                    match cols[3 + i].trim().parse::<f64>() {
                        Ok(x) => *v = x,
                        Err(_) => {
                            ok = false;
                            break;
                        }
                    }
                }
                if !ok {
                    skipped += 1;
                    continue;
                }
                let dm = daily
                    .entry(cols[1].to_string())
                    .or_default()
                    .entry(ord)
                    .or_default();
                dm.add(&DayMetrics::from_slice(&vals));
                metric_rows += 1;
            }
            Some("P") if cols.len() >= 3 => {
                let (Ok(s), Ok(e)) = (cols[1].parse::<i64>(), cols[2].parse::<i64>()) else {
                    skipped += 1;
                    continue;
                };
                roster_periods.push((s.saturating_mul(DAY), e.saturating_mul(DAY)));
            }
            _ => skipped += 1,
        }
    }

    let Some((checked_start, checked_end, scenario_end, weekday_start)) = checked else {
        eprintln!("missing C config line — nothing checked");
        return;
    };

    let empty_quals: Quals = Default::default();
    let cand_days: BTreeSet<i64> = BTreeSet::new();
    let t0 = std::time::Instant::now();
    let mut violations: Vec<(String, i64, CumViolation)> = Vec::new();
    for (crew, metrics) in &daily {
        let q = quals.get(crew).unwrap_or(&empty_quals);
        for (idx, rule) in &rules {
            if !crew_qualifies_8002(rule, &q[0], &q[1], &q[2], &q[3], checked_start, checked_end) {
                continue;
            }
            for v in check_max_cumulative_row(
                crew,
                rule,
                metrics,
                &cand_days,
                checked_start,
                checked_end,
                &weekday_start,
                &roster_periods,
                scenario_end,
                &q[3],
                app,
            ) {
                violations.push((crew.clone(), *idx, v));
            }
        }
    }
    let eval = t0.elapsed();
    violations.sort_by(|a, b| {
        (&a.0, a.1, a.2.win_start_local_s).cmp(&(&b.0, b.1, b.2.win_start_local_s))
    });

    if args.iter().any(|a| a == "--emit-tsv") {
        for (crew, idx, v) in &violations {
            println!(
                "V\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}",
                crew,
                idx,
                v.rtype.as_str(),
                v.period,
                v.unit.as_str(),
                v.actual_min,
                v.max_min,
                v.min_min,
                v.win_start_local_s,
                v.win_end_local_s,
                i32::from(v.over),
                v.cross_tz_count,
            );
        }
        eprintln!(
            "emitted {} violations across {} crew ({} metric rows, {} rule rows, {} skipped, {:.3} ms)",
            violations.len(),
            daily.len(),
            metric_rows,
            rules.len(),
            skipped,
            eval.as_secs_f64() * 1000.0,
        );
        return;
    }

    println!("─────────────────────────────────────────────────────────────");
    println!(" Rule 8002 (MAX CUMULATIVE, full port) — Rust engine");
    println!("─────────────────────────────────────────────────────────────");
    println!(" metric rows    : {}", metric_rows);
    println!(" rule rows      : {}", rules.len());
    if skipped > 0 {
        println!(" rows skipped   : {}", skipped);
    }
    println!(" crew evaluated : {}", daily.len());
    println!(" violations     : {}", violations.len());
    println!(" rule eval time : {:.3} ms", eval.as_secs_f64() * 1000.0);
    if !violations.is_empty() {
        println!(" First {}:", top.min(violations.len()));
        println!(
            "   {:<12} {:>4} {:>4} {:>8} {:>8} {:>5}",
            "crew", "rule", "type", "actual", "limit", "over"
        );
        for (crew, idx, v) in violations.iter().take(top) {
            println!(
                "   {:<12} {:>4} {:>4} {:>8} {:>8} {:>5}",
                crew,
                idx,
                v.rtype.as_str(),
                v.actual_min,
                if v.over { v.max_min } else { v.min_min },
                i32::from(v.over),
            );
        }
    }
    println!("─────────────────────────────────────────────────────────────");
}
