//! Orchestrator tests for `rois_rule_engine::Engine` (pure-Rust, no PyO3).
//!
//! TDD: these tests are written first. They will fail to compile until
//! `Engine` + `EngineParams` exist in the core crate.

use rois_rule_engine::{Engine, EngineParams};

/// Empty engine: no pairings, no bands → check_line returns Ok([]).
/// Also asserts n_rules() == 0.
#[test]
fn empty_engine_returns_empty() {
    let params = EngineParams {
        crew_fixed_pairings: vec![vec![]],
        ..Default::default()
    };
    let engine = Engine::new(params).expect("empty engine should construct");
    assert_eq!(engine.n_rules(), 0);
    let result = engine
        .check_line(0, &[])
        .expect("check_line on empty should succeed");
    assert!(
        result.is_empty(),
        "expected no violations, got {:?}",
        result
    );
}

/// 8002 block breach fires exactly one "8002|" string.
/// Two pairings on the same UTC day (start_utc 0 and 3600, both day_ord 0).
/// Each has 4000 blk_min; sum = 8000 > 6720 (= 112.0 * 60).
#[test]
fn block_breach_fires_8002() {
    let params = EngineParams {
        pairing_start_utc: vec![0, 3600],
        pairing_end_utc: vec![1800, 5400],
        pairing_blk_min: vec![4000, 4000],
        crew_fixed_pairings: vec![vec![]],
        block_bands: vec![(28, 112.0 * 60.0)],
        pairing_is_fly: vec![false, false],
        pairing_label: vec!["P0".to_string(), "P1".to_string()],
        ..Default::default()
    };
    let engine = Engine::new(params).expect("engine should construct");

    // Two pairings together breach 112h in 28-day window.
    let result = engine
        .check_line(0, &[0, 1])
        .expect("check_line should succeed");
    assert!(
        result.iter().any(|s| s.starts_with("8002|")),
        "expected an 8002 violation, got {:?}",
        result
    );
    // All returned strings must be 8002 (no other rule is enabled).
    assert!(
        result.iter().all(|s| s.starts_with("8002|")),
        "expected only 8002 violations, got {:?}",
        result
    );

    // Single pairing 4000 < 6720 → no breach.
    let no_breach = engine
        .check_line(0, &[0])
        .expect("check_line single should succeed");
    assert!(
        !no_breach.iter().any(|s| s.starts_with("8002|")),
        "single pairing should not breach 8002, got {:?}",
        no_breach
    );
}

/// Out-of-range crew_idx → Err containing "crew_idx".
#[test]
fn out_of_range_crew_idx_is_err() {
    let params = EngineParams {
        crew_fixed_pairings: vec![vec![]],
        ..Default::default()
    };
    let engine = Engine::new(params).expect("engine should construct");
    let err = engine
        .check_line(5, &[])
        .expect_err("crew_idx 5 on 1-crew engine should Err");
    assert!(
        err.contains("crew_idx"),
        "error message should mention crew_idx, got: {err}"
    );
}

/// Out-of-range pairing index → Err containing "pairing index".
#[test]
fn out_of_range_pairing_index_is_err() {
    let params = EngineParams {
        pairing_start_utc: vec![0],
        pairing_end_utc: vec![3600],
        pairing_blk_min: vec![100],
        crew_fixed_pairings: vec![vec![]],
        ..Default::default()
    };
    let engine = Engine::new(params).expect("engine should construct");
    let err = engine
        .check_line(0, &[99])
        .expect_err("pairing index 99 out of range should Err");
    assert!(
        err.contains("pairing index"),
        "error message should mention pairing index, got: {err}"
    );
}

/// 8056 spacing breach fires when gap between two FLY duties < spacing_hours.
/// Pairing 0 ends at 3600s; pairing 1 starts at 3600 + 12*3600 = 46800s.
/// Gap = 12h < 13h → violation.
#[test]
fn spacing_breach_fires_8056() {
    let gap_secs: i64 = 12 * 3600; // 12 hours, less than 13h limit
    let p0_end: i64 = 3_600;
    let p1_start: i64 = p0_end + gap_secs;
    let params = EngineParams {
        pairing_start_utc: vec![0, p1_start],
        pairing_end_utc: vec![p0_end, p1_start + 3600],
        pairing_blk_min: vec![60, 60],
        crew_fixed_pairings: vec![vec![]],
        pairing_is_fly: vec![true, true],
        pairing_label: vec!["F0".to_string(), "F1".to_string()],
        spacing_hours: Some(13.0),
        ..Default::default()
    };
    let engine = Engine::new(params).expect("engine should construct");
    let result = engine
        .check_line(0, &[0, 1])
        .expect("check_line should succeed");
    assert!(
        result.iter().any(|s| s.starts_with("8056|")),
        "expected an 8056 violation for gap < 13h, got {:?}",
        result
    );
}
