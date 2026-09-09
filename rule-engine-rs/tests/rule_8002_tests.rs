//! C++ → Rust migration-fidelity replica for rule 8002 (MAX_CUM_BLOCK + CREDIT BAND).
//!
//! Source of truth: `crewrule-dev/RuleTest/rule8002_gtest.cpp`
//!
//! Part 1 — MAX_CUM_BLOCK (rolling block hours):
//!   Rule: cumulative block hours (BH) must not exceed 112:00 in any rolling 28 CD window.
//!   Fixture: 15 realistic fly pairings (regional / red-eye / long-haul / multi-sector / DHD),
//!            26 segments, block minutes summing to 6715 (111:55).
//!   The gtest's two assertions:
//!   - 6715 min (111:55) in 28 CD  → legal,  no 8002 violation.
//!   - 6725 min (112:05, last seg +10) → illegal, "block hours" violation.
//!
//! Part 2 — CREDIT BAND (8002/006, Type=CH):
//!   Source: `rule8002.cpp:657-684`. Violates if totalCredit > Max || totalCredit < Min.
//!   The 4th param row of 8002/006: `1 | CM | Y | 75:00 | 65:00 | CH`
//!   → band [65:00, 75:00] = [3900, 4500] minutes.

use rois_rule_engine::{
    accumulate_daily, check_credit_band, check_max_cum_block, days_in_month, flight_credit,
    ground_credit, parse_date_ord,
};

/// (departure local date, segment block minutes) — the 26 segments of the gtest fixture.
const SEGMENTS: &[(&str, f64)] = &[
    ("2026-06-01", 100.0), // P1  HKG-TPE
    ("2026-06-02", 68.0),
    ("2026-06-02", 72.0),  // P2  HKG-CAN-HKG
    ("2026-06-03", 215.0), // P3  HKG-ICN (red-eye)
    ("2026-06-04", 175.0),
    ("2026-06-05", 195.0), // P4  HKG-BKK / BKK-HKG
    ("2026-06-06", 514.0),
    ("2026-06-07", 90.0),
    ("2026-06-08", 590.0), // P5 HKG-SYD-MEL-HKG
    ("2026-06-09", 98.0),  // P6  HKG-TPE
    ("2026-06-10", 235.0),
    ("2026-06-11", 245.0), // P7  HKG-NRT / NRT-HKG
    ("2026-06-12", 168.0), // P8  HKG-MNL
    ("2026-06-13", 470.0),
    ("2026-06-14", 455.0),
    ("2026-06-15", 320.0), // P9 HKG-DXB-SIN-HKG(DHD)
    ("2026-06-16", 70.0),  // P10 HKG-CAN
    ("2026-06-17", 210.0),
    ("2026-06-18", 208.0), // P11 HKG-ICN / ICN-HKG
    ("2026-06-19", 102.0), // P12 HKG-TPE
    ("2026-06-20", 780.0),
    ("2026-06-21", 600.0),
    ("2026-06-22", 185.0), // P13 HKG-LHR-BKK-HKG
    ("2026-06-24", 72.0),  // P14 CAN-HKG
    ("2026-06-25", 240.0),
    ("2026-06-26", 238.0), // P15 HKG-SIN / SIN-HKG
];

const LIMIT_28D_BH_MINUTES: f64 = 112.0 * 60.0; // 6720
const WINDOW_DAYS: i64 = 28;

fn daily(segments: &[(&str, f64)]) -> std::collections::BTreeMap<i64, f64> {
    accumulate_daily(
        segments
            .iter()
            .map(|(d, m)| (parse_date_ord(d).expect("valid date"), *m)),
    )
}

#[test]
fn fixture_sums_to_6715_minutes() {
    let total: f64 = SEGMENTS.iter().map(|(_, m)| *m).sum();
    assert_eq!(
        total, 6715.0,
        "gtest fixture total BH must be 111:55 (6715 min)"
    );
}

#[test]
fn rolling_bh_111h55m_within_112h_limit_passes() {
    // C++ TwentyEightDayRollingBh111h55mWithin112hLimitPasses
    let d = daily(SEGMENTS);
    let v = check_max_cum_block("8002HX1", &d, WINDOW_DAYS, LIMIT_28D_BH_MINUTES);
    assert!(
        v.is_none(),
        "111:55 in 28 CD must NOT trigger rule 8002, got {:?}",
        v
    );
}

#[test]
fn rolling_bh_112h05m_exceeds_112h_limit_fails() {
    // C++ TwentyEightDayRollingBh112h05mExceeds112hLimitFails: last segment +10 → 6725.
    let mut segs = SEGMENTS.to_vec();
    let last = segs.last_mut().unwrap();
    last.1 += 10.0; // SIN-HKG 238 → 248
    let total: f64 = segs.iter().map(|(_, m)| *m).sum();
    assert_eq!(
        total, 6725.0,
        "over-limit fixture total must be 112:05 (6725 min)"
    );

    let d = daily(&segs);
    let v = check_max_cum_block("8002HX2", &d, WINDOW_DAYS, LIMIT_28D_BH_MINUTES)
        .expect("112:05 in 28 CD MUST trigger rule 8002");
    assert_eq!(v.actual_minutes, 6725.0);
    assert!(v.actual_minutes > LIMIT_28D_BH_MINUTES);
    assert_eq!(v.window_days, 28);
}

#[test]
fn boundary_exactly_at_limit_is_legal() {
    // Strict ">" semantics: exactly 112:00 (6720) is legal (matches C++ gtest direction).
    let d = accumulate_daily([(parse_date_ord("2026-06-01").unwrap(), 6720.0)]);
    assert!(check_max_cum_block("c", &d, WINDOW_DAYS, LIMIT_28D_BH_MINUTES).is_none());
    let d2 = accumulate_daily([(parse_date_ord("2026-06-01").unwrap(), 6721.0)]);
    assert!(check_max_cum_block("c", &d2, WINDOW_DAYS, LIMIT_28D_BH_MINUTES).is_some());
}

// ── Part 2: Credit Band (8002/006, Type=CH) ─────────────────────────────────

const CREDIT_MIN: i64 = 65 * 60; // 65:00 = 3900
const CREDIT_MAX: i64 = 75 * 60; // 75:00 = 4500

#[test]
fn credit_inside_band_is_legal() {
    assert!(check_credit_band("c", "2026-06", 70 * 60, CREDIT_MIN, CREDIT_MAX, 1.0).is_none());
    // Boundaries are legal: exactly 75:00 is not > 75:00; exactly 65:00 is not < 65:00.
    assert!(check_credit_band("c", "2026-06", CREDIT_MAX, CREDIT_MIN, CREDIT_MAX, 1.0).is_none());
    assert!(check_credit_band("c", "2026-06", CREDIT_MIN, CREDIT_MIN, CREDIT_MAX, 1.0).is_none());
}

#[test]
fn credit_above_max_fires_over_warning() {
    let v =
        check_credit_band("c", "2026-06", 80 * 60, CREDIT_MIN, CREDIT_MAX, 1.0).expect("80h > 75h");
    assert!(v.over);
    assert_eq!(v.max_minutes, CREDIT_MAX);
    assert!(v.message().contains("exceeds"));
    assert!(v.message().contains("75:00"));
}

#[test]
fn credit_below_min_fires_under_warning() {
    let v =
        check_credit_band("c", "2026-06", 60 * 60, CREDIT_MIN, CREDIT_MAX, 1.0).expect("60h < 65h");
    assert!(!v.over);
    assert_eq!(v.min_minutes, CREDIT_MIN);
    assert!(v.message().contains("below"));
    assert!(v.message().contains("65:00"));
}

#[test]
fn credit_proration_scales_the_band() {
    // Half-available month → band [32:30, 37:30] = [1950, 2250].
    assert!(check_credit_band("c", "2026-06", 2000, CREDIT_MIN, CREDIT_MAX, 0.5).is_none());
    let over =
        check_credit_band("c", "2026-06", 2300, CREDIT_MIN, CREDIT_MAX, 0.5).expect("2300 > 2250");
    assert!(over.over);
    assert_eq!(over.max_minutes, 2250);
    let under =
        check_credit_band("c", "2026-06", 1900, CREDIT_MIN, CREDIT_MAX, 0.5).expect("1900 < 1950");
    assert!(!under.over);
    assert_eq!(under.min_minutes, 1950);
    // factor clamps to [0,1].
    assert_eq!(
        check_credit_band("c", "2026-06", 4600, CREDIT_MIN, CREDIT_MAX, 2.0)
            .unwrap()
            .max_minutes,
        CREDIT_MAX
    );
}

#[test]
fn credit_data_driven_activity_credit() {
    // Ground: a FIXED credit (>0) wins, flat, regardless of duration (VAC/ASBY/SIM = 4:00).
    assert_eq!(ground_credit(Some(240)), 240); // 24h span → flat 4:00
    assert_eq!(ground_credit(Some(420)), 420); // FC = 7:00
    assert_eq!(ground_credit(None), 0); // missing fixed credit → 0
    assert_eq!(ground_credit(Some(0)), 0); // explicit zero → 0
                                           // Flight: block × ft (FLT ft 1.0).
    assert_eq!(flight_credit(300, 1.0), 300);
    assert_eq!(flight_credit(150, 1.0), 150);
}

#[test]
fn credit_crew_379_off_and_vac_is_twenty_hours() {
    // crew 379: 16 DO + 5 VAC, no flight block → 20h, well under the band.
    let dos: i64 = (0..16).map(|_| ground_credit(None)).sum(); // 16 day-off → 0
    let vac: i64 = (0..5).map(|_| ground_credit(Some(240))).sum(); // 5 VAC × 4:00
    let credit = dos + vac;
    assert_eq!(credit, 1200); // 20:00
    let v = check_credit_band("379", "2026-06", credit, CREDIT_MIN, CREDIT_MAX, 1.0)
        .expect("20h < 65h");
    assert!(!v.over);
}

#[test]
fn credit_days_in_month_for_proration() {
    assert_eq!(days_in_month(2026, 6), 30);
    assert_eq!(days_in_month(2026, 2), 28);
    assert_eq!(days_in_month(2024, 2), 29);
    assert_eq!(days_in_month(2026, 12), 31);
}
