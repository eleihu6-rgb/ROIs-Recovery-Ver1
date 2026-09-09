//! Integration test for the `ruletool` binary: verifies the crew-manday credit model
//! (flying = gz credited minutes; ground = imported act/sch credited minutes only, no
//! assignment fixed_credit_min supplement), the daily→monthly→yearly rollup, and the
//! 8002 monthly credit-band proration.

use std::io::Write;
use std::process::{Command, Stdio};

fn run(tsv: &str) -> String {
    let mut child = Command::new(env!("CARGO_BIN_EXE_ruletool"))
        .args(["--band-min", "3900", "--band-max", "4500"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn ruletool");
    child
        .stdin
        .take()
        .unwrap()
        .write_all(tsv.as_bytes())
        .unwrap();
    let out = child.wait_with_output().expect("wait");
    assert!(out.status.success(), "ruletool exited non-zero");
    String::from_utf8(out.stdout).unwrap()
}

fn rows(stdout: &str, grain: &str) -> Vec<Vec<String>> {
    stdout
        .lines()
        .map(|l| l.split('\t').map(|s| s.to_string()).collect::<Vec<_>>())
        .filter(|f| f[0] == grain)
        .collect()
}

#[test]
fn credit_model_rollup_and_band() {
    // crew A (FD, division P):
    //   06-01: a flight credited 360 + a ground duty with no roster credit (a2 fixed ignored) → blh 360, credit 360
    //   06-02: a ground duty without fixed credit → credit 0
    //   06-03: a day off (no fixed, pct 0) → credit 0, is_day_off
    let tsv = "\
A\tP\t2026-06-01\tFLY\t360\t-1\t0\t
A\tP\t2026-06-01\tGND\t600\t240\t0\t
A\tP\t2026-06-02\tGND\t720\t-1\t0.5\t
A\tP\t2026-06-03\tGND\t0\t-1\t0\tDO";
    let out = run(tsv);

    let d = rows(&out, "D");
    let d1 = d.iter().find(|r| r[3] == "2026-06-01").unwrap();
    assert_eq!(d1[4], "360", "06-01 blh = flight block");
    assert_eq!(
        d1[5], "360",
        "06-01 credit = flight only; ground fixed credit not supplemented"
    );
    assert_eq!(d1[6], "0", "06-01 is_day_off");
    let d2 = d.iter().find(|r| r[3] == "2026-06-02").unwrap();
    assert_eq!(d2[5], "0", "06-02 credit = 0 without fixed credit");
    assert_eq!(d2[4], "0", "06-02 blh = 0 (no flying)");
    let d3 = d.iter().find(|r| r[3] == "2026-06-03").unwrap();
    assert_eq!(d3[5], "0", "06-03 day off credit = 0");
    assert_eq!(d3[6], "1", "06-03 is_day_off flag");

    // monthly: M crew div ym blh credit do al leave band
    let m = &rows(&out, "M")[0];
    assert_eq!(m[4], "360", "month blh");
    assert_eq!(m[5], "360", "month credit = 360 + 0 + 0");
    assert_eq!(m[6], "1", "month day-off count");
    // active_days = 3 / 30 ⇒ prorated band = round(3900/4500 × 0.1) = [390, 450]; credit 360 < 390 ⇒ UNDER
    assert_eq!(
        m[9], "UNDER",
        "8002 band: monthly credit below prorated min"
    );

    // yearly
    let y = &rows(&out, "Y")[0];
    assert_eq!(y[5], "360", "year credit");
    assert_eq!(y[6], "1", "year day-off count");
}

#[test]
fn cabin_crew_routes_leave_flag() {
    // division != 'P' ⇒ cabin crew; ILL drives the leave flag, VAC the al flag.
    let tsv = "\
B\tC\t2026-06-01\tGND\t0\t-1\t0\tILL
B\tC\t2026-06-02\tGND\t0\t-1\t0\tVAC";
    let out = run(tsv);
    let d = rows(&out, "D");
    let ill = d.iter().find(|r| r[3] == "2026-06-01").unwrap();
    assert_eq!(ill[8], "1", "ILL → is_leave");
    let vac = d.iter().find(|r| r[3] == "2026-06-02").unwrap();
    assert_eq!(vac[7], "1", "VAC → is_al");
}

#[test]
fn ground_credit_prefers_roster_actual_then_scheduled_else_zero() {
    let tsv = "\
A\tP\t2026-06-01\tGND\t600\t240\t0\t\t155\t300
A\tP\t2026-06-02\tGND\t600\t240\t0\t\t\t180
A\tP\t2026-06-03\tGND\t600\t240\t0\t";
    let out = run(tsv);
    let d = rows(&out, "D");

    let d1 = d.iter().find(|r| r[3] == "2026-06-01").unwrap();
    assert_eq!(d1[5], "155", "actual roster credit wins");

    let d2 = d.iter().find(|r| r[3] == "2026-06-02").unwrap();
    assert_eq!(
        d2[5], "180",
        "scheduled roster credit wins when actual missing"
    );

    let d3 = d.iter().find(|r| r[3] == "2026-06-03").unwrap();
    assert_eq!(
        d3[5], "0",
        "ground with no roster credit = 0 (assignment fixed_credit_min not supplemented)"
    );
}

#[test]
fn ground_dp_min_is_aggregated_separately_from_credit() {
    let out = run("A\tP\t2026-06-01\tGND\t600\t-1\t0\t\t100\t120\t75\n");
    let d = rows(&out, "D");
    assert_eq!(d[0][5], "100", "credit still prefers actual credit");
    assert_eq!(d[0][9], "75", "dp_min is emitted as the daily DP metric");
}

#[test]
fn monthly_credit_follows_each_duty_start_month() {
    let tsv = "\
A\tP\t2026-07-31\tFLY\t600\t-1\t0\t
A\tP\t2026-08-01\tFLY\t900\t-1\t0\t";
    let out = run(tsv);
    let months = rows(&out, "M");
    let july = months.iter().find(|r| r[3] == "2026-07").unwrap();
    let august = months.iter().find(|r| r[3] == "2026-08").unwrap();

    assert_eq!(
        july[5], "600",
        "July gets only the duty that starts in July"
    );
    assert_eq!(
        august[5], "900",
        "August gets only the duty that starts in August"
    );
}
