//! ruletool — populate the scenario crew-manday tables from a solver result.
//!
//! Aggregates per-crew credited time into daily → monthly → yearly buckets using the
//! SAME credit model as rules 7502 / 8002 (the data-driven `assignment` model). The DB
//! read/write happens upstream in node (gz parse → TSV in, TSV out → upsert); the credit
//! arithmetic and the monthly 8002 band check live here in Rust so they never drift.
//!
//! Input (stdin), one row per crew-day activity contribution, TSV:
//!     crew \t division \t local_date(YYYY-MM-DD) \t kind \t a1 \t a2 \t a3 \t flag
//!   kind=FLY : a1 = credited_minutes (from gz duty_act_credited_minutes); a2,a3 unused
//!   kind=GND : a1 = duty_minutes, a2 = fixed_credit_min (unused), a3 reserved,
//!              optional act_credit, sch_credit, dp_min
//!   flag     : '' | DO | VAC | ILL  (drives is_day_off / is_al(FD) / is_leave(CC))
//!
//! Flying credit = gz credited minutes (FT 1.0 ⇒ block ≈ credit ⇒ also counts as blh).
//! Ground credit = imported act/sch credited minutes only (0 when absent). Ground tasks
//! (roster_flight.pairing_id = 0) are NOT supplemented from assignment.fixed_credit_min.
//!
//! Output (stdout), TSV, one row per (grain, crew, key):
//!     D \t crew \t division \t YYYY-MM-DD \t blh \t credit \t is_do \t is_al \t is_leave
//!     M \t crew \t division \t YYYY-MM    \t blh \t credit \t do_cnt \t al_cnt \t leave_cnt \t band
//!     Y \t crew \t division \t YYYY       \t blh \t credit \t do_cnt \t al_cnt \t leave_cnt
//!   band ∈ OK|OVER|UNDER (8002 credit band, prorated by active-days/days-in-month).
//!
//! Usage: ruletool [--band-min 3900] [--band-max 4500]   (minutes; F8 = 65:00 / 75:00)

use std::collections::{BTreeMap, BTreeSet};
use std::io::{self, Read};

use rois_rule_engine::rules::rule8002::{check_credit_band, days_in_month};

fn arg_value(args: &[String], flag: &str) -> Option<String> {
    args.iter()
        .position(|a| a == flag)
        .and_then(|i| args.get(i + 1).cloned())
}

fn parse_optional_i64(value: Option<&&str>) -> Option<i64> {
    value.and_then(|v| {
        let trimmed = v.trim();
        if trimmed.is_empty() {
            None
        } else {
            trimmed.parse::<i64>().ok()
        }
    })
}

#[derive(Default, Clone)]
struct Bucket {
    division: String,
    blh: i64,
    credit: i64,
    dp: i64,
    is_do: bool,
    is_al: bool,
    is_leave: bool,
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let band_min: i64 = arg_value(&args, "--band-min")
        .and_then(|v| v.parse().ok())
        .unwrap_or(3900);
    let band_max: i64 = arg_value(&args, "--band-max")
        .and_then(|v| v.parse().ok())
        .unwrap_or(4500);

    let mut input = String::new();
    io::stdin().read_to_string(&mut input).expect("read stdin");

    // daily bucket keyed by (crew, date); flags are per-day booleans
    let mut daily: BTreeMap<(String, String), Bucket> = BTreeMap::new();
    let mut skipped = 0usize;
    let mut rows = 0usize;

    for line in input.lines() {
        let line = line.trim_end_matches(['\r', '\n']);
        if line.is_empty() {
            continue;
        }
        let f: Vec<&str> = line.split('\t').collect();
        if f.len() < 8 {
            skipped += 1;
            continue;
        }
        let (crew, division, date, kind, a1, _a2, _a3, flag) =
            (f[0], f[1], f[2], f[3], f[4], f[5], f[6], f[7]);

        let (blh_add, credit_add, dp_add) = match kind {
            "FLY" => {
                let c = a1.parse::<i64>().unwrap_or(0);
                (c, c, 0) // FT 1.0 ⇒ credited minutes double as block hours
            }
            "GND" => {
                let act_credit = parse_optional_i64(f.get(8));
                let sch_credit = parse_optional_i64(f.get(9));
                let credit = act_credit.or(sch_credit).unwrap_or(0);
                let dp = parse_optional_i64(f.get(10)).unwrap_or(0).max(0);
                (0, credit, dp)
            }
            _ => {
                skipped += 1;
                continue;
            }
        };

        let e = daily
            .entry((crew.to_string(), date.to_string()))
            .or_default();
        if e.division.is_empty() {
            e.division = division.to_string();
        }
        e.blh += blh_add;
        e.credit += credit_add;
        e.dp += dp_add;
        match flag {
            "DO" => e.is_do = true,
            "VAC" => e.is_al = true,
            "ILL" => e.is_leave = true,
            _ => {}
        }
        rows += 1;
    }

    // ── monthly + yearly rollups ────────────────────────────────────────────
    #[derive(Default, Clone)]
    struct Roll {
        division: String,
        blh: i64,
        credit: i64,
        dp: i64,
        do_cnt: i64,
        al_cnt: i64,
        leave_cnt: i64,
        active_days: BTreeSet<u32>, // day-of-month, for band proration
    }
    let mut monthly: BTreeMap<(String, String), Roll> = BTreeMap::new();
    let mut yearly: BTreeMap<(String, String), Roll> = BTreeMap::new();

    for ((crew, date), b) in &daily {
        let ym = &date[..7.min(date.len())]; // YYYY-MM
        let yr = &date[..4.min(date.len())]; // YYYY
        let dom: u32 = date.get(8..10).and_then(|d| d.parse().ok()).unwrap_or(0);
        for (map, key) in [
            (&mut monthly, (crew.clone(), ym.to_string())),
            (&mut yearly, (crew.clone(), yr.to_string())),
        ] {
            let r = map.entry(key).or_default();
            if r.division.is_empty() {
                r.division = b.division.clone();
            }
            r.blh += b.blh;
            r.credit += b.credit;
            r.dp += b.dp;
            if b.is_do {
                r.do_cnt += 1;
            }
            if b.is_al {
                r.al_cnt += 1;
            }
            if b.is_leave {
                r.leave_cnt += 1;
            }
            r.active_days.insert(dom);
        }
    }

    // ── emit ─────────────────────────────────────────────────────────────────
    let mut out = String::new();
    for ((crew, date), b) in &daily {
        out.push_str(&format!(
            "D\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\n",
            crew,
            b.division,
            date,
            b.blh,
            b.credit,
            b.is_do as i64,
            b.is_al as i64,
            b.is_leave as i64,
            b.dp,
        ));
    }
    let mut over = 0usize;
    let mut under = 0usize;
    for ((crew, ym), r) in &monthly {
        let (y, m): (i64, i64) = (
            ym[..4].parse().unwrap_or(0),
            ym.get(5..7).and_then(|s| s.parse().ok()).unwrap_or(1),
        );
        let dim = days_in_month(y, m).max(1);
        let factor = r.active_days.len() as f64 / dim as f64;
        let band = match check_credit_band(crew, ym, r.credit, band_min, band_max, factor) {
            None => "OK",
            Some(v) if v.over => {
                over += 1;
                "OVER"
            }
            Some(_) => {
                under += 1;
                "UNDER"
            }
        };
        out.push_str(&format!(
            "M\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\n",
            crew, r.division, ym, r.blh, r.credit, r.do_cnt, r.al_cnt, r.leave_cnt, band,
        ));
    }
    for ((crew, yr), r) in &yearly {
        out.push_str(&format!(
            "Y\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\n",
            crew, r.division, yr, r.blh, r.credit, r.do_cnt, r.al_cnt, r.leave_cnt,
        ));
    }
    print!("{}", out);

    eprintln!(
        "ruletool: {} activity rows ({} skipped) → {} crew-days, {} crew-months ({} over / {} under band), {} crew-years",
        rows, skipped, daily.len(), monthly.len(), over, under, yearly.len(),
    );
}
