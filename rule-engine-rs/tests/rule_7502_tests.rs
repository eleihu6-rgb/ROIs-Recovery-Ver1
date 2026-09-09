//! C++ → Rust migration-fidelity replica for rule 7502 (CALCULATION OF CREDIT HOURS).
//!
//! Source of truth: `crewrule-dev/RuleEngine/rule/rule7502/CalculateCreditHoursForCARSRule.cpp`
//! (`CalculateCredit`, lines 609-665) + `rule7502_gtest.cpp`.
//!
//! KEY CONTRACT — the 4:00 floor applies at DUTY level, not per segment:
//!   C++ `CalculateCredit(const Duty*, ...)`:
//!     totalFtCredit = SUM of CalculateCreditByFltHours(seg) for all segs in duty
//!     return max(minCHCredit, totalFtCredit, dpCredit)
//!
//! This means a 4-segment duty with segments [80, 65, 65, 85] = 295 total block
//! credits 295 (not 4 × 240 = 960 as per-segment floor would produce).

use rois_rule_engine::{
    credit_duty, credit_for_activity, credit_ground, f8_credit_ruleset, segment_ft_raw,
    CreditParam, DEFAULT_CREDIT_FLOOR_MINUTES,
};

const FLY: &CreditParam = &CreditParam {
    min_ch_minutes: -1,
    ft_ratio: 1.0,
    dp_ratio: -1.0,
};
const GND: &CreditParam = &CreditParam {
    min_ch_minutes: -1,
    ft_ratio: -1.0,
    dp_ratio: 0.5,
};
const DOLO: &CreditParam = &CreditParam {
    min_ch_minutes: 240,
    ft_ratio: -1.0,
    dp_ratio: -1.0,
};

#[test]
fn default_floor_is_four_hours() {
    assert_eq!(DEFAULT_CREDIT_FLOOR_MINUTES, 240);
}

// ── FLY duty: max(240 floor, totalBlock × 1.0) ──────────────────────────────────────
// Mirrors gtest Calculate_FlyWithFTRatio_ReturnsMaxOfMinCHAndFT (single seg, block 80):
//   max(240, 80) = 240
// and Calculate_FlyWithLongFlight_ReturnsFTCredit (single seg, block 300):
//   max(240, 300) = 300
#[test]
fn fly_duty_credit_floor_vs_block() {
    // Short single-segment duty (block 80 min) → floor 240 wins.
    assert_eq!(credit_duty(80, 0, FLY), 240);
    // Long single-segment duty (block 300 min) → block wins.
    assert_eq!(credit_duty(300, 0, FLY), 300);
    // Exactly at the floor.
    assert_eq!(credit_duty(240, 0, FLY), 240);
}

// ── KEY TEST: multi-segment duty applies floor ONCE at duty level ────────────────────
// Mirrors gtest Calculate_MultiSegmentPairing_ReturnsTotalFTCredit:
//   Pairing 62209: YEG-YLW(80) + YLW-YYC(65) + YYC-YLW(65) + YLW-YEG(85) = 295 min
//   Expected roster credit = 295 (max(240, 295) = 295, NOT 4×240=960)
#[test]
fn multi_segment_duty_applies_floor_once() {
    let segs = [80i64, 65, 65, 85]; // F8757, F8558, F8559, F8756
    let total_blk: i64 = segs.iter().sum(); // 295
    assert_eq!(total_blk, 295);

    // Correct: floor applied once at duty level.
    assert_eq!(credit_duty(total_blk, 0, FLY), 295);

    // Sanity: per-segment raw FT (no floor) sums to 295.
    let raw_sum: i64 = segs.iter().map(|&b| segment_ft_raw(b, FLY)).sum();
    assert_eq!(raw_sum, 295);
}

// ── Mirrors gtest Calculate_ShortFlight_ReturnsMinimumCH (single seg 60 min) ────────
#[test]
fn short_single_segment_returns_floor() {
    assert_eq!(credit_duty(60, 0, FLY), 240);
}

// ── GND duty: max(240 floor, dutyPeriod × 0.5) ──────────────────────────────────────
// Mirrors gtest Calculate_GNDWithDPRatio_ReturnsMaxOfMinAndDP:
//   DP 8h = 480 min, 480×0.5 = 240 = floor → 240
#[test]
fn ground_credit_floor_vs_dp_ratio() {
    // DP 10:00 (600 min) × 0.5 = 300 > 240 → 300.
    assert_eq!(credit_ground(600, GND), 300);
    // DP 8:00 (480 min) × 0.5 = 240 = floor → 240 (boundary, gtest value).
    assert_eq!(credit_ground(480, GND), 240);
    // DP 6:00 (360) × 0.5 = 180 < 240 → floor 240.
    assert_eq!(credit_ground(360, GND), 240);
    // C++ guards dp>0; zero DP → just the floor.
    assert_eq!(credit_ground(0, GND), 240);
}

// ── DO/LO/LEA/SBY: MinimumCH 4:00, no FT/DP → flat 240 ──────────────────────────────
// Mirrors gtest Calculate_VGDO_ReturnsMinimumCH and Calculate_DOAssignmentMatchesVGDO.
#[test]
fn dolo_credit_is_minimum_ch() {
    assert_eq!(
        credit_ground(9999, DOLO),
        240,
        "no DP ratio → only the 4:00 minimum CH"
    );
    let dolo6 = CreditParam {
        min_ch_minutes: 360,
        ft_ratio: -1.0,
        dp_ratio: -1.0,
    };
    assert_eq!(credit_ground(0, &dolo6), 360);
}

// ── max() picks the largest of the three dimensions ─────────────────────────────────
#[test]
fn max_of_three_dimensions() {
    let all = CreditParam {
        min_ch_minutes: 240,
        ft_ratio: 1.0,
        dp_ratio: 0.5,
    };
    // totalBlk 200, DP 500: max(240, 200, 250) = 250.
    assert_eq!(credit_duty(200, 500, &all), 250);
    // totalBlk 500, DP 500: max(240, 500, 250) = 500.
    assert_eq!(credit_duty(500, 500, &all), 500);
}

// ── truncation toward zero matches C++ static_cast<int> ─────────────────────────────
#[test]
fn truncates_toward_zero_like_cpp() {
    let half = CreditParam {
        min_ch_minutes: 0,
        ft_ratio: 0.5,
        dp_ratio: -1.0,
    };
    // block 101 × 0.5 = 50.5 → truncates to 50 (floor 0 → 50 wins).
    assert_eq!(credit_duty(101, 0, &half), 50);
}

// ── segment_ft_raw: no floor, just block × ratio ─────────────────────────────────────
#[test]
fn segment_ft_raw_has_no_floor() {
    // Short segment 80 min: raw = 80×1.0 = 80 (no 240 floor).
    assert_eq!(segment_ft_raw(80, FLY), 80);
    // No FT ratio configured → 0.
    assert_eq!(segment_ft_raw(300, GND), 0);
}

// ── ruleset matching by assignment group ─────────────────────────────────────────────
// Mirrors gtest Calculate_MultipleRosters_ReturnsCorrectCreditForEach.
#[test]
fn ruleset_matches_by_assignment_group() {
    let rules = f8_credit_ruleset(1.0, 0.5, 240);
    // FLY short single-segment duty (80 min) → floor 240.
    assert_eq!(credit_for_activity("FLY", 80, 0, &rules), Some(240));
    // FLY single long-sector duty (420 min) → block.
    assert_eq!(credit_for_activity("FLY", 420, 0, &rules), Some(420));
    // FLY multi-segment total 295 → duty-level max(240, 295) = 295.
    assert_eq!(credit_for_activity("FLY", 295, 0, &rules), Some(295));
    // GND with DP 12:00 (720) × 0.5 = 360.
    assert_eq!(credit_for_activity("GND", 0, 720, &rules), Some(360));
    // SBY / DO → flat 240.
    assert_eq!(credit_for_activity("SBY", 0, 0, &rules), Some(240));
    assert_eq!(credit_for_activity("DO", 0, 0, &rules), Some(240));
    // Unmatched group → None.
    assert_eq!(credit_for_activity("XYZ", 999, 999, &rules), None);
}

// ── live F8 assignment CODES map to the right param class ───────────────────────────
#[test]
fn live_assignment_codes_map_correctly() {
    let rules = f8_credit_ruleset(1.0, 0.5, 240);
    // Off / leave / standby → flat 4:00 MinCH.
    for off in ["DO", "VAC", "ILL", "RES"] {
        assert_eq!(
            credit_for_activity(off, 0, 1440, &rules),
            Some(240),
            "{off} (24h span) must credit a flat 4:00, not dutyPeriod×0.5",
        );
    }
    // Real ground duty → DP×0.5 with the 4:00 floor.
    assert_eq!(credit_for_activity("GRD", 0, 600, &rules), Some(300)); // 10h×0.5=5h
    assert_eq!(credit_for_activity("SIM", 0, 370, &rules), Some(240)); // 185 < floor
    assert_eq!(credit_for_activity("DHD", 0, 85, &rules), Some(240)); // 42 < floor
}
