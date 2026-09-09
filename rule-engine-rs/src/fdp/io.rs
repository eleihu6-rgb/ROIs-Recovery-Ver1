//! Tagged TSV codec for compute-fdp / check-3007 binaries.

use super::{
    hhmm_to_minutes, AssignmentSpec, CheckInOutParams, DutyNode, FdpContext, FdpDuty, FdpSegment,
    LongTransitRow,
};
use crate::rules::rule3007::Rule3007Row;

#[derive(Debug, Default)]
pub struct FdpTsvBatch {
    pub ctx: FdpContext,
    pub duties: Vec<FdpDuty>,
    pub rows: Vec<(usize, Rule3007Row)>,
}

fn yn(raw: &str) -> bool {
    matches!(raw.trim().to_ascii_uppercase().as_str(), "Y" | "YES" | "TRUE" | "1")
}

pub fn parse_fdp_tsv(input: &str) -> FdpTsvBatch {
    let mut batch = FdpTsvBatch::default();
    batch.ctx.add_assignment("FLY", 1.0, &["FLY"]);
    let mut header: Vec<String> = Vec::new();
    let mut by_key: std::collections::BTreeMap<String, usize> = std::collections::BTreeMap::new();

    for raw in input.lines() {
        if raw.is_empty() || raw.starts_with('#') {
            continue;
        }
        let cols: Vec<&str> = raw.split('\t').collect();
        if cols.is_empty() {
            continue;
        }
        match cols[0] {
            "B" if cols.len() >= 3 => {
                batch.ctx.basic.set_definition(cols[1], cols[2]);
            }
            "C" if cols.len() >= 3 => {
                batch.ctx.checkin = CheckInOutParams {
                    brief_min: parse_min(cols[1]),
                    debrief_min: parse_min(cols[2]),
                };
            }
            "T" if cols.len() >= 10 => {
                batch.ctx.long_transits.push(LongTransitRow {
                    inbound: cols[1].into(),
                    outbound: cols[2].into(),
                    airport: cols[3].into(),
                    fleets: cols[4]
                        .split('|')
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                        .collect(),
                    max_turn_time_min: parse_min(cols[5]),
                    pseudo_ci_min: parse_min(cols[6]),
                    pseudo_co_min: parse_min(cols[7]),
                    pseudo_pickup_min: parse_min(cols[8]),
                    pseudo_dropoff_min: parse_min(cols[9]),
                    is_split_duty: cols.get(10).map(|v| yn(v)).unwrap_or(true),
                    in_assignment: cols.get(11).unwrap_or(&"*").to_string(),
                    out_assignment: cols.get(12).unwrap_or(&"*").to_string(),
                    ..LongTransitRow::default()
                });
            }
            "A" if cols.len() >= 3 => {
                let groups: Vec<String> = cols
                    .get(3)
                    .unwrap_or(&"")
                    .split('|')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
                let pct: f64 = cols[2].parse().unwrap_or(1.0);
                let spec = AssignmentSpec {
                    name: cols[1].into(),
                    fdp_pct: pct,
                    groups: if groups.is_empty() {
                        vec![cols[1].into()]
                    } else {
                        groups
                    },
                };
                batch.ctx.assignments.insert(cols[1].into(), spec);
            }
            "H" => {
                header = cols.iter().skip(1).map(|s| (*s).to_string()).collect();
            }
            "R" if cols.len() >= 2 => {
                let idx: usize = cols[1].parse().unwrap_or(batch.rows.len());
                let values: Vec<String> = cols.iter().skip(2).map(|s| (*s).to_string()).collect();
                let row = if header.is_empty() {
                    let mut r = Rule3007Row::default();
                    if let Some(max) = values.first() {
                        if !max.is_empty() {
                            r.max_fdp = max.clone();
                        }
                    }
                    r
                } else {
                    Rule3007Row::from_headers(&header, &values)
                };
                batch.rows.push((idx, row));
            }
            "D" if cols.len() >= 6 => {
                let key = cols[1].to_string();
                let fdp_raw = cols.get(6).copied().unwrap_or("");
                let pln = if fdp_raw.trim().is_empty() {
                    None
                } else {
                    fdp_raw.parse().ok()
                };
                let duty = FdpDuty {
                    duty_key: key.clone(),
                    crew_id: cols.get(2).unwrap_or(&"").to_string(),
                    pairing_id: cols.get(3).and_then(|v| v.parse().ok()).unwrap_or(0),
                    duty_seq: cols.get(4).and_then(|v| v.parse().ok()).unwrap_or(1),
                    assignment_group: nonempty(cols.get(5).copied().unwrap_or("FLY"), "FLY"),
                    pln_fdp_min: pln,
                    times_calculated: pln.is_some(),
                    rest_facility: cols.get(7).and_then(|v| v.parse().ok()).unwrap_or(0),
                    composition_name: cols.get(8).unwrap_or(&"").to_string(),
                    fleet_grp: cols.get(9).unwrap_or(&"").to_string(),
                    checkin_local: cols.get(10).and_then(|v| v.parse().ok()).unwrap_or(0),
                    dep_local: cols.get(11).and_then(|v| v.parse().ok()).unwrap_or(0),
                    start_utc: cols.get(12).and_then(|v| v.parse().ok()).unwrap_or(0),
                    end_utc: cols.get(13).and_then(|v| v.parse().ok()).unwrap_or(0),
                    is_manual_modify: cols.get(14).map(|v| yn(v)).unwrap_or(false),
                    fdp_discretion_min: cols.get(15).and_then(|v| v.parse().ok()).unwrap_or(0),
                    discretion_types: split_bar(cols.get(16).copied().unwrap_or("")),
                    ts_flags: split_bar(cols.get(17).copied().unwrap_or("")),
                    crew_base: cols.get(18).unwrap_or(&"").to_string(),
                    first_dep_is_crew_base: cols.get(19).map(|v| yn(v)).unwrap_or(false),
                    ..FdpDuty::default()
                };
                by_key.insert(key, batch.duties.len());
                batch.duties.push(duty);
            }
            "S" if cols.len() >= 8 => {
                let key = cols[1];
                if let Some(&idx) = by_key.get(key) {
                    let operating = cols.get(9).map(|v| yn(v) || *v == "1").unwrap_or(true);
                    batch.duties[idx].segments.push(FdpSegment {
                        db_id: cols[2].parse().unwrap_or(0),
                        assignment: nonempty(cols.get(3).copied().unwrap_or("FLY"), "FLY"),
                        start_utc_act: cols[4].parse().unwrap_or(0),
                        end_utc_act: cols[5].parse().unwrap_or(0),
                        start_utc_sch: cols.get(6).and_then(|v| v.parse().ok()).unwrap_or(0),
                        end_utc_sch: cols.get(7).and_then(|v| v.parse().ok()).unwrap_or(0),
                        blk_seconds: cols.get(8).and_then(|v| v.parse().ok()).unwrap_or(0),
                        is_operating: operating,
                        flt_sts: cols.get(10).unwrap_or(&"").to_string(),
                        dep: cols.get(11).unwrap_or(&"").to_string(),
                        arr: cols.get(12).unwrap_or(&"").to_string(),
                        fleet: cols.get(13).unwrap_or(&"").to_string(),
                        fleet_grp: cols.get(14).unwrap_or(&"").to_string(),
                        dom_int: nonempty(cols.get(15).copied().unwrap_or("*"), "*"),
                    });
                }
            }
            "N" if cols.len() >= 6 => {
                let key = cols[1];
                if let Some(&idx) = by_key.get(key) {
                    let start: i64 = cols[4].parse().unwrap_or(0);
                    let end: i64 = cols[5].parse().unwrap_or(0);
                    batch.duties[idx].nodes.push(DutyNode {
                        node_type: cols[2].into(),
                        node: cols[3].into(),
                        start_loc: start,
                        end_loc: end,
                        start_utc: start,
                        end_utc: end,
                        from_segment_id: cols.get(6).and_then(|v| v.parse().ok()).unwrap_or(0),
                        to_segment_id: cols.get(7).and_then(|v| v.parse().ok()).unwrap_or(0),
                    });
                }
            }
            _ => {}
        }
    }
    batch
}

fn nonempty(value: &str, fallback: &str) -> String {
    let t = value.trim();
    if t.is_empty() {
        fallback.into()
    } else {
        t.into()
    }
}

fn split_bar(value: &str) -> Vec<String> {
    value
        .split('|')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

fn parse_min(raw: &str) -> i64 {
    if raw.contains(':') {
        hhmm_to_minutes(raw)
    } else {
        raw.trim().parse().unwrap_or(0)
    }
}
