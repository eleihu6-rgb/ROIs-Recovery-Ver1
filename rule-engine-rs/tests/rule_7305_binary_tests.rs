//! Process-level contract tests for the Rule 7305 Live/Scenario batch binary.

use std::io::Write;
use std::process::{Command, Output, Stdio};

const VALID_INPUT: &str = "\
C\t0\t86400\teditor
R\t0\tYEG\tCA\tCAPT\t320\tTEAM-A\tFLY\tFLT\tLABEL-A\tATTR-A\tT\t1\t2
Q\tC1\tBASE\tYEG\t0\t-1
Q\tC1\tRANK\tCA\t0\t-1
Q\tC1\tPOSITION\tCAPT\t0\t-1
Q\tC1\tFLEET\t320\t0\t-1
T\tC1\tTEAM-A
G\tFLT\tFLY
D\tC1\t101\t101\t0\t3600\t7200\t-360\tFLT\tFLY\tATTR-A\tLABEL-A\tN\tY\t0
D\tC1\t102\t102\t10800\t14400\t18000\t-360\tFLT\tFLY\tATTR-A\tLABEL-A\tN\tY\t0
";

fn run(input: &str) -> Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_check-7305"))
        .arg("--emit-tsv")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn check-7305");
    child
        .stdin
        .as_mut()
        .expect("check-7305 stdin")
        .write_all(input.as_bytes())
        .expect("write check-7305 input");
    child.wait_with_output().expect("wait for check-7305")
}

#[test]
fn valid_structured_tsv_preserves_exact_r_q_p_t_g_d_shape_and_v_output() {
    let output = run(VALID_INPUT);
    assert!(
        output.status.success(),
        "stderr={}",
        String::from_utf8_lossy(&output.stderr)
    );

    let stdout = String::from_utf8(output.stdout).expect("UTF-8 stdout");
    assert_eq!(
        stdout.trim(),
        "V\tC1\t0\t101\t0\t18000\t2\t1\t2\tThe number of consecutive rosters (2) [1969-12-31, 1969-12-31] exceeds the threshold (1)."
    );
}

#[test]
fn malformed_r_and_d_rows_exit_nonzero() {
    let malformed_r = "\
C\t0\t86400\teditor
R\t0\t*\t*\t*\t*\t*\t*\t*\t*\t*\t*\t\t\tT\t\t1
";
    let r_output = run(malformed_r);
    assert!(!r_output.status.success(), "malformed R must fail");
    assert!(
        String::from_utf8_lossy(&r_output.stderr).contains("malformed tag"),
        "stderr={}",
        String::from_utf8_lossy(&r_output.stderr)
    );

    let extra_r_cell = "\
C\t0\t86400\teditor
R\t0\t*\t*\t*\t*\t*\t*\t*\t*\t*\tT\t1\t1\textra
";
    let extra_output = run(extra_r_cell);
    assert!(
        !extra_output.status.success(),
        "R rows with extra cells must fail"
    );
    assert!(
        String::from_utf8_lossy(&extra_output.stderr).contains("malformed tag"),
        "stderr={}",
        String::from_utf8_lossy(&extra_output.stderr)
    );

    let malformed_d = "\
C\t0\t86400\teditor
R\t0\tYEG\tCA\tCAPT\t320\tTEAM-A\tFLY\tFLT\tLABEL-A\tATTR-A\tT\t1\t2
D\tC1\t101\t101\t0\t3600\t7200\t-360\tFLT\tFLY\tATTR\tLABEL\tN\tY
";
    let d_output = run(malformed_d);
    assert!(!d_output.status.success(), "malformed D must fail");
    assert!(
        String::from_utf8_lossy(&d_output.stderr).contains("malformed tag"),
        "stderr={}",
        String::from_utf8_lossy(&d_output.stderr)
    );
}

fn run_per_crew(input: &str) -> Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_check-7305"))
        .args(["--emit-tsv", "--per-crew-window"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn check-7305 --per-crew-window");
    child
        .stdin
        .as_mut()
        .expect("check-7305 stdin")
        .write_all(input.as_bytes())
        .expect("write check-7305 input");
    child.wait_with_output().expect("wait for check-7305")
}

#[test]
fn per_crew_window_does_not_require_c_and_scopes_each_crew() {
    let input = "\
R\t0\tYEG\tCA\tCAPT\t320\tTEAM-A\tFLY\tFLT\tLABEL-A\tATTR-A\tT\t1\t2
Q\tC1\tBASE\tYEG\t0\t-1
Q\tC1\tRANK\tCA\t0\t-1
Q\tC1\tPOSITION\tCAPT\t0\t-1
Q\tC1\tFLEET\t320\t0\t-1
T\tC1\tTEAM-A
Q\tC2\tBASE\tYEG\t0\t-1
Q\tC2\tRANK\tCA\t0\t-1
Q\tC2\tPOSITION\tCAPT\t0\t-1
Q\tC2\tFLEET\t320\t0\t-1
T\tC2\tTEAM-A
G\tFLT\tFLY
D\tC1\t101\t101\t0\t3600\t7200\t-360\tFLT\tFLY\tATTR-A\tLABEL-A\tN\tY\t0
D\tC1\t102\t102\t10800\t14400\t18000\t-360\tFLT\tFLY\tATTR-A\tLABEL-A\tN\tY\t0
D\tC2\t201\t201\t172800\t176400\t180000\t-360\tFLT\tFLY\tATTR-A\tLABEL-A\tN\tY\t0
D\tC2\t202\t202\t183600\t187200\t190800\t-360\tFLT\tFLY\tATTR-A\tLABEL-A\tN\tY\t0
";
    let output = run_per_crew(input);
    assert!(
        output.status.success(),
        "stderr={}",
        String::from_utf8_lossy(&output.stderr)
    );
    let stdout = String::from_utf8(output.stdout).expect("UTF-8 stdout");
    assert!(
        stdout.contains("V\tC1\t0\t101\t0\t18000\t2\t1\t2\t"),
        "stdout={stdout}"
    );
    assert!(
        stdout.contains("V\tC2\t0\t201\t172800\t190800\t2\t1\t2\t"),
        "stdout={stdout}"
    );
}

#[test]
fn per_crew_window_ignores_global_c_when_present() {
    // Global C covers day range [0,1]. C1's base qual is effective only for days [2,4),
    // so with the global window the crew would be OUT of scope (no violations).
    // With --per-crew-window the crew's own window is day [2,2] -> in scope -> violation fires.
    let input = "\
C\t0\t86400\teditor
R\t0\tYEG\tCA\tCAPT\t320\tTEAM-A\tFLY\tFLT\tLABEL-A\tATTR-A\tT\t1\t2
Q\tC1\tBASE\tYEG\t2\t4
Q\tC1\tRANK\tCA\t0\t-1
Q\tC1\tPOSITION\tCAPT\t0\t-1
Q\tC1\tFLEET\t320\t0\t-1
T\tC1\tTEAM-A
G\tFLT\tFLY
D\tC1\t101\t101\t172800\t176400\t180000\t-360\tFLT\tFLY\tATTR-A\tLABEL-A\tN\tY\t0
D\tC1\t102\t102\t183600\t187200\t190800\t-360\tFLT\tFLY\tATTR-A\tLABEL-A\tN\tY\t0
";
    let output = run_per_crew(input);
    assert!(
        output.status.success(),
        "stderr={}",
        String::from_utf8_lossy(&output.stderr)
    );
    let stdout = String::from_utf8(output.stdout).expect("UTF-8 stdout");
    assert_eq!(
        stdout.trim(),
        "V\tC1\t0\t101\t172800\t190800\t2\t1\t2\tThe number of consecutive rosters (2) [1970-01-02, 1970-01-02] exceeds the threshold (1)."
    );
}

#[test]
fn missing_c_without_flag_still_fails() {
    let input = "\
R\t0\tYEG\tCA\tCAPT\t320\tTEAM-A\tFLY\tFLT\tLABEL-A\tATTR-A\tT\t1\t2
D\tC1\t101\t101\t0\t3600\t7200\t-360\tFLT\tFLY\tATTR-A\tLABEL-A\tN\tY\t0
";
    let output = run(input); // existing helper: --emit-tsv only, no flag
    assert!(
        !output.status.success(),
        "C must still be required without the flag"
    );
    assert!(
        String::from_utf8_lossy(&output.stderr).contains("missing C checked window row"),
        "stderr={}",
        String::from_utf8_lossy(&output.stderr)
    );
}
