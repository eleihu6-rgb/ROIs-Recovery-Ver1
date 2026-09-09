//! C++ → Rust migration-fidelity replica for rule 8030 (PILOT AGE).
//!
//! Source of truth: `crewrule-dev/RuleEngine/rule8030.cpp` (`LegalityChecker::checkPilotAge`).
//! There is NO `rule8030_gtest.cpp` in the C++ repo, so this replica encodes the contract
//! taken directly from the active checker (rule8030.cpp:139-198):
//!
//!   per flight (flt_id): n = count( crew.division==DIVISION && age(crew, segStart) >= AGE_DEFINE )
//!   violation  ⇔  n > MAX_NUMBER          (strict `>`; rule8030.cpp:172)
//!   message: "The number of crew older than {AGE} at the airport({AIRPORT})
//!             must not exceed ({MAX})."                              (rule8030.cpp:176)
//!
//! Instance 8030/004 (F8 "Age Restriction"): DIVISION=P, AIRPORT=*, AGE DEFINE, MAX NUMBER=1.
//! The live AGE DEFINE is lowered 65 → 35 (`sql/migration/2026-06-15-rule-8030-004-add-to-103-age35.sql`)
//! so the many flights crewed by two pilots over 35 surface as warnings.
//!
//! Grain: physical `flt_id` COF — same flight on different pairings merges into one count.

use rois_rule_engine::{age_years_at, check_pilot_age, parse_date_ord, AgeFlight, FlightCrew};

fn crew(id: &str, division: &str, birth: &str, pairing_id: i64) -> FlightCrew {
    FlightCrew {
        crew_id: id.to_string(),
        division: division.to_string(),
        birth_ord: parse_date_ord(birth).expect("valid birth date"),
        pairing_id,
    }
}

fn flight(flight_id: i64, start: &str, crew: Vec<FlightCrew>) -> AgeFlight {
    AgeFlight {
        flight_id,
        start_ord: parse_date_ord(start).expect("valid start date"),
        crew,
    }
}

// ── calendar age: completed years, decremented before the birthday ──────────────────
#[test]
fn age_years_at_matches_calendar_age() {
    // Born 1980-06-15; as of 2026-06-15 → exactly 46 (birthday reached).
    let b = parse_date_ord("1980-06-15").unwrap();
    assert_eq!(age_years_at(b, parse_date_ord("2026-06-15").unwrap()), 46);
    // One day before the 46th birthday → still 45.
    assert_eq!(age_years_at(b, parse_date_ord("2026-06-14").unwrap()), 45);
    // Day after → 46.
    assert_eq!(age_years_at(b, parse_date_ord("2026-06-16").unwrap()), 46);
}

// ── strict `>` MAX: exactly MAX over-age crew is LEGAL; MAX+1 fires ──────────────────
#[test]
fn count_equal_to_max_is_legal_one_more_fires() {
    // MAX=1. One over-35 pilot → count 1, not > 1 → legal.
    let one = [flight(
        9001,
        "2026-06-10",
        vec![
            crew("P1", "P", "1980-01-01", 100), // 46 ≥ 35
            crew("P2", "P", "2000-01-01", 100), // 26 < 35
        ],
    )];
    assert!(
        check_pilot_age(&one, "P", 35, 1).is_empty(),
        "1 over-age pilot is legal at MAX=1"
    );

    // Two over-35 pilots on the same flight → count 2 > 1 → both fire.
    let two = [flight(
        9001,
        "2026-06-10",
        vec![
            crew("P1", "P", "1980-01-01", 100), // 46
            crew("P2", "P", "1985-01-01", 100), // 41
        ],
    )];
    let v = check_pilot_age(&two, "P", 35, 1);
    assert_eq!(v.len(), 2, "2 over-age pilots > MAX=1 → both crew flagged");
    assert!(v
        .iter()
        .all(|x| x.flight_id == 9001 && x.pairing_id == 100 && x.over_age_count == 2));
    assert_eq!(
        v[0].message("*"),
        "The number of crew older than 35 at the airport(*) must not exceed (1).",
    );
}

// ── same flt_id on different pairings merges into one COF ───────────────────────────
#[test]
fn same_flight_different_pairings_merges_over_age_count() {
    // P1 on pairing 10, P2 on pairing 20, same physical flight 500 → count 2 > 1.
    let f = [flight(
        500,
        "2026-06-10",
        vec![
            crew("P1", "P", "1980-01-01", 10),
            crew("P2", "P", "1985-01-01", 20),
        ],
    )];
    let v = check_pilot_age(&f, "P", 35, 1);
    assert_eq!(v.len(), 2);
    assert!(v
        .iter()
        .all(|x| x.flight_id == 500 && x.over_age_count == 2));
    let by_crew: std::collections::BTreeMap<&str, i64> = v
        .iter()
        .map(|x| (x.crew_id.as_str(), x.pairing_id))
        .collect();
    assert_eq!(by_crew.get("P1"), Some(&10));
    assert_eq!(by_crew.get("P2"), Some(&20));
}

// ── DIVISION filter: only the configured division is counted ────────────────────────
#[test]
fn only_configured_division_counts() {
    // Two over-age crew but one is cabin (C) — only the pilot (P) counts → 1, legal.
    let f = [flight(
        7,
        "2026-06-10",
        vec![
            crew("P1", "P", "1970-01-01", 7), // 56, division P
            crew("C1", "C", "1970-01-01", 7), // 56, division C (ignored)
        ],
    )];
    assert!(
        check_pilot_age(&f, "P", 35, 1).is_empty(),
        "cabin crew don't count toward the P limit"
    );

    // Add a second over-age pilot → now 2 P crew → fires.
    let f2 = [flight(
        7,
        "2026-06-10",
        vec![
            crew("P1", "P", "1970-01-01", 7),
            crew("P2", "P", "1972-01-01", 7),
            crew("C1", "C", "1970-01-01", 7),
        ],
    )];
    assert_eq!(check_pilot_age(&f2, "P", 35, 1).len(), 2);
}

// ── the 65 → 35 migration is what flips a real complement to a violation ────────────
#[test]
fn two_pilots_legal_at_65_but_violate_at_35() {
    // Two pilots aged 46 and 41 — both under 65, both over 35.
    let f = [flight(
        11381,
        "2026-06-13",
        vec![
            crew("997", "P", "1980-03-01", 11381),
            crew("1012", "P", "1985-03-01", 11381),
        ],
    )];
    assert!(
        check_pilot_age(&f, "P", 65, 1).is_empty(),
        "no pilot is over 65 → legal"
    );
    let at35 = check_pilot_age(&f, "P", 35, 1);
    assert_eq!(at35.len(), 2, "both pilots are over 35 → violation");
    assert_eq!(at35[0].age_limit, 35);
}

// ── empty flight / no over-age crew → no violations ─────────────────────────────────
#[test]
fn no_violation_when_nobody_over_age() {
    let f = [flight(
        1,
        "2026-06-10",
        vec![
            crew("P1", "P", "2000-01-01", 1),
            crew("P2", "P", "1999-01-01", 1),
        ],
    )];
    assert!(check_pilot_age(&f, "P", 35, 1).is_empty());
    assert!(
        check_pilot_age(&[], "P", 35, 1).is_empty(),
        "no flights → no violations"
    );
}
