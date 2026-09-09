//! C++ → Rust migration-fidelity replica for rule 7500 (ACCLIMATISATION DEFINITION, CARS).
//!
//! Source of truth: `crewrule-dev/RuleEngine/rule/rule7500/AcclimatizationForCARSRule.cpp`
//! (`adjustTimezone` + `CalculateDuty`). There is NO `rule7500_gtest.cpp`, so this replica
//! encodes the contract from the active calculator:
//!   - first duty is acclimatised to its DEPARTURE timezone;
//!   - while the crew stays in one TZ, every "Stay Duration per X Hours" of stay drifts the
//!     reference TZ toward that TZ by "ACC TZ Adjust X Hours" (clamped, never overshooting);
//!   - 7500 emits NO violations — it only sets per-duty state consumed by 7503 (and others).
//!
//! F8 7500/002 DailyAdjustment (table 2) = "24:00" / "01:00" → stay_per_min=1440, adjust=60.

use rois_rule_engine::{
    acc_duty_refs, acc_duty_refs_for_crew_duties, adjust_timezone, AccDuty, AccDutyInput,
};

const H: i64 = 3600;

fn duty(start_h: i64, end_h: i64, dep_tz: i64, arr_tz: i64) -> AccDuty {
    AccDuty {
        start_utc: start_h * H,
        end_utc: end_h * H,
        first_flight_departure_utc: start_h * H,
        last_flight_arrival_utc: end_h * H,
        dep_tz_min: dep_tz,
        arr_tz_min: arr_tz,
    }
}

fn duty_with_flight_bounds(
    start_h: i64,
    end_h: i64,
    first_dep_h: i64,
    last_arr_h: i64,
    dep_tz: i64,
    arr_tz: i64,
) -> AccDuty {
    AccDuty {
        start_utc: start_h * H,
        end_utc: end_h * H,
        first_flight_departure_utc: first_dep_h * H,
        last_flight_arrival_utc: last_arr_h * H,
        dep_tz_min: dep_tz,
        arr_tz_min: arr_tz,
    }
}

// ── adjustTimezone: move toward dest by adjust, never overshoot (both directions) ───────
#[test]
fn adjust_timezone_clamps_toward_dest() {
    // src 0 → dest -600 (west), adjust 60 → -60 (one step toward dest).
    assert_eq!(adjust_timezone(0, -600, 60), -60);
    // Overshoot is clamped to dest.
    assert_eq!(adjust_timezone(0, -600, 1000), -600);
    // src 0 → dest +600 (east), adjust 60 → +60.
    assert_eq!(adjust_timezone(0, 600, 60), 60);
    assert_eq!(adjust_timezone(0, 600, 1000), 600);
    // dest == src → no movement.
    assert_eq!(adjust_timezone(-240, -240, 60), -240);
}

// ── domestic (dep TZ == arr TZ == base): ref TZ never drifts off base ────────────────────
#[test]
fn same_timezone_roster_stays_at_base() {
    // Every duty departs and arrives in the base TZ (-240, EDT). No drift, ever — this is the
    // live-port case (roster_flight has no segment airport TZ → all duties at base TZ).
    let duties = [
        duty(0, 8, -240, -240),
        duty(48, 56, -240, -240),
        duty(96, 104, -240, -240),
    ];
    let refs: Vec<i64> = acc_duty_refs(&duties, 1440, 60)
        .into_iter()
        .map(|r| r.ref_tz_min)
        .collect();
    assert_eq!(
        refs,
        vec![-240, -240, -240],
        "domestic roster never drifts off base TZ"
    );
}

// ── crossing to a new TZ then staying drifts the ref TZ toward it (1h per 24h) ──────────
#[test]
fn drift_toward_destination_after_long_stay() {
    // d0: depart base (0), arrive a -600 zone (e.g. UTC→UTC-10). First duty ref = dep = 0.
    // d1: stays in the -600 zone, starting 25h after d0 ended → one full 24h stay-unit →
    //     ref drifts from 0 toward -600 by 60 → -60.
    let d0 = duty(0, 4, 0, -600);
    let d1 = AccDuty {
        start_utc: (4 + 25) * H,
        end_utc: (4 + 29) * H,
        first_flight_departure_utc: (4 + 25) * H,
        last_flight_arrival_utc: (4 + 29) * H,
        dep_tz_min: -600,
        arr_tz_min: -600,
    };
    let refs: Vec<i64> = acc_duty_refs(&[d0, d1], 1440, 60)
        .into_iter()
        .map(|r| r.ref_tz_min)
        .collect();
    assert_eq!(refs[0], 0, "first duty acclimatised to its departure TZ");
    assert_eq!(
        refs[1], -60,
        "one 24h stay drifts ref 0 → -60 toward the -600 zone"
    );
}

#[test]
fn stay_uses_first_departure_after_previous_last_arrival_not_duty_bounds() {
    // Duty gap: 25h - 6h = 19h, which used to be too short for a 24h adjustment.
    // Flight-boundary gap: 30h - 5h = 25h, so 7500 must now apply one 24h step.
    let d0 = duty_with_flight_bounds(0, 6, 1, 5, 0, -600);
    let d1 = duty_with_flight_bounds(25, 34, 30, 33, -600, -600);

    let refs = acc_duty_refs(&[d0, d1], 1440, 60);

    assert_eq!(refs[1].ref_tz_min, -60);
    assert_eq!(refs[1].duty_end_ref_tz_min, -60);
}

#[test]
fn stay_does_not_adjust_when_flight_boundary_gap_is_under_24h() {
    // Duty gap is 25h, but actual last-arrival -> next-first-departure stay is 23h.
    let d0 = duty_with_flight_bounds(0, 4, 0, 6, 0, -600);
    let d1 = duty_with_flight_bounds(29, 35, 29, 34, -600, -600);

    let refs = acc_duty_refs(&[d0, d1], 1440, 60);

    assert_eq!(refs[1].ref_tz_min, 0);
    assert_eq!(refs[1].duty_end_ref_tz_min, -60);
}

#[test]
fn timezone_change_resets_stay_start_to_last_flight_arrival() {
    let d0 = duty_with_flight_bounds(0, 4, 0, 3, 0, -600);
    let d1 = duty_with_flight_bounds(10, 20, 11, 18, -600, -300);
    // If reset used duty end (20h), d2 first dep at 42h would be only 22h.
    // Correct reset uses d1 last flight arrival (18h), so 42h is one full 24h stay.
    let d2 = duty_with_flight_bounds(40, 46, 42, 45, -300, -300);

    let refs = acc_duty_refs(&[d0, d1, d2], 1440, 60);

    assert_eq!(refs[2].ref_tz_min, -60);
}

// ── empty / single duty ─────────────────────────────────────────────────────────────────
#[test]
fn empty_and_single() {
    assert!(acc_duty_refs(&[], 1440, 60).is_empty());
    assert_eq!(
        acc_duty_refs(&[duty(0, 4, -300, -300)], 1440, 60)
            .iter()
            .map(|r| r.ref_tz_min)
            .collect::<Vec<_>>(),
        vec![-300]
    );
}

#[test]
fn crew_batch_keeps_shared_pairing_refs_isolated_by_crew() {
    let rows = [
        AccDutyInput {
            crew_id: "crew-a".to_string(),
            pairing_id: 700,
            duty_seq: 1,
            duty: duty(0, 4, 0, -600),
        },
        AccDutyInput {
            crew_id: "crew-a".to_string(),
            pairing_id: 701,
            duty_seq: 1,
            duty: AccDuty {
                start_utc: 29 * H,
                end_utc: 33 * H,
                first_flight_departure_utc: 29 * H,
                last_flight_arrival_utc: 33 * H,
                dep_tz_min: -600,
                arr_tz_min: -600,
            },
        },
        AccDutyInput {
            crew_id: "crew-b".to_string(),
            pairing_id: 700,
            duty_seq: 1,
            duty: duty(0, 4, 300, 300),
        },
        AccDutyInput {
            crew_id: "crew-b".to_string(),
            pairing_id: 701,
            duty_seq: 1,
            duty: AccDuty {
                start_utc: 29 * H,
                end_utc: 33 * H,
                first_flight_departure_utc: 29 * H,
                last_flight_arrival_utc: 33 * H,
                dep_tz_min: 300,
                arr_tz_min: 300,
            },
        },
    ];

    let refs = acc_duty_refs_for_crew_duties(&rows, 1440, 60);

    assert_eq!(refs.len(), rows.len());
    assert_eq!(refs[0].crew_id, "crew-a");
    assert_eq!(refs[0].pairing_id, 700);
    assert_eq!(refs[0].ref_tz_min, 0);
    assert_eq!(refs[1].ref_tz_min, -60);
    assert_eq!(refs[2].crew_id, "crew-b");
    assert_eq!(refs[2].pairing_id, 700);
    assert_eq!(refs[2].ref_tz_min, 300);
    assert_eq!(refs[3].ref_tz_min, 300);
}

#[test]
fn crew_batch_sorts_each_crew_timeline_but_returns_input_order() {
    let rows = [
        AccDutyInput {
            crew_id: "crew-a".to_string(),
            pairing_id: 701,
            duty_seq: 1,
            duty: AccDuty {
                start_utc: 29 * H,
                end_utc: 33 * H,
                first_flight_departure_utc: 29 * H,
                last_flight_arrival_utc: 33 * H,
                dep_tz_min: -600,
                arr_tz_min: -600,
            },
        },
        AccDutyInput {
            crew_id: "crew-a".to_string(),
            pairing_id: 700,
            duty_seq: 1,
            duty: duty(0, 4, 0, -600),
        },
    ];

    let refs = acc_duty_refs_for_crew_duties(&rows, 1440, 60);

    assert_eq!(refs[0].pairing_id, 701);
    assert_eq!(refs[0].ref_tz_min, -60);
    assert_eq!(refs[1].pairing_id, 700);
    assert_eq!(refs[1].ref_tz_min, 0);
}

#[test]
fn crew_batch_uses_dynamic_stay_and_adjust_parameters() {
    let rows = [
        AccDutyInput {
            crew_id: "crew-a".to_string(),
            pairing_id: 700,
            duty_seq: 1,
            duty: duty(0, 4, 0, -600),
        },
        AccDutyInput {
            crew_id: "crew-a".to_string(),
            pairing_id: 701,
            duty_seq: 1,
            duty: AccDuty {
                start_utc: 14 * H,
                end_utc: 18 * H,
                first_flight_departure_utc: 14 * H,
                last_flight_arrival_utc: 18 * H,
                dep_tz_min: -600,
                arr_tz_min: -600,
            },
        },
    ];

    let refs = acc_duty_refs_for_crew_duties(&rows, 600, 30);

    assert_eq!(refs[1].ref_tz_min, -30);
    assert_eq!(refs[1].duty_end_ref_tz_min, -30);
}

#[test]
fn check_7500_ref_cli_emits_one_tsv_result_per_duty() {
    use std::io::Write;
    use std::process::{Command, Stdio};

    let input = concat!(
        "crew-a\t700\t1\t0\t14400\t0\t-600\n",
        "crew-a\t701\t1\t50400\t64800\t-600\t-600\n",
        "crew-b\t700\t1\t0\t14400\t300\t300\n",
    );
    let mut child = Command::new(env!("CARGO_BIN_EXE_check-7500-ref"))
        .args(["--stay-per-min", "600", "--adjust-min", "30", "--emit-tsv"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("start check-7500-ref");
    child
        .stdin
        .as_mut()
        .expect("stdin")
        .write_all(input.as_bytes())
        .expect("write stdin");
    let output = child.wait_with_output().expect("wait for check-7500-ref");

    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout).expect("utf8 stdout");
    assert_eq!(stdout.lines().count(), 3);
    assert!(stdout.lines().any(|line| line == "crew-a\t700\t1\t0\t0"));
    assert!(stdout
        .lines()
        .any(|line| line == "crew-a\t701\t1\t-30\t-30"));
    assert!(stdout
        .lines()
        .any(|line| line == "crew-b\t700\t1\t300\t300"));
}

#[test]
fn check_7500_ref_cli_accepts_flight_boundary_columns() {
    use std::io::Write;
    use std::process::{Command, Stdio};

    let input = concat!(
        "crew-a\t700\t1\t0\t21600\t3600\t18000\t0\t-600\n",
        "crew-a\t701\t1\t90000\t122400\t108000\t118800\t-600\t-600\n",
    );
    let mut child = Command::new(env!("CARGO_BIN_EXE_check-7500-ref"))
        .args(["--stay-per-min", "1440", "--adjust-min", "60", "--emit-tsv"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("start check-7500-ref");
    child
        .stdin
        .as_mut()
        .expect("stdin")
        .write_all(input.as_bytes())
        .expect("write stdin");
    let output = child.wait_with_output().expect("wait for check-7500-ref");

    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout).expect("utf8 stdout");
    assert!(stdout
        .lines()
        .any(|line| line == "crew-a\t701\t1\t-60\t-60"));
}
