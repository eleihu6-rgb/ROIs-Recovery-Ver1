//! Rule 8002 — MAX CUMULATIVE, full C++ port (types BH / DP / FT / CH).
//!
//! Source of truth: `ROCode/RO-Dev/.../CrewRule/RuleEngine/rule8002.cpp:42-852`
//! (check flow), `db/RuleParseParams.cpp:216-344` (15-column param row),
//! `db/Utility.cpp:1792-1936` (`getDateRangeFromLong` window enumeration) and
//! `db/Utility.cpp:4617-4909` (`isCrewQualified` matching).
//!
//! Everything here runs in **base-local seconds** (`local = utc + offset*60`).
//! The C++ uses ONE static base offset for the whole 8002 check
//! (`getAirportOffsetMinutes(base)`, rule8002.cpp:123), so the offset shift
//! cancels out of every comparison and windows/metrics/quals can all live on
//! the local axis. Windows are inclusive `[w0, w1]`, exactly like the C++
//! `map<time_t,time_t>` ranges. Day-keyed metrics sit at `day_ord * 86400`.
//!
//! Deliberate non-ports (documented, per plan):
//! - Phase gating: `PhaseUtils::IsChecked` is a no-op under the optimizer /
//!   scenario / service paths (PhaseUtils.cpp:35-51) — this engine only runs
//!   those paths, so the per-window phase gate is omitted.
//! - `Prorated` / `CHECK_LAST_DAY`: parsed but inert in the C++ checker
//!   (proration happens upstream in manday generation).
//! - The other 9 C++ types (WP, TOTAL WP, PFT, FDP, DP-NON-RB-PNC, PH,
//!   DP-SBY-PNC, DP-WITHOUT-SBY-PNC, COSMIC): rejected at parse level —
//!   drivers warn and drop such rows.
//! - BR "TPE base" special case (rule8002.cpp:120): F8-only engine, skipped.

use std::collections::{BTreeMap, BTreeSet};

use crate::{civil_from_days, days_from_civil, Application};

const DAY: i64 = 86_400;
const HOUR: i64 = 3_600;
/// C++ `ZERO_EPSILON` (rule8002.cpp:21).
const ZERO_EPSILON: f64 = 0.000_001;

/// Column order of one `crew_daily_metrics` row (from `CrewMandayFd`).
/// `sby_present` is a 0/1 presence proxy for the C++ `SBY_DP` magnitude
/// (ro_input has no `sbyDp` column, only the boolean `standby`), which is
/// sufficient for the `HAS SBY OR FLY` presence filter.
pub const MANDAY_METRICS: [&str; 9] = [
    "blh",
    "ft",
    "dp",
    "credit",
    "sby_present",
    "int_blh",
    "aug_blh",
    "duty_aloft",
    "cross_tz_count",
];

// ─────────────────────────────────────────────────────────────────────────────
// Param row
// ─────────────────────────────────────────────────────────────────────────────

/// UNIT column — the window kind (C++ `strPrdDesc`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CumUnit {
    /// Calendar Day — rolling N-day windows, stride 1 day.
    Cd,
    /// Rolling Day — same code path as CD in C++ (`method C|R, unit D`).
    Rd,
    /// Calendar Week — N-week windows anchored at local week starts.
    Cw,
    /// Rolling Week — same code path as CW.
    Rw,
    /// Calendar Month — forward + backward rolling N-month windows.
    Cm,
    /// Rolling Month — same code path as CM.
    Rm,
    /// Calendar Year — consecutive 1-year windows (PERIOD is ignored, as C++).
    Cy,
    /// Rolling Hour — N-hour windows, stride 1 hour.
    Rh,
    /// Roster Period (Alliance) — windows from the roster-period list.
    Rp,
    /// Year-To-Month — `[local year start, end of month PERIOD]`.
    Ytm,
}

impl CumUnit {
    pub fn parse(s: &str) -> Option<CumUnit> {
        match s.trim().to_ascii_uppercase().as_str() {
            "CD" => Some(CumUnit::Cd),
            "RD" => Some(CumUnit::Rd),
            "CW" => Some(CumUnit::Cw),
            "RW" => Some(CumUnit::Rw),
            "CM" => Some(CumUnit::Cm),
            "RM" => Some(CumUnit::Rm),
            "CY" => Some(CumUnit::Cy),
            "RH" => Some(CumUnit::Rh),
            "RP" => Some(CumUnit::Rp),
            "YTM" => Some(CumUnit::Ytm),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            CumUnit::Cd => "CD",
            CumUnit::Rd => "RD",
            CumUnit::Cw => "CW",
            CumUnit::Rw => "RW",
            CumUnit::Cm => "CM",
            CumUnit::Rm => "RM",
            CumUnit::Cy => "CY",
            CumUnit::Rh => "RH",
            CumUnit::Rp => "RP",
            CumUnit::Ytm => "YTM",
        }
    }
}

/// TYPE column — the metric checked (supported subset of the 13 C++ types).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CumType {
    Bh,
    Dp,
    Ft,
    Ch,
}

impl CumType {
    pub fn parse(s: &str) -> Option<CumType> {
        match s.trim().to_ascii_uppercase().as_str() {
            "BH" => Some(CumType::Bh),
            "DP" => Some(CumType::Dp),
            "FT" => Some(CumType::Ft),
            "CH" => Some(CumType::Ch),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            CumType::Bh => "BH",
            CumType::Dp => "DP",
            CumType::Ft => "FT",
            CumType::Ch => "CH",
        }
    }
}

/// One 8002 param row (RuleParseParams.cpp:216-344 fidelity).
///
/// Qualification lists are pipe-split; `["*"]` (or empty) means the dimension
/// is not gated. Band filters are `Some((lower, upper))` minutes with
/// left-closed / right-open `[lower, upper)` semantics; `None` = `"*"`.
#[derive(Debug, Clone)]
pub struct CumRule8002 {
    pub bases: Vec<String>,
    pub ranks: Vec<String>,
    pub fleets: Vec<String>,
    pub teams: Vec<String>,
    /// PERIOD — window count (months for YTM; ignored by CY, as C++).
    pub period: i64,
    pub unit: CumUnit,
    /// MAX LIMITS in minutes; C++ default 999999 for `"*"` / unparsable.
    pub max_min: i64,
    /// MIN LIMITS in minutes; default 0. Only checked when app != Optimizer.
    pub min_min: i64,
    pub rtype: CumType,
    /// INT OPERATION BLH `[lower, upper)` gate (BH only).
    pub int_oper_band: Option<(i64, i64)>,
    /// AUG OPERATION BLH `[lower, upper)` gate (BH only).
    pub aug_oper_band: Option<(i64, i64)>,
    /// DUTY ALOT TIME `[lower, upper)` gate (BH only).
    pub duty_aloft_band: Option<(i64, i64)>,
    /// HAS SBY OR FLY(Y/N): `Some(true)`=Y, `Some(false)`=N, `None`=`"*"`.
    pub has_sby_or_fly: Option<bool>,
    /// REDUCTION PER DUTY minutes per cross-6h-TZ duty (DP only); 0 = absent.
    pub reduction_min_per_duty: i64,
}

/// Wildcard test for a pipe-split qualification list (C++ Utility.cpp:4620-4634):
/// empty list, or a single `*` / empty element, means "not gated".
pub fn is_wildcard(list: &[String]) -> bool {
    list.is_empty() || (list.len() == 1 && (list[0] == "*" || list[0].is_empty()))
}

// ─────────────────────────────────────────────────────────────────────────────
// Qualification matching
// ─────────────────────────────────────────────────────────────────────────────

/// One effective-dated qualification entry (crew base / rank / fleet / team).
/// `eff_s` / `exp_s` sit on the same axis as the checked window (base-local
/// seconds); `exp_s = i64::MAX` means open-ended (C++ `expUtc < 0`).
#[derive(Debug, Clone)]
pub struct QualEntry {
    pub value: String,
    pub eff_s: i64,
    pub exp_s: i64,
}

/// Pipe-list OR match with `*` wildcard + effective-date overlap against
/// `[win_start, win_end]`.
///
/// `inclusive_exp` selects the C++ boundary flavour: base/rank/fleet use the
/// strict `exp > win_start` (Utility.cpp:4643-4645); teams use `exp >= win_start`
/// (Utility.cpp:4735-4737).
pub fn qual_matches(
    list: &[String],
    quals: &[QualEntry],
    win_start: i64,
    win_end: i64,
    inclusive_exp: bool,
) -> bool {
    if is_wildcard(list) {
        return true;
    }
    quals.iter().any(|q| {
        let date_ok = q.eff_s <= win_end
            && (q.exp_s == i64::MAX
                || if inclusive_exp {
                    q.exp_s >= win_start
                } else {
                    q.exp_s > win_start
                });
        date_ok && list.iter().any(|v| v == &q.value)
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// Local-calendar helpers (base-local seconds axis)
// ─────────────────────────────────────────────────────────────────────────────

#[inline]
fn day_start(t: i64) -> i64 {
    t.div_euclid(DAY) * DAY
}

#[inline]
fn hour_start(t: i64) -> i64 {
    t.div_euclid(HOUR) * HOUR
}

fn month_start(t: i64) -> i64 {
    let (y, m, _) = civil_from_days(t.div_euclid(DAY));
    days_from_civil(y, m, 1) * DAY
}

fn year_start(t: i64) -> i64 {
    let (y, _, _) = civil_from_days(t.div_euclid(DAY));
    days_from_civil(y, 1, 1) * DAY
}

/// End (inclusive, last second) of the local year containing `t`.
fn year_end(t: i64) -> i64 {
    let (y, _, _) = civil_from_days(t.div_euclid(DAY));
    days_from_civil(y + 1, 1, 1) * DAY - 1
}

/// Calendar month addition on a **local-midnight month anchor**. All 8002 call
/// sites feed month starts (day = 1), so no day-of-month clamping is needed.
fn add_months(t: i64, n: i64) -> i64 {
    let (y, m, d) = civil_from_days(t.div_euclid(DAY));
    let total = y * 12 + (m - 1) + n;
    let y2 = total.div_euclid(12);
    let m2 = total.rem_euclid(12) + 1;
    days_from_civil(y2, m2, d) * DAY + t.rem_euclid(DAY)
}

/// Local week start containing `t` (Utility.cpp:362-401): snap to the local
/// day, then step back to the configured week-start weekday. Unknown tokens
/// (incl. "SUN") fall through to Sunday, exactly like the C++ default.
fn week_start(t: i64, weekday_start_from: &str) -> i64 {
    let ord = t.div_euclid(DAY);
    // 1970-01-01 (ord 0) was a Thursday → tm_wday convention 0=Sun..6=Sat.
    let wday = (ord + 4).rem_euclid(7);
    let ws = match weekday_start_from {
        "MON" => 1,
        "TUE" => 2,
        "WED" => 3,
        "THU" => 4,
        "FRI" => 5,
        "SAT" => 6,
        _ => 0,
    };
    let diff = (wday - ws).rem_euclid(7);
    (ord - diff) * DAY
}

// ─────────────────────────────────────────────────────────────────────────────
// Window enumeration — port of Utility::getDateRangeFromLong + RP/YTM overrides
// ─────────────────────────────────────────────────────────────────────────────

/// Enumerate check windows for one rule row, in base-local seconds, inclusive
/// `[w0, w1]` pairs ordered (and deduplicated) by `w0`.
///
/// * `checked_start` / `checked_end` — the 8002 checked window on the local
///   axis (optimizer/editor: `[scenario start, scenario end + 24h]`).
/// * `weekday_start_from` — `"MON"…"SAT"`; anything else = Sunday (C++ default).
/// * `roster_periods` — `(rp_start, rp_end)` local-midnight pairs, used by RP
///   only (rule8002.cpp:132-150; rp_end is the midnight *of* the last day —
///   the window extends to `rp_end + 24h`, faithful to the C++).
/// * `scenario_end` — the raw scenario end (WITHOUT the +24h buffer), used by
///   the YTM skip test (rule8002.cpp:161). `None` falls back to
///   `checked_end - 86400`.
///
/// Duplicate window starts collapse keeping the FIRST inserted value — the C++
/// stores windows in a `map<time_t,time_t>` and `map::insert` does not
/// overwrite (matters for the CM/RM forward+backward union).
pub fn enumerate_windows(
    unit: CumUnit,
    period: i64,
    checked_start: i64,
    checked_end: i64,
    weekday_start_from: &str,
    roster_periods: &[(i64, i64)],
    scenario_end: Option<i64>,
) -> Vec<(i64, i64)> {
    let mut range: BTreeMap<i64, i64> = BTreeMap::new();
    let insert = |k: i64, v: i64, range: &mut BTreeMap<i64, i64>| {
        range.entry(k).or_insert(v);
    };
    let n = period.max(0);

    match unit {
        CumUnit::Cd | CumUnit::Rd => {
            // Utility.cpp:1817-1821, 1903-1913.
            if n < 1 {
                return Vec::new();
            }
            let mut t1 = day_start(checked_start) - (n - 1) * DAY;
            loop {
                let t2 = t1 + n * DAY - 1;
                insert(t1, t2, &mut range);
                if t2 >= checked_end {
                    break;
                }
                t1 += DAY;
            }
        }
        CumUnit::Cw | CumUnit::Rw => {
            // Utility.cpp:1891-1901.
            if n < 1 {
                return Vec::new();
            }
            let mut t1 = week_start(checked_start, weekday_start_from);
            loop {
                let t2 = t1 + n * 7 * DAY - 1;
                insert(t1, t2, &mut range);
                if t2 >= checked_end {
                    break;
                }
                t1 += 7 * DAY;
            }
        }
        CumUnit::Cm | CumUnit::Rm => {
            // Utility.cpp:1852-1877 — forward roll from start…
            if n < 1 {
                return Vec::new();
            }
            let mut t1 = month_start(checked_start);
            loop {
                let t2 = add_months(t1, n) - 1;
                insert(t1, t2, &mut range);
                if t2 >= checked_end {
                    break;
                }
                t1 = add_months(t1, 1);
            }
            // …plus backward roll from the end (windows may extend before the
            // checked start; C++ keeps them and dedups via map insert).
            let mut t2 = month_start(checked_end);
            if t2 != checked_end {
                t2 = add_months(t2, 1);
            }
            loop {
                let t1b = add_months(t2, -n);
                insert(t1b, t2 - 1, &mut range);
                t2 = add_months(t2, -1);
                if t2 <= checked_start {
                    break;
                }
            }
        }
        CumUnit::Cy => {
            // Utility.cpp:1828-1838 — consecutive 1-year windows; PERIOD unused.
            let mut t1 = year_start(checked_start);
            let mut t2 = year_end(checked_start);
            insert(t1, t2, &mut range);
            loop {
                if t2 >= checked_end {
                    break;
                }
                t1 = t2 + 1;
                t2 = year_end(t1);
                insert(t1, t2, &mut range);
            }
        }
        CumUnit::Rh => {
            // Utility.cpp:1916-1927.
            if n < 1 {
                return Vec::new();
            }
            let mut t1 = hour_start(checked_start);
            loop {
                let t2 = t1 + n * HOUR - 1;
                insert(t1, t2, &mut range);
                if t2 >= checked_end {
                    break;
                }
                t1 += HOUR;
            }
        }
        CumUnit::Rp => {
            // rule8002.cpp:132-150: for each roster period overlapping the
            // checked window, window = [rp_start − (N−1)×28d, rp_end + 24h].
            if n < 1 {
                return Vec::new();
            }
            for &(rp_start, rp_end) in roster_periods {
                if rp_start <= checked_end && rp_end >= checked_start {
                    let start = rp_start - (n - 1) * 28 * DAY;
                    let end = rp_end + DAY;
                    insert(start, end, &mut range);
                }
            }
        }
        CumUnit::Ytm => {
            // rule8002.cpp:152-170: [local year start, end of month PERIOD].
            if !(1..=12).contains(&n) {
                return Vec::new();
            }
            let scen_end = scenario_end.unwrap_or(checked_end - DAY);
            let ys = year_start(checked_start);
            let end_month = add_months(ys, n) - 1;
            if end_month > scen_end {
                return Vec::new(); // C++ `return true` — rule skipped.
            }
            insert(ys, end_month, &mut range);
            let (y_start, _, _) = civil_from_days(checked_start.div_euclid(DAY));
            let (y_end, _, _) = civil_from_days(checked_end.div_euclid(DAY));
            if y_start != y_end {
                let ye = year_start(checked_end);
                insert(ye, add_months(ye, n) - 1, &mut range);
            }
        }
    }

    range.into_iter().collect()
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-window metric accumulation + check
// ─────────────────────────────────────────────────────────────────────────────

/// One local day's metrics (a `CrewMandayFd` row, or candidate contributions).
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct DayMetrics {
    pub blh: f64,
    pub ft: f64,
    pub dp: f64,
    pub credit: f64,
    pub sby_present: f64,
    pub int_blh: f64,
    pub aug_blh: f64,
    pub duty_aloft: f64,
    pub cross_tz_count: f64,
}

impl DayMetrics {
    /// Build from a `MANDAY_METRICS`-ordered slice (caller validates length).
    pub fn from_slice(v: &[f64]) -> DayMetrics {
        DayMetrics {
            blh: v[0],
            ft: v[1],
            dp: v[2],
            credit: v[3],
            sby_present: v[4],
            int_blh: v[5],
            aug_blh: v[6],
            duty_aloft: v[7],
            cross_tz_count: v[8],
        }
    }

    pub fn add(&mut self, o: &DayMetrics) {
        self.blh += o.blh;
        self.ft += o.ft;
        self.dp += o.dp;
        self.credit += o.credit;
        self.sby_present += o.sby_present;
        self.int_blh += o.int_blh;
        self.aug_blh += o.aug_blh;
        self.duty_aloft += o.duty_aloft;
        self.cross_tz_count += o.cross_tz_count;
    }

    /// Field-wise subtraction — the inverse of [`DayMetrics::add`], used by the
    /// prefix-sum window query so a `[lo, hi]` slice sums as `prefix[hi] - prefix[lo-1]`.
    pub fn sub(&mut self, o: &DayMetrics) {
        self.blh -= o.blh;
        self.ft -= o.ft;
        self.dp -= o.dp;
        self.credit -= o.credit;
        self.sby_present -= o.sby_present;
        self.int_blh -= o.int_blh;
        self.aug_blh -= o.aug_blh;
        self.duty_aloft -= o.duty_aloft;
        self.cross_tz_count -= o.cross_tz_count;
    }
}

/// Cumulative prefix over a sparse day→metrics map so any `[lo, hi]` window sum is an
/// O(log n) difference instead of an O(hi-lo) re-accumulation over every day.
fn day_metrics_prefix(daily: &BTreeMap<i64, DayMetrics>) -> BTreeMap<i64, DayMetrics> {
    let mut prefix = BTreeMap::new();
    let mut acc = DayMetrics::default();
    for (&day, m) in daily {
        acc.add(m);
        prefix.insert(day, acc);
    }
    prefix
}

/// Sum of `daily` entries whose key lies in `[lo, hi]` (inclusive), via prefix difference.
/// Equivalent to `daily.range(lo..=hi).fold(default(), DayMetrics::add)`.
fn day_metrics_range_sum(prefix: &BTreeMap<i64, DayMetrics>, lo: i64, hi: i64) -> DayMetrics {
    let hi_sum = prefix
        .range(..=hi)
        .next_back()
        .map(|(_, v)| *v)
        .unwrap_or_default();
    let lo_sum = prefix
        .range(..lo)
        .next_back()
        .map(|(_, v)| *v)
        .unwrap_or_default();
    let mut acc = hi_sum;
    acc.sub(&lo_sum);
    acc
}

/// A breach of one rule row in one window.
#[derive(Debug, Clone, PartialEq)]
pub struct CumViolation {
    pub crew_id: String,
    pub rtype: CumType,
    pub period: i64,
    pub unit: CumUnit,
    /// Accumulated metric, `(int)`-truncated like the C++ (`as i64`).
    pub actual_min: i64,
    pub max_min: i64,
    pub min_min: i64,
    pub win_start_local_s: i64,
    pub win_end_local_s: i64,
    /// Cross-TZ duty count that fed the DP reduction (0 otherwise).
    pub cross_tz_count: i64,
    /// true = exceeded max; false = under min (editor mode only).
    pub over: bool,
}

/// BH band gate (rule8002.cpp:403-419): active only when the param is set AND
/// (bounds nonzero OR value nonzero); the window is SKIPPED when the value is
/// outside `[lower, upper)`.
#[inline]
fn band_skips(band: Option<(i64, i64)>, val: i64) -> bool {
    match band {
        None => false,
        Some((lo, hi)) => (lo != 0 || hi != 0 || val != 0) && (lo > val || hi <= val),
    }
}

/// Full-path check of ONE rule row × ONE crew (rule8002.cpp:174-852 for the
/// four supported types). The caller has already applied the crew-level
/// qualification gate for bases/ranks/fleets/teams over the checked window;
/// `team_quals` is still needed here for the per-window team re-check
/// (rule8002.cpp:201-203).
///
/// * `daily` — local-day-ord → `DayMetrics`, baseline + candidate merged.
/// * `cand_days` — local-day ords carrying candidate (non-PA) activity; under
///   `Application::Optimizer` a window with no candidate day is skipped (≡ the
///   C++ moved-roster overlap gate, rule8002.cpp:177-182) and min-limits are
///   suppressed; the first breach returns early (C++ `return false`).
pub fn check_max_cumulative_row(
    crew_id: &str,
    rule: &CumRule8002,
    daily: &BTreeMap<i64, DayMetrics>,
    cand_days: &BTreeSet<i64>,
    checked_start: i64,
    checked_end: i64,
    weekday_start_from: &str,
    roster_periods: &[(i64, i64)],
    scenario_end: Option<i64>,
    team_quals: &[QualEntry],
    app: Application,
) -> Vec<CumViolation> {
    let windows = enumerate_windows(
        rule.unit,
        rule.period,
        checked_start,
        checked_end,
        weekday_start_from,
        roster_periods,
        scenario_end,
    );
    let prefix = day_metrics_prefix(daily);
    let mut out = Vec::new();

    for (w0, w1) in windows {
        // rule8002.cpp:198 — skip windows outside the checked window.
        if !(w0 <= checked_end && w1 >= checked_start) {
            continue;
        }
        // Optimizer gate ≡ moved-roster overlap (rule8002.cpp:177-182).
        let ord_lo = (w0 + DAY - 1).div_euclid(DAY);
        let ord_hi = w1.div_euclid(DAY);
        if app.is_optimizer() && cand_days.range(ord_lo..=ord_hi).next().is_none() {
            continue;
        }
        // Per-window team gate (rule8002.cpp:201-203; inclusive exp overlap).
        if !is_wildcard(&rule.teams) && !qual_matches(&rule.teams, team_quals, w0, w1, true) {
            continue;
        }

        let acc = day_metrics_range_sum(&prefix, ord_lo, ord_hi);

        // hasSBYorFLY window filter (rule8002.cpp:303-316).
        match rule.has_sby_or_fly {
            Some(true) if acc.sby_present <= ZERO_EPSILON && acc.blh <= ZERO_EPSILON => continue,
            Some(false) if acc.sby_present > ZERO_EPSILON || acc.blh > ZERO_EPSILON => continue,
            _ => {}
        }

        let mut cross_tz = 0i64;
        let metric: i64 = match rule.rtype {
            CumType::Bh => {
                if band_skips(rule.int_oper_band, acc.int_blh as i64)
                    || band_skips(rule.aug_oper_band, acc.aug_blh as i64)
                    || band_skips(rule.duty_aloft_band, acc.duty_aloft as i64)
                {
                    continue;
                }
                acc.blh as i64
            }
            CumType::Dp => {
                let mut dp = acc.dp;
                if rule.reduction_min_per_duty != 0 {
                    cross_tz = acc.cross_tz_count as i64;
                    dp -= (cross_tz * rule.reduction_min_per_duty) as f64;
                    if dp < 0.0 {
                        dp = 0.0;
                    }
                }
                dp as i64
            }
            CumType::Ft => acc.ft as i64,
            CumType::Ch => acc.credit.ceil() as i64, // rule8002.cpp:665
        };

        let over = metric > rule.max_min;
        let under = metric < rule.min_min && !app.is_optimizer();
        if over || under {
            out.push(CumViolation {
                crew_id: crew_id.to_string(),
                rtype: rule.rtype,
                period: rule.period,
                unit: rule.unit,
                actual_min: metric,
                max_min: rule.max_min,
                min_min: rule.min_min,
                win_start_local_s: w0,
                win_end_local_s: w1,
                cross_tz_count: cross_tz,
                over,
            });
            if app.is_optimizer() {
                return out; // C++ early `return false` on first breach.
            }
        }
    }
    out
}

/// Crew-level qualification gate (rule8002.cpp:98-99 + Utility.cpp:4617-4752):
/// all four dimensions must match over the checked window. Base/rank/fleet use
/// the strict exp-boundary; teams the inclusive one. A crew with no entries in
/// a gated dimension does not qualify (covers rule8002.cpp:114).
pub fn crew_qualifies_8002(
    rule: &CumRule8002,
    base_quals: &[QualEntry],
    rank_quals: &[QualEntry],
    fleet_quals: &[QualEntry],
    team_quals: &[QualEntry],
    checked_start: i64,
    checked_end: i64,
) -> bool {
    qual_matches(&rule.bases, base_quals, checked_start, checked_end, false)
        && qual_matches(&rule.ranks, rank_quals, checked_start, checked_end, false)
        && qual_matches(&rule.fleets, fleet_quals, checked_start, checked_end, false)
        && qual_matches(&rule.teams, team_quals, checked_start, checked_end, true)
}

/// Convert a qualification row stored as `(value, eff_ord, exp_ord)` into the
/// local-seconds `QualEntry` the 8002 matcher uses. `exp_ord < 0` (and `i64::MAX`)
/// stay open-ended. Identical to the previous per-`check_line` conversion.
pub fn qual_entry_from_ord(value: String, eff_ord: i64, exp_ord: i64) -> QualEntry {
    QualEntry {
        value,
        eff_s: eff_ord.saturating_mul(DAY),
        exp_s: if exp_ord < 0 || exp_ord == i64::MAX {
            i64::MAX
        } else {
            exp_ord.saturating_mul(DAY)
        },
    }
}

/// Team rows have no effective window in the C++ 8002 path: they are always
/// in-range. `eff_s = i64::MIN` matches the previous per-call construction.
pub fn team_qual_entry(value: String) -> QualEntry {
    QualEntry {
        value,
        eff_s: i64::MIN,
        exp_s: i64::MAX,
    }
}

/// Build the working 8002 day map without mutating the stored manday baseline.
///
/// Same as: clone `baseline`, set every `credit = 0`, `DayMetrics::add` each
/// candidate day, then add `extra_credit` onto `credit`. Stored manday CH is
/// discarded (CH comes from the duty-formula overlay, not CrewMandayFd.credit).
pub fn merge_daily_with_candidate(
    baseline: &BTreeMap<i64, DayMetrics>,
    candidate: &BTreeMap<i64, DayMetrics>,
    extra_credit: &BTreeMap<i64, f64>,
) -> BTreeMap<i64, DayMetrics> {
    let mut daily: BTreeMap<i64, DayMetrics> = BTreeMap::new();
    for (&day, metrics) in baseline {
        let mut row = *metrics;
        row.credit = 0.0;
        daily.insert(day, row);
    }
    for (&day, metrics) in candidate {
        daily.entry(day).or_default().add(metrics);
    }
    for (&day, &credit) in extra_credit {
        daily.entry(day).or_default().credit += credit;
    }
    daily
}

#[cfg(test)]
mod merge_daily_tests {
    use super::*;

    fn bh(blh: f64, credit: f64) -> DayMetrics {
        DayMetrics {
            blh,
            ft: blh,
            credit,
            ..DayMetrics::default()
        }
    }

    #[test]
    fn merge_zeros_stored_credit_then_adds_candidate_and_formula_ch() {
        let mut baseline = BTreeMap::new();
        baseline.insert(10, bh(100.0, 9999.0));
        baseline.insert(11, bh(50.0, 8888.0));
        let mut candidate = BTreeMap::new();
        candidate.insert(11, bh(20.0, 0.0));
        candidate.insert(12, bh(7.0, 0.0));
        let mut extra = BTreeMap::new();
        extra.insert(11, 400.0);
        extra.insert(12, 240.0);

        let merged = merge_daily_with_candidate(&baseline, &candidate, &extra);

        assert_eq!(merged.get(&10).unwrap().blh, 100.0);
        assert_eq!(merged.get(&10).unwrap().credit, 0.0);
        assert_eq!(merged.get(&11).unwrap().blh, 70.0);
        assert_eq!(merged.get(&11).unwrap().credit, 400.0);
        assert_eq!(merged.get(&12).unwrap().blh, 7.0);
        assert_eq!(merged.get(&12).unwrap().credit, 240.0);
    }

    #[test]
    fn qual_entry_from_ord_matches_previous_check_line_conversion() {
        let open = qual_entry_from_ord("CA".into(), 0, -1);
        assert_eq!(open.eff_s, 0);
        assert_eq!(open.exp_s, i64::MAX);
        let dated = qual_entry_from_ord("B737".into(), 10, 20);
        assert_eq!(dated.eff_s, 10 * DAY);
        assert_eq!(dated.exp_s, 20 * DAY);
        let team = team_qual_entry("T1".into());
        assert_eq!(team.eff_s, i64::MIN);
        assert_eq!(team.exp_s, i64::MAX);
    }

    #[test]
    fn prefix_window_sum_matches_naive_accumulation_on_sparse_days() {
        // Sparse day map with gaps: prefix difference must equal a naive range fold
        // for windows whose bounds fall between existing keys.
        let mut daily = BTreeMap::new();
        daily.insert(1, bh(10.0, 1.0));
        daily.insert(5, bh(20.0, 2.0));
        daily.insert(10, bh(30.0, 3.0));
        let prefix = day_metrics_prefix(&daily);

        let naive = |lo: i64, hi: i64| {
            let mut acc = DayMetrics::default();
            for (_, m) in daily.range(lo..=hi) {
                acc.add(m);
            }
            acc
        };

        // Whole range, inner gap, empty range, bounds between keys.
        for (lo, hi) in [(1, 10), (1, 4), (2, 9), (5, 5), (0, 0), (6, 7), (11, 20)] {
            let expected = naive(lo, hi);
            let got = day_metrics_range_sum(&prefix, lo, hi);
            assert_eq!(got, expected, "window [{lo},{hi}]");
        }
    }
}
