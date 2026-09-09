//! Live check for rule 3007 MAX FDP PER DUTY.
//!
//! Tagged TSV on stdin (see `fdp::io`). With `--emit-tsv`:
//!   F <tab> duty_key <tab> pairing_id <tab> duty_seq <tab> fdp_min <tab> skipped
//!   V <tab> duty_key <tab> crew_id <tab> pairing_id <tab> duty_seq <tab> rule_id
//!     <tab> fdp_min <tab> max_fdp_min <tab> start_utc <tab> end_utc <tab> message

use std::io::{self, Read};

use rois_rule_engine::fdp::io::parse_fdp_tsv;
use rois_rule_engine::rules::rule3007::check_fdp_per_duty;
use rois_rule_engine::Application;

fn arg_flag(args: &[String], flag: &str) -> bool {
    args.iter().any(|a| a == flag)
}

fn arg_value(args: &[String], flag: &str) -> Option<String> {
    args.iter()
        .position(|a| a == flag)
        .and_then(|i| args.get(i + 1).cloned())
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let emit = arg_flag(&args, "--emit-tsv");
    let app = match arg_value(&args, "--application")
        .unwrap_or_else(|| "editor".into())
        .to_ascii_lowercase()
        .as_str()
    {
        "optimizer" | "ro" => Application::Optimizer,
        _ => Application::Editor,
    };

    let mut input = String::new();
    io::stdin().read_to_string(&mut input).expect("stdin");
    let mut batch = parse_fdp_tsv(&input);
    let rows: Vec<_> = batch.rows.iter().map(|(_, r)| r.clone()).collect();
    if rows.is_empty() && emit {
        // still emit F lines from calc
    }

    for duty in &mut batch.duties {
        let before = duty.pln_fdp_min;
        let result = check_fdp_per_duty(duty, &batch.ctx, &rows, app, true);
        let skipped = if before.is_some() || duty.assignment_group != "FLY" {
            "Y"
        } else {
            "N"
        };
        if emit {
            println!(
                "F\t{}\t{}\t{}\t{}\t{skipped}",
                duty.duty_key,
                duty.pairing_id,
                duty.duty_seq,
                result.fdp_min.unwrap_or(0)
            );
            for v in result.violations {
                println!(
                    "V\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}",
                    duty.duty_key,
                    v.crew_id,
                    v.pairing_id,
                    v.duty_seq,
                    v.rule_id,
                    v.fdp_min,
                    v.max_fdp_min,
                    v.start_utc,
                    v.end_utc,
                    v.message.replace('\t', " ").replace('\n', " ")
                );
            }
        } else if !result.legal {
            for v in result.violations {
                println!(
                    "{}\t{}\t{}\t{}\t{}",
                    v.crew_id, v.pairing_id, v.duty_seq, v.rule_id, v.message
                );
            }
        }
    }
}
