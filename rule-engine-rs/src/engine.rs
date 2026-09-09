//! In-process rule engine orchestrator — pure Rust, no PyO3.
//!
//! Defines [`Engine`] (the line-level orchestrator that runs all 14 F8 rules)
//! and [`EngineParams`] (its plain-Rust constructor input). The PyO3 wrapper at
//! `rule-engine-rs/py/src/lib.rs` wraps this with the Python-facing API; this
//! module has zero dependency on PyO3.
//!
//! **Documented subset**: this orchestrator mirrors only the SIMPLE 8002 bands
//! (`block_bands` — CD windows, no per-crew qualification matching,
//! no min limits) and none of the ground-duty / extras infrastructure. The
//! full 8002 C++ port (`cum_rules`: all window units, Bases/Ranks/Fleets/Teams
//! row matching, Min Limits, BLH band filters, hasSBYorFLY, DP cross-TZ
//! reduction) lives in [`crate::rule8002`] and is wired into the production
//! PyO3 `Engine` at `py/src/lib.rs` (`check_8002_full`). Consumers of this
//! pure-Rust engine (the `src/bin/check_*.rs` demo drivers) do not feed those
//! inputs; do not add solver features here without wiring both engines.
//!
//! See docs/superpowers/plans/2026-06-20-python-solver-rust-rule-engine-plan.md.

use std::collections::{BTreeMap, BTreeSet};

use crate::{
    check_base_competency_app, check_consecutive_wocl, check_max_cum_block_app,
    check_min_space_wocl, check_pilot_age_app, check_roster_spacing_app, check_sdfd_rolling_app,
    check_single_daily_checkin, AgeFlight, Application, BaseActivity, BaseQual, BaseRoster,
    CheckinRoster, FlightCrew, LocalNightDef, RosterDuty, WoclSpacingDuty, WoclWorkPeriod,
    WorkPeriod7501,
};

const SECONDS_PER_DAY: i64 = 86_400;

/// Immutable per-pairing facts needed by the per-crew kernels.
struct PairingRec {
    start_utc: i64,
    end_utc: i64,
    blk_min: i64,
    /// UTC calendar day ordinal (days since 1970-01-01) of the pairing start.
    day_ord: i64,
    /// True when assignment_group == "FLY" (the 8056 A/B side in live data).
    is_fly: bool,
    label: String,
    /// Pairing base (rule 8004); empty/"*" → skipped.
    base: String,
    /// Departure/arrival station of the pairing (rule 8004 location-continuity exemption).
    start_station: String,
    end_station: String,
    /// Flight indices for rule 8030 (physical flights on this pairing).
    flight_idxs: Vec<usize>,
}

/// A rolling-window block-hour band: cap `limit_min` minutes over any
/// `window_days` consecutive calendar days (rule 8002 row).
struct BlockBand {
    window_days: i64,
    limit_min: f64,
}

/// Plain-Rust constructor input for [`Engine`].
///
/// Field names and types mirror the PyO3 `#[pyo3(signature = ...)]` parameters
/// exactly so the wrapper can forward them directly. Use [`Default`] to build a
/// partial config ergonomically in tests (all `Vec`s default to empty, all
/// `Option`s to `None`, numeric fields to 0).
///
/// Note: Python-side defaults (`age_limit = 65`, `age_max_number = 1`,
/// `sdfd_buffer_secs = 0`) live in the PyO3 signature block, NOT here.
/// `i64::default()` gives 0 for those fields; tests that need the real defaults
/// must set them explicitly.
#[derive(Default)]
pub struct EngineParams {
    pub pairing_start_utc: Vec<i64>,
    pub pairing_end_utc: Vec<i64>,
    pub pairing_blk_min: Vec<i64>,
    pub crew_fixed_pairings: Vec<Vec<i64>>,
    pub block_bands: Vec<(i64, f64)>,
    pub pairing_is_fly: Vec<bool>,
    pub pairing_label: Vec<String>,
    pub spacing_hours: Option<f64>,
    pub rp_start_ord: Option<i64>,
    pub rp_end_ord: Option<i64>,
    pub min_days_off: Option<i64>,
    pub crew_offset_min: Vec<i64>,
    pub local_night: Option<(i64, i64, i64)>,
    pub sdfd_rows: Vec<(i64, i64)>,
    pub sdfd_buffer_secs: i64,
    pub checked_window: Option<(i64, i64)>,
    pub wocl_window: Option<(i64, i64)>,
    pub max_consecutive_wocl: Option<i64>,
    pub wocl_spacing_hours: Option<i64>,
    pub one_checkin_groups: Option<Vec<String>>,
    pub pairing_base: Vec<String>,
    /// Departure/arrival station per pairing (rule 8004 location-continuity exemption).
    pub pairing_start_station: Vec<String>,
    pub pairing_end_station: Vec<String>,
    pub crew_base_quals: Vec<Vec<(String, i64, i64)>>,
    pub base_grace_days: Option<i64>,
    pub crew_division: Vec<String>,
    pub crew_birth_ord: Vec<i64>,
    pub age_division: Option<String>,
    pub age_limit: i64,
    pub age_max_number: i64,
    /// Per pairing: physical `flt_id`s on that pairing. Empty → one synthetic flight
    /// per pairing (`-(pairing_idx+1)`), preserving same-pairing COF without cross-pairing merge.
    pub pairing_flight_ids: Vec<Vec<i64>>,
}

/// In-process rule engine handle (pure Rust).
///
/// Construct via [`Engine::new`] from [`EngineParams`]. The PyO3 crate wraps
/// this as a Python class; a Rust PBS solver caller can use it directly.
pub struct Engine {
    pairings: Vec<PairingRec>,
    crew_fixed: Vec<Vec<usize>>,
    /// Rule 8002006 BLOCK-hour bands (window_days, limit_minutes). Empty → disabled.
    block_bands: Vec<BlockBand>,
    /// Rule 8056 minimum spacing in clock hours. None → 8056 disabled.
    spacing_hours: Option<f64>,
    /// Rule 7505 MIN # GDOs: the roster period (inclusive UTC day ordinals) and the
    /// minimum guaranteed days off it must contain. All-Some → 7505 enabled.
    rp_start_ord: Option<i64>,
    rp_end_ord: Option<i64>,
    min_days_off: Option<i64>,

    // --- rest / WOCL infrastructure (rules 7501, 7503, 7504) ---
    /// Per-crew base-TZ offset (minutes east of UTC; e.g. YEG June MDT = -360).
    crew_offset_min: Vec<i64>,
    /// Local-night definition (rule 2014): (start_min, end_min, min_rest_secs).
    local_night: Option<LocalNightDef>,
    /// Rule 7501 SDFD rows (period_hours, min_limits) + duty-end buffer + checked window.
    sdfd_rows: Vec<(i64, i64)>,
    sdfd_buffer_secs: i64,
    checked_window: Option<(i64, i64)>,
    /// Rule 7503/7504 WOCL band (wocl_start_min, wocl_end_min).
    wocl_window: Option<(i64, i64)>,
    /// Rule 7503 max consecutive WOCL duties.
    max_consecutive_wocl: Option<i64>,
    /// Rule 7504 minimum spacing between WOCL flight duties (clock hours).
    wocl_spacing_hours: Option<i64>,
    /// Rule 7506 ONE CHECKIN PER DAY: the "checked" assignment groups (e.g. ["FLY"]).
    /// Some → 7506 enabled (needs crew_offset_min too).
    one_checkin_groups: Option<Vec<String>>,
    /// Rule 8004 BASE competency: per-crew base-validity windows (base, eff_ord, exp_ord)
    /// + grace days. Non-empty quals + Some(grace) → 8004 enabled.
    crew_base_quals: Vec<Vec<(String, i64, i64)>>,
    base_grace_days: Option<i64>,

    // --- rule 8030 PILOT AGE (cross-crew complement, flt_id grain) ---
    /// Per-crew division (e.g. "P") and birth date (days-since-epoch).
    crew_division: Vec<String>,
    crew_birth_ord: Vec<i64>,
    /// Stable flight ids parallel to `crew_on_flight_8030` / `flight_start_ord_8030`.
    flight_ids_8030: Vec<i64>,
    flight_start_ord_8030: Vec<i64>,
    /// Mutable flight → crew indices on it (fixed/PA at construct; commit/rollback during solve).
    crew_on_flight_8030: Vec<Vec<usize>>,
    /// 8030 params: division, age limit (AGE DEFINE), max over-age per flight.
    age_division: Option<String>,
    age_limit: i64,
    age_max_number: i64,
}

impl Engine {
    /// Construct and validate from [`EngineParams`].
    ///
    /// Returns `Err(message)` when the arrays are inconsistent (same validation
    /// messages as the PyO3 constructor, which delegates here).
    pub fn new(params: EngineParams) -> Result<Engine, String> {
        let EngineParams {
            pairing_start_utc,
            pairing_end_utc,
            pairing_blk_min,
            crew_fixed_pairings,
            block_bands,
            pairing_is_fly,
            pairing_label,
            spacing_hours,
            rp_start_ord,
            rp_end_ord,
            min_days_off,
            crew_offset_min,
            local_night,
            sdfd_rows,
            sdfd_buffer_secs,
            checked_window,
            wocl_window,
            max_consecutive_wocl,
            wocl_spacing_hours,
            one_checkin_groups,
            pairing_base,
            pairing_start_station,
            pairing_end_station,
            crew_base_quals,
            base_grace_days,
            crew_division,
            crew_birth_ord,
            age_division,
            age_limit,
            age_max_number,
            pairing_flight_ids,
        } = params;

        let n = pairing_start_utc.len();
        if pairing_end_utc.len() != n || pairing_blk_min.len() != n {
            return Err(format!(
                "pairing_* arrays must be equal length: starts={}, ends={}, blk={}",
                n,
                pairing_end_utc.len(),
                pairing_blk_min.len(),
            ));
        }
        if !pairing_is_fly.is_empty() && pairing_is_fly.len() != n {
            return Err(format!(
                "pairing_is_fly must be empty or length {n}, got {}",
                pairing_is_fly.len()
            ));
        }
        if !pairing_label.is_empty() && pairing_label.len() != n {
            return Err(format!(
                "pairing_label must be empty or length {n}, got {}",
                pairing_label.len()
            ));
        }
        if !pairing_base.is_empty() && pairing_base.len() != n {
            return Err(format!(
                "pairing_base must be empty or length {n}, got {}",
                pairing_base.len()
            ));
        }
        if !pairing_start_station.is_empty() && pairing_start_station.len() != n {
            return Err(format!(
                "pairing_start_station must be empty or length {n}, got {}",
                pairing_start_station.len()
            ));
        }
        if !pairing_end_station.is_empty() && pairing_end_station.len() != n {
            return Err(format!(
                "pairing_end_station must be empty or length {n}, got {}",
                pairing_end_station.len()
            ));
        }
        if !pairing_flight_ids.is_empty() && pairing_flight_ids.len() != n {
            return Err(format!(
                "pairing_flight_ids must be empty or length {n}, got {}",
                pairing_flight_ids.len()
            ));
        }

        // Build unique flight index space for 8030. Empty pairing_flight_ids → one
        // synthetic non-merging flight per pairing.
        let mut flight_id_to_idx: BTreeMap<i64, usize> = BTreeMap::new();
        let mut flight_ids_8030: Vec<i64> = Vec::new();
        let mut flight_start_ord_8030: Vec<i64> = Vec::new();
        let mut pairing_flight_idxs: Vec<Vec<usize>> = vec![Vec::new(); n];
        for pi in 0..n {
            let day_ord = pairing_start_utc[pi].div_euclid(SECONDS_PER_DAY);
            let raw_ids: Vec<i64> =
                if pairing_flight_ids.is_empty() || pairing_flight_ids[pi].is_empty() {
                    vec![-(pi as i64 + 1)]
                } else {
                    pairing_flight_ids[pi].clone()
                };
            for fid in raw_ids {
                let idx = if let Some(&existing) = flight_id_to_idx.get(&fid) {
                    if day_ord < flight_start_ord_8030[existing] {
                        flight_start_ord_8030[existing] = day_ord;
                    }
                    existing
                } else {
                    let idx = flight_ids_8030.len();
                    flight_id_to_idx.insert(fid, idx);
                    flight_ids_8030.push(fid);
                    flight_start_ord_8030.push(day_ord);
                    idx
                };
                if !pairing_flight_idxs[pi].contains(&idx) {
                    pairing_flight_idxs[pi].push(idx);
                }
            }
        }

        let pairings = (0..n)
            .map(|i| PairingRec {
                start_utc: pairing_start_utc[i],
                end_utc: pairing_end_utc[i],
                blk_min: pairing_blk_min[i],
                day_ord: pairing_start_utc[i].div_euclid(SECONDS_PER_DAY),
                is_fly: pairing_is_fly.get(i).copied().unwrap_or(false),
                label: pairing_label.get(i).cloned().unwrap_or_default(),
                base: pairing_base.get(i).cloned().unwrap_or_default(),
                start_station: pairing_start_station.get(i).cloned().unwrap_or_default(),
                end_station: pairing_end_station.get(i).cloned().unwrap_or_default(),
                flight_idxs: pairing_flight_idxs[i].clone(),
            })
            .collect();

        let mut crew_fixed: Vec<Vec<usize>> = Vec::with_capacity(crew_fixed_pairings.len());
        for (c, fixed) in crew_fixed_pairings.iter().enumerate() {
            let mut v = Vec::with_capacity(fixed.len());
            for &pi in fixed {
                if pi < 0 || pi as usize >= n {
                    return Err(format!(
                        "crew {c} fixed pairing index {pi} out of range 0..{n}"
                    ));
                }
                v.push(pi as usize);
            }
            crew_fixed.push(v);
        }

        let to_bands = |v: Vec<(i64, f64)>| -> Vec<BlockBand> {
            v.into_iter()
                .map(|(window_days, limit_min)| BlockBand {
                    window_days,
                    limit_min,
                })
                .collect()
        };

        if !crew_offset_min.is_empty() && crew_offset_min.len() != crew_fixed.len() {
            return Err(format!(
                "crew_offset_min must be empty or length {} (crews), got {}",
                crew_fixed.len(),
                crew_offset_min.len()
            ));
        }

        // Invert fixed rosters → per-flight mutable crew complement (rule 8030).
        let mut crew_on_flight_8030: Vec<Vec<usize>> = vec![Vec::new(); flight_ids_8030.len()];
        for (j, fixed) in crew_fixed.iter().enumerate() {
            for &pi in fixed {
                for &fi in &pairing_flight_idxs[pi] {
                    if !crew_on_flight_8030[fi].contains(&j) {
                        crew_on_flight_8030[fi].push(j);
                    }
                }
            }
        }

        Ok(Engine {
            pairings,
            crew_fixed,
            block_bands: to_bands(block_bands),
            spacing_hours,
            rp_start_ord,
            rp_end_ord,
            min_days_off,
            crew_offset_min,
            local_night: local_night.map(|(start_min, end_min, min_rest_secs)| LocalNightDef {
                start_min,
                end_min,
                min_rest_secs,
            }),
            sdfd_rows,
            sdfd_buffer_secs,
            checked_window,
            wocl_window,
            max_consecutive_wocl,
            wocl_spacing_hours,
            one_checkin_groups,
            crew_base_quals,
            base_grace_days,
            crew_division,
            crew_birth_ord,
            flight_ids_8030,
            flight_start_ord_8030,
            crew_on_flight_8030,
            age_division,
            age_limit,
            age_max_number,
        })
    }

    /// Hot path: evaluate one candidate line and return its violations as strings.
    pub fn check_line(&self, crew_idx: i64, pairing_idxs: &[i64]) -> Result<Vec<String>, String> {
        if crew_idx < 0 || crew_idx as usize >= self.crew_fixed.len() {
            return Err(format!(
                "crew_idx {crew_idx} out of range 0..{}",
                self.crew_fixed.len()
            ));
        }
        let mut candidate: Vec<usize> = Vec::with_capacity(pairing_idxs.len());
        for &pi in pairing_idxs {
            if pi < 0 || pi as usize >= self.pairings.len() {
                return Err(format!(
                    "pairing index {pi} out of range 0..{}",
                    self.pairings.len()
                ));
            }
            candidate.push(pi as usize);
        }

        let fixed = &self.crew_fixed[crew_idx as usize];
        let crew_id = crew_idx.to_string();
        let mut out: Vec<String> = Vec::new();
        self.check_cum_windows(
            fixed,
            &candidate,
            &crew_id,
            &self.block_bands,
            |p| p.blk_min,
            "8002",
            &mut out,
        );
        self.check_8056(fixed, &candidate, &crew_id, &mut out);
        self.check_7505(fixed, &candidate, &crew_id, &mut out);
        self.check_7501(crew_idx as usize, fixed, &candidate, &crew_id, &mut out);
        self.check_wocl(crew_idx as usize, fixed, &candidate, &crew_id, &mut out);
        self.check_7506(crew_idx as usize, fixed, &candidate, &crew_id, &mut out);
        self.check_8004(crew_idx as usize, fixed, &candidate, &crew_id, &mut out);
        self.check_8030(crew_idx as usize, &candidate, &crew_id, &mut out);
        Ok(out)
    }

    pub fn n_pairings(&self) -> usize {
        self.pairings.len()
    }

    pub fn n_crews(&self) -> usize {
        self.crew_fixed.len()
    }

    pub fn n_rules(&self) -> usize {
        usize::from(!self.block_bands.is_empty())
            + usize::from(self.spacing_hours.is_some())
            + usize::from(
                self.rp_start_ord.is_some()
                    && self.rp_end_ord.is_some()
                    && self.min_days_off.is_some(),
            )
            + usize::from(
                self.local_night.is_some()
                    && !self.sdfd_rows.is_empty()
                    && self.checked_window.is_some(),
            )
            + usize::from(self.wocl_window.is_some() && self.max_consecutive_wocl.is_some())
            + usize::from(self.wocl_window.is_some() && self.wocl_spacing_hours.is_some())
            + usize::from(self.one_checkin_groups.is_some())
            + usize::from(self.base_grace_days.is_some() && !self.crew_base_quals.is_empty())
            + usize::from(self.age_division.is_some() && !self.crew_birth_ord.is_empty())
    }

    /// Render a human-readable summary (mirrors the Python `__repr__`).
    pub fn repr(&self) -> String {
        format!(
            "Engine(phase=2, pairings={}, crews={}, rules={})",
            self.pairings.len(),
            self.crew_fixed.len(),
            self.n_rules(),
        )
    }

    // --- private helper methods (bodies verbatim from py/src/lib.rs) ---

    /// Rolling-window cumulative check (rule 8002): sum a per-pairing value
    /// (block or duty minutes) by UTC start day and flag any band breach.
    /// Optimizer PA-ignore: windows entirely within fixed days are tolerated.
    fn check_cum_windows(
        &self,
        fixed: &[usize],
        candidate: &[usize],
        crew_id: &str,
        bands: &[BlockBand],
        value: impl Fn(&PairingRec) -> i64,
        code: &str,
        out: &mut Vec<String>,
    ) {
        if bands.is_empty() {
            return;
        }
        let mut daily: BTreeMap<i64, f64> = BTreeMap::new();
        for &pi in fixed.iter().chain(candidate.iter()) {
            let p = &self.pairings[pi];
            *daily.entry(p.day_ord).or_insert(0.0) += value(p) as f64;
        }
        let cand_days: BTreeSet<i64> = candidate
            .iter()
            .map(|&pi| self.pairings[pi].day_ord)
            .collect();
        for band in bands {
            if let Some(v) = check_max_cum_block_app(
                crew_id,
                &daily,
                band.window_days,
                band.limit_min,
                Application::Optimizer,
                &cand_days,
            ) {
                out.push(format!(
                    "{code}|window_days={}|limit_h={:.2}|actual_h={:.2}|window_start_ord={}",
                    band.window_days,
                    v.limit_hours(),
                    v.actual_hours(),
                    v.window_start_ord,
                ));
            }
        }
    }

    fn check_8056(
        &self,
        fixed: &[usize],
        candidate: &[usize],
        crew_id: &str,
        out: &mut Vec<String>,
    ) {
        let Some(space_h) = self.spacing_hours else {
            return;
        };
        let mut duties: Vec<RosterDuty> = Vec::new();
        let mut pa: Vec<bool> = Vec::new();
        for (is_pa, slice) in [(true, fixed), (false, candidate)] {
            for &pi in slice {
                let p = &self.pairings[pi];
                if !p.is_fly {
                    continue;
                }
                duties.push(RosterDuty {
                    pairing_id: pi as i64,
                    start_utc: p.start_utc,
                    end_utc: p.end_utc,
                    label: p.label.clone(),
                    assignment_group: "FLY".to_string(),
                    assignment: "FLY".to_string(),
                });
                pa.push(is_pa);
            }
        }
        for v in check_roster_spacing_app(crew_id, &duties, space_h, Application::Optimizer, &pa) {
            out.push(format!(
                "8056|pairing={}|gap_min={}|limit_min={}",
                v.pairing_id, v.actual_minutes, v.limit_minutes,
            ));
        }
    }

    /// Rule 7505 MIN # GDOs (simplified live port): the roster period must contain
    /// at least `min_days_off` calendar days with no duty. A calendar day is
    /// "working" if any pairing covers it (start..=end UTC day, so layover/middle
    /// days count as working — COUNT LAYOVER=N). Optimizer PA-ignore: a shortfall
    /// already present with the fixed rosters alone is tolerated; the candidate is
    /// flagged only when it turns an otherwise-compliant period non-compliant.
    fn check_7505(
        &self,
        fixed: &[usize],
        candidate: &[usize],
        _crew_id: &str,
        out: &mut Vec<String>,
    ) {
        let (Some(rp0), Some(rp1), Some(min_off)) =
            (self.rp_start_ord, self.rp_end_ord, self.min_days_off)
        else {
            return;
        };
        if rp1 < rp0 {
            return;
        }
        let rp_len = rp1 - rp0 + 1;

        let working = |slices: &[&[usize]]| -> BTreeSet<i64> {
            let mut days: BTreeSet<i64> = BTreeSet::new();
            for slice in slices {
                for &pi in *slice {
                    let p = &self.pairings[pi];
                    let s = p.start_utc.div_euclid(SECONDS_PER_DAY).max(rp0);
                    let e = p.end_utc.div_euclid(SECONDS_PER_DAY).min(rp1);
                    let mut d = s;
                    while d <= e {
                        days.insert(d);
                        d += 1;
                    }
                }
            }
            days
        };

        let working_fixed = working(&[fixed]).len() as i64;
        let working_all = working(&[fixed, candidate]).len() as i64;
        let off_fixed = rp_len - working_fixed;
        let off_all = rp_len - working_all;

        // Candidate creates the violation only if fixed alone was compliant.
        if off_fixed >= min_off && off_all < min_off {
            out.push(format!(
                "7505|rp_days={}|min_days_off={}|days_off={}",
                rp_len, min_off, off_all,
            ));
        }
    }

    /// Rule 7501 SDFD: each rolling PERIOD-hour window must contain >= MIN LIMITS
    /// single-days-free-from-duty. Optimizer PA-ignore (168/672 rows). Flight
    /// pairings only (ground/standby work not in the store — documented).
    fn check_7501(
        &self,
        crew_idx: usize,
        fixed: &[usize],
        candidate: &[usize],
        crew_id: &str,
        out: &mut Vec<String>,
    ) {
        let (Some(lnd), Some((cs, ce))) = (self.local_night, self.checked_window) else {
            return;
        };
        if self.sdfd_rows.is_empty() || crew_idx >= self.crew_offset_min.len() {
            return;
        }
        let offset = self.crew_offset_min[crew_idx];
        let mut work: Vec<WorkPeriod7501> = Vec::new();
        let mut pa: Vec<bool> = Vec::new();
        for (is_pa, slice) in [(true, fixed), (false, candidate)] {
            for &pi in slice {
                let p = &self.pairings[pi];
                work.push(WorkPeriod7501 {
                    pairing_id: Some(pi as i64),
                    start_utc: p.start_utc,
                    end_utc: p.end_utc,
                });
                pa.push(is_pa);
            }
        }
        for &(period_hours, min_limits) in &self.sdfd_rows {
            if let Some(v) = check_sdfd_rolling_app(
                crew_id,
                &work,
                offset,
                &lnd,
                period_hours,
                "RH",
                self.sdfd_buffer_secs,
                min_limits,
                cs,
                ce,
                Application::Optimizer,
                &pa,
                None,
                &[],
                None,
            ) {
                out.push(format!(
                    "7501|period_h={}|min_limits={}|sdfd={}|window_start={}",
                    period_hours, min_limits, v.total_sdfd, v.window_start_utc,
                ));
            }
        }
    }

    /// Rules 7503 (max consecutive WOCL) and 7504 (min spacing between WOCL flight
    /// duties). Editor-mode kernels; pre-existing tolerance comes from the Python
    /// baseline-diff (fixed-only violations are subtracted).
    fn check_wocl(
        &self,
        crew_idx: usize,
        fixed: &[usize],
        candidate: &[usize],
        crew_id: &str,
        out: &mut Vec<String>,
    ) {
        let Some((wstart, wend)) = self.wocl_window else {
            return;
        };
        if crew_idx >= self.crew_offset_min.len() {
            return;
        }
        let offset = self.crew_offset_min[crew_idx];
        let all: Vec<usize> = fixed.iter().chain(candidate.iter()).copied().collect();

        if let (Some(max_consec), Some(lnd)) = (self.max_consecutive_wocl, self.local_night) {
            let periods: Vec<WoclWorkPeriod> = all
                .iter()
                .map(|&pi| {
                    let p = &self.pairings[pi];
                    WoclWorkPeriod {
                        pairing_id: Some(pi as i64),
                        start_utc: p.start_utc,
                        end_utc: p.end_utc,
                        offset_min: offset,
                        is_ground: !p.is_fly,
                    }
                })
                .collect();
            for v in check_consecutive_wocl(crew_id, &periods, wstart, wend, max_consec, &lnd) {
                out.push(format!(
                    "7503|count={}|max={}|pairing={}",
                    v.count, v.max_limit, v.pairing_id
                ));
            }
        }

        if let Some(min_h) = self.wocl_spacing_hours {
            let duties: Vec<WoclSpacingDuty> = all
                .iter()
                .filter(|&&pi| self.pairings[pi].is_fly)
                .map(|&pi| {
                    let p = &self.pairings[pi];
                    WoclSpacingDuty {
                        pairing_id: pi as i64,
                        start_utc: p.start_utc,
                        end_utc: p.end_utc,
                        offset_min: offset,
                    }
                })
                .collect();
            for v in check_min_space_wocl(crew_id, &duties, wstart, wend, min_h) {
                out.push(format!(
                    "7504|gap_min={}|limit_min={}|pairing={}",
                    v.actual_minutes, v.limit_minutes, v.pairing_id
                ));
            }
        }
    }

    /// Rule 7506 ONE CHECKIN PER DAY: at most one "checked" (FLY) roster may check
    /// in on a crew-local calendar day. Editor kernel; pre-existing tolerance via
    /// the Python baseline-diff. Uses the crew base offset for the end station.
    fn check_7506(
        &self,
        crew_idx: usize,
        fixed: &[usize],
        candidate: &[usize],
        crew_id: &str,
        out: &mut Vec<String>,
    ) {
        let Some(groups) = &self.one_checkin_groups else {
            return;
        };
        if crew_idx >= self.crew_offset_min.len() {
            return;
        }
        let offset = self.crew_offset_min[crew_idx];
        let mut idxs: Vec<usize> = fixed.iter().chain(candidate.iter()).copied().collect();
        idxs.sort_by_key(|&pi| self.pairings[pi].start_utc);
        let rosters: Vec<CheckinRoster> = idxs
            .iter()
            .map(|&pi| {
                let p = &self.pairings[pi];
                CheckinRoster {
                    duty: if p.is_fly {
                        "FLY".to_string()
                    } else {
                        "GND".to_string()
                    },
                    start_utc: p.start_utc,
                    rest_start_utc: p.end_utc,
                    end_offset_min: offset,
                }
            })
            .collect();
        let raw = groups.join("|");
        for v in check_single_daily_checkin(crew_id, &rosters, groups, &raw) {
            out.push(format!(
                "7506|local_day_start={}|groups={}",
                v.local_day_start_utc, v.checked_groups_raw
            ));
        }
    }

    /// Rule 8004 BASIC COMPETENCY (BASE): a roster's base must be covered by one of
    /// the crew's base-validity windows over the roster span. Optimizer PA-ignore.
    fn check_8004(
        &self,
        crew_idx: usize,
        fixed: &[usize],
        candidate: &[usize],
        crew_id: &str,
        out: &mut Vec<String>,
    ) {
        let Some(grace) = self.base_grace_days else {
            return;
        };
        if crew_idx >= self.crew_base_quals.len() {
            return;
        }
        let quals: Vec<BaseQual> = self.crew_base_quals[crew_idx]
            .iter()
            .map(|(base, eff, exp)| BaseQual {
                base: base.clone(),
                eff_ord: Some(*eff),
                exp_ord: Some(*exp),
            })
            .collect();
        if quals.is_empty() {
            return;
        }
        let mut rosters: Vec<BaseRoster> = Vec::new();
        let mut activities: Vec<BaseActivity> = Vec::new();
        let mut pa: Vec<bool> = Vec::new();
        for (is_pa, slice) in [(true, fixed), (false, candidate)] {
            for &pi in slice {
                let p = &self.pairings[pi];
                rosters.push(BaseRoster {
                    pairing_id: pi as i64,
                    base: p.base.clone(),
                    start_ord: p.start_utc.div_euclid(SECONDS_PER_DAY),
                    end_ord: p.end_utc.div_euclid(SECONDS_PER_DAY),
                });
                activities.push(BaseActivity {
                    pairing_id: Some(pi as i64),
                    start_utc: p.start_utc,
                    end_utc: p.end_utc,
                    start_station: p.start_station.clone(),
                    end_station: p.end_station.clone(),
                });
                pa.push(is_pa);
            }
        }
        for v in check_base_competency_app(
            crew_id,
            &rosters,
            &quals,
            grace,
            Application::Optimizer,
            &pa,
            &activities,
        ) {
            out.push(format!("8004|pairing={}|base={}", v.pairing_id, v.base));
        }
    }

    /// Rule 8030 PILOT AGE: per physical flight (`flt_id`), at most `age_max_number` crew of
    /// `age_division` may be >= `age_limit` years old at flight start. Complement is
    /// the mutable flight COF (`crew_on_flight_8030`, including prior commits) plus
    /// the candidate when not already present. Candidate pairings may share flights
    /// with other pairings — COF merges across those pairings.
    fn check_8030(
        &self,
        crew_idx: usize,
        candidate: &[usize],
        crew_id: &str,
        out: &mut Vec<String>,
    ) {
        let Some(division) = &self.age_division else {
            return;
        };
        if crew_idx >= self.crew_division.len() {
            return;
        }
        let mut seen_flights = BTreeSet::new();
        let mut flights: Vec<AgeFlight> = Vec::new();
        for &pi in candidate {
            for &fi in &self.pairings[pi].flight_idxs {
                if !seen_flights.insert(fi) {
                    continue;
                }
                let mut crew: Vec<FlightCrew> = self.crew_on_flight_8030[fi]
                    .iter()
                    .filter(|&&j| j != crew_idx)
                    .filter(|&&j| j < self.crew_division.len() && j < self.crew_birth_ord.len())
                    .map(|&j| FlightCrew {
                        crew_id: j.to_string(),
                        division: self.crew_division[j].clone(),
                        birth_ord: self.crew_birth_ord[j],
                        // Attribution for peers is unused when filtering to candidate.
                        pairing_id: 0,
                    })
                    .collect();
                crew.push(FlightCrew {
                    crew_id: crew_id.to_string(),
                    division: self.crew_division[crew_idx].clone(),
                    birth_ord: self.crew_birth_ord[crew_idx],
                    pairing_id: pi as i64,
                });
                flights.push(AgeFlight {
                    flight_id: self.flight_ids_8030[fi],
                    start_ord: self.flight_start_ord_8030[fi],
                    crew,
                });
            }
        }
        // Candidate flights are not entirely pre-assigned → checked.
        let pa = vec![false; flights.len()];
        for v in check_pilot_age_app(
            &flights,
            division,
            self.age_limit,
            self.age_max_number,
            Application::Optimizer,
            &pa,
        ) {
            // Only surface breaches involving the candidate crew.
            if v.crew_id == crew_id {
                out.push(format!(
                    "8030|pairing={}|flight={}|age={}|limit={}|over_age_count={}",
                    v.pairing_id, v.flight_id, v.age_years, v.age_limit, v.over_age_count,
                ));
            }
        }
    }

    /// Trial-add candidate onto mutable flight COF for every flight on the pairing (8030).
    pub fn can_add_pairing_8030(
        &self,
        crew_idx: usize,
        pairing_idx: usize,
    ) -> Result<Vec<String>, String> {
        if crew_idx >= self.crew_fixed.len() {
            return Err(format!(
                "crew_idx {crew_idx} out of range 0..{}",
                self.crew_fixed.len()
            ));
        }
        if pairing_idx >= self.pairings.len() {
            return Err(format!(
                "pairing_idx {pairing_idx} out of range 0..{}",
                self.pairings.len()
            ));
        }
        if self.age_division.is_none() || self.crew_birth_ord.is_empty() {
            return Ok(Vec::new());
        }
        let crew_id = crew_idx.to_string();
        let mut out = Vec::new();
        self.check_8030(crew_idx, &[pairing_idx], &crew_id, &mut out);
        Ok(out)
    }

    pub fn commit_pairing_8030(
        &mut self,
        crew_idx: usize,
        pairing_idx: usize,
    ) -> Result<(), String> {
        if crew_idx >= self.crew_fixed.len() {
            return Err(format!(
                "crew_idx {crew_idx} out of range 0..{}",
                self.crew_fixed.len()
            ));
        }
        if pairing_idx >= self.pairings.len() {
            return Err(format!(
                "pairing_idx {pairing_idx} out of range 0..{}",
                self.pairings.len()
            ));
        }
        for &fi in &self.pairings[pairing_idx].flight_idxs {
            if !self.crew_on_flight_8030[fi].contains(&crew_idx) {
                self.crew_on_flight_8030[fi].push(crew_idx);
            }
        }
        Ok(())
    }

    pub fn rollback_pairing_8030(
        &mut self,
        crew_idx: usize,
        pairing_idx: usize,
    ) -> Result<(), String> {
        if crew_idx >= self.crew_fixed.len() {
            return Err(format!(
                "crew_idx {crew_idx} out of range 0..{}",
                self.crew_fixed.len()
            ));
        }
        if pairing_idx >= self.pairings.len() {
            return Err(format!(
                "pairing_idx {pairing_idx} out of range 0..{}",
                self.pairings.len()
            ));
        }
        for &fi in &self.pairings[pairing_idx].flight_idxs {
            self.crew_on_flight_8030[fi].retain(|&idx| idx != crew_idx);
        }
        Ok(())
    }
}
