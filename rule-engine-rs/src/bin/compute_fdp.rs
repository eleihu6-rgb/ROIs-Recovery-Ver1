//! Compute duty FDP minutes (C++ `calculatePairingDutyTimes` / `calculateDutyFdp`).
//!
//! Tagged TSV on stdin (see `fdp::io`). Emits:
//!   F <tab> duty_key <tab> pairing_id <tab> duty_seq <tab> fdp_min <tab> skipped
//! `skipped` is Y when the duty is not FLY or already had minutes.

use std::io::{self, Read};

use rois_rule_engine::fdp::io::parse_fdp_tsv;
use rois_rule_engine::fdp::ensure_fly_fdp;

fn main() {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).expect("stdin");
    let mut batch = parse_fdp_tsv(&input);
    for duty in &mut batch.duties {
        let before = duty.pln_fdp_min;
        if duty.is_manual_modify && before.is_some() {
            println!(
                "F\t{}\t{}\t{}\t{}\tY",
                duty.duty_key,
                duty.pairing_id,
                duty.duty_seq,
                before.unwrap()
            );
            continue;
        }
        ensure_fly_fdp(duty, &batch.ctx);
        let skipped = if before.is_some() || duty.assignment_group != "FLY" {
            "Y"
        } else {
            "N"
        };
        let minutes = duty.pln_fdp_min.unwrap_or(0);
        println!(
            "F\t{}\t{}\t{}\t{}\t{skipped}",
            duty.duty_key, duty.pairing_id, duty.duty_seq, minutes
        );
    }
}
