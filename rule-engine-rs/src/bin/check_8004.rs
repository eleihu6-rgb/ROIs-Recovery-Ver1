//! Rule 8004 BASE/RANK/FLEET checker. See the Rust library for rule semantics.

use std::collections::BTreeMap;
use std::io::{self, Read};
use rois_rule_engine::{parse_date_ord, rules::rule8004::{check_base_competency_app, check_fleet_competency, check_rank_competency, BaseActivity, BaseQual, BaseRoster, CompetencyFlight, CompetencyQual, CompetencyViolation, DimensionCompetencyViolation}, Application};

fn arg_value(args: &[String], flag: &str) -> Option<String> { args.iter().position(|a| a == flag).and_then(|i| args.get(i + 1).cloned()) }
fn opt_ord(s: &str) -> Option<i64> { if s == "-" || s.is_empty() { None } else { parse_date_ord(s) } }
fn opt_pairing_id(s: &str) -> Option<i64> { if s == "-" || s.is_empty() { None } else { s.parse().ok() } }
fn bool_field(s: &str) -> bool { matches!(s.trim(), "1" | "Y" | "y" | "true" | "TRUE") }

#[derive(Default)]
struct CrewData { rosters: Vec<BaseRoster>, quals: Vec<BaseQual>, activities: Vec<BaseActivity>, flights: Vec<CompetencyFlight>, rank_quals: Vec<CompetencyQual>, fleet_quals: Vec<CompetencyQual> }

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let grace_days = arg_value(&args, "--grace-days").and_then(|v| v.parse().ok()).unwrap_or(0);
    let top: usize = arg_value(&args, "--top").and_then(|v| v.parse().ok()).unwrap_or(15);
    let dimension = arg_value(&args, "--dimension").map(|v| v.to_uppercase());
    let assignments: Vec<String> = arg_value(&args, "--assignments").unwrap_or_default().split('|').filter(|s| !s.is_empty()).map(str::to_string).collect();
    let mut input = String::new(); io::stdin().read_to_string(&mut input).expect("read stdin");
    let mut by_crew: BTreeMap<String, CrewData> = BTreeMap::new(); let mut skipped = 0usize;
    for line in input.lines().map(str::trim).filter(|l| !l.is_empty()) {
        let c: Vec<&str> = line.split('\t').collect();
        match c.first().copied() {
            Some("R") if c.len() >= 6 => match (c[2].parse::<i64>(), parse_date_ord(c[4]), parse_date_ord(c[5])) { (Ok(pid), Some(s), Some(e)) => { by_crew.entry(c[1].to_string()).or_default().rosters.push(BaseRoster { pairing_id: pid, base: c[3].to_string(), start_ord: s, end_ord: e }); }, _ => skipped += 1 },
            Some("Q") if c.len() >= 5 => { by_crew.entry(c[1].to_string()).or_default().quals.push(BaseQual { base: c[2].to_string(), eff_ord: opt_ord(c[3]), exp_ord: opt_ord(c[4]) }); },
            Some("A") if c.len() >= 7 => match (c[3].parse::<i64>(), c[4].parse::<i64>()) { (Ok(s), Ok(e)) => { by_crew.entry(c[1].to_string()).or_default().activities.push(BaseActivity { pairing_id: opt_pairing_id(c[2]), start_utc: s, end_utc: e, start_station: c[5].to_string(), end_station: c[6].to_string() }); }, _ => skipped += 1 },
            Some("F") if c.len() >= 14 => match (c[2].parse::<i64>(), c[3].parse::<i64>(), c[4].parse::<i64>(), c[8].parse::<i64>(), c[9].parse::<i64>(), parse_date_ord(c[10]), parse_date_ord(c[11])) {
                (Ok(p), Ok(d), Ok(sg), Ok(st), Ok(en), Some(so), Some(eo)) => { by_crew.entry(c[1].to_string()).or_default().flights.push(CompetencyFlight { pairing_id: p, duty_seq: d, seg_seq: sg, assignment: c[5].to_string(), rank: c[6].to_string(), fleet: c[7].to_string(), start_utc: st, end_utc: en, start_ord: so, end_ord: eo, deadhead: bool_field(c[12]), ferry: bool_field(c[13]) }); }, _ => skipped += 1 },
            Some("K") if c.len() >= 6 => { let q = CompetencyQual { value: c[3].to_string(), eff_ord: opt_ord(c[4]), exp_ord: opt_ord(c[5]) }; let d = by_crew.entry(c[1].to_string()).or_default(); match c[2].to_uppercase().as_str() { "RANK" => d.rank_quals.push(q), "FLEET" => d.fleet_quals.push(q), _ => skipped += 1 } },
            _ => skipped += 1,
        }
    }
    let mut base: Vec<CompetencyViolation> = Vec::new(); let mut dim: Vec<DimensionCompetencyViolation> = Vec::new();
    for (crew, d) in &by_crew { if dimension.as_deref().map_or(true, |v| v == "BASE") { base.extend(check_base_competency_app(crew, &d.rosters, &d.quals, grace_days, Application::Editor, &[], &d.activities)); } if dimension.as_deref().map_or(false, |v| v == "RANK") { dim.extend(check_rank_competency(crew, &d.flights, &d.rank_quals, &assignments, grace_days)); } if dimension.as_deref().map_or(false, |v| v == "FLEET") { dim.extend(check_fleet_competency(crew, &d.flights, &d.fleet_quals, &assignments, grace_days)); } }
    base.sort_by(|a, b| a.crew_id.cmp(&b.crew_id).then(a.pairing_id.cmp(&b.pairing_id))); dim.sort_by(|a, b| a.crew_id.cmp(&b.crew_id).then(a.pairing_id.cmp(&b.pairing_id)).then(a.duty_seq.cmp(&b.duty_seq)).then(a.seg_seq.cmp(&b.seg_seq)).then(a.dimension.cmp(&b.dimension)));
    if args.iter().any(|a| a == "--emit-tsv") { for v in &base { println!("{}\t{}\t{}", v.crew_id, v.pairing_id, v.base); } for v in &dim { println!("{}\t{}\t{}\t{}\t{}\t{}", v.crew_id, v.pairing_id, v.duty_seq, v.seg_seq, v.dimension, v.value); } return; }
    println!("Rule 8004 BASE/RANK/FLEET — {} crews, {} violations, {} rows skipped", by_crew.len(), base.len() + dim.len(), skipped); for v in base.iter().take(top) { println!("{} pairing={} missing BASE={}", v.crew_id, v.pairing_id, v.base); } for v in dim.iter().take(top) { println!("{} pairing={} duty={} seg={} missing {}={}", v.crew_id, v.pairing_id, v.duty_seq, v.seg_seq, v.dimension, v.value); }
}
