use rois_rule_engine::{check_avoid_co_pairing, Application, Rule7509Member, Rule7509Param};

fn param(a: &str, b: &str, eff: &str, exp: &str) -> Rule7509Param {
    Rule7509Param::from_cells(&[a, b, eff, exp]).expect("valid 7509 parameter row")
}

fn member(
    flight_id: i64,
    crew_id: &str,
    pairing_id: i64,
    start: i64,
    end: i64,
    source_is_pa: bool,
) -> Rule7509Member {
    Rule7509Member {
        flight_id,
        crew_id: crew_id.to_string(),
        pairing_id,
        pairing_start_utc: start,
        pairing_end_utc: end,
        source_is_pa,
    }
}

#[test]
fn parameter_rows_normalize_symmetric_ids_and_ignore_self_pairs() {
    let row = param(" A ", " B ", "2026-08-01", "2026-08-31");
    assert_eq!(row.crew_a, "A");
    assert_eq!(row.crew_b, "B");
    assert!(Rule7509Param::from_cells(&["C", " C ", "2026-08-01", "2026-08-31"]).is_none());
}

#[test]
fn parameter_rows_reject_impossible_calendar_dates() {
    assert!(Rule7509Param::from_cells(&["A", "B", "2026-02-31", "2026-03-01"]).is_none());
    assert!(Rule7509Param::from_cells(&["A", "B", "2024-02-29", "2024-03-01"]).is_some());
}

#[test]
fn inclusive_effective_and_expiry_dates_include_boundary_pairing_spans() {
    let rule = param("A", "B", "2026-08-10", "2026-08-20");
    let members = vec![
        // Pairing 1 ends exactly at Eff Date 00:00:00.
        member(100, "A", 1, 1_786_311_600, 1_786_320_000, false),
        member(100, "B", 2, 1_786_311_600, 1_786_320_000, false),
        // Pairing 3 starts exactly at Exp Date 23:59:59.
        member(200, "A", 3, 1_787_270_399, 1_787_274_000, false),
        member(200, "B", 4, 1_787_270_399, 1_787_274_000, false),
    ];
    let violations = check_avoid_co_pairing(&[rule], &members, Application::Editor);
    assert_eq!(violations.len(), 4);
}

#[test]
fn no_overlap_and_reversed_ranges_do_not_violate() {
    let rule = param("A", "B", "2026-08-10", "2026-08-20");
    let members = vec![
        member(100, "A", 1, 1_786_319_999, 1_786_319_999, false),
        member(100, "B", 2, 1_786_319_999, 1_786_319_999, false),
    ];
    assert!(check_avoid_co_pairing(&[rule], &members, Application::Editor).is_empty());
    assert!(Rule7509Param::from_cells(&["A", "B", "2026-08-20", "2026-08-10"]).is_none());
}

#[test]
fn same_physical_flight_across_pairings_checks_all_members_and_deduplicates_rows() {
    let rule = param("A", "B", "2026-08-01", "2026-08-31");
    let members = vec![
        member(9001, "A", 101, 1_785_600_000, 1_785_607_200, false),
        member(9001, "A", 101, 1_785_600_000, 1_785_607_200, false),
        member(9001, "B", 202, 1_785_600_000, 1_785_607_200, false),
        member(9001, "C", 303, 1_785_600_000, 1_785_607_200, false),
    ];
    let violations = check_avoid_co_pairing(&[rule], &members, Application::Editor);
    assert_eq!(violations.len(), 2);
    assert!(violations.iter().any(|v| {
        v.crew_id == "A" && v.paired_crew_id == "B" && v.pairing_id == 101 && v.flight_id == 9001
    }));
    assert!(violations.iter().any(|v| {
        v.crew_id == "B" && v.paired_crew_id == "A" && v.pairing_id == 202 && v.flight_id == 9001
    }));
}

#[test]
fn multiple_parameter_rows_are_evaluated_independently() {
    let rules = vec![
        param("A", "B", "2026-08-01", "2026-08-31"),
        param("B", "C", "2026-08-01", "2026-08-31"),
    ];
    let members = vec![
        member(9001, "A", 101, 1_785_600_000, 1_785_607_200, false),
        member(9001, "B", 202, 1_785_600_000, 1_785_607_200, false),
        member(9001, "C", 303, 1_785_600_000, 1_785_607_200, false),
    ];
    let violations = check_avoid_co_pairing(&rules, &members, Application::Editor);
    assert_eq!(violations.len(), 4);
}

#[test]
fn optimizer_suppresses_only_pa_only_pairings() {
    let rule = param("A", "B", "2026-08-01", "2026-08-31");
    let pa_only = vec![
        member(9001, "A", 101, 1_785_600_000, 1_785_607_200, true),
        member(9001, "B", 202, 1_785_600_000, 1_785_607_200, true),
    ];
    assert!(check_avoid_co_pairing(&[rule.clone()], &pa_only, Application::Optimizer).is_empty());

    let pa_plus_candidate = vec![
        member(9001, "A", 101, 1_785_600_000, 1_785_607_200, true),
        member(9001, "B", 202, 1_785_600_000, 1_785_607_200, false),
    ];
    assert_eq!(
        check_avoid_co_pairing(&[rule], &pa_plus_candidate, Application::Optimizer).len(),
        2
    );
}

#[test]
fn check_7509_cli_emits_both_affected_members_for_a_shared_flight() {
    use std::io::Write;
    use std::process::{Command, Stdio};

    let input = [
        "R\t0\tA\tB\t2026-08-01\t2026-08-31",
        "M\t9001\tA\t101\t1785600000\t1785607200\tN",
        "M\t9001\tB\t202\t1785600000\t1785607200\tN",
        "",
    ]
    .join("\n");
    let mut child = Command::new(env!("CARGO_BIN_EXE_check-7509"))
        .arg("--emit-tsv")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn check-7509");
    child
        .stdin
        .as_mut()
        .expect("stdin")
        .write_all(input.as_bytes())
        .expect("write input");
    drop(child.stdin.take());
    let output = child.wait_with_output().expect("check-7509 output");
    assert!(
        output.status.success(),
        "stderr={}",
        String::from_utf8_lossy(&output.stderr)
    );
    let stdout = String::from_utf8(output.stdout).expect("utf8 stdout");
    assert!(
        stdout.contains("V\t0\tA\tB\t101\t9001"),
        "stdout={stdout:?}"
    );
    assert!(
        stdout.contains("V\t0\tB\tA\t202\t9001"),
        "stdout={stdout:?}"
    );
}
