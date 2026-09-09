//! ROIS crew-rostering rule engine (Rust).
//!
//! First rule ported from the proven C++ engine (`crewrule-dev/RuleEngine/rule8002.cpp`):
//! **8002 — MAX_CUM_BLOCK**. Cumulative block hours (BLH), accumulated per crew per
//! calendar day, must not exceed a limit in any rolling N-calendar-day window.
//!
//! The C++ gtest (`rule8002_gtest.cpp`) proves the contract: 111:55 (6715 min) in a
//! 28 CD window is legal under the 112:00 limit; 112:05 (6725 min) is a violation.
//! See `tests/rule_8002_cpp_replica.rs`.

pub mod engine;
pub mod fdp;
pub mod rule7510;
pub mod rule8002;
pub mod rule8071;
pub mod rule8072;
pub mod rules;
pub use engine::{Engine, EngineParams};
pub use rule7510::{
    check_green_on_green, mark_green_on_green, split_7510_list, Rule7510CrewFlight, Rule7510Mark,
    Rule7510Param, Rule7510Violation,
};
pub use rule8002::{
    check_max_cumulative_row, crew_qualifies_8002, enumerate_windows, merge_daily_with_candidate,
    qual_entry_from_ord, qual_matches, team_qual_entry, CumRule8002, CumType, CumUnit,
    CumViolation, DayMetrics, QualEntry, MANDAY_METRICS,
};
pub use rule8071::{
    check_roster_properties_row, RosterPropertyActivity, Rule8071, Rule8071Mode, Rule8071Unit,
    Rule8071Violation,
};
pub use rule8072::{
    check_min_qual_by_fleet_rank, Rule8072, Rule8072Crew, Rule8072Evaluation, Rule8072Segment,
    Rule8072Violation,
};
pub use rules::rule7509::{
    check_avoid_co_pairing, Rule7509Member, Rule7509Param, Rule7509Violation,
};

use std::collections::{BTreeMap, BTreeSet};

/// Which application is running the rule.
///
/// The **optimizer** (`ROSTER_OPTIMIZER`) tolerates violations that arise entirely among
/// **pre-assigned** (`source == "PA"`) rosters — it only flags a breach when at least one
/// *contributing* roster is newly assigned (non-PA), because the solver must not be blamed
/// for legality it did not create. The **editor** (and the live gantt) always reports.
/// Mirrors the C++ `_application` checks (`rule8056.cpp:719-721` PA-source skip;
/// `rule7501.cpp` `ShouldApplyOptimizerPaIgnore` + `HasRoAssignedRosterInRange`).
///
/// Each checker has an `*_app(...)` variant taking the pre-assignment info; the plain
/// (editor) function delegates to it with `Application::Editor` and no PA flags, so existing
/// behaviour — and the gantt's editor-mode violations — are unchanged.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Application {
    #[default]
    Editor,
    Optimizer,
}

impl Application {
    #[inline]
    pub fn is_optimizer(self) -> bool {
        matches!(self, Application::Optimizer)
    }
}

/// `flags.get(i)` defaulting to `false` — pre-assignment flags may be shorter than (or
/// absent from) the roster list; a missing flag means "not pre-assigned" (always checked).
#[inline]
fn pre_assigned_at(flags: &[bool], i: usize) -> bool {
    flags.get(i).copied().unwrap_or(false)
}

/// Days since 1970-01-01 for a proleptic-Gregorian date (Howard Hinnant's algorithm).
/// Lets us treat calendar days as contiguous integers for rolling-window arithmetic.
pub fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = (if y >= 0 { y } else { y - 399 }) / 400;
    let yoe = y - era * 400; // [0, 399]
    let mp = if m > 2 { m - 3 } else { m + 9 }; // Mar=0..Feb=11
    let doy = (153 * mp + 2) / 5 + d - 1; // [0, 365]
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy; // [0, 146096]
    era * 146097 + doe - 719468
}

/// Parse `YYYY-MM-DD` (ignoring any trailing time) into days-since-epoch.
pub fn parse_date_ord(s: &str) -> Option<i64> {
    if s.len() < 10 {
        return None;
    }
    let y: i64 = s.get(0..4)?.parse().ok()?;
    let m: i64 = s.get(5..7)?.parse().ok()?;
    let d: i64 = s.get(8..10)?.parse().ok()?;
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    Some(days_from_civil(y, m, d))
}

/// Render a days-since-epoch ordinal back to `YYYY-MM-DD` (inverse of `days_from_civil`).
pub fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719468;
    let era = (if z >= 0 { z } else { z - 146096 }) / 146097;
    let doe = z - era * 146097; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365; // [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = doy - (153 * mp + 2) / 5 + 1; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 }; // [1, 12]
    (if m <= 2 { y + 1 } else { y }, m, d)
}

pub fn format_ord(ord: i64) -> String {
    let (y, m, d) = civil_from_days(ord);
    format!("{:04}-{:02}-{:02}", y, m, d)
}

#[derive(Debug, Clone, PartialEq)]
pub struct Violation {
    pub crew_id: String,
    /// First calendar day of the worst rolling window (days-since-epoch).
    pub window_start_ord: i64,
    pub window_days: i64,
    pub actual_minutes: f64,
    pub limit_minutes: f64,
}

impl Violation {
    pub fn window_end_ord(&self) -> i64 {
        self.window_start_ord + self.window_days - 1
    }
    pub fn actual_hours(&self) -> f64 {
        self.actual_minutes / 60.0
    }
    pub fn limit_hours(&self) -> f64 {
        self.limit_minutes / 60.0
    }
}

/// `max_rolling_window`, but in optimizer mode only windows that contain at least one
/// **non-pre-assigned** activity day (`non_pa_days`) qualify — a window made up entirely of
/// pre-assigned days is tolerated (the solver did not create it). Anchoring at activity days
/// stays sufficient: a non-PA day is itself an activity day, so the qualifying max window can
/// always be anchored at one.
pub fn max_rolling_window_opt(
    daily: &BTreeMap<i64, f64>,
    window_days: i64,
    app: Application,
    non_pa_days: &BTreeSet<i64>,
) -> (i64, f64) {
    // Cumulative prefix so each `[start, end]` window sum is an O(log n) difference
    // instead of re-summing the whole window per start day (O(days × window)).
    let mut prefix: BTreeMap<i64, f64> = BTreeMap::new();
    {
        let mut acc = 0.0f64;
        for (&day, &v) in daily {
            acc += v;
            prefix.insert(day, acc);
        }
    }
    let window_sum = |start: i64, end: i64| -> f64 {
        let hi = prefix
            .range(..=end)
            .next_back()
            .map(|(_, v)| *v)
            .unwrap_or(0.0);
        let lo = prefix
            .range(..start)
            .next_back()
            .map(|(_, v)| *v)
            .unwrap_or(0.0);
        hi - lo
    };

    let mut best_start = 0i64;
    let mut best = 0.0f64;
    for &start in daily.keys() {
        let end = start + window_days - 1;
        if app.is_optimizer() && non_pa_days.range(start..=end).next().is_none() {
            continue;
        }
        let sum = window_sum(start, end);
        if sum > best {
            best = sum;
            best_start = start;
        }
    }
    (best_start, best)
}

/// Rule 8002 (MAX_CUM_BLOCK): the cumulative block minutes for one crew must not exceed
/// `limit_minutes` in any rolling `window_days`-calendar-day window. Returns the worst
/// window as a `Violation` when the limit is exceeded (strictly greater, matching C++).
pub fn check_max_cum_block(
    crew_id: &str,
    daily_block_minutes: &BTreeMap<i64, f64>,
    window_days: i64,
    limit_minutes: f64,
) -> Option<Violation> {
    check_max_cum_block_app(
        crew_id,
        daily_block_minutes,
        window_days,
        limit_minutes,
        Application::Editor,
        &BTreeSet::new(),
    )
}

/// `check_max_cum_block` with optimizer/PA-ignore: in `Application::Optimizer`, a window whose
/// days are ALL pre-assigned is tolerated. `non_pa_days` = the activity days that carry at
/// least one non-PA (newly-assigned) block; in editor mode it is ignored.
pub fn check_max_cum_block_app(
    crew_id: &str,
    daily_block_minutes: &BTreeMap<i64, f64>,
    window_days: i64,
    limit_minutes: f64,
    app: Application,
    non_pa_days: &BTreeSet<i64>,
) -> Option<Violation> {
    let (start, actual) =
        max_rolling_window_opt(daily_block_minutes, window_days, app, non_pa_days);
    if actual > limit_minutes {
        Some(Violation {
            crew_id: crew_id.to_string(),
            window_start_ord: start,
            window_days,
            actual_minutes: actual,
            limit_minutes,
        })
    } else {
        None
    }
}

/// Accumulate `(date_ord, block_minutes)` rows into a per-day total (one crew).
pub fn accumulate_daily<I: IntoIterator<Item = (i64, f64)>>(rows: I) -> BTreeMap<i64, f64> {
    let mut daily: BTreeMap<i64, f64> = BTreeMap::new();
    for (ord, mins) in rows {
        *daily.entry(ord).or_insert(0.0) += mins;
    }
    daily
}

// ===========================================================================
// Rule 8056 — ROSTER SPACING (second rule ported from C++)
//
// Source: `crewrule-dev/RuleEngine/rule8056.cpp` (no gtest exists for 8056 in the C++
// repo, so the contract below is derived directly from the active checker logic).
//
// Semantics (8056/006 "Roster Spacing", the F8 instance): between two consecutive
// matching rosters — Assignment A = `FLY`, Assignment B = `FLY|SBY|SIM`,
// Directional=Y, UtilizePostDutyRest=Y — the gap from the end of roster A to the
// start of roster B must be at least SPACE in the given UNIT (RH = clock hours).
//
//   interval = nextRoster.start − currentRoster.end           (C++ lStaDT − lEndDT)
//   violation  ⇔  interval < SPACE          (strict `<`; exactly-equal is legal)
//   message: "The spacing between ({curLabel}) and ({nextLabel}) is {H:MM},
//             which is less than {SPACE} {UNIT}."             (C++ rule8056.cpp:808)
//
// Live-port simplification (documented, matches the 8002 UTC-day pragmatism): the live
// roster carries FLY duties; B's `FLY|SBY|SIM` superset reduces to FLY in the available
// data, so we scan each crew's FLY duties in chronological order and check every
// CONSECUTIVE pair. Non-consecutive pairs can only have a larger gap, so they never add
// a distinct violation — and consecutive-only emission keeps one row per triggering
// pairing (the C++ attaches the violation to `rosters[iCurrentRoster]->pairId`), which
// also satisfies the rule_violation UNIQUE(crew, pairing, …, start_dt) constraint.
// ===========================================================================

/// One roster (a pairing/duty) for the spacing check — the minimal shape the rule needs.
#[derive(Debug, Clone)]
pub struct RosterDuty {
    pub pairing_id: i64,
    /// Duty start / end as UTC epoch SECONDS (the C++ `actStrUtc` / `actEndUtc`).
    pub start_utc: i64,
    pub end_utc: i64,
    /// Roster label (falls back to qualifier in C++); used in the violation message.
    pub label: String,
    /// Assignment group code, e.g. "FLY", "SBY", "SIM".  Used by
    /// `check_roster_spacing_grouped` to match A-side / B-side filter sets from
    /// param_json (C++ `strAssignmentA` / `strAssignmentB`).  Empty string means
    /// "matches any group" for backward-compat callers that don't set it.
    pub assignment_group: String,
    /// Assignment CODE, e.g. "FLT"/"FLY", "VAC", "DO".  Lets an 8056 param row match
    /// by the specific code (param "Assignment A"/"Assignment B") instead of / in addition
    /// to the group, so e.g. `assignment FLY → assignment VAC` can be spaced independently
    /// of the broad GRD bucket.  Empty string means "matches any assignment".
    pub assignment: String,
}

/// Full rule-8056 parameter row. All values are normalized before matching:
/// filters are pipe-separated lists and `None` means an explicit Y/N value was
/// not configured (wildcard).
#[derive(Debug, Clone, PartialEq)]
pub struct Rule8056Rule {
    pub bases: Vec<String>,
    pub ranks: Vec<String>,
    pub fleets: Vec<String>,
    pub teams: Vec<String>,
    pub attribute_a: Vec<String>,
    pub label_a: Vec<String>,
    pub assignment_group_a: Vec<String>,
    pub assignment_a: Vec<String>,
    pub qualifier_a: Vec<String>,
    pub airport_a: Vec<String>,
    pub roles_a: Vec<String>,
    pub is_requested_a: Option<bool>,
    pub attribute_b: Vec<String>,
    pub label_b: Vec<String>,
    pub assignment_group_b: Vec<String>,
    pub assignment_b: Vec<String>,
    pub qualifier_b: Vec<String>,
    pub airport_b: Vec<String>,
    pub roles_b: Vec<String>,
    pub is_requested_b: Option<bool>,
    pub space: f64,
    pub unit: String,
    pub directional: bool,
    pub location_equal_base_a: Option<bool>,
    pub location_equal_base_b: Option<bool>,
    pub utilize_post_duty_rest: bool,
}

/// A crew-specific duty context used by the full 8056 matcher.
#[derive(Debug, Clone, PartialEq)]
pub struct Rule8056Duty {
    pub pairing_id: i64,
    pub start_utc: i64,
    pub end_utc: i64,
    pub post_rest_end_utc: i64,
    pub label: String,
    pub assignment_group: String,
    pub assignment: String,
    pub attribute: String,
    pub qualifier: String,
    pub airport: String,
    pub role: String,
    pub is_requested: bool,
    pub location: String,
    pub crew_base: String,
    pub pre_assigned: bool,
}

fn rule8056_filter_matches(filters: &[String], value: &str) -> bool {
    filters.is_empty()
        || filters.iter().any(|item| item == "*")
        || filters.iter().any(|item| item.eq_ignore_ascii_case(value))
}

fn rule8056_bool_matches(expected: Option<bool>, actual: bool) -> bool {
    expected.is_none_or(|value| value == actual)
}

fn rule8056_location_matches(expected: Option<bool>, duty: &Rule8056Duty) -> bool {
    expected.is_none_or(|value| {
        value
            == duty
                .location
                .trim()
                .eq_ignore_ascii_case(duty.crew_base.trim())
    })
}

fn rule8056_matches_side(
    duty: &Rule8056Duty,
    attributes: &[String],
    labels: &[String],
    groups: &[String],
    assignments: &[String],
    qualifiers: &[String],
    airports: &[String],
    roles: &[String],
    requested: Option<bool>,
    location_equal_base: Option<bool>,
) -> bool {
    rule8056_filter_matches(attributes, &duty.attribute)
        && rule8056_filter_matches(labels, &duty.label)
        && rule8056_filter_matches(groups, &duty.assignment_group)
        && rule8056_filter_matches(assignments, &duty.assignment)
        && rule8056_filter_matches(qualifiers, &duty.qualifier)
        && rule8056_filter_matches(airports, &duty.airport)
        && rule8056_filter_matches(roles, &duty.role)
        && rule8056_bool_matches(requested, duty.is_requested)
        && rule8056_location_matches(location_equal_base, duty)
}

/// Full 8056 spacing check for RH (clock hours).
///
/// The PyO3 adapter uses the context-aware variant below for CD/LN and for
/// optimizer PA handling. This convenience function keeps pure RH callers
/// small and mirrors the existing editor API.
pub fn check_roster_spacing_full(
    crew_id: &str,
    duties: &[Rule8056Duty],
    rule: &Rule8056Rule,
    crew_offset_min: i64,
) -> Vec<SpacingViolation> {
    check_roster_spacing_full_with_context(crew_id, duties, rule, crew_offset_min, None)
        .unwrap_or_default()
}

/// Full 8056 spacing check with the local-night definition required by `Unit=LN`.
pub fn check_roster_spacing_full_with_context(
    crew_id: &str,
    duties: &[Rule8056Duty],
    rule: &Rule8056Rule,
    crew_offset_min: i64,
    local_night: Option<LocalNightDef>,
) -> Result<Vec<SpacingViolation>, String> {
    let mut sorted: Vec<&Rule8056Duty> = duties.iter().collect();
    sorted.sort_by_key(|duty| (duty.start_utc, duty.end_utc));
    let mut out = Vec::new();

    for (ai, current) in sorted.iter().enumerate() {
        let current_matches_a = rule8056_matches_side(
            current,
            &rule.attribute_a,
            &rule.label_a,
            &rule.assignment_group_a,
            &rule.assignment_a,
            &rule.qualifier_a,
            &rule.airport_a,
            &rule.roles_a,
            rule.is_requested_a,
            rule.location_equal_base_a,
        );
        for next in sorted.iter().skip(ai + 1) {
            // C++ naming is counterintuitive: when "Utilize Post Duty Rest"
            // is enabled, it checks from the duty end; otherwise it uses the
            // pairing end including post-duty rest.
            let current_end = if rule.utilize_post_duty_rest {
                current.end_utc
            } else {
                current.post_rest_end_utc
            };
            let (actual, limit) = if rule.unit.eq_ignore_ascii_case("RH") {
                (
                    (next.start_utc - current_end) / 60,
                    (rule.space * 60.0).round() as i64,
                )
            } else if rule.unit.eq_ignore_ascii_case("CD") {
                let current_day = local_day_start_utc(current_end, crew_offset_min);
                let next_day = local_day_start_utc(next.start_utc, crew_offset_min);
                (
                    (next_day - current_day).div_euclid(86_400) + 1,
                    rule.space.round() as i64,
                )
            } else if rule.unit.eq_ignore_ascii_case("LN") {
                let Some(local_night) = local_night else {
                    return Err("8056 Unit=LN requires a LocalNight definition".to_string());
                };
                (
                    local_night_count(
                        current_end + crew_offset_min * 60,
                        next.start_utc + crew_offset_min * 60,
                        local_night.start_min,
                        local_night.end_min,
                        local_night.min_rest_secs / 60,
                    ),
                    rule.space.round() as i64,
                )
            } else {
                return Err(format!("unsupported 8056 Unit={}", rule.unit));
            };
            // Early-exit: `sorted` is ordered by start_utc, so for a fixed `current`
            // the gap to each later `next` is non-decreasing. Once it exceeds the
            // limit, no later duty can violate (independent of the A/B filter match
            // below), so the remaining pairs can be skipped — turning this all-pairs
            // scan from O(n²) into O(n·k).
            if actual > limit {
                break;
            }
            if current.pre_assigned && next.pre_assigned {
                continue;
            }
            let next_matches_b = rule8056_matches_side(
                next,
                &rule.attribute_b,
                &rule.label_b,
                &rule.assignment_group_b,
                &rule.assignment_b,
                &rule.qualifier_b,
                &rule.airport_b,
                &rule.roles_b,
                rule.is_requested_b,
                rule.location_equal_base_b,
            );
            let forward = current_matches_a && next_matches_b;
            let reverse = !rule.directional
                && rule8056_matches_side(
                    current,
                    &rule.attribute_b,
                    &rule.label_b,
                    &rule.assignment_group_b,
                    &rule.assignment_b,
                    &rule.qualifier_b,
                    &rule.airport_b,
                    &rule.roles_b,
                    rule.is_requested_b,
                    rule.location_equal_base_b,
                )
                && rule8056_matches_side(
                    next,
                    &rule.attribute_a,
                    &rule.label_a,
                    &rule.assignment_group_a,
                    &rule.assignment_a,
                    &rule.qualifier_a,
                    &rule.airport_a,
                    &rule.roles_a,
                    rule.is_requested_a,
                    rule.location_equal_base_a,
                );
            if !forward && !reverse {
                continue;
            }
            if actual < limit {
                out.push(SpacingViolation {
                    crew_id: crew_id.to_string(),
                    pairing_id: current.pairing_id,
                    next_pairing_id: next.pairing_id,
                    current_label: current.label.clone(),
                    next_label: next.label.clone(),
                    gap_start_utc: current_end,
                    gap_end_utc: next.start_utc,
                    actual_minutes: actual,
                    limit_minutes: limit,
                });
            }
        }
    }
    Ok(out)
}

/// A roster-spacing violation: gap between a duty and the next is below the limit.
#[derive(Debug, Clone, PartialEq)]
pub struct SpacingViolation {
    pub crew_id: String,
    /// Triggering pairing = the CURRENT (earlier) duty's pairing (C++ `iCurrentRoster`).
    pub pairing_id: i64,
    /// The NEXT (later) duty's pairing; 0 when the B-side is a ground duty (no pairing id).
    pub next_pairing_id: i64,
    pub current_label: String,
    pub next_label: String,
    /// Gap span = end of current duty → start of next duty (UTC epoch seconds).
    pub gap_start_utc: i64,
    pub gap_end_utc: i64,
    /// Actual gap in whole minutes (negative if the rosters overlap).
    pub actual_minutes: i64,
    /// The configured limit in minutes (SPACE hours × 60).
    pub limit_minutes: i64,
}

impl SpacingViolation {
    pub fn actual_hours(&self) -> f64 {
        self.actual_minutes as f64 / 60.0
    }
    /// Render the C++ violation message for this row (`space_str`/`unit` from param_json,
    /// e.g. "24"/"RH"). Mirrors `rule8056.cpp` line 808.
    pub fn message(&self, space_str: &str, unit: &str) -> String {
        format!(
            "The spacing between ({}) and ({}) is {}, which is less than {} {}.",
            self.current_label,
            self.next_label,
            format_hhmm(self.actual_minutes),
            space_str,
            unit,
        )
    }
}

/// Format whole minutes as `H:MM` (C++ `Utility::formatMinutes`), with a leading `-` for
/// a negative gap (overlap), matching `rule8056.cpp`'s `interval < 0 ? "-"+… : …`.
pub fn format_hhmm(minutes: i64) -> String {
    let neg = minutes < 0;
    let m = minutes.abs();
    let body = format!("{}:{:02}", m / 60, m % 60);
    if neg {
        format!("-{}", body)
    } else {
        body
    }
}

/// Parse a UTC timestamp into epoch SECONDS. Accepts `YYYY-MM-DD`,
/// `YYYY-MM-DDTHH:MM[:SS]` and `YYYY-MM-DD HH:MM[:SS]` (date-only → midnight).
pub fn parse_utc_seconds(s: &str) -> Option<i64> {
    let ord = parse_date_ord(s)?;
    let mut secs = ord * 86_400;
    if s.len() >= 16 {
        let h: i64 = s.get(11..13)?.parse().ok()?;
        let mi: i64 = s.get(14..16)?.parse().ok()?;
        let se: i64 = if s.len() >= 19 {
            s.get(17..19).and_then(|x| x.parse().ok()).unwrap_or(0)
        } else {
            0
        };
        secs += h * 3_600 + mi * 60 + se;
    }
    Some(secs)
}

/// Rule 8056 (ROSTER SPACING) for one crew: check every consecutive pair of duties and
/// flag those whose gap (next.start − current.end) is strictly less than `space_hours`.
/// `duties` need not be pre-sorted — they are ordered by (start, end) here. Returns one
/// `SpacingViolation` per violating pair, attributed to the earlier duty's pairing.
pub fn check_roster_spacing(
    crew_id: &str,
    duties: &[RosterDuty],
    space_hours: f64,
) -> Vec<SpacingViolation> {
    check_roster_spacing_app(crew_id, duties, space_hours, Application::Editor, &[])
}

/// `check_roster_spacing_grouped_app`: checks all A-side → B-side pairs (C++ all-pairs loop,
/// `rule8056.cpp:637-839`), where A must be in `group_a` and B in `group_b` and B
/// comes strictly after A chronologically (Directional=Y behaviour).
/// Per-assignment-code filters + optimizer/PA-ignore.
///
/// A duty is an A-side candidate iff its `assignment_group` matches `group_a` AND its
/// `assignment` matches `assign_a` (same for B / `group_b` / `assign_b`). A filter list that
/// is empty or contains `"*"` is a wildcard (matches anything); an empty value on the duty is
/// also a wildcard (legacy back-compat). This lets a param row drive spacing by group
/// ("Assignment Group A/B"), by code ("Assignment A/B"), or both.
#[allow(clippy::too_many_arguments)]
pub fn check_roster_spacing_grouped_app(
    crew_id: &str,
    duties: &[RosterDuty],
    space_hours: f64,
    group_a: &[&str],
    group_b: &[&str],
    assign_a: &[&str],
    assign_b: &[&str],
    app: Application,
    pre_assigned: &[bool],
) -> Vec<SpacingViolation> {
    let mut sorted: Vec<(&RosterDuty, bool)> = duties
        .iter()
        .enumerate()
        .map(|(i, d)| (d, pre_assigned_at(pre_assigned, i)))
        .collect();
    sorted.sort_by_key(|(d, _)| (d.start_utc, d.end_utc));

    let space_seconds = (space_hours * 3_600.0).round() as i64;
    let limit_minutes = (space_hours * 60.0).round() as i64;

    // A filter matches when it is a wildcard (empty / contains "*") or the value is in it;
    // an empty value on the duty also matches any filter (legacy back-compat).
    let mf = |filter: &[&str], val: &str| -> bool {
        filter.is_empty()
            || filter.iter().any(|&f| f == "*")
            || val.is_empty()
            || filter.iter().any(|&f| f == val)
    };
    let side = |groups: &[&str], assigns: &[&str], d: &RosterDuty| -> bool {
        mf(groups, &d.assignment_group) && mf(assigns, &d.assignment)
    };

    let mut out = Vec::new();
    for ai in 0..sorted.len() {
        let (a, a_pa) = sorted[ai];
        if !side(group_a, assign_a, a) {
            continue;
        }
        for bi in (ai + 1)..sorted.len() {
            let (b, b_pa) = sorted[bi];
            // Early-exit: sorted by start, so gaps only grow from here.
            let gap = b.start_utc - a.end_utc;
            if gap >= space_seconds {
                break;
            }
            if !side(group_b, assign_b, b) {
                continue;
            }
            // Same pairing on both sides (FLY can appear in both A and B groups).
            if a.pairing_id > 0 && a.pairing_id == b.pairing_id {
                continue;
            }
            if app.is_optimizer() && a_pa && b_pa {
                continue;
            }
            out.push(SpacingViolation {
                crew_id: crew_id.to_string(),
                pairing_id: a.pairing_id,
                next_pairing_id: b.pairing_id,
                current_label: a.label.clone(),
                next_label: b.label.clone(),
                gap_start_utc: a.end_utc,
                gap_end_utc: b.start_utc,
                actual_minutes: gap / 60,
                limit_minutes,
            });
        }
    }
    out
}

/// `check_roster_spacing` with optimizer/PA-ignore. `pre_assigned[i]` ↔ `duties[i]`; in
/// `Application::Optimizer` a sub-limit pair is tolerated only when BOTH rosters are
/// pre-assigned (C++ `rule8056.cpp:719-721`: report unless both `source == "PA"`).
pub fn check_roster_spacing_app(
    crew_id: &str,
    duties: &[RosterDuty],
    space_hours: f64,
    app: Application,
    pre_assigned: &[bool],
) -> Vec<SpacingViolation> {
    // Sort duties together with their PA flag so the flag follows its duty.
    let mut sorted: Vec<(&RosterDuty, bool)> = duties
        .iter()
        .enumerate()
        .map(|(i, d)| (d, pre_assigned_at(pre_assigned, i)))
        .collect();
    sorted.sort_by_key(|(d, _)| (d.start_utc, d.end_utc));

    let space_seconds = (space_hours * 3_600.0).round() as i64;
    let limit_minutes = (space_hours * 60.0).round() as i64;

    let mut out = Vec::new();
    for pair in sorted.windows(2) {
        let (cur, cur_pa) = pair[0];
        let (nxt, nxt_pa) = pair[1];
        let interval = nxt.start_utc - cur.end_utc;
        if interval >= space_seconds {
            continue;
        }
        // Optimizer tolerates a tight gap between two pre-assigned rosters.
        if app.is_optimizer() && cur_pa && nxt_pa {
            continue;
        }
        out.push(SpacingViolation {
            crew_id: crew_id.to_string(),
            pairing_id: cur.pairing_id,
            next_pairing_id: nxt.pairing_id,
            current_label: cur.label.clone(),
            next_label: nxt.label.clone(),
            gap_start_utc: cur.end_utc,
            gap_end_utc: nxt.start_utc,
            // Integer minutes, truncated toward zero (C++ `interval / 60`).
            actual_minutes: interval / 60,
            limit_minutes,
        });
    }
    out
}

// ===========================================================================
// Rule 7502 — CALCULATION OF CREDIT HOURS (third rule ported; a CALC rule)
//
// Source: `crewrule-dev/RuleEngine/rule/rule7502/CalculateCreditHoursForCARSRule.cpp`
// (`CalculateCredit`, lines 609-665) + its param parser `CreditHoursForCARSRuleParam`.
// See also `rule7502_gtest.cpp` for the authoritative test cases.
//
// 7502 is a CALCULATOR: it produces a credit-hour value per duty/roster, NOT a violation.
//
// IMPORTANT — floor applies at DUTY level, not per segment:
//   FLY roster credit  = max(minCH_or_floor, SUM(block_i × FT) over all segs in duty, dutyDP × DP)
//   GND roster credit  = max(minCH_or_floor, dutyPeriod × DP)
//
// The 4:00 default floor is applied ONCE per duty (after summing all segment FT), NOT once
// per segment. C++ `CalculateCredit(const Duty*, ...)` sums totalFtCredit across segments
// first, then returns max({minCHCredit, totalFtCredit, dpCredit}).
//
// F8 7502/002 params: FLY→FT 1.0, GND→DP 0.5, DO|LO|LEA|SBY→MinCH 04:00.
// ===========================================================================

/// The hardcoded default credit floor (C++ `CalculateCredit`: 240 min = 4:00) applied
/// when a matched param does not itself configure Minimum CH.
pub const DEFAULT_CREDIT_FLOOR_MINUTES: i64 = 240;

/// One credit param row (`CreditHoursForCARSRuleParam`). Sentinels mirror C++ exactly:
/// `min_ch_minutes < 0`, `ft_ratio < 0`, `dp_ratio < 0` all mean "not configured".
#[derive(Debug, Clone)]
pub struct CreditParam {
    pub min_ch_minutes: i64,
    pub ft_ratio: f64,
    pub dp_ratio: f64,
}

impl CreditParam {
    pub fn need_min_ch(&self) -> bool {
        self.min_ch_minutes >= 0
    }
    pub fn need_ft(&self) -> bool {
        self.ft_ratio >= 0.0
    }
    pub fn need_dp(&self) -> bool {
        self.dp_ratio >= 0.0
    }
    fn floor(&self) -> i64 {
        if self.need_min_ch() {
            self.min_ch_minutes
        } else {
            DEFAULT_CREDIT_FLOOR_MINUTES
        }
    }
}

/// Raw FT credit for a single segment — just `block × FT-ratio`, no floor.
/// Used when summing across multiple segments before applying the duty-level floor.
/// `as i64` truncates toward zero, matching C++ `static_cast<int>`.
pub fn segment_ft_raw(blk_minutes: i64, p: &CreditParam) -> i64 {
    if p.need_ft() {
        (blk_minutes as f64 * p.ft_ratio) as i64
    } else {
        0
    }
}

/// Credit (minutes) for a FLY DUTY — C++ `CalculateCredit(const Duty*, ...)` (line 609).
/// The caller passes `total_blk_minutes` = SUM of all segment block minutes in the duty.
/// The 4:00 floor is applied ONCE at duty level:
///   `max(minCH_or_floor, total_blk × FT, dutyPeriod × DP)`
pub fn credit_duty(total_blk_minutes: i64, duty_period_minutes: i64, p: &CreditParam) -> i64 {
    let ft = if p.need_ft() {
        (total_blk_minutes as f64 * p.ft_ratio) as i64
    } else {
        0
    };
    let dp = if p.need_dp() && duty_period_minutes > 0 {
        (duty_period_minutes as f64 * p.dp_ratio) as i64
    } else {
        0
    };
    p.floor().max(ft).max(dp)
}

/// Credit (minutes) for a GROUND roster — C++ `CalculateCredit(const ROSTER*, ...)`
/// (line 651): `max(minCH_or_floor, dutyPeriod×DP)`.
pub fn credit_ground(duty_period_minutes: i64, p: &CreditParam) -> i64 {
    let dp = if p.need_dp() && duty_period_minutes > 0 {
        (duty_period_minutes as f64 * p.dp_ratio) as i64
    } else {
        0
    };
    p.floor().max(dp)
}

/// A credit rule row = the assignment groups it matches + whether those activities are
/// ground rosters (use `credit_ground`) or flight duties (use `credit_duty`).
#[derive(Debug, Clone)]
pub struct CreditRule {
    pub groups: Vec<String>,
    pub is_ground: bool,
    pub param: CreditParam,
}

/// First credit rule whose `groups` contains `group` (C++ matches the first ruleParam
/// whose assignment-group expression accepts the activity, then `break`s).
pub fn match_credit_rule<'a>(rules: &'a [CreditRule], group: &str) -> Option<&'a CreditRule> {
    rules.iter().find(|r| r.groups.iter().any(|g| g == group))
}

/// Credit (minutes) for one duty given the ruleset, or `None` if no row matches its
/// assignment group. For FLY duties pass `total_blk_minutes` = sum of all segments.
/// For GND/off rosters pass 0 for `total_blk_minutes`.
pub fn credit_for_activity(
    group: &str,
    total_blk_minutes: i64,
    duty_period_minutes: i64,
    rules: &[CreditRule],
) -> Option<i64> {
    let r = match_credit_rule(rules, group)?;
    Some(if r.is_ground {
        credit_ground(duty_period_minutes, &r.param)
    } else {
        credit_duty(total_blk_minutes, duty_period_minutes, &r.param)
    })
}

// ===========================================================================
// Rule 8002 — CREDIT-HOUR MIN/MAX BAND (4th row of 8002/006, Type=CH, Unit=CM)
//
// An enrichment of 8002: a per-calendar-month credit-hour utilisation band. 8002 fires
// this warning BY ITSELF — it computes the crew's monthly credit standalone and warns
// when the total is above Max or below Min. It does NOT read 7502's man-day credit store.
//
// C++ contract (rule8002.cpp:657-684, Type="CH"): violate if
//   totalCredit > Max  ||  totalCredit < Min      (strict both ends; minutes).
//
// 8002's monthly credit is built from per-activity credit (same definition 7502 uses, so
// the two reconcile — see `ground_credit` / `flight_credit`), summed per crew per CALENDAR
// MONTH. Prorated=Y scales the band by the crew's availability (active days / days in
// month) so part-month crew aren't mis-flagged.
// ===========================================================================

/// Credit (minutes) for a GROUND duty (no pairing). `assignment.fixed_credit_min`
/// is the only assignment-level fallback. A missing fixed credit yields 0.
pub fn ground_credit(fixed_credit_min: Option<i64>) -> i64 {
    fixed_credit_min.unwrap_or(0)
}

/// Credit (minutes) for a FLIGHT segment (a pairing): block time × FT factor (FLT ft=1.0).
pub fn flight_credit(block_minutes: i64, ft_pct: f64) -> i64 {
    (block_minutes as f64 * ft_pct).round() as i64
}

/// A monthly credit-band warning: the crew's standalone monthly credit is outside the
/// (prorated) [min, max] band.
#[derive(Debug, Clone, PartialEq)]
pub struct CreditBandViolation {
    pub crew_id: String,
    pub month: String, // "YYYY-MM"
    pub credit_minutes: i64,
    /// Prorated limits actually applied.
    pub min_minutes: i64,
    pub max_minutes: i64,
    /// Configured (un-prorated) limits + the factor, for the message.
    pub raw_min_minutes: i64,
    pub raw_max_minutes: i64,
    pub prorate_factor: f64,
    /// true = above max; false = below min.
    pub over: bool,
}

impl CreditBandViolation {
    /// Human message (mirrors the C++ CH wording, with the fired bound made explicit).
    pub fn message(&self) -> String {
        let actual = format_hhmm(self.credit_minutes);
        let max_s = format_hhmm(self.max_minutes);
        let min_s = format_hhmm(self.min_minutes);
        if self.over {
            format!(
                "Monthly credit {} in 1 CM ({}) exceeds the {} maximum (8002 credit band {}–{}).",
                actual, self.month, max_s, min_s, max_s,
            )
        } else {
            format!(
                "Monthly credit {} in 1 CM ({}) is below the {} minimum (8002 credit band {}–{}).",
                actual, self.month, min_s, min_s, max_s,
            )
        }
    }
}

/// Check one crew-month's credit against the prorated band (C++ rule8002.cpp:660).
/// `factor` (0..=1) scales both limits; `raw_*` are the configured minute limits.
pub fn check_credit_band(
    crew_id: &str,
    month: &str,
    credit_minutes: i64,
    raw_min_minutes: i64,
    raw_max_minutes: i64,
    prorate_factor: f64,
) -> Option<CreditBandViolation> {
    check_credit_band_app(
        crew_id,
        month,
        credit_minutes,
        raw_min_minutes,
        raw_max_minutes,
        prorate_factor,
        Application::Editor,
        true,
    )
}

/// `check_credit_band` with optimizer/PA-ignore: in `Application::Optimizer`, a crew-month
/// whose activity is entirely pre-assigned (`month_has_non_pa == false`) is tolerated.
#[allow(clippy::too_many_arguments)]
pub fn check_credit_band_app(
    crew_id: &str,
    month: &str,
    credit_minutes: i64,
    raw_min_minutes: i64,
    raw_max_minutes: i64,
    prorate_factor: f64,
    app: Application,
    month_has_non_pa: bool,
) -> Option<CreditBandViolation> {
    if app.is_optimizer() && !month_has_non_pa {
        return None;
    }
    let f = prorate_factor.clamp(0.0, 1.0);
    let min_p = (raw_min_minutes as f64 * f).round() as i64;
    let max_p = (raw_max_minutes as f64 * f).round() as i64;
    let over = credit_minutes > max_p;
    let under = credit_minutes < min_p;
    if !over && !under {
        return None;
    }
    Some(CreditBandViolation {
        crew_id: crew_id.to_string(),
        month: month.to_string(),
        credit_minutes,
        min_minutes: min_p,
        max_minutes: max_p,
        raw_min_minutes,
        raw_max_minutes,
        prorate_factor: f,
        over,
    })
}

/// Days in a `YYYY-MM` month (for the availability proration denominator).
pub fn days_in_month(year: i64, month: i64) -> i64 {
    let first = days_from_civil(year, month, 1);
    let (ny, nm) = if month == 12 {
        (year + 1, 1)
    } else {
        (year, month + 1)
    };
    days_from_civil(ny, nm, 1) - first
}

/// The F8 7502/002 ruleset from `rule.param_json`: FLY→FT 1.0 (segment), GND→DP 0.5
/// (ground duty), DO|LO|LEA|SBY→MinCH 4:00 (off / leave / standby). Ratios/floor are
/// parameters so config (param_json) and engine never drift.
///
/// Matching is by the live `assignment` CODE (not the coarse assignment_group, which lumps
/// days-off with ground duty). The param's group names are mapped to the live F8 codes:
///   off/leave/standby (flat MinCH) ← DO, LO, LEA, SBY, VAC, ILL, RES
///   ground duty       (DP ratio)   ← GND, GRD, SIM, DHD, SFT
///   flight            (FT ratio)   ← FLY
pub fn f8_credit_ruleset(ft_ratio: f64, dp_ratio: f64, min_ch_minutes: i64) -> Vec<CreditRule> {
    let codes = |s: &[&str]| s.iter().map(|x| x.to_string()).collect::<Vec<_>>();
    vec![
        CreditRule {
            groups: codes(&["FLY"]),
            is_ground: false,
            param: CreditParam {
                min_ch_minutes: -1,
                ft_ratio,
                dp_ratio: -1.0,
            },
        },
        CreditRule {
            groups: codes(&["GND", "GRD", "SIM", "DHD", "SFT"]),
            is_ground: true,
            param: CreditParam {
                min_ch_minutes: -1,
                ft_ratio: -1.0,
                dp_ratio,
            },
        },
        CreditRule {
            groups: codes(&["DO", "LO", "LEA", "SBY", "VAC", "ILL", "RES"]),
            is_ground: true,
            param: CreditParam {
                min_ch_minutes,
                ft_ratio: -1.0,
                dp_ratio: -1.0,
            },
        },
    ]
}

// ===========================================================================
// Rule 8030 — PILOT AGE (5th rule ported from C++)
//
// Source: `crewrule-dev/RuleEngine/rule8030.cpp` (`checkPilotAge`). **No gtest exists**,
// so the contract below is derived directly from the active checker.
//
// Per matching flight (`flt_id`), count the crew of the configured DIVISION whose age AT
// THE FLIGHT START is >= AGE DEFINE. If that count strictly EXCEEDS MAX NUMBER, every
// over-age crew on that flight gets a violation (C++ FLIGHT_VIOLATION), attached to that
// crew's own pairing (attribution) and the shared flight id:
//   violation  ⇔  count( division==DIV && age>=AGE_DEFINE ) > MAX_NUMBER   (strict `>`)
//   message: "The number of crew older than {AGE} at the airport({AIRPORT}) must not
//             exceed ({MAX})."                                       (rule8030.cpp:176)
//
// Grain: `flt_id` (physical flight), matching C++ `crewsOnFlt[segment->getDBId()]` and
// allowing the same flight on different pairings to merge into one COF. Callers that lack
// a real flt_id must use a non-merging local key. The C++ ground-duty branch is a per-crew
// count of 1, which can never exceed MAX_NUMBER=1, so it produces no violations and is
// omitted here.
// ===========================================================================

/// One crew member on a flight (for the age check).
#[derive(Debug, Clone)]
pub struct FlightCrew {
    pub crew_id: String,
    pub division: String,
    /// Birth date as days-since-epoch.
    pub birth_ord: i64,
    /// Pairing that placed this crew on the flight (violation attribution).
    pub pairing_id: i64,
}

/// One physical flight with its crew-on-flight complement (may span pairings).
#[derive(Debug, Clone)]
pub struct AgeFlight {
    pub flight_id: i64,
    /// Flight start as days-since-epoch (age is evaluated at this instant).
    pub start_ord: i64,
    pub crew: Vec<FlightCrew>,
}

/// A pilot-age violation: too many over-age crew of the division share one flight.
#[derive(Debug, Clone, PartialEq)]
pub struct AgeViolation {
    pub crew_id: String,
    pub flight_id: i64,
    /// Attribution pairing for this crew (their roster on the flight).
    pub pairing_id: i64,
    pub age_years: i64,
    pub age_limit: i64,
    pub max_number: i64,
    /// How many division crew on the flight reached the age limit (the count that fired).
    pub over_age_count: i64,
}

impl AgeViolation {
    /// Render the C++ violation message (`rule8030.cpp:176`); `airport` from param_json.
    pub fn message(&self, airport: &str) -> String {
        format!(
            "The number of crew older than {} at the airport({}) must not exceed ({}).",
            self.age_limit, airport, self.max_number,
        )
    }
}

/// Completed-years age at `at_ord` for a person born on `birth_ord` — calendar age,
/// decremented when the birthday has not yet occurred in the target year. Mirrors the
/// C++ `getAgeByTime` (whole years lived as of the instant).
pub fn age_years_at(birth_ord: i64, at_ord: i64) -> i64 {
    let (by, bm, bd) = civil_from_days(birth_ord);
    let (ay, am, ad) = civil_from_days(at_ord);
    let mut age = ay - by;
    if (am, ad) < (bm, bd) {
        age -= 1;
    }
    age
}

/// Rule 8030 (PILOT AGE): for each flight, count crew of `division` whose age at the
/// flight start is >= `age_limit`; when that count strictly exceeds `max_number`, emit a
/// violation for every such over-age crew (attributed to that crew's pairing_id).
pub fn check_pilot_age(
    flights: &[AgeFlight],
    division: &str,
    age_limit: i64,
    max_number: i64,
) -> Vec<AgeViolation> {
    check_pilot_age_app(
        flights,
        division,
        age_limit,
        max_number,
        Application::Editor,
        &[],
    )
}

/// `check_pilot_age` with optimizer/PA-ignore. `flight_pre_assigned[i]` ↔ `flights[i]`; in
/// `Application::Optimizer` a flight whose roster is entirely pre-assigned is tolerated (the
/// solver placed no new crew on it, so an over-age complement there is pre-existing).
pub fn check_pilot_age_app(
    flights: &[AgeFlight],
    division: &str,
    age_limit: i64,
    max_number: i64,
    app: Application,
    flight_pre_assigned: &[bool],
) -> Vec<AgeViolation> {
    let mut out = Vec::new();
    for (fi, f) in flights.iter().enumerate() {
        if app.is_optimizer() && pre_assigned_at(flight_pre_assigned, fi) {
            continue;
        }
        let over: Vec<(&FlightCrew, i64)> = f
            .crew
            .iter()
            .filter(|c| c.division == division)
            .map(|c| (c, age_years_at(c.birth_ord, f.start_ord)))
            .filter(|(_, age)| *age >= age_limit)
            .collect();
        let count = over.len() as i64;
        if count > max_number {
            for (c, age) in over {
                out.push(AgeViolation {
                    crew_id: c.crew_id.clone(),
                    flight_id: f.flight_id,
                    pairing_id: c.pairing_id,
                    age_years: age,
                    age_limit,
                    max_number,
                    over_age_count: count,
                });
            }
        }
    }
    out
}

// ===========================================================================
// Rule 8004 — BASIC COMPETENCY (6th rule ported from C++)
//
// Source: `crewrule-dev/RuleEngine/RuleEngine.cpp` (`checkBasicCompetency`, line 8429).
// **No gtest exists.** F8 8004/004 has three Type rows; only BASE has Enable Check=Y
// (RANK, FLEET = N), so the live port checks BASE competency only.
//
// Per roster (a crew×pairing): the pairing's BASE must be covered by one of the crew's
// `crew_base` rows whose validity window contains the roster span —
//   eff <= roster_start  AND  exp(+grace) > roster_end                  (C++ 8542)
// If no row covers it → violation (C++ ROSTER_VIOLATION):
//   message: "{crewId}: No base ({base}) assigned in roster."           (C++ 8554)
//
// Live-port handling of demo-data nulls (documented): a `crew_base` row with no expiry
// is treated as far-future (the C++ does exactly this, 8535-8540); a row with no
// effective date is treated as always-effective (the C++ has no such branch, but the
// demo leaves EVERY crew_base.eff null, so a strict eff check would spuriously fail every
// base). Pairings with an empty/'*' base carry no base requirement and are skipped — you
// cannot violate a base you were never assigned. `isInSameBase` is simplified to an exact
// base-code match.
//
// Location-continuity exemption (added for a real false-positive: crew based at YVR flies
// YVR→YYZ, does two SIM sessions at YYZ, then flies YYZ→YVR — every leg's arrival station
// matches the next leg's departure station, so this is a genuine closed loop out of and back
// to the crew's qualified base, not an unqualified cross-base assignment). Before raising a
// violation for a roster whose own base isn't covered, we walk the crew's chronological
// activity chain (`BaseActivity`) both backward and forward from that roster's own activity,
// requiring an exact station match at every hop (no time-gap tolerance — SIM-to-SIM gaps of
// 12-22h are fine as long as the station doesn't change). If both walks reach the SAME
// qualified base, the violation is suppressed. This is strict on purpose: the forward walk
// only sees activities already present in the roster being checked (no assumption that a
// return will be scheduled later), and the two anchors must be the same base (a crew qualified
// at both YVR and LAX that flies YVR→...→LAX is not "closed loop" — that's a real transfer
// through an unqualified station and must still violate).
// ===========================================================================

/// One `crew_base` qualification window (days-since-epoch; `None` = open-ended).
#[derive(Debug, Clone)]
pub struct BaseQual {
    pub base: String,
    pub eff_ord: Option<i64>,
    pub exp_ord: Option<i64>,
}

/// One roster to check (crew×pairing): the pairing's base + the roster's span.
#[derive(Debug, Clone)]
pub struct BaseRoster {
    pub pairing_id: i64,
    pub base: String,
    pub start_ord: i64,
    pub end_ord: i64,
}

/// One chronological activity (FLY pairing, ground duty, SIM, deadhead, or any other crew
/// activity) used only by rule 8004's location-continuity exemption chain-walk. Parallel to
/// `BaseRoster`, not a replacement: `pairing_id = Some(id)` when this activity is the same
/// pairing as a `BaseRoster` entry; `None` for ground/SIM/other non-pairing activity.
#[derive(Debug, Clone)]
pub struct BaseActivity {
    pub pairing_id: Option<i64>,
    pub start_utc: i64,
    pub end_utc: i64,
    pub start_station: String,
    pub end_station: String,
}

/// A basic-competency (BASE) violation: the roster's base is not covered by any qual.
#[derive(Debug, Clone, PartialEq)]
pub struct CompetencyViolation {
    pub crew_id: String,
    pub pairing_id: i64,
    pub base: String,
}

impl CompetencyViolation {
    /// Render the C++ violation message (`RuleEngine.cpp:8554`).
    pub fn message(&self) -> String {
        format!(
            "{}: No base ({}) assigned in roster.",
            self.crew_id, self.base
        )
    }
}

/// True if `quals` cover `base` for the roster window `[start, end]`, with `grace_days`
/// added to expiry: some row matches the base with `eff <= start` and `exp(+grace) > end`.
pub fn base_is_covered(
    base: &str,
    start_ord: i64,
    end_ord: i64,
    quals: &[BaseQual],
    grace_days: i64,
) -> bool {
    quals.iter().any(|q| {
        if q.base != base {
            return false;
        }
        let eff_ok = q.eff_ord.map_or(true, |e| e <= start_ord);
        let exp = q.exp_ord.map_or(i64::MAX, |e| e.saturating_add(grace_days));
        eff_ok && exp > end_ord
    })
}

/// Rule 8004 (BASIC COMPETENCY, BASE): emit a violation for each roster whose base is
/// non-empty and not covered by the crew's base quals. Empty/'*'-base rosters are skipped.
pub fn check_base_competency(
    crew_id: &str,
    rosters: &[BaseRoster],
    quals: &[BaseQual],
    grace_days: i64,
) -> Vec<CompetencyViolation> {
    check_base_competency_app(
        crew_id,
        rosters,
        quals,
        grace_days,
        Application::Editor,
        &[],
        &[],
    )
}

/// `check_base_competency` with optimizer/PA-ignore and the location-continuity exemption.
/// `pre_assigned[i]` ↔ `rosters[i]`; in `Application::Optimizer` a pre-assigned roster's base
/// breach is tolerated (the solver did not assign it). `activities` is the crew's full
/// chronological activity chain (may be empty — an empty chain means the exemption never
/// applies, so omitting it is always safe and behaviourally identical to before its addition);
/// a roster that fails the qualification check is still spared if `closed_loop_anchor` finds
/// it sits inside a genuine closed loop back to a qualified base (see module doc above).
pub fn check_base_competency_app(
    crew_id: &str,
    rosters: &[BaseRoster],
    quals: &[BaseQual],
    grace_days: i64,
    app: Application,
    pre_assigned: &[bool],
    activities: &[BaseActivity],
) -> Vec<CompetencyViolation> {
    let mut sorted: Vec<&BaseActivity> = activities.iter().collect();
    sorted.sort_by_key(|a| (a.start_utc, a.end_utc));

    let mut out = Vec::new();
    for (i, r) in rosters.iter().enumerate() {
        if r.base.is_empty() || r.base == "*" {
            continue;
        }
        if app.is_optimizer() && pre_assigned_at(pre_assigned, i) {
            continue;
        }
        if base_is_covered(&r.base, r.start_ord, r.end_ord, quals, grace_days) {
            continue;
        }
        if closed_loop_anchor(r, &sorted, quals, grace_days).is_some() {
            continue;
        }
        out.push(CompetencyViolation {
            crew_id: crew_id.to_string(),
            pairing_id: r.pairing_id,
            base: r.base.clone(),
        });
    }
    out
}

/// Direction to walk the sorted activity chain away from the failing roster's own activity.
#[derive(Clone, Copy)]
enum ChainDirection {
    Backward,
    Forward,
}

impl ChainDirection {
    /// The station on "our own" side of an activity when walking in this direction: the
    /// side we still need the *next* hop to land on.
    fn own_side(self, a: &BaseActivity) -> &str {
        match self {
            ChainDirection::Backward => &a.start_station,
            ChainDirection::Forward => &a.end_station,
        }
    }

    /// The station on the "incoming" side of an activity when walking in this direction: the
    /// side that must match the previous hop's `own_side` station for the chain to hold.
    fn incoming_side(self, a: &BaseActivity) -> &str {
        match self {
            ChainDirection::Backward => &a.end_station,
            ChainDirection::Forward => &a.start_station,
        }
    }

    fn step(self, idx: usize, len: usize) -> Option<usize> {
        match self {
            ChainDirection::Backward => idx.checked_sub(1),
            ChainDirection::Forward => {
                let next = idx + 1;
                (next < len).then_some(next)
            }
        }
    }
}

/// Returns `Some(base)` iff the crew's activity chain walks both backward and forward from
/// `roster`'s own activity to the SAME base covered by `quals` for `roster`'s span, with every
/// intermediate hop an exact station match (station identity only — no gap-size check, so a
/// multi-hour/multi-day gap between two activities at the same station never breaks the
/// chain). Returns `None` if either walk fails, or if the two anchors differ (a real closed
/// loop returns to the base it left, not to a different qualified base).
fn closed_loop_anchor(
    roster: &BaseRoster,
    sorted: &[&BaseActivity],
    quals: &[BaseQual],
    grace_days: i64,
) -> Option<String> {
    let pos = sorted
        .iter()
        .position(|a| a.pairing_id == Some(roster.pairing_id))?;
    let back = walk_chain(roster, sorted, pos, quals, grace_days, ChainDirection::Backward)?;
    let fwd = walk_chain(roster, sorted, pos, quals, grace_days, ChainDirection::Forward)?;
    (back == fwd).then_some(back)
}

/// Walks the sorted activity chain from `pos` in `dir`, requiring each hop's incoming station
/// to exactly match the previous hop's outgoing station. Stops (returns the anchor base) as
/// soon as a station reached in this direction — including the failing activity's own far
/// side, checked before any hop is taken — is covered by a qualification for `roster`'s span;
/// returns `None` if the chain runs off the end of `sorted`, or hits an unknown (empty) or
/// mismatched station first.
fn walk_chain(
    roster: &BaseRoster,
    sorted: &[&BaseActivity],
    pos: usize,
    quals: &[BaseQual],
    grace_days: i64,
    dir: ChainDirection,
) -> Option<String> {
    let mut idx = pos;
    let mut expected = dir.own_side(sorted[pos]).to_string();
    if !expected.is_empty()
        && base_is_covered(&expected, roster.start_ord, roster.end_ord, quals, grace_days)
    {
        // The failing pairing's own far side already lands at a qualified base (e.g. its
        // return leg ends at the crew's home base) — no further hops needed.
        return Some(expected);
    }
    loop {
        idx = dir.step(idx, sorted.len())?;
        let hop = sorted[idx];
        let landing = dir.incoming_side(hop);
        if expected.is_empty() || landing.is_empty() || landing != expected {
            return None;
        }
        let anchor_candidate = dir.own_side(hop);
        if !anchor_candidate.is_empty()
            && base_is_covered(anchor_candidate, roster.start_ord, roster.end_ord, quals, grace_days)
        {
            return Some(anchor_candidate.to_string());
        }
        expected = anchor_candidate.to_string();
    }
}

// ===========================================================================
//  Rule 7501 — SINGLE DAY FREE FROM DUTY (SDFD) in a rolling RH window
//  Source: crewrule-dev/RuleEngine/rule/rule7501/LimitSingleDayFreeFromDutyForCARSRule.cpp
//  Oracle: crewrule-dev/RuleTest/rule7501_gtest.cpp (editor-mode contract).
//
//  An SDFD = a True Rest that fully covers TWO CONSECUTIVE local nights (a valid
//  min-rest placement in each band, with no duty in the daytime gap between them).
//  The crew must accumulate at least MIN LIMITS SDFDs in every rolling PERIOD-hour
//  window; a window with fewer is a violation (strict `<`).
//
//  The local-night band (start/end/min-interval) is NOT hardcoded — it is the
//  Local Night Definition (rule 2014/014), passed in as `LocalNightDef` so config
//  (param_json) and engine never drift.
// ===========================================================================

/// Local Night Definition (rule 2014). Minutes are measured from local midnight; when
/// `end_min <= start_min` the band crosses midnight into the next civil day (the normal
/// case, e.g. 22:00→08:00). `min_rest_secs` is the minimum continuous rest that must fit
/// inside band∩rest for the night to count.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LocalNightDef {
    pub start_min: i64,
    pub end_min: i64,
    pub min_rest_secs: i64,
}

/// One work period (a duty/pairing or a ground roster) for the SDFD scan. `pairing_id`
/// is `None` for ground duties (days-off / standby with no pairing).
#[derive(Debug, Clone, PartialEq)]
pub struct WorkPeriod7501 {
    pub pairing_id: Option<i64>,
    pub start_utc: i64,
    pub end_utc: i64,
}

/// A 7501 violation: a rolling PERIOD-hour window whose fully-contained SDFD count is
/// below MIN LIMITS. Editor mode reports the single worst (lowest-count, earliest) window
/// per rule row, matching the C++ `ThrowRuleViolation` call.
#[derive(Debug, Clone, PartialEq)]
pub struct SdfdViolation {
    pub crew_id: String,
    pub window_start_utc: i64,
    pub window_end_utc: i64,
    pub total_sdfd: i64,
    pub min_limits: i64,
    pub period_hours: i64,
    pub unit: String,
}

impl SdfdViolation {
    /// C++ `ThrowRuleViolation` message (rule7501.cpp:767-770).
    pub fn message(&self) -> String {
        format!(
            "Single day free from duty ({}) must be at least {} in {} {}.",
            self.total_sdfd, self.min_limits, self.period_hours, self.unit
        )
    }
}

const SECONDS_PER_DAY_7501: i64 = 86400;

/// Civil-day ordinal (days-since-epoch) of `utc_secs` in local time (`offset_min` = minutes
/// to add to UTC to get local, e.g. EDT = -240).
fn local_day_ord(utc_secs: i64, offset_min: i64) -> i64 {
    let local = utc_secs + offset_min * 60;
    local.div_euclid(SECONDS_PER_DAY_7501)
}

/// UTC instant of local midnight at the start of civil day `day_ord`.
fn local_midnight_utc(day_ord: i64, offset_min: i64) -> i64 {
    day_ord * SECONDS_PER_DAY_7501 - offset_min * 60
}

/// The local-night band `[start_utc, end_utc)` for civil day `day_ord`.
fn local_night_band(day_ord: i64, offset_min: i64, lnd: &LocalNightDef) -> (i64, i64) {
    let start = local_midnight_utc(day_ord, offset_min) + lnd.start_min * 60;
    let end = if lnd.end_min <= lnd.start_min {
        local_midnight_utc(day_ord + 1, offset_min) + lnd.end_min * 60
    } else {
        local_midnight_utc(day_ord, offset_min) + lnd.end_min * 60
    };
    (start, end)
}

/// Buffered True Rest `(start, end)` when `raw_end > raw_start + buffer`; mirrors C++
/// `BuildTrueRestPeriods::appendRest` (segments too short after buffer are omitted).
fn true_rest_segment(raw_start: i64, raw_end: i64, buffer_secs: i64) -> Option<(i64, i64)> {
    if raw_end <= raw_start {
        return None;
    }
    let start = raw_start + buffer_secs;
    if raw_end <= start {
        return None;
    }
    Some((start, raw_end))
}

/// True Rest segments: leading rest, inter-duty gaps (start = prev end + duty-end buffer),
/// and the trailing rest. Mirrors C++ `BuildTrueRestPeriods`.
fn build_true_rest(
    work: &[WorkPeriod7501],
    buffer_secs: i64,
    leading_start: i64,
    trailing_end: i64,
) -> Vec<(i64, i64)> {
    let mut out: Vec<(i64, i64)> = Vec::new();
    if work.is_empty() {
        return out;
    }
    let first_start = work[0].start_utc;
    if first_start > leading_start {
        out.push((leading_start, first_start));
    }
    for i in 0..work.len() - 1 {
        if let Some(seg) = true_rest_segment(work[i].end_utc, work[i + 1].start_utc, buffer_secs) {
            out.push(seg);
        }
    }
    if let Some(seg) = true_rest_segment(work[work.len() - 1].end_utc, trailing_end, buffer_secs) {
        out.push(seg);
    }
    out
}

/// Half-open interval overlap `[a0,a1) ∩ [b0,b1) ≠ ∅`.
fn overlaps(a0: i64, a1: i64, b0: i64, b1: i64) -> bool {
    a1 > b0 && a0 < b1
}

/// Civil days whose local-night band overlaps the rest `[rest_start, rest_end)`.
fn local_night_dates(
    rest_start: i64,
    rest_end: i64,
    offset_min: i64,
    lnd: &LocalNightDef,
) -> Vec<i64> {
    let mut out = Vec::new();
    let first = local_day_ord(rest_start, offset_min) - 1;
    let last = local_day_ord(rest_end, offset_min) + 1;
    for d in first..=last {
        let (b0, b1) = local_night_band(d, offset_min, lnd);
        if overlaps(b0, b1, rest_start, rest_end) {
            out.push(d);
        }
    }
    out
}

/// Earliest/latest UTC start for a `min_rest`-second placement inside band∩rest.
/// Mirrors C++ `ComputeFlexibleLocalNightSegment`. Returns `None` when it cannot fit.
fn flexible_night(
    band: (i64, i64),
    rest_start: i64,
    rest_end: i64,
    min_rest: i64,
) -> Option<(i64, i64)> {
    if min_rest <= 0 {
        return None;
    }
    let avail_start = band.0.max(rest_start);
    let avail_end = band.1.min(rest_end);
    if avail_end - avail_start < min_rest {
        return None;
    }
    let earliest = avail_start;
    let latest = (band.1 - min_rest).min(avail_end - min_rest);
    if earliest > latest {
        return None;
    }
    Some((earliest, latest))
}

/// Valid SDFD windows. Each is two consecutive local nights with a valid placement and no
/// duty in the daytime gap. We keep `start_latest` (latest night-1 start) and `end_earliest`
/// (earliest night-2 end) — the only bounds a rolling window's containment test needs.
fn build_valid_sdfd(
    rests: &[(i64, i64)],
    rest_offsets: &[i64],
    work: &[WorkPeriod7501],
    lnd: &LocalNightDef,
) -> Vec<(i64, i64)> {
    let mut out = Vec::new();
    let min_rest = lnd.min_rest_secs;
    for (i, &(rs, re)) in rests.iter().enumerate() {
        let offset_min = rest_offsets.get(i).copied().unwrap_or(0);
        let days = local_night_dates(rs, re, offset_min, lnd);
        for w in days.windows(2) {
            let (d1, d2) = (w[0], w[1]);
            if d2 != d1 + 1 {
                continue;
            }
            let band1 = local_night_band(d1, offset_min, lnd);
            let band2 = local_night_band(d2, offset_min, lnd);
            // No duty in the open daytime interval (band1.end, band2.start).
            if band2.0 > band1.1
                && work
                    .iter()
                    .any(|wp| overlaps(wp.start_utc, wp.end_utc, band1.1, band2.0))
            {
                continue;
            }
            let n1 = match flexible_night(band1, rs, re, min_rest) {
                Some(n) => n,
                None => continue,
            };
            let n2 = match flexible_night(band2, rs, re, min_rest) {
                Some(n) => n,
                None => continue,
            };
            let start_latest = n1.1;
            let end_earliest = n2.0 + min_rest;
            out.push((start_latest, end_earliest));
        }
    }
    out
}

fn round_down_minute(t: i64) -> i64 {
    t - t.rem_euclid(60)
}
fn round_up_minute(t: i64) -> i64 {
    let r = t.rem_euclid(60);
    if r == 0 {
        t
    } else {
        t + (60 - r)
    }
}

/// Should this rolling window participate in the check? Mirrors C++ `ShouldCheckWindow`:
/// the window must contain rest, and a pure trailing-rest window past the last duty is skipped.
fn should_check_window(
    ws: i64,
    we: i64,
    last_work_end: i64,
    work: &[WorkPeriod7501],
    rests: &[(i64, i64)],
) -> bool {
    let has_work = work
        .iter()
        .any(|wp| overlaps(wp.start_utc, wp.end_utc, ws, we));
    let has_rest = rests.iter().any(|&(rs, re)| overlaps(rs, re, ws, we));
    if !has_rest {
        return false;
    }
    if !has_work && ws >= last_work_end {
        return false;
    }
    true
}

/// Rule 7501 (editor mode) for one crew & one rule row. Returns the single worst window
/// (lowest SDFD count, earliest on ties — matching C++ `currentSdfd < worstSdfd`) whose
/// fully-contained SDFD count is below `min_limits`, or `None` if every checked window is
/// legal. Non-`RH` units (and non-positive period/limit) are ignored, like the C++.
#[allow(clippy::too_many_arguments)]
#[allow(clippy::too_many_arguments)]
pub fn check_sdfd_rolling(
    crew_id: &str,
    work: &[WorkPeriod7501],
    offset_min: i64,
    lnd: &LocalNightDef,
    period_hours: i64,
    unit: &str,
    duty_end_buffer_secs: i64,
    min_limits: i64,
    checked_start_utc: i64,
    checked_end_utc: i64,
) -> Option<SdfdViolation> {
    check_sdfd_rolling_app(
        crew_id,
        work,
        offset_min,
        lnd,
        period_hours,
        unit,
        duty_end_buffer_secs,
        min_limits,
        checked_start_utc,
        checked_end_utc,
        Application::Editor,
        &[],
        None,
        &[],
        None,
    )
}

/// Offsets for each True Rest segment consumed by rule 7501 (rule 7500 acclimatisation TZ).
/// Mirrors C++ `GetAccOffsetAtRestStart` / `GetAccOffsetBeforeFirstWork`.
pub fn sdfd_rest_acc_offsets(
    work: &[WorkPeriod7501],
    duty_refs: &[AccDutyRef],
    work_to_ref: &[usize],
    leading_offset: i64,
    buffer_secs: i64,
    leading_start: i64,
    trailing_end: i64,
) -> Vec<i64> {
    let rests = build_true_rest(work, buffer_secs, leading_start, trailing_end);
    if rests.is_empty() {
        return Vec::new();
    }
    if work.is_empty() {
        return vec![leading_offset; rests.len()];
    }
    let duty_end_offset = |work_idx: usize| -> i64 {
        let ri = work_to_ref.get(work_idx).copied().unwrap_or(0);
        duty_refs
            .get(ri)
            .map(|r| r.duty_end_ref_tz_min)
            .unwrap_or(leading_offset)
    };
    let mut out = Vec::with_capacity(rests.len());
    if work[0].start_utc > leading_start {
        out.push(leading_offset);
    }
    for i in 0..work.len().saturating_sub(1) {
        if true_rest_segment(work[i].end_utc, work[i + 1].start_utc, buffer_secs).is_some() {
            out.push(duty_end_offset(i));
        }
    }
    if true_rest_segment(work[work.len() - 1].end_utc, trailing_end, buffer_secs).is_some() {
        out.push(duty_end_offset(work.len() - 1));
    }
    debug_assert_eq!(out.len(), rests.len());
    out
}

/// `check_sdfd_rolling` with optimizer/PA-ignore. `pre_assigned[i]` ↔ `work[i]`. In
/// `Application::Optimizer` a violating window is tolerated when NO non-pre-assigned work
/// period overlaps it AND the period is 168 or 672 RH — mirrors the C++
/// `ShouldApplyOptimizerPaIgnore` (168/672) + `HasRoAssignedRosterInRange` (window holds a
/// non-PA roster). A shorter-period rule is always checked.
#[allow(clippy::too_many_arguments)]
pub fn check_sdfd_rolling_app(
    crew_id: &str,
    work: &[WorkPeriod7501],
    offset_min: i64,
    lnd: &LocalNightDef,
    period_hours: i64,
    unit: &str,
    duty_end_buffer_secs: i64,
    min_limits: i64,
    checked_start_utc: i64,
    checked_end_utc: i64,
    app: Application,
    pre_assigned: &[bool],
    rest_acc_offsets: Option<&[i64]>,
    focus_intervals: &[(i64, i64)],
    focus_crew_ids: Option<&[String]>,
) -> Option<SdfdViolation> {
    if unit != "RH" || period_hours <= 0 || min_limits <= 0 || work.is_empty() {
        return None;
    }
    // The C++ only applies the PA-ignore to the 168/672 RH cumulative periods.
    let pa_ignore = app.is_optimizer() && (period_hours == 168 || period_hours == 672);
    let window_secs = period_hours * 3600;
    let last_work_end = work.iter().map(|w| w.end_utc).max().unwrap_or(0);
    let trailing_rest_end = last_work_end + window_secs;
    let scan_end = checked_end_utc.min(trailing_rest_end);
    let scan_start = if checked_start_utc >= window_secs {
        checked_start_utc - window_secs
    } else {
        0
    };
    if scan_start >= scan_end {
        return None;
    }

    let rests = build_true_rest(work, duty_end_buffer_secs, scan_start, trailing_rest_end);
    if rests.is_empty() {
        return None;
    }
    let rest_offsets: Vec<i64> = if let Some(offsets) = rest_acc_offsets {
        debug_assert_eq!(offsets.len(), rests.len());
        offsets.to_vec()
    } else {
        vec![offset_min; rests.len()]
    };
    let sdfds = build_valid_sdfd(&rests, &rest_offsets, work, lnd);

    // Candidate window-start instants (minute-aligned), like C++ CollectWindowStartCriticalTimes.
    let mut criticals: std::collections::BTreeSet<i64> = std::collections::BTreeSet::new();
    let add = |t: i64, set: &mut std::collections::BTreeSet<i64>| {
        if t > 0 {
            set.insert(round_down_minute(t));
        }
    };
    for &(start_latest, end_earliest) in &sdfds {
        let last = round_down_minute(start_latest);
        let first = round_up_minute(end_earliest - window_secs);
        if first > last {
            continue;
        }
        add(first, &mut criticals);
        add(last, &mut criticals);
        add(last + 60, &mut criticals);
    }
    for wp in work {
        add(wp.start_utc - window_secs + 1, &mut criticals);
        add(wp.start_utc, &mut criticals);
        add(wp.end_utc, &mut criticals);
        add(wp.end_utc - window_secs + 1, &mut criticals);
    }
    for &(rs, re) in &rests {
        add(rs - window_secs + 1, &mut criticals);
        add(rs, &mut criticals);
        add(re, &mut criticals);
        add(re - window_secs + 1, &mut criticals);
    }
    add(checked_start_utc - window_secs, &mut criticals);
    add(checked_start_utc, &mut criticals);
    add(scan_end - window_secs, &mut criticals);
    add(scan_end, &mut criticals);

    let min_window_start = round_up_minute(checked_start_utc - window_secs + 1);
    let max_window_start = round_down_minute(scan_end - 1);

    let mut violating_windows = Vec::new(); // (total_sdfd, window_start)
    for &ws in &criticals {
        if ws < min_window_start || ws > max_window_start {
            continue;
        }
        let we = ws + window_secs;
        if we <= checked_start_utc || ws >= scan_end {
            continue;
        }
        if !should_check_window(ws, we, last_work_end, work, &rests) {
            continue;
        }
        // Window contains an SDFD iff a placement fits: ws <= start_latest && we >= end_earliest.
        let count = sdfds
            .iter()
            .filter(|&&(start_latest, end_earliest)| ws <= start_latest && we >= end_earliest)
            .count() as i64;
        if count >= min_limits {
            continue;
        }
        // Optimizer tolerates a window with no newly-assigned (non-PA) work — the breach is
        // entirely among pre-assigned rosters (C++ HasRoAssignedRosterInRange == false).
        if pa_ignore {
            let has_non_pa = work.iter().enumerate().any(|(i, wp)| {
                !pre_assigned_at(pre_assigned, i) && overlaps(wp.start_utc, wp.end_utc, ws, we)
            });
            if !has_non_pa {
                continue;
            }
        }
        violating_windows.push((count, ws));
    }

    let crew_focus_intervals = match focus_crew_ids {
        Some(ids) if !ids.is_empty() && !ids.iter().any(|id| id == crew_id) => &[][..],
        _ => focus_intervals,
    };
    let focused_worst = if crew_focus_intervals.is_empty() {
        None
    } else {
        violating_windows
            .iter()
            .filter(|&&(_, ws)| {
                crew_focus_intervals
                    .iter()
                    .any(|&(f0, f1)| overlaps(ws, ws + window_secs, f0, f1))
            })
            .min_by_key(|&&(count, ws)| (count, ws))
            .copied()
    };
    let worst = focused_worst.or_else(|| {
        violating_windows
            .iter()
            .min_by_key(|&&(count, ws)| (count, ws))
            .copied()
    });

    worst.map(|(total_sdfd, window_start)| SdfdViolation {
        crew_id: crew_id.to_string(),
        window_start_utc: window_start,
        window_end_utc: window_start + window_secs,
        total_sdfd,
        min_limits,
        period_hours,
        unit: unit.to_string(),
    })
}

// ===========================================================================
//  Rule 7500 — ACCLIMATISATION DEFINITION (CARS) — a DEFINITION/state-builder rule
//  Source: crewrule-dev/RuleEngine/rule/rule7500/AcclimatizationForCARSRule.cpp
//  (`CalculateDuty`). **No gtest** — contract derived from the active calculator.
//
//  7500 emits NO violations (like 7502 / 2014). It computes, per duty, the crew's
//  acclimatisation REFERENCE TIMEZONE — the timezone the crew is physiologically adapted
//  to — which OTHER rules consume (7503 WOCL, plus 7005/7025/6038/7482 in the C++). The
//  WOCL evaluation timezone (`GetAdjustOffsetTZ`) is this ref TZ, falling back to the crew
//  base TZ when not computed.
//
//  Model (DailyAdjustment, 7500 table 2 = "Stay Duration per X Hours" / "ACC TZ Adjust X
//  Hours", F8 = 24:00 / 01:00): the first duty is acclimatised to its departure TZ; while
//  the crew stays in one TZ, every `stay_per` minutes of stay drifts the ref TZ toward that
//  TZ by `adjust` minutes (clamped, `adjustTimezone`); a TZ change restarts the stay clock.
//
//  Live-port note: roster_flight carries no per-segment airport TZ (dep_arp/arv_arp are
//  null, flt_id is null), so the live 7503 harness uses the C++ FALLBACK — the crew prime-
//  base TZ — as the WOCL evaluation TZ (the dominant case for a domestic operation, where
//  dep TZ == arr TZ == base TZ and the drift model is a no-op). The drift model below is
//  exercised by the unit tests with synthetic multi-TZ duties.
// ===========================================================================

/// One duty for the acclimatisation calc: its span (UTC seconds) + departure/arrival TZ
/// offset (minutes east of UTC, e.g. EDT = -240).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AccDuty {
    pub start_utc: i64,
    pub end_utc: i64,
    pub first_flight_departure_utc: i64,
    pub last_flight_arrival_utc: i64,
    pub dep_tz_min: i64,
    pub arr_tz_min: i64,
}

impl AccDuty {
    fn effective_first_flight_departure_utc(&self) -> i64 {
        if self.first_flight_departure_utc > 0 {
            self.first_flight_departure_utc
        } else {
            self.start_utc
        }
    }

    fn effective_last_flight_arrival_utc(&self) -> i64 {
        if self.last_flight_arrival_utc > 0 {
            self.last_flight_arrival_utc
        } else {
            self.end_utc
        }
    }
}

/// Move `src` toward `dest` by `adjust_min`, never overshooting `dest`. Mirrors the C++
/// `adjustTimezone` (AcclimatizationForCARSRule.cpp:22-32); timezones may be negative.
pub fn adjust_timezone(src: i64, dest: i64, adjust_min: i64) -> i64 {
    let new_tz = if dest - src > 0 {
        src + adjust_min
    } else {
        src - adjust_min
    };
    if dest > src {
        dest.min(new_tz)
    } else {
        dest.max(new_tz)
    }
}

/// Per-duty acclimatisation state from rule 7500 (ref at duty start + ref at duty end/rest start).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AccDutyRef {
    pub ref_tz_min: i64,
    pub duty_end_ref_tz_min: i64,
}

/// One crew-specific duty input for the bounded 7500 Ref timezone batch API.
///
/// The caller supplies one row per `(crew_id, pairing_id, duty_seq)`. Segment-level
/// duplication belongs to the caller because 7500 state is duty-level, not segment-level.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AccDutyInput {
    pub crew_id: String,
    pub pairing_id: i64,
    pub duty_seq: i64,
    pub duty: AccDuty,
}

/// A 7500 Ref timezone result identified by its crew/pairing/duty key.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AccDutyRefOutput {
    pub crew_id: String,
    pub pairing_id: i64,
    pub duty_seq: i64,
    pub ref_tz_min: i64,
    pub duty_end_ref_tz_min: i64,
}

/// Per-duty acclimatisation reference timezones, C++ `CalculateDuty` DailyAdjustment branch.
/// `stay_per_min` = "Stay Duration per X Hours" (e.g. 1440), `adjust_min` = "ACC TZ
/// Adjust X Hours" (e.g. 60). The `AcclimatizationStayPeriod` branch is a C++ TODO (no-op).
pub fn acc_duty_refs(duties: &[AccDuty], stay_per_min: i64, adjust_min: i64) -> Vec<AccDutyRef> {
    let mut out = Vec::with_capacity(duties.len());
    if duties.is_empty() {
        return out;
    }
    let mut moving = duties[0].dep_tz_min;
    let mut prev_before = duties[0].dep_tz_min;
    let mut stay_start = duties[0].effective_last_flight_arrival_utc();
    out.push(AccDutyRef {
        ref_tz_min: duties[0].dep_tz_min,
        duty_end_ref_tz_min: duties[0].dep_tz_min,
    });

    for d in &duties[1..] {
        let mut ref_tz = moving;
        let duty_end_ref;
        let (dep, arr) = (d.dep_tz_min, d.arr_tz_min);
        if dep == arr {
            let stay_min = (d.effective_first_flight_departure_utc() - stay_start) / 60;
            let factor = if stay_per_min > 0 {
                stay_min / stay_per_min
            } else {
                0
            };
            if factor > 0 {
                let acc = adjust_timezone(prev_before, dep, factor * adjust_min);
                ref_tz = acc;
                moving = acc;
            }
            let mut end_ref = moving;
            let stay_min2 = (d.effective_last_flight_arrival_utc() - stay_start) / 60;
            let factor2 = if stay_per_min > 0 {
                stay_min2 / stay_per_min
            } else {
                0
            };
            if factor2 > 0 {
                moving = adjust_timezone(prev_before, arr, factor2 * adjust_min);
                end_ref = moving;
            }
            duty_end_ref = end_ref;
        } else {
            let stay_min = (d.effective_first_flight_departure_utc() - stay_start) / 60;
            let factor = if stay_per_min > 0 {
                stay_min / stay_per_min
            } else {
                0
            };
            if factor > 0 {
                let acc = adjust_timezone(prev_before, dep, factor * adjust_min);
                ref_tz = acc;
                moving = acc;
                prev_before = acc;
            }
            duty_end_ref = ref_tz;
            stay_start = d.effective_last_flight_arrival_utc();
        }
        out.push(AccDutyRef {
            ref_tz_min: ref_tz,
            duty_end_ref_tz_min: duty_end_ref,
        });
    }
    out
}

/// Calculate 7500 Ref timezones independently for each crew.
///
/// Inputs may arrive in any order. Each crew's duties are evaluated chronologically, while
/// results retain the input order so callers can write values back to their source rows.
/// `pairing_id` is intentionally only an output key: two crews on the same pairing do not
/// share acclimatisation state.
pub fn acc_duty_refs_for_crew_duties(
    inputs: &[AccDutyInput],
    stay_per_min: i64,
    adjust_min: i64,
) -> Vec<AccDutyRefOutput> {
    let mut by_crew: BTreeMap<&str, Vec<(usize, &AccDutyInput)>> = BTreeMap::new();
    for (index, input) in inputs.iter().enumerate() {
        by_crew
            .entry(input.crew_id.as_str())
            .or_default()
            .push((index, input));
    }

    let mut outputs: Vec<Option<AccDutyRefOutput>> = vec![None; inputs.len()];
    for (crew_id, mut crew_inputs) in by_crew {
        crew_inputs.sort_by_key(|(_, input)| {
            (
                input.duty.start_utc,
                input.duty.end_utc,
                input.pairing_id,
                input.duty_seq,
            )
        });
        let duties: Vec<AccDuty> = crew_inputs.iter().map(|(_, input)| input.duty).collect();
        let refs = acc_duty_refs(&duties, stay_per_min, adjust_min);
        for ((index, input), duty_ref) in crew_inputs.into_iter().zip(refs) {
            outputs[index] = Some(AccDutyRefOutput {
                crew_id: crew_id.to_string(),
                pairing_id: input.pairing_id,
                duty_seq: input.duty_seq,
                ref_tz_min: duty_ref.ref_tz_min,
                duty_end_ref_tz_min: duty_ref.duty_end_ref_tz_min,
            });
        }
    }

    outputs
        .into_iter()
        .map(|output| output.expect("every 7500 batch input must produce one output"))
        .collect()
}

// ===========================================================================
//  Rule 7503 — LIMITS OF CONSECUTIVE WOCLs (CARS)
//  Source: crewrule-dev/RuleEngine/rule/rule7503/LimitConsecutiveWoclForCARSRule.cpp
//  (`CheckRule`). **No gtest** — contract derived from the active checker.
//
//  A WOCL duty = a flight duty whose FDP overlaps the WOCL window [WOCL Start, WOCL End]
//  (02:00–05:59 local, F8) in the crew's acclimatisation-local time (rule 7500's ref TZ;
//  base TZ in the live port). Consecutive WOCL duties accumulate UNLESS a full LOCAL NIGHT
//  (rule 2014's band, ≥ Min Interval) of rest separates two of them, or a ground duty / a
//  non-WOCL duty intervenes (either resets the run). The run is a violation when its size
//  is strictly greater than MAX CONSECUTIVE WOCLs (`> max`).
//    message: "Concecutive WOCL duties(N) is more than the limitation(M)." (C++ verbatim,
//             including the legacy "Concecutive" spelling — fidelity to the oracle).
//
//  The local-night count reuses 2014's `LocalNightDef`, exactly as the C++ 7503 calls
//  `DutyUtils::GetLocalNightNums` with the global Local Night Definition.
// ===========================================================================

/// One work period for the WOCL scan: a flight duty (`is_ground=false`) tested for WOCL, or
/// a ground roster (`is_ground=true`) that only resets the consecutive run.
#[derive(Debug, Clone, PartialEq)]
pub struct WoclWorkPeriod {
    /// Triggering pairing for the gantt (None for ground rosters).
    pub pairing_id: Option<i64>,
    /// Duty span (UTC seconds); FDP is approximated by the duty span in the live port.
    pub start_utc: i64,
    pub end_utc: i64,
    /// Acclimatisation TZ offset (minutes east of UTC) for this duty (rule 7500; base TZ live).
    pub offset_min: i64,
    pub is_ground: bool,
}

/// A consecutive-WOCL violation for one crew: a run of `count` WOCL duties exceeding `max`.
#[derive(Debug, Clone, PartialEq)]
pub struct WoclViolation {
    pub crew_id: String,
    /// Triggering pairing = the FIRST WOCL duty in the run (for the gantt).
    pub pairing_id: i64,
    pub start_utc: i64,
    pub end_utc: i64,
    pub count: i64,
    pub max_limit: i64,
}

impl WoclViolation {
    /// C++ violation message (LimitConsecutiveWoclForCARSRule.cpp:135, "Concecutive" verbatim).
    pub fn message(&self) -> String {
        format!(
            "Concecutive WOCL duties({}) is more than the limitation({}).",
            self.count, self.max_limit
        )
    }
}

const SECONDS_PER_DAY_7503: i64 = 86_400;

/// 4-endpoint overlap of `[cs,ce]` and `[ts,te]` (C++ `TimeUtils::IsAbsoluteTimesCovered`).
fn abs_times_covered(cs: i64, ce: i64, ts: i64, te: i64) -> bool {
    (cs >= ts && cs <= te)
        || (ce >= ts && ce <= te)
        || (ts >= cs && ts <= ce)
        || (te >= cs && te <= ce)
}

/// C++ `TimeUtils::IsTimesCovered`: does local `[check_start,check_end]` (seconds) overlap the
/// daily window `[start_min,end_min]` (minutes-of-day), mapped onto a 2-day period?
fn wocl_times_covered(check_start: i64, check_end: i64, start_min: i64, end_min: i64) -> bool {
    let day = check_start - check_start.rem_euclid(SECONDS_PER_DAY_7503);
    let (t1s, t1e, t2s, t2e) = if end_min >= start_min {
        (
            day + start_min * 60,
            day + end_min * 60,
            day + SECONDS_PER_DAY_7503 + start_min * 60,
            day + SECONDS_PER_DAY_7503 + end_min * 60,
        )
    } else {
        (
            day - SECONDS_PER_DAY_7503 + start_min * 60,
            day + end_min * 60,
            day + start_min * 60,
            day + SECONDS_PER_DAY_7503 + end_min * 60,
        )
    };
    abs_times_covered(check_start, check_end, t1s, t1e)
        || abs_times_covered(check_start, check_end, t2s, t2e)
}

/// Number of local nights of rest in local `[start_loc,end_loc]` (seconds). Faithful to C++
/// `DutyUtils::GetLocalNightNums`: widens the band symmetrically when its duration is below
/// `min_rest_min`, then counts days whose band overlaps the rest by ≥ `min_rest_min`.
pub fn local_night_count(
    start_loc: i64,
    end_loc: i64,
    night_start_min: i64,
    night_end_min: i64,
    min_rest_min: i64,
) -> i64 {
    let mut ln_start = night_start_min;
    let mut ln_end = night_end_min;
    // C++ GetDurationOfHHmm: minutes between start and end (handles the cross-midnight wrap).
    let interval = if ln_end >= ln_start {
        ln_end - ln_start
    } else {
        1440 - ln_start + ln_end
    };
    if interval < min_rest_min {
        let pad = min_rest_min - interval;
        ln_start -= pad;
        ln_end += pad;
    }
    let floor_day = |t: i64| t - t.rem_euclid(SECONDS_PER_DAY_7503);
    let start_day = floor_day(start_loc);
    let end_day = floor_day(end_loc);
    let mut count_start = start_day;
    let mut interval_days = (end_day - start_day) / SECONDS_PER_DAY_7503;
    if ln_end <= ln_start {
        count_start -= SECONDS_PER_DAY_7503;
        interval_days += 1;
    }
    let mut nights = 0;
    for d in 0..interval_days {
        let base = count_start + d * SECONDS_PER_DAY_7503;
        let lo = base + ln_start * 60;
        let hi = if ln_end > ln_start {
            base + ln_end * 60
        } else {
            base + SECONDS_PER_DAY_7503 + ln_end * 60
        };
        if abs_times_covered(start_loc, end_loc, lo, hi) {
            let s = start_loc.max(lo);
            let e = end_loc.min(hi);
            if (e - s) / 60 >= min_rest_min {
                nights += 1;
            }
        }
    }
    nights
}

/// Rule 7503 (editor mode) for one crew. `periods` need not be pre-sorted (ordered by start
/// here). Flags each run of consecutive WOCL duties whose size exceeds `max_consecutive`,
/// attributed to the first duty's pairing. `lnd` is rule 2014's Local Night Definition.
pub fn check_consecutive_wocl(
    crew_id: &str,
    periods: &[WoclWorkPeriod],
    wocl_start_min: i64,
    wocl_end_min: i64,
    max_consecutive: i64,
    lnd: &LocalNightDef,
) -> Vec<WoclViolation> {
    check_consecutive_wocl_app(
        crew_id,
        periods,
        wocl_start_min,
        wocl_end_min,
        max_consecutive,
        lnd,
        Application::Editor,
        &[],
    )
}

/// `check_consecutive_wocl` with optimizer/PA-ignore. `pre_assigned[i]` ↔ `periods[i]`.
/// In `Application::Optimizer` a consecutive-WOCL run that exceeds `max_consecutive` is
/// tolerated when ALL duties in the run are pre-assigned. If any duty in the run is newly
/// assigned (non-PA), the violation fires. The C++ (`LimitConsecutiveWoclForCARSRule.cpp:102`)
/// hard-fails on ANY violation in optimizer mode; the Rust adds the per-roster PA granularity
/// consistent with all other migrated checkers.
pub fn check_consecutive_wocl_app(
    crew_id: &str,
    periods: &[WoclWorkPeriod],
    wocl_start_min: i64,
    wocl_end_min: i64,
    max_consecutive: i64,
    lnd: &LocalNightDef,
    app: Application,
    pre_assigned: &[bool],
) -> Vec<WoclViolation> {
    // Attach the PA flag to each period (by original index) before sorting.
    let mut sorted: Vec<(&WoclWorkPeriod, bool)> = periods
        .iter()
        .enumerate()
        .map(|(i, p)| (p, pre_assigned_at(pre_assigned, i)))
        .collect();
    sorted.sort_by_key(|(w, _)| (w.start_utc, w.end_utc));

    let mut out = Vec::new();
    let mut run: Vec<(&WoclWorkPeriod, bool)> = Vec::new();
    for &(wp, is_pa) in &sorted {
        if wp.is_ground {
            run.clear();
            continue;
        }
        let valid = wp.start_utc > 0 && wp.end_utc > 0;
        let is_wocl = valid
            && wocl_times_covered(
                wp.start_utc + wp.offset_min * 60,
                wp.end_utc + wp.offset_min * 60,
                wocl_start_min,
                wocl_end_min,
            );
        if !is_wocl {
            run.clear();
            continue;
        }
        if run.is_empty() {
            run.push((wp, is_pa));
        } else {
            let rest_start = run.last().unwrap().0.end_utc;
            let rest_end = wp.start_utc;
            let nights = local_night_count(
                rest_start + wp.offset_min * 60,
                rest_end + wp.offset_min * 60,
                lnd.start_min,
                lnd.end_min,
                lnd.min_rest_secs / 60,
            );
            if nights < 1 {
                run.push((wp, is_pa));
            } else {
                run = vec![(wp, is_pa)];
            }
        }
        if run.len() as i64 > max_consecutive {
            // Optimizer: tolerate iff every duty in the run is pre-assigned.
            let all_pa = run.iter().all(|(_, pa)| *pa);
            if !(app.is_optimizer() && all_pa) {
                let first_wp = run[0].0;
                let last_wp = run.last().unwrap().0;
                out.push(WoclViolation {
                    crew_id: crew_id.to_string(),
                    pairing_id: first_wp.pairing_id.unwrap_or(0),
                    start_utc: first_wp.start_utc,
                    end_utc: last_wp.end_utc,
                    count: run.len() as i64,
                    max_limit: max_consecutive,
                });
            }
            run.clear();
        }
    }
    out
}

// ===========================================================================
//  Rule 7504 — SPACING RULE - WOCL (min rest between WOCL flight duties)
//  Source: crewrule-dev/RuleEngine/rule/rule7504/CheckMinSpaceBetweenDutyForF8Rule.cpp
//  + CheckMinSpaceBetweenDutyForF8RuleParam.cpp (`CheckMinRest`).
//  Oracle: crewrule-dev/RuleTest/rule7504_gtest.cpp.
//
//  F8 7504/003: Prev Assignment=FLY, Next Assignment=FLY, Prev/Next Attributes=WOCL,
//  Level=D (duty), Utilize Post Rest=Y, Min Period=55, Unit=RH. A duty is a WOCL duty when
//  its FDP overlaps the WOCL window [02:00,05:59] in CREW-BASE-local time (the gtest's
//  `APPLY PRELABELLED ATTRIBUTES=N` path — "WOCL evaluated in crew-base local time"; same
//  base-TZ simplification 7503 uses live). Between two WOCL flight duties the rest gap must
//  be at least Min Period RH; a gap below it is a violation (`CheckMinRest`: violate iff
//  `gapEnd < gapStart + minPeriod*3600`, i.e. gap < MinPeriod hours, strict).
//    message: "The space between duty(START - END) is less than the minumum rest time
//             (P unit)." (C++ verbatim, incl. the legacy "minumum" spelling.)
//
//  Live-port emission (documented, the 8056 precedent): the C++ checks ALL ordered pairs of
//  matching WOCL duties, but a non-consecutive pair's gap is strictly larger than the
//  consecutive pair sharing its earlier duty, so emitting one violation per CONSECUTIVE
//  WOCL-duty pair is the minimal faithful set (one row per triggering pairing; satisfies the
//  rule_violation UNIQUE). Utilize Post Rest=Y → the gap starts at the duty end; Utilize
//  Post Rest=N → the gap starts at end including post-duty rest. Unit RH =
//  check_min_space_wocl; Unit CD = check_min_space_wocl_cd (forked APIs — CD must not
//  change RH). F8 live 7504/003 uses RH.
// ===========================================================================

/// One flight duty for the WOCL-spacing check. `offset_min` = crew-base TZ (for the WOCL
/// classification + the local-time violation message).
#[derive(Debug, Clone, PartialEq)]
pub struct WoclSpacingDuty {
    pub pairing_id: i64,
    pub start_utc: i64,
    pub end_utc: i64,
    pub offset_min: i64,
}

/// A 7504 violation: two WOCL flight duties closer than Min Period RH.
#[derive(Debug, Clone, PartialEq)]
pub struct WoclSpacingViolation {
    pub crew_id: String,
    /// Triggering pairing = the earlier (current) duty's pairing.
    pub pairing_id: i64,
    pub gap_start_utc: i64,
    pub gap_end_utc: i64,
    pub offset_min: i64,
    pub actual_minutes: i64,
    pub limit_minutes: i64,
}

/// Format a UTC instant as local `YYYY-MM-DD HH:MM` (offset = minutes east of UTC).
pub fn format_local_dt(utc_secs: i64, offset_min: i64) -> String {
    let local = utc_secs + offset_min * 60;
    let day = local.div_euclid(86_400);
    let secs = local.rem_euclid(86_400);
    let (y, m, d) = civil_from_days(day);
    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}",
        y,
        m,
        d,
        secs / 3600,
        (secs % 3600) / 60
    )
}

impl WoclSpacingViolation {
    pub fn actual_hours(&self) -> f64 {
        self.actual_minutes as f64 / 60.0
    }
    /// C++ message (CheckMinSpaceBetweenDutyForF8Rule.cpp:262, "minumum" verbatim);
    /// `period_str`/`unit` from param_json (e.g. "55"/"RH").
    pub fn message(&self, period_str: &str, unit: &str) -> String {
        format!(
            "The space between duty({} - {}) is less than the minumum rest time ({} {}).",
            format_local_dt(self.gap_start_utc, self.offset_min),
            format_local_dt(self.gap_end_utc, self.offset_min),
            period_str,
            unit,
        )
    }
}

/// Rule 7504 (editor mode) for one crew. Filters to WOCL flight duties (FDP overlaps the
/// WOCL window in base-local time), then flags each CONSECUTIVE WOCL-duty pair whose rest
/// gap is below `min_period_hours` (Unit=RH). `duties` need not be pre-sorted.
pub fn check_min_space_wocl(
    crew_id: &str,
    duties: &[WoclSpacingDuty],
    wocl_start_min: i64,
    wocl_end_min: i64,
    min_period_hours: i64,
) -> Vec<WoclSpacingViolation> {
    check_min_space_wocl_app(
        crew_id,
        duties,
        wocl_start_min,
        wocl_end_min,
        min_period_hours,
        Application::Editor,
        &[],
    )
}

/// `check_min_space_wocl` with optimizer/PA-ignore. `pre_assigned[i]` ↔ `duties[i]`.
/// In `Application::Optimizer` a spacing pair is tolerated when BOTH the preceding and
/// the following WOCL duty are pre-assigned. If either duty in the pair is newly
/// assigned (non-PA), the violation fires. The C++ (`CheckMinSpaceBetweenDutyForF8Rule.cpp:129,183,240`)
/// hard-fails on ANY violation in optimizer mode; the Rust adds the per-roster PA
/// granularity consistent with all other migrated checkers (mirrors the 8056 pattern).
pub fn check_min_space_wocl_app(
    crew_id: &str,
    duties: &[WoclSpacingDuty],
    wocl_start_min: i64,
    wocl_end_min: i64,
    min_period_hours: i64,
    app: Application,
    pre_assigned: &[bool],
) -> Vec<WoclSpacingViolation> {
    // Attach the PA flag to each duty (by original index) before sorting.
    let mut wocl: Vec<(&WoclSpacingDuty, bool)> = duties
        .iter()
        .enumerate()
        .filter(|(_, d)| {
            d.start_utc > 0
                && d.end_utc > 0
                && wocl_times_covered(
                    d.start_utc + d.offset_min * 60,
                    d.end_utc + d.offset_min * 60,
                    wocl_start_min,
                    wocl_end_min,
                )
        })
        .map(|(i, d)| (d, pre_assigned_at(pre_assigned, i)))
        .collect();
    wocl.sort_by_key(|(d, _)| (d.start_utc, d.end_utc));

    let min_secs = min_period_hours * 3_600;
    let limit_minutes = min_period_hours * 60;
    let mut out = Vec::new();
    for pair in wocl.windows(2) {
        let (cur, cur_pa) = pair[0];
        let (nxt, nxt_pa) = pair[1];
        // Optimizer: tolerate iff BOTH duties in the pair are pre-assigned (mirrors 8056).
        if app.is_optimizer() && cur_pa && nxt_pa {
            continue;
        }
        // Utilize Post Rest=Y → gap starts at the duty end.
        let gap_start = cur.end_utc;
        let gap_end = nxt.start_utc;
        if gap_end < gap_start + min_secs {
            out.push(WoclSpacingViolation {
                crew_id: crew_id.to_string(),
                pairing_id: cur.pairing_id,
                gap_start_utc: gap_start,
                gap_end_utc: gap_end,
                offset_min: cur.offset_min,
                actual_minutes: (gap_end - gap_start) / 60,
                limit_minutes,
            });
        }
    }
    out
}

/// Rule 7504 Unit=CD (editor). Same WOCL filter as RH, but rest uses C++ calendar-day
/// `CheckMinRest`: `minRestEnd = localDayStart(gapStart, offset) + 1d + minPeriod*1d`.
/// Crew-base `offset_min` (not airport TZ — intentional vs C++). On violation,
/// `actual_minutes` / `limit_minutes` hold **calendar days** (not minutes).
pub fn check_min_space_wocl_cd(
    crew_id: &str,
    duties: &[WoclSpacingDuty],
    wocl_start_min: i64,
    wocl_end_min: i64,
    min_period_days: i64,
) -> Vec<WoclSpacingViolation> {
    check_min_space_wocl_cd_app(
        crew_id,
        duties,
        wocl_start_min,
        wocl_end_min,
        min_period_days,
        Application::Editor,
        &[],
    )
}

/// CD variant of `check_min_space_wocl_app` (optimizer PA tolerance identical to RH).
pub fn check_min_space_wocl_cd_app(
    crew_id: &str,
    duties: &[WoclSpacingDuty],
    wocl_start_min: i64,
    wocl_end_min: i64,
    min_period_days: i64,
    app: Application,
    pre_assigned: &[bool],
) -> Vec<WoclSpacingViolation> {
    let mut wocl: Vec<(&WoclSpacingDuty, bool)> = duties
        .iter()
        .enumerate()
        .filter(|(_, d)| {
            d.start_utc > 0
                && d.end_utc > 0
                && wocl_times_covered(
                    d.start_utc + d.offset_min * 60,
                    d.end_utc + d.offset_min * 60,
                    wocl_start_min,
                    wocl_end_min,
                )
        })
        .map(|(i, d)| (d, pre_assigned_at(pre_assigned, i)))
        .collect();
    wocl.sort_by_key(|(d, _)| (d.start_utc, d.end_utc));

    let mut out = Vec::new();
    for pair in wocl.windows(2) {
        let (cur, cur_pa) = pair[0];
        let (nxt, nxt_pa) = pair[1];
        if app.is_optimizer() && cur_pa && nxt_pa {
            continue;
        }
        let gap_start = cur.end_utc;
        let gap_end = nxt.start_utc;
        let day_start = local_day_start_utc(gap_start, cur.offset_min);
        let min_rest_end = day_start + 86_400 + min_period_days * 86_400;
        if gap_end < min_rest_end {
            let actual_days = (gap_end - day_start).div_euclid(86_400) - 1;
            out.push(WoclSpacingViolation {
                crew_id: crew_id.to_string(),
                pairing_id: cur.pairing_id,
                gap_start_utc: gap_start,
                gap_end_utc: gap_end,
                offset_min: cur.offset_min,
                actual_minutes: actual_days,
                limit_minutes: min_period_days,
            });
        }
    }
    out
}

// ============================================================================
// Rule 7505/002 — MIN # GDOs IN A RP (Minimum Guaranteed Days Off per Rostering
// Period). Ported from `crewrule-dev/RuleEngine/rule/rule7505/
// MinimumDaysOffForCARSRule.cpp` + its oracle `RuleTest/rule7505_gtest.cpp`.
//
// Per crew, per rostering-period window the crew must have at least MIN DO days off.
// A "day off" (C++ `howManyDaysOffInRanges`) is a crew-base-local calendar day that
// is: blank (COUNT BLANK DAY=Y), or covered only by DO-group assignments (or a
// LAYOVER, or DO + an exception assignment {SNY,DPW,DPV}). MIN DO is read from the
// band row whose RP-DAYS-RANGE matches the period length AND whose LEAVE-DAYS-RANGE
// contains the crew's leave-assignment (VAC) day-count — so more leave ⇒ fewer
// required days off. Violation ⇔ `daysOff < MIN DO` (strict `<`), severity Soft.
// ============================================================================

/// UTC timestamp of the start of the crew-base-LOCAL calendar day containing `utc`
/// (C++ `Utility::getLocalDayStartInUTC`). `offset_min` = base UTC offset in minutes.
pub fn local_day_start_utc(utc: i64, offset_min: i64) -> i64 {
    let local = utc + offset_min * 60;
    local.div_euclid(86_400) * 86_400 - offset_min * 60
}

/// Convert inclusive RP calendar ordinals to a half-open UTC window whose
/// endpoints are crew-base **local** midnights (C++ / 7505 unit-test contract).
/// `offset_min` = base UTC offset in minutes (east of UTC).
pub fn rp_ordinal_bounds_to_local_utc(
    rp_start_ord: i64,
    rp_end_ord: i64,
    offset_min: i64,
) -> (i64, i64) {
    const SECONDS_PER_DAY: i64 = 86_400;
    let rp_start_utc = rp_start_ord * SECONDS_PER_DAY - offset_min * 60;
    let rp_end_utc = (rp_end_ord + 1) * SECONDS_PER_DAY - offset_min * 60;
    (rp_start_utc, rp_end_utc)
}

/// One crew activity (roster) as seen by 7505: the assignment code plus its UTC span.
///
/// Live/PyO3 mapping (names are historical):
/// - `end_utc` = duty/pairing end ≡ C++ `actRestStrUtc`
/// - `rest_start_utc` = end **including** post-duty rest ≡ C++ `actEndUtc`
///
/// Occupancy end follows C++ 8023/7505 (counterintuitive param): see
/// [`activity_occupy_end_utc`].
#[derive(Debug, Clone)]
pub struct Activity7505 {
    pub code: String,
    /// Assignment group (e.g. "DO"), distinct from the assignment code (e.g. "GDO").
    pub assignment_group: String,
    pub start_utc: i64,
    pub end_utc: i64,
    pub rest_start_utc: i64,
    /// Live/PBS pairing id for C++ Count Layover span fill + duty-gap synthesis.
    /// `None` = ground / unpaired activity (no span fill or layover synthesis).
    pub pairing_id: Option<i64>,
}

/// C++ `howManyDaysOffInRanges`: `bCountPostRest ? actRestStrUtc : actEndUtc`.
///
/// With Live/Py fields: Utilize Post Duty Rest=**Y** → `end_utc` (duty end so rest
/// can count as blank/DO); **N** → `rest_start_utc` (paint through including-rest).
fn activity_occupy_end_utc(a: &Activity7505, count_post_rest: bool) -> i64 {
    if count_post_rest {
        a.end_utc
    } else {
        a.rest_start_utc
    }
}

/// Clamp occupy end for 2015 DO Start grace (rule 2015).
///
/// When `do_start_min > 0` and the local time-of-day of `roster_end` is strictly
/// before that many minutes past local midnight, treat the end as that day's local
/// midnight so subsequent exclusive-midnight paint stops on the previous day.
/// `do_start_min == 0` (missing 2015) → no-op (today's DO/blank logic).
pub fn apply_do_start_occupy_end(roster_end: i64, offset_min: i64, do_start_min: i64) -> i64 {
    if do_start_min <= 0 {
        return roster_end;
    }
    let local = roster_end + offset_min * 60;
    let tod = local.rem_euclid(86_400);
    let do_start_secs = do_start_min.saturating_mul(60);
    if tod > 0 && tod < do_start_secs {
        local_day_start_utc(roster_end, offset_min)
    } else {
        roster_end
    }
}

/// Exclusive local-midnight then optional 2015 DO-start grace for 7505 paint ends.
fn paint_occupy_end_utc(roster_end0: i64, offset_min: i64, do_start_min: i64) -> i64 {
    let mut roster_end = apply_do_start_occupy_end(roster_end0, offset_min, do_start_min);
    if (roster_end + offset_min * 60) % 86_400 == 0 {
        roster_end -= 1;
    }
    roster_end
}

/// One band row of 7505/002 — a (RP-days, leave-days) → MIN DO requirement.
/// Rule 7507 reuses the same row with optional fly/reserve day-count filters.
#[derive(Debug, Clone)]
pub struct DaysOffRow {
    pub min_do: i64,
    /// Assignment codes in the DO group (e.g. ["DO"]); a day covered only by these is off.
    pub do_codes: Vec<String>,
    /// LEAVE ASSIGNMENTS codes (e.g. ["VAC"]); their day-count selects the band row.
    pub leave_codes: Vec<String>,
    pub count_blank: bool,
    /// Whether a middle layover day is treated as a day off.
    pub count_layover: bool,
    /// C++ UTILIZE POST DUTY REST: Y → occupy through duty end; N → through rest end.
    pub count_post_rest: bool,
    pub rp_days_lower: i64,
    pub rp_days_upper: i64,
    pub leave_days_lower: i64,
    pub leave_days_upper: i64,
    /// PERIOD / UNIT for the message (e.g. "1" / "RP").
    pub period: String,
    pub unit: String,
    /// 7507 NUM FLY DAY range; ignored when `fly_assignments` is unrestricted.
    pub fly_days_lower: i64,
    pub fly_days_upper: i64,
    /// 7507 FLY ASSIGNMENTS; empty / `*` → no fly-day filter.
    pub fly_assignments: Vec<String>,
    /// 7507 NUM RESERVES range; ignored when `reserve_assignments` is unrestricted.
    pub reserve_days_lower: i64,
    pub reserve_days_upper: i64,
    /// 7507 RES ASSIGNMENTS; empty / `*` → no reserve-day filter.
    pub reserve_assignments: Vec<String>,
}

/// Unrestricted fly/reserve filters (7505 behavior / wildcard template).
pub fn unrestricted_assignment_day_filters() -> (i64, i64, Vec<String>, i64, i64, Vec<String>) {
    (0, i64::MAX, Vec::new(), 0, i64::MAX, Vec::new())
}

fn assignment_day_filter_applies(codes: &[String]) -> bool {
    !codes.is_empty() && codes.iter().all(|c| c.trim() != "*")
}

/// Empty / `*` → unrestricted (empty vec). Otherwise uppercase trimmed codes.
fn normalize_assignment_filter_codes(codes: &[String]) -> Vec<String> {
    let out: Vec<String> = codes
        .iter()
        .flat_map(|value| value.split(|ch| ch == ',' || ch == '|'))
        .map(|value| value.trim().to_ascii_uppercase())
        .filter(|value| !value.is_empty())
        .collect();
    if out.is_empty() || out.iter().any(|c| c == "*") {
        Vec::new()
    } else {
        out
    }
}

/// Rule 7505 crew applicability filters from one parameter row.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DaysOffScope {
    pub bases: Vec<String>,
    pub ranks: Vec<String>,
    pub fleets: Vec<String>,
    pub teams: Vec<String>,
}

/// Effective-dated crew scope used to evaluate 7505 applicability.
#[derive(Debug, Clone, Default)]
pub struct CrewScope7505 {
    pub bases: Vec<QualEntry>,
    pub ranks: Vec<QualEntry>,
    pub fleets: Vec<QualEntry>,
    pub teams: Vec<QualEntry>,
}

/// A 7505 band row plus its crew applicability filters.
#[derive(Debug, Clone)]
pub struct ScopedDaysOffRow {
    pub scope: DaysOffScope,
    pub row: DaysOffRow,
}

#[derive(Debug, Clone, Default)]
pub struct Parsed7505Input {
    pub rows: Vec<ScopedDaysOffRow>,
    pub by_crew: BTreeMap<String, Vec<Activity7505>>,
    pub crew_scopes: BTreeMap<String, CrewScope7505>,
    pub skipped: usize,
}

fn normalize_7505_scope_values(values: &[String]) -> Vec<String> {
    values
        .iter()
        .flat_map(|value| value.split('|'))
        .map(|value| value.trim().to_ascii_uppercase())
        .filter(|value| !value.is_empty() && value != "*")
        .collect()
}

fn matches_7505_scope_values(
    values: &[String],
    quals: &[QualEntry],
    checked_start: i64,
    checked_end: i64,
    inclusive_exp: bool,
) -> bool {
    let wanted = normalize_7505_scope_values(values);
    if wanted.is_empty() {
        return true;
    }
    quals.iter().any(|qual| {
        let date_ok = qual.eff_s <= checked_end
            && (qual.exp_s == i64::MAX
                || if inclusive_exp {
                    qual.exp_s >= checked_start
                } else {
                    qual.exp_s > checked_start
                });
        date_ok && wanted.contains(&qual.value.trim().to_ascii_uppercase())
    })
}

/// Returns whether a 7505 parameter row applies to a crew over the checked window.
pub fn scope_matches_7505(
    scope: &DaysOffScope,
    crew: &CrewScope7505,
    checked_start: i64,
    checked_end: i64,
) -> bool {
    matches_7505_scope_values(&scope.bases, &crew.bases, checked_start, checked_end, false)
        && matches_7505_scope_values(&scope.ranks, &crew.ranks, checked_start, checked_end, false)
        && matches_7505_scope_values(
            &scope.fleets,
            &crew.fleets,
            checked_start,
            checked_end,
            false,
        )
        && matches_7505_scope_values(&scope.teams, &crew.teams, checked_start, checked_end, true)
}

/// Filters scoped 7505 rows down to the existing unscoped days-off kernel input.
pub fn filter_days_off_rows_for_crew(
    scoped_rows: &[ScopedDaysOffRow],
    crew: &CrewScope7505,
    checked_start: i64,
    checked_end: i64,
) -> Vec<DaysOffRow> {
    scoped_rows
        .iter()
        .filter(|row| scope_matches_7505(&row.scope, crew, checked_start, checked_end))
        .map(|row| row.row.clone())
        .collect()
}

fn csv_7505(s: &str) -> Vec<String> {
    s.split(',')
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect()
}

fn scope_field_7505(s: &str) -> Vec<String> {
    let value = s.trim();
    if value.is_empty() || value == "*" {
        Vec::new()
    } else {
        vec![value.to_string()]
    }
}

fn parse_i64_7505(s: &str) -> i64 {
    s.trim().parse().unwrap_or(0)
}

fn parse_7505_eff_day(s: &str) -> i64 {
    let value = parse_i64_7505(s);
    if value < 0 {
        0
    } else {
        value.saturating_mul(86_400)
    }
}

fn parse_7505_exp_day(s: &str) -> i64 {
    let value = parse_i64_7505(s);
    if value < 0 || value == i64::MAX {
        i64::MAX
    } else {
        value.saturating_mul(86_400)
    }
}

fn parse_bool_7505(s: &str) -> bool {
    matches!(
        s.trim().to_ascii_uppercase().as_str(),
        "1" | "Y" | "YES" | "TRUE"
    )
}

fn push_7505_qual(scope: &mut CrewScope7505, dim: &str, entry: QualEntry) -> bool {
    match dim.trim().to_ascii_uppercase().as_str() {
        "B" | "BASE" | "BASES" => scope.bases.push(entry),
        "R" | "RANK" | "RANKS" => scope.ranks.push(entry),
        "F" | "FLEET" | "FLEETS" => scope.fleets.push(entry),
        _ => return false,
    }
    true
}

pub fn parse_check_7505_input(input: &str) -> Parsed7505Input {
    let mut parsed = Parsed7505Input::default();
    for line in input.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let c: Vec<&str> = line.split('\t').collect();
        match c.first().copied() {
            Some("R") if c.len() >= 22 => {
                parsed.rows.push(ScopedDaysOffRow {
                    scope: DaysOffScope {
                        bases: scope_field_7505(c[1]),
                        ranks: scope_field_7505(c[2]),
                        fleets: scope_field_7505(c[3]),
                        teams: scope_field_7505(c[4]),
                    },
                    row: DaysOffRow {
                        min_do: parse_i64_7505(c[5]),
                        rp_days_lower: parse_i64_7505(c[6]),
                        rp_days_upper: parse_i64_7505(c[7]),
                        leave_days_lower: parse_i64_7505(c[8]),
                        leave_days_upper: parse_i64_7505(c[9]),
                        do_codes: csv_7505(c[10]),
                        leave_codes: csv_7505(c[11]),
                        count_blank: parse_bool_7505(c[12]),
                        count_post_rest: parse_bool_7505(c[13]),
                        period: c[14].to_string(),
                        unit: c[15].to_string(),
                        fly_days_lower: parse_i64_7505(c[16]),
                        fly_days_upper: parse_i64_7505(c[17]),
                        fly_assignments: normalize_assignment_filter_codes(&csv_7505(c[18])),
                        reserve_days_lower: parse_i64_7505(c[19]),
                        reserve_days_upper: parse_i64_7505(c[20]),
                        reserve_assignments: normalize_assignment_filter_codes(&csv_7505(c[21])),
                        // Optional trailing Count Layover after reserve codes (col 22).
                        count_layover: c.get(22).map_or(false, |v| parse_bool_7505(v)),
                    },
                });
            }
            Some("R") if c.len() >= 16 => {
                let (fly_lo, fly_hi, fly_codes, res_lo, res_hi, res_codes) =
                    unrestricted_assignment_day_filters();
                parsed.rows.push(ScopedDaysOffRow {
                    scope: DaysOffScope {
                        bases: scope_field_7505(c[1]),
                        ranks: scope_field_7505(c[2]),
                        fleets: scope_field_7505(c[3]),
                        teams: scope_field_7505(c[4]),
                    },
                    row: DaysOffRow {
                        min_do: parse_i64_7505(c[5]),
                        rp_days_lower: parse_i64_7505(c[6]),
                        rp_days_upper: parse_i64_7505(c[7]),
                        leave_days_lower: parse_i64_7505(c[8]),
                        leave_days_upper: parse_i64_7505(c[9]),
                        do_codes: csv_7505(c[10]),
                        leave_codes: csv_7505(c[11]),
                        count_blank: parse_bool_7505(c[12]),
                        count_post_rest: parse_bool_7505(c[13]),
                        period: c[14].to_string(),
                        unit: c[15].to_string(),
                        fly_days_lower: fly_lo,
                        fly_days_upper: fly_hi,
                        fly_assignments: fly_codes,
                        reserve_days_lower: res_lo,
                        reserve_days_upper: res_hi,
                        reserve_assignments: res_codes,
                        // Optional trailing Count Layover after unit (col 16).
                        count_layover: c.get(16).map_or(false, |v| parse_bool_7505(v)),
                    },
                });
            }
            Some("R") if c.len() >= 12 => {
                let (fly_lo, fly_hi, fly_codes, res_lo, res_hi, res_codes) =
                    unrestricted_assignment_day_filters();
                parsed.rows.push(ScopedDaysOffRow {
                    scope: DaysOffScope::default(),
                    row: DaysOffRow {
                        min_do: parse_i64_7505(c[1]),
                        rp_days_lower: parse_i64_7505(c[2]),
                        rp_days_upper: parse_i64_7505(c[3]),
                        leave_days_lower: parse_i64_7505(c[4]),
                        leave_days_upper: parse_i64_7505(c[5]),
                        do_codes: csv_7505(c[6]),
                        leave_codes: csv_7505(c[7]),
                        count_blank: parse_bool_7505(c[8]),
                        count_post_rest: parse_bool_7505(c[9]),
                        period: c[10].to_string(),
                        unit: c[11].to_string(),
                        fly_days_lower: fly_lo,
                        fly_days_upper: fly_hi,
                        fly_assignments: fly_codes,
                        reserve_days_lower: res_lo,
                        reserve_days_upper: res_hi,
                        reserve_assignments: res_codes,
                        count_layover: c.get(12).map_or(false, |v| parse_bool_7505(v)),
                    },
                });
            }
            Some("Q") if c.len() >= 6 => {
                let entry = QualEntry {
                    value: c[3].to_string(),
                    eff_s: parse_7505_eff_day(c[4]),
                    exp_s: parse_7505_exp_day(c[5]),
                };
                let scope = parsed.crew_scopes.entry(c[1].to_string()).or_default();
                if !push_7505_qual(scope, c[2], entry) {
                    parsed.skipped += 1;
                }
            }
            Some("T") if c.len() >= 3 => {
                let entry = QualEntry {
                    value: c[2].to_string(),
                    eff_s: c.get(3).map_or(0, |value| parse_7505_eff_day(value)),
                    exp_s: c.get(4).map_or(i64::MAX, |value| parse_7505_exp_day(value)),
                };
                parsed
                    .crew_scopes
                    .entry(c[1].to_string())
                    .or_default()
                    .teams
                    .push(entry);
            }
            Some("A") if c.len() >= 6 => {
                match (
                    c[3].parse::<i64>(),
                    c[4].parse::<i64>(),
                    c[5].parse::<i64>(),
                ) {
                    (Ok(s), Ok(e), Ok(r)) => {
                        let pairing_id = c.get(6).and_then(|v| {
                            let t = v.trim();
                            if t.is_empty() {
                                None
                            } else {
                                t.parse::<i64>().ok()
                            }
                        });
                        parsed
                            .by_crew
                            .entry(c[1].to_string())
                            .or_default()
                            .push(Activity7505 {
                                code: c[2].to_string(),
                                assignment_group: c[2].to_string(),
                                start_utc: s,
                                end_utc: e,
                                rest_start_utc: r,
                                pairing_id,
                            });
                    }
                    _ => parsed.skipped += 1,
                }
            }
            _ => parsed.skipped += 1,
        }
    }
    parsed
}

/// A shortfall: the crew had fewer days off than the matched row's MIN DO in the RP.
#[derive(Debug, Clone, PartialEq)]
pub struct MinDaysOffViolation {
    pub crew_id: String,
    pub rp_start_utc: i64,
    pub rp_end_utc: i64,
    pub days_off: i64,
    pub min_do: i64,
    pub period: String,
    pub unit: String,
}

impl MinDaysOffViolation {
    /// C++ `ThrowDaysOffShortViolation` message
    /// (`MinimumDaysOffForCARSRule.cpp:892`).
    pub fn message(&self) -> String {
        format!(
            "The number of days off({}) must be at least {} in {} {}.",
            self.days_off, self.min_do, self.period, self.unit,
        )
    }
}

/// Count crew-base-local days off in `[rp_start, rp_end)` per the C++
/// `howManyDaysOffInRanges` day-classification (blank / DO-only / DO+exception /
/// LAYOVER). When activities share `pairing_id`, empty days in the pairing span
/// are filled as working (C++ roster-level paint). When `count_layover`, middle
/// days between consecutive duties are overwritten as LAYOVER/DO.
fn count_days_off(
    acts: &[Activity7505],
    rp_start: i64,
    rp_end: i64,
    offset_min: i64,
    row: &DaysOffRow,
    do_start_min: i64,
) -> i64 {
    const EXCEPTION: [&str; 3] = ["SNY", "DPW", "DPV"];
    let mut day_map: BTreeMap<i64, Vec<usize>> = BTreeMap::new();
    let mut t = rp_start;
    while t < rp_end {
        day_map.insert(t, Vec::new());
        t += 86_400;
    }

    // Own a working activity list so layover synthesis can append synthetic LAYOVER rows.
    let mut acts_work: Vec<Activity7505> = acts.to_vec();

    let paint_activity = |day_map: &mut BTreeMap<i64, Vec<usize>>,
                          acts_work: &[Activity7505],
                          activity_index: usize,
                          count_post_rest: bool| {
        let a = &acts_work[activity_index];
        let roster_end0 = activity_occupy_end_utc(a, count_post_rest);
        if a.start_utc > rp_end || roster_end0 < rp_start {
            return;
        }
        let roster_end = paint_occupy_end_utc(roster_end0, offset_min, do_start_min);
        let day_start = local_day_start_utc(a.start_utc, offset_min);
        let day_end = local_day_start_utc(roster_end, offset_min);
        let days = (day_end - day_start) / 86_400 + 1;
        if days <= 0 {
            return;
        }
        for d in 0..days {
            let key = day_start + d * 86_400;
            if let Some(v) = day_map.get_mut(&key) {
                v.push(activity_index);
            }
        }
    };

    for i in 0..acts_work.len() {
        paint_activity(&mut day_map, &acts_work, i, row.count_post_rest);
    }

    // Group by pairing_id for span fill + layover synthesis.
    let mut by_pairing: BTreeMap<i64, Vec<usize>> = BTreeMap::new();
    for (i, a) in acts_work.iter().enumerate() {
        if let Some(pid) = a.pairing_id {
            by_pairing.entry(pid).or_default().push(i);
        }
    }

    // C++ roster-level paint: fill empty days in [min start, max occupy end] with a
    // representative working duty so Count Layover=N does not treat gaps as blank-DO.
    for indices in by_pairing.values() {
        if indices.is_empty() {
            continue;
        }
        let mut span_start = i64::MAX;
        let mut span_end = i64::MIN;
        for &i in indices {
            let a = &acts_work[i];
            span_start = span_start.min(a.start_utc);
            let end = activity_occupy_end_utc(a, row.count_post_rest);
            span_end = span_end.max(end);
        }
        if span_start == i64::MAX || span_end == i64::MIN {
            continue;
        }
        let roster_end = paint_occupy_end_utc(span_end, offset_min, do_start_min);
        let day_start = local_day_start_utc(span_start, offset_min);
        let day_end = local_day_start_utc(roster_end, offset_min);
        let days = (day_end - day_start) / 86_400 + 1;
        if days <= 0 {
            continue;
        }
        let anchor = indices[0];
        for d in 0..days {
            let key = day_start + d * 86_400;
            if let Some(v) = day_map.get_mut(&key) {
                if v.is_empty() {
                    v.push(anchor);
                }
            }
        }
    }

    // C++ Count Layover=Y: overwrite middle local days between consecutive duties.
    if row.count_layover {
        for indices in by_pairing.values() {
            let mut sorted = indices.clone();
            sorted.sort_by_key(|&i| (acts_work[i].start_utc, acts_work[i].end_utc));
            for w in sorted.windows(2) {
                let (duty_end_day, next_start_day, pairing_id) = {
                    let cur = &acts_work[w[0]];
                    let nxt = &acts_work[w[1]];
                    (
                        local_day_start_utc(cur.end_utc, offset_min),
                        local_day_start_utc(nxt.start_utc, offset_min),
                        cur.pairing_id,
                    )
                };
                let gap_days = (next_start_day - duty_end_day) / 86_400;
                if gap_days <= 1 {
                    continue;
                }
                let layover_idx = acts_work.len();
                acts_work.push(Activity7505 {
                    code: "LAYOVER".to_string(),
                    assignment_group: "LAYOVER".to_string(),
                    start_utc: duty_end_day + 86_400,
                    end_utc: next_start_day,
                    rest_start_utc: next_start_day,
                    pairing_id,
                });
                let mut key = duty_end_day + 86_400;
                while key < next_start_day {
                    if let Some(v) = day_map.get_mut(&key) {
                        v.clear();
                        v.push(layover_idx);
                    }
                    key += 86_400;
                }
            }
        }
    }

    let is_do = |index: usize| {
        row.do_codes
            .iter()
            .any(|x| x == &acts_work[index].assignment_group || x == &acts_work[index].code)
    };
    // C++: sole LAYOVER always counts as DO (flag only gates synthesis).
    let is_layover = |index: usize| acts_work[index].code == "LAYOVER";

    let mut off = 0i64;
    for codes in day_map.values() {
        if codes.is_empty() {
            if row.count_blank {
                off += 1;
            }
            continue;
        }
        if codes.len() == 1 {
            let activity_index = codes[0];
            // C++: sole DO-group OR sole LAYOVER counts as a day off.
            if is_do(activity_index) || is_layover(activity_index) {
                off += 1;
            }
            continue;
        }
        let mut has_do = false;
        let mut only_do = true;
        let mut has_exc = false;
        for &activity_index in codes {
            if is_do(activity_index) {
                has_do = true;
            } else {
                only_do = false;
            }
            if EXCEPTION.contains(&acts_work[activity_index].code.as_str()) {
                has_exc = true;
            }
        }
        if has_do && (only_do || has_exc) {
            off += 1;
        }
    }
    off
}

/// Count distinct crew-base-local days in `[rp_start, rp_end)` carrying any activity
/// whose **assignment code** is in `codes` (7507 fly/reserve filters; also leave days).
pub fn count_assignment_days(
    acts: &[Activity7505],
    rp_start: i64,
    rp_end: i64,
    offset_min: i64,
    count_post_rest: bool,
    codes: &[String],
) -> i64 {
    if codes.is_empty() {
        return 0;
    }
    let wanted: Vec<String> = codes
        .iter()
        .map(|c| c.trim().to_ascii_uppercase())
        .filter(|c| !c.is_empty() && c != "*")
        .collect();
    if wanted.is_empty() {
        return 0;
    }
    let mut window: BTreeSet<i64> = BTreeSet::new();
    let mut w = rp_start + offset_min * 60;
    while w < rp_end {
        window.insert(w);
        w += 86_400;
    }
    if window.is_empty() {
        return 0;
    }
    let mut matched: BTreeSet<i64> = BTreeSet::new();
    for a in acts {
        if !wanted
            .iter()
            .any(|x| x == &a.code.trim().to_ascii_uppercase())
        {
            continue;
        }
        let mut roster_end = activity_occupy_end_utc(a, count_post_rest);
        if a.start_utc > rp_end || roster_end < rp_start {
            continue;
        }
        if (roster_end + offset_min * 60) % 86_400 == 0 {
            roster_end -= 1;
        }
        let day_start = local_day_start_utc(a.start_utc, offset_min) + offset_min * 60;
        let day_end = local_day_start_utc(roster_end, offset_min) + offset_min * 60;
        let n = (day_end - day_start) / 86_400 + 1;
        if n <= 0 {
            continue;
        }
        for d in 0..n {
            let key = day_start + d * 86_400;
            if window.contains(&key) {
                matched.insert(key);
            }
        }
    }
    matched.len() as i64
}

/// Count distinct crew-base-local days in `[rp_start, rp_end)` carrying a LEAVE
/// assignment (C++ `countLeaveAssignmentDaysInWindow`). Selects which band row applies.
fn count_leave_days(
    acts: &[Activity7505],
    rp_start: i64,
    rp_end: i64,
    offset_min: i64,
    count_post_rest: bool,
    leave_codes: &[String],
) -> i64 {
    count_assignment_days(
        acts,
        rp_start,
        rp_end,
        offset_min,
        count_post_rest,
        leave_codes,
    )
}

/// Rule 7505/002 for one crew over a single rostering-period window. Picks the band
/// row matching the RP length and the crew's leave-day count, then fires when days off
/// fall below that row's MIN DO. (Editor application; always reports.)
pub fn check_min_days_off(
    crew_id: &str,
    acts: &[Activity7505],
    rp_start_utc: i64,
    rp_end_utc: i64,
    offset_min: i64,
    rows: &[DaysOffRow],
    do_start_min: i64,
) -> Vec<MinDaysOffViolation> {
    check_min_days_off_app(
        crew_id,
        acts,
        rp_start_utc,
        rp_end_utc,
        offset_min,
        rows,
        do_start_min,
        Application::Editor,
        &[],
    )
}

/// `check_min_days_off` with optimizer/PA-ignore. In `Application::Optimizer` a
/// shortfall is tolerated unless at least one activity overlapping the RP is newly
/// assigned (non-PA) — C++ `hasROAssignedRosterInRange` (`MinimumDaysOffForCARSRule
/// .cpp:858`). `pre_assigned[i]` ↔ `acts[i]`.
///
/// `do_start_min` = rule 2015 DO Start (minutes past local midnight); `0` = no grace
/// (missing 2015 / today’s midnight paint).
pub fn check_min_days_off_app(
    crew_id: &str,
    acts: &[Activity7505],
    rp_start_utc: i64,
    rp_end_utc: i64,
    offset_min: i64,
    rows: &[DaysOffRow],
    do_start_min: i64,
    app: Application,
    pre_assigned: &[bool],
) -> Vec<MinDaysOffViolation> {
    // RP length in days = ceil(span / 24h), as C++ `numDaysInRP`.
    let rp_days = ((rp_end_utc - rp_start_utc) as f64 / 86_400.0).ceil() as i64;
    let mut out = Vec::new();
    for row in rows {
        if rp_days < row.rp_days_lower || rp_days > row.rp_days_upper {
            continue;
        }
        let leave_days = count_leave_days(
            acts,
            rp_start_utc,
            rp_end_utc,
            offset_min,
            row.count_post_rest,
            &row.leave_codes,
        );
        if leave_days < row.leave_days_lower || leave_days > row.leave_days_upper {
            continue;
        }
        if assignment_day_filter_applies(&row.fly_assignments) {
            let fly_days = count_assignment_days(
                acts,
                rp_start_utc,
                rp_end_utc,
                offset_min,
                row.count_post_rest,
                &row.fly_assignments,
            );
            if fly_days < row.fly_days_lower || fly_days > row.fly_days_upper {
                continue;
            }
        }
        if assignment_day_filter_applies(&row.reserve_assignments) {
            let reserve_days = count_assignment_days(
                acts,
                rp_start_utc,
                rp_end_utc,
                offset_min,
                row.count_post_rest,
                &row.reserve_assignments,
            );
            if reserve_days < row.reserve_days_lower || reserve_days > row.reserve_days_upper {
                continue;
            }
        }
        let off = count_days_off(
            acts,
            rp_start_utc,
            rp_end_utc,
            offset_min,
            row,
            do_start_min,
        );
        if off < row.min_do {
            if app.is_optimizer() {
                let any_non_pa = acts.iter().enumerate().any(|(i, a)| {
                    let r_end = activity_occupy_end_utc(a, row.count_post_rest);
                    !pre_assigned_at(pre_assigned, i)
                        && a.start_utc < rp_end_utc
                        && r_end >= rp_start_utc
                });
                if !any_non_pa {
                    continue;
                }
            }
            out.push(MinDaysOffViolation {
                crew_id: crew_id.to_string(),
                rp_start_utc,
                rp_end_utc,
                days_off: off,
                min_do: row.min_do,
                period: row.period.clone(),
                unit: row.unit.clone(),
            });
        }
    }
    out
}

// ============================================================================
// Rule 7506/002 — ONE CHECKIN PER DAY ("One Checkin Per Day."). Ported from
// `crewrule-dev/RuleEngine/rule/rule7506/SingleDailyCheckinForCARSRule.cpp`
// (`CheckRuleForCrew`) + its oracle `RuleTest/rule7506_gtest.cpp`.
//
// Per crew, at most ONE check-in (roster start) per crew-LOCAL calendar day for the
// checked assignment groups (F8 = ["FLY"]). Walking the crew's rosters in time order
// and tracking the previous CHECKED roster, two consecutive checked rosters whose
// START local-days are equal → violation (severity 1, ROSTER). The local day is bucketed
// with the PREVIOUS roster's END-station UTC offset, falling back to the crew's
// prime-base offset when that station is empty (C++ `GetRosterEndStation` +
// `getAirportOffsetMinutes`). Violation span is clamped to the local day:
// [min(dayStart, start), min(dayStart+24h, restStart)] (`ThrowViolation`).
//
// Faithful quirk: the C++ initialises `iPrevRoster = 0`, so when the crew's FIRST
// roster is NOT a checked group, the first checked roster is compared against
// roster[0] (the unchecked one). Replicated verbatim for oracle fidelity.
// ============================================================================

/// One crew roster as seen by 7506: its duty group, start, post-rest end, and the UTC
/// offset (minutes east of UTC) of its END station — used to bucket the NEXT roster's
/// start into a local day. The caller resolves the station→offset (with prime-base
/// fallback for an empty station) so this struct already carries the effective offset.
#[derive(Debug, Clone)]
pub struct CheckinRoster {
    pub duty: String,
    pub start_utc: i64,
    pub rest_start_utc: i64,
    pub end_offset_min: i64,
}

/// A 7506 breach: two checked rosters check in on the same local calendar day.
#[derive(Debug, Clone, PartialEq)]
pub struct CheckinViolation {
    pub crew_id: String,
    /// The local-day-start (UTC) shared by the two check-ins.
    pub local_day_start_utc: i64,
    /// Violation span, clamped to the local day (C++ `ThrowViolation`).
    pub viol_start_utc: i64,
    pub viol_end_utc: i64,
    /// Raw checked-groups string for the message (e.g. "FLY").
    pub checked_groups_raw: String,
}

impl CheckinViolation {
    /// C++ message (`SingleDailyCheckinForCARSRule.cpp:130-131`).
    pub fn message(&self) -> String {
        format!(
            "Only one roster allowed ({}) in one local day.",
            self.checked_groups_raw
        )
    }
}

/// Rule 7506 (editor mode) for one crew. Rosters are sorted chronologically here
/// (input order is ignored). `checked_groups` should be upper-cased (the C++
/// upper-cases the param groups).
pub fn check_single_daily_checkin(
    crew_id: &str,
    rosters: &[CheckinRoster],
    checked_groups: &[String],
    checked_groups_raw: &str,
) -> Vec<CheckinViolation> {
    check_single_daily_checkin_app(
        crew_id,
        rosters,
        checked_groups,
        checked_groups_raw,
        Application::Editor,
        &[],
    )
}

/// `check_single_daily_checkin` with optimizer/PA-ignore. In `Application::Optimizer`
/// a same-day pair is tolerated when BOTH rosters are pre-assigned (C++
/// `!currRoster->needRuleCheck && !prevRoster->needRuleCheck` → `continue`), and the
/// crew check stops after the first fired violation (C++ `return false`). `pre_assigned[i]`
/// ↔ `rosters[i]` before the chronological sort. The editor path always reports and
/// collects every breach.
pub fn check_single_daily_checkin_app(
    crew_id: &str,
    rosters: &[CheckinRoster],
    checked_groups: &[String],
    checked_groups_raw: &str,
    app: Application,
    pre_assigned: &[bool],
) -> Vec<CheckinViolation> {
    let mut out = Vec::new();
    if checked_groups.is_empty() || rosters.is_empty() {
        return out;
    }
    // Consecutive same-day walk requires chronological order. Structured feeders may
    // emit FLY then ground blocks; sorting here keeps bin / library / PyO3 aligned.
    let mut order: Vec<usize> = (0..rosters.len()).collect();
    order.sort_by_key(|&i| (rosters[i].start_utc, rosters[i].rest_start_utc));

    let is_checked = |d: &str| checked_groups.iter().any(|g| g == d);

    let mut prev_idx: usize = order[0];
    for &i in &order {
        if !is_checked(&rosters[i].duty) {
            continue;
        }
        if i != prev_idx {
            let prev = &rosters[prev_idx];
            let curr = &rosters[i];
            // Both starts are bucketed with the PREVIOUS roster's end-station offset.
            let offset = prev.end_offset_min;
            let prev_day = local_day_start_utc(prev.start_utc, offset);
            let curr_day = local_day_start_utc(curr.start_utc, offset);
            if prev_day == curr_day {
                // Optimizer: tolerate iff BOTH rosters are pre-assigned.
                let tolerate = app.is_optimizer()
                    && pre_assigned_at(pre_assigned, i)
                    && pre_assigned_at(pre_assigned, prev_idx);
                if !tolerate {
                    out.push(CheckinViolation {
                        crew_id: crew_id.to_string(),
                        local_day_start_utc: prev_day,
                        viol_start_utc: prev_day.min(curr.start_utc),
                        viol_end_utc: (prev_day + 24 * 3600).min(curr.rest_start_utc),
                        checked_groups_raw: checked_groups_raw.to_string(),
                    });
                    if app.is_optimizer() {
                        return out; // C++ `return false` after the first optimizer breach.
                    }
                }
            }
        }
        prev_idx = i;
    }
    out
}

// ============================================================================
// Rule 7272/001 — CALCULATE DP OF THE RESERVES (standby duty-period calculator).
// Ported from `crewrule-dev/RuleEngine/rule/rule7272/CalculateStandbyDPForTGRule.cpp`
// + oracle `RuleTest/rule7272_gtest.cpp`.
//
// A **Definition / CALC rule** (category=Definition, like 7502/2014/7500): it computes the
// duty-period (DP) "points" a standby/reserve assignment earns and emits **NO violations**.
// Other duty-time rules consume the DP it sets. F8 7272/001 params: Assignments=SBY|PRAM|PRPM,
// Standby Offset=00:00, Rate=0.33, SBY Limit=00:00, Notification Limit=00:00.
//
//   regular standby:  dp = (long)(max(0, duration_secs − offset_min·60) · rate)
//   callout standby (notificationTime>0 with a next pairing): sbyDuration = notify − start;
//     callout = nextReport − notify;
//       if sbyDuration > sbyLimit·60 → dp = regular(sbyDuration) (+ callout·rate if callout
//         < notifyLimit·60); else if callout < notifyLimit·60 → dp = callout·rate; else 0.
// The duty/pairing path stores DP rounded to whole MINUTES (dp_secs/60), so the stored seconds
// become minutes·60 (the gtest's 14256→237→14220).
// ============================================================================

/// One band row of 7272/001 — the standby-DP factors for a set of assignment codes.
#[derive(Debug, Clone)]
pub struct StandbyDpParam {
    /// Assignment codes this row applies to (qualifier must be one of these).
    pub assignments: Vec<String>,
    /// STANDBY OFFSET in minutes (subtracted from the standby duration before rating).
    pub offset_min: i64,
    /// RATE — the DP fraction of the (offset-adjusted) standby seconds (F8 0.33).
    pub rate: f64,
    /// SBY LIMIT in minutes — callout only adds regular points when sbyDuration exceeds it.
    pub sby_limit_min: i64,
    /// NOTIFICATION LIMIT in minutes — callout period counts only when below it.
    pub notify_limit_min: i64,
}

/// One standby roster as seen by 7272. `notification_utc`/`next_report_utc` are 0 when there
/// is no callout (no notification time, or no next pairing) → the regular-standby path.
#[derive(Debug, Clone)]
pub struct StandbyRoster {
    pub crew_id: String,
    pub qualifier: String,
    pub start_utc: i64,
    /// Post-duty-rest start = C++ `getRestStartUtcAct()` (the standby end for regular DP).
    pub rest_start_utc: i64,
    pub notification_utc: i64,
    pub next_report_utc: i64,
}

/// Regular standby DP in seconds: `max(0, duration − offset)·rate`, truncated toward zero
/// (C++ `calculateRegularStandby`). `duration_secs` and the result are seconds.
pub fn regular_standby_dp(duration_secs: i64, offset_min: i64, rate: f64) -> i64 {
    ((duration_secs - offset_min * 60).max(0) as f64 * rate) as i64
}

/// Callout standby DP in seconds (C++ `calculateCalloutStandby`). `sby_duration` = notify −
/// start; `next_report_utc` = the next pairing's report time. Truncates like the C++ `(long)`.
pub fn callout_standby_dp(
    notification_utc: i64,
    next_report_utc: i64,
    sby_duration: i64,
    p: &StandbyDpParam,
) -> i64 {
    let callout = next_report_utc - notification_utc;
    let mut points: f64 = 0.0;
    if sby_duration > p.sby_limit_min * 60 {
        points = regular_standby_dp(sby_duration, p.offset_min, p.rate) as f64;
        if callout < p.notify_limit_min * 60 {
            points += callout as f64 * p.rate;
        }
    } else if callout < p.notify_limit_min * 60 {
        points = callout as f64 * p.rate;
    }
    points as i64
}

/// Calculate the standby DP (in SECONDS) for one reserve roster (C++ `Calculate`). Returns the
/// first matching param's DP, or **-1** when the roster's qualifier matches no param row.
pub fn calc_standby_dp(r: &StandbyRoster, params: &[StandbyDpParam]) -> i64 {
    for p in params {
        if !p.assignments.iter().any(|a| a == &r.qualifier) {
            continue;
        }
        if r.notification_utc > 0 && r.next_report_utc > 0 {
            let sby_duration = r.notification_utc - r.start_utc;
            return callout_standby_dp(r.notification_utc, r.next_report_utc, sby_duration, p);
        }
        return regular_standby_dp(r.rest_start_utc - r.start_utc, p.offset_min, p.rate);
    }
    -1
}

/// DP in whole MINUTES as the duty/pairing path stores it (C++ `setActualDP(dp / 60)`): an
/// integer floor of the DP seconds. The stored seconds then become `dp_minutes·60`.
pub fn standby_dp_minutes(dp_secs: i64) -> i64 {
    dp_secs / 60
}

// ============================================================================
// Rule 1001 — Assignment Overlap.
//
// Parameter-driven replacement for the RO hardcoded overlap gate. The caller
// provides one crew timeline (fixed pairings, candidate pairings, and ground
// tasks) plus prohibition rule rows from `rule.param_json` (Before/After filters
// + Rest Before). A filter-matching row whose Rest-Before window hits After duty
// emits `1001|...`. Empty rules or no filter match are fail-closed. Filter match
// with no Rest-Before window hit allows the time overlap.
// ============================================================================

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AssignmentOverlapRule {
    pub group_before: Vec<String>,
    pub assignment_before: Vec<String>,
    pub rest_before: bool,
    pub type_before: Vec<String>,
    pub group_after: Vec<String>,
    pub assignment_after: Vec<String>,
    pub type_after: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AssignmentOverlapRoster {
    pub id: i64,
    pub start_utc: i64,
    pub end_duty_utc: i64,
    pub end_including_rest_utc: i64,
    pub assignment_group: String,
    pub assignment: String,
    pub assignment_type: String,
    pub is_pre_assigned: bool,
    /// Crew home-base UTC offset (minutes east of UTC) for rule 2015 local TOD.
    pub offset_min: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AssignmentOverlapViolation {
    pub crew_id: String,
    pub before_id: i64,
    pub after_id: i64,
    pub overlap_start_utc: i64,
    pub overlap_end_utc: i64,
    pub before_assignment: String,
    pub after_assignment: String,
}

impl AssignmentOverlapViolation {
    pub fn message(&self) -> String {
        format!(
            "1001|before={}|after={}|before_assignment={}|after_assignment={}|overlap_start={}|overlap_end={}",
            self.before_id,
            self.after_id,
            self.before_assignment,
            self.after_assignment,
            self.overlap_start_utc,
            self.overlap_end_utc,
        )
    }
}

fn assignment_filter_matches(filter: &[String], value: &str) -> bool {
    filter.is_empty()
        || filter.iter().any(|v| {
            let s = v.trim();
            s.is_empty() || s == "*" || s == value
        })
}

fn assignment_windows_overlap(
    a_start: i64,
    a_end: i64,
    b_start: i64,
    b_end: i64,
) -> Option<(i64, i64)> {
    let start = a_start.max(b_start);
    let end = a_end.min(b_end);
    if start < end {
        Some((start, end))
    } else {
        None
    }
}

fn rule_filters_match(
    before: &AssignmentOverlapRoster,
    after: &AssignmentOverlapRoster,
    rule: &AssignmentOverlapRule,
) -> bool {
    assignment_filter_matches(&rule.group_before, &before.assignment_group)
        && assignment_filter_matches(&rule.assignment_before, &before.assignment)
        && assignment_filter_matches(&rule.type_before, &before.assignment_type)
        && assignment_filter_matches(&rule.group_after, &after.assignment_group)
        && assignment_filter_matches(&rule.assignment_after, &after.assignment)
        && assignment_filter_matches(&rule.type_after, &after.assignment_type)
}

/// Rest Before=Y → Before end = duty_end; N → rest_end.
/// Returns the Rest-Before window ∩ After duty when filters match and that window hits.
fn rule_window_intersects_after_duty(
    before: &AssignmentOverlapRoster,
    after: &AssignmentOverlapRoster,
    rule: &AssignmentOverlapRule,
) -> Option<(i64, i64)> {
    if !rule_filters_match(before, after, rule) {
        return None;
    }
    let before_end = if rule.rest_before {
        before.end_duty_utc
    } else {
        before.end_including_rest_utc
    };
    assignment_windows_overlap(
        before.start_utc,
        before_end,
        after.start_utc,
        after.end_duty_utc,
    )
}

/// Rule 2015 parameters consumed by 1001 FLY|DHD → After grace (7505/7507 ignore filter lists).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DoStartGrace1001 {
    pub do_start_min: i64,
    pub assignments: Vec<String>,
    pub groups: Vec<String>,
}

impl DoStartGrace1001 {
    /// Both filter lists empty → 1001 treats DO Start as 00:00 (no grace).
    pub fn effective_do_start_min(&self) -> i64 {
        if self.assignments.is_empty() && self.groups.is_empty() {
            0
        } else {
            self.do_start_min
        }
    }
}

/// Rule 2015 DO Start grace for 1001 FLY|DHD → filtered After: Duty Release local TOD strictly before DO Start.
fn fly_do_2015_grace_applies(
    before: &AssignmentOverlapRoster,
    after: &AssignmentOverlapRoster,
    grace: &DoStartGrace1001,
) -> bool {
    let do_start_min = grace.effective_do_start_min();
    if do_start_min <= 0 {
        return false;
    }
    let before_ok = before.assignment_group == "FLY"
        || before.assignment == "FLY"
        || before.assignment_group == "DHD"
        || before.assignment == "DHD";
    if !before_ok {
        return false;
    }
    let group_hit =
        !grace.groups.is_empty() && grace.groups.iter().any(|g| g == &after.assignment_group);
    let assign_hit =
        !grace.assignments.is_empty() && grace.assignments.iter().any(|a| a == &after.assignment);
    if !group_hit && !assign_hit {
        return false;
    }
    apply_do_start_occupy_end(before.end_duty_utc, before.offset_min, do_start_min)
        != before.end_duty_utc
}

pub fn check_assignment_overlap(
    crew_id: &str,
    rosters: &[AssignmentOverlapRoster],
    rules: &[AssignmentOverlapRule],
    do_start_grace: DoStartGrace1001,
) -> Vec<AssignmentOverlapViolation> {
    let mut sorted: Vec<&AssignmentOverlapRoster> = rosters.iter().collect();
    sorted.sort_by_key(|r| (r.start_utc, r.end_duty_utc, r.id));

    let mut out = Vec::new();
    for i in 0..sorted.len() {
        let before = sorted[i];
        for after in sorted.iter().skip(i + 1) {
            let actual_end = before.end_including_rest_utc.max(before.end_duty_utc);
            let Some((actual_start, actual_overlap_end)) = assignment_windows_overlap(
                before.start_utc,
                actual_end,
                after.start_utc,
                after.end_duty_utc,
            ) else {
                if after.start_utc >= actual_end {
                    break;
                }
                continue;
            };
            if fly_do_2015_grace_applies(before, after, &do_start_grace) {
                continue;
            }
            // Empty rules → fail-closed. Otherwise blacklist: filter match + Rest-Before
            // window ∩ After duty → 1001; filter match but no window hit → allow;
            // no filter match → fail-closed.
            let prohibited = if rules.is_empty() {
                true
            } else {
                let matching: Vec<&AssignmentOverlapRule> = rules
                    .iter()
                    .filter(|rule| rule_filters_match(before, after, rule))
                    .collect();
                matching.is_empty()
                    || matching.iter().any(|rule| {
                        rule_window_intersects_after_duty(before, after, rule).is_some()
                    })
            };
            if prohibited {
                out.push(AssignmentOverlapViolation {
                    crew_id: crew_id.to_string(),
                    before_id: before.id,
                    after_id: after.id,
                    overlap_start_utc: actual_start,
                    overlap_end_utc: actual_overlap_end,
                    before_assignment: before.assignment.clone(),
                    after_assignment: after.assignment.clone(),
                });
            }
        }
    }
    out
}

// ============================================================================
// RO gate — `LegalityChecker::isOverlap` (RuleEngine.cpp:24900-24950).
//
// RO interface: before any numbered rule, reject candidate pairings that overlap
// the crew's existing roster. Compares each candidate pairing against every
// roster on `crew->rosterList`:
//
//   • Candidate upper bound depends on the **existing** roster's assignment TYPE:
//     W/T/S (and live FLY/GRD/SBY/TRN) → `end_including_rest_utc`;
//     rest-like (LVE/DO/…) → `end_duty_utc` only.
//   • Existing pairing roster span → `[start, end_including_rest]`.
//   • Existing ground roster span → `[start, end_duty]` (no post-duty rest).
//   • Overlap ⇔ NOT `(existing_end < cand_start || existing_start > cand_end_bound)`.
//
// No PA-ignore and no overlapable-assignment map (unlike `isOverlapBetweenTwoRoster`).
// ============================================================================

/// Legacy C++ W/T/S plus live assignment.type codes that behave as work-like.
#[inline]
pub fn is_work_like_assignment_type(type_code: &str) -> bool {
    matches!(type_code, "FLY" | "GRD" | "SBY" | "TRN" | "SIM" | "RES")
}

/// One roster already on the crew (`crew->rosterList` entry).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OverlapExistingRoster {
    pub pairing_id: i64,
    pub start_utc: i64,
    pub end_duty_utc: i64,
    pub end_including_rest_utc: i64,
    /// Assignment TYPE (e.g. `FLY`, `LVE`) — drives candidate end bound.
    pub assignment_type: String,
    /// Pairing roster (`roster->pairing != nullptr`) vs ground roster.
    pub is_pairing_roster: bool,
}

/// One candidate pairing to assign (`pairings` vector in the C++ API).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OverlapCandidatePairing {
    pub pairing_id: i64,
    pub start_utc: i64,
    pub end_duty_utc: i64,
    pub end_including_rest_utc: i64,
}

/// Detail for the first overlap hit (for violation messages / tests).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OverlapViolation {
    pub crew_id: String,
    pub candidate_pairing_id: i64,
    pub existing_pairing_id: i64,
    pub candidate_start_utc: i64,
    pub candidate_end_bound_utc: i64,
    pub existing_start_utc: i64,
    pub existing_end_utc: i64,
}

impl OverlapViolation {
    pub fn message(&self) -> String {
        format!(
            "overlap|candidate={}|existing={}|cand_start={}|cand_end_bound={}|exist_start={}|exist_end={}",
            self.candidate_pairing_id,
            self.existing_pairing_id,
            self.candidate_start_utc,
            self.candidate_end_bound_utc,
            self.existing_start_utc,
            self.existing_end_utc,
        )
    }
}

/// C++ `LegalityChecker::isOverlap` — true when any candidate overlaps any existing roster.
pub fn is_overlap(
    existing: &[OverlapExistingRoster],
    candidates: &[OverlapCandidatePairing],
) -> bool {
    is_overlap_detail(existing, candidates).is_some()
}

/// Return detail for the first overlap, or `None` when legal.
pub fn is_overlap_detail(
    existing: &[OverlapExistingRoster],
    candidates: &[OverlapCandidatePairing],
) -> Option<OverlapViolation> {
    if candidates.is_empty() {
        return None;
    }
    for cand in candidates {
        let sta_time = cand.start_utc;
        let end_duty = cand.end_duty_utc;
        let end_incl_rest = cand.end_including_rest_utc;
        for ex in existing {
            let tmp_end = if is_work_like_assignment_type(&ex.assignment_type) {
                end_incl_rest
            } else {
                end_duty
            };
            let (roster_start, roster_end) = if ex.is_pairing_roster {
                (ex.start_utc, ex.end_including_rest_utc)
            } else {
                (ex.start_utc, ex.end_duty_utc)
            };
            if !((roster_end < sta_time) || (roster_start > tmp_end)) {
                return Some(OverlapViolation {
                    crew_id: String::new(),
                    candidate_pairing_id: cand.pairing_id,
                    existing_pairing_id: ex.pairing_id,
                    candidate_start_utc: sta_time,
                    candidate_end_bound_utc: tmp_end,
                    existing_start_utc: roster_start,
                    existing_end_utc: roster_end,
                });
            }
        }
    }
    None
}

/// Like `is_overlap_detail` but fills `crew_id` and returns a list (at most one today).
pub fn check_roster_overlap(
    crew_id: &str,
    existing: &[OverlapExistingRoster],
    candidates: &[OverlapCandidatePairing],
) -> Vec<OverlapViolation> {
    is_overlap_detail(existing, candidates)
        .map(|mut v| {
            v.crew_id = crew_id.to_string();
            vec![v]
        })
        .unwrap_or_default()
}
