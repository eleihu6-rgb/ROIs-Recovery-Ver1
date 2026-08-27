# Whole-duty CH/CR on report day Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Engine 8002 CH and `ro_check` SVG **CR** use `max(240, actFlightMinutes, actualDutyMinutes/2)` on the crew-base local date of duty report — BH/DP stay bit-identical to today.

**Architecture:** Keep manday + candidate SPAN for BH/DP/FT. After that composition, **zero manday `credit`** and overlay formula CH for `fixed ∪ candidate` duties plus non-rest ground. Do not send CH through `cum_daily_map` (that path is DP, and today it even ignores `pairing_duty_credit_min`). Feed `actFlightMinutes` as a new `pairing_duty_blk_min` array. SVG hover calls the same Engine map instead of `CrewMandayFd.credit`.

**Tech Stack:** Rust PyO3 `Engine` (`rule-engine-rs/py/src/lib.rs`), pytest (`rule-engine-rs/py/tests/test_engine_8002_full.py`), F8 extras (`engine-server/F8/rust_legality_extras.py`), `ro_check.py` hover.

**Spec:** `docs/superpowers/specs/2026-08-19-ro-check-credit-duty-report-day-design.md`

## Global Constraints

- **BH/DP/FT frozen.** Do not edit `cum_daily_map`, `split_weighted_duty_dp`, `daily_blk`, `daily_dp`, `_blk_by_day_for_hover`, `_dp_by_day_for_hover`, manday `blh`/`dp` extras, or the BH/DP/FT parts of `candidate_day_metrics`.
- CH formula (minutes, `f64`): `max(240.0, blk as f64, dp as f64 / 2.0)`. Never `creditedMinutes`. Never `CrewMandayFd.credit`.
- Attribution: whole duty on crew-base local day of `pairing_duty_start_utc[di] + pairing_duty_crew_offset_min[crew][di] * 60`. No SPAN, ignore `pairing_duty_dp_pct`.
- Ground non-rest: `240.0` on crew-base local date of `GroundDuty.start_utc` using `crew_offset(crew_idx)` — not airport / `crew_ground_tz_min`. Rest/DO/leave (`is_rest=true`) = 0.
- When manday `crew_daily_metrics` is present: still use it for BH/DP/FT; zero `credit`; overlay formula CH; do **not** `add()` candidate credit on top of manday credit.
- Union candidate CH days into `cand_days` (optimizer PA-ignore). Do not put ground-only days into `cand_days`.
- Live `check-8002` bin / `ruletool` manday tables: out of scope.
- Solver 8002 CH **will** change (shared Engine). Intended.
- §No-Auto-Commit: skip `git commit` unless the user asks.
- Before editing `check_8002_full` / `candidate_day_metrics`, run GitNexus `impact` if the MCP is available; if HIGH/CRITICAL, stop and report.

## File map

| File | Responsibility |
|------|----------------|
| `rule-engine-rs/py/tests/test_engine_8002_full.py` | CH overlay + BH regression tests |
| `rule-engine-rs/py/src/lib.rs` | `pairing_duty_blk_min`, formula map, 8002 overlay, `daily_credit` |
| `engine-server/F8/rust_legality_extras.py` | Pass `actFlightMinutes` as `pairing_duty_blk_min` |
| `engine-server/tests/test_rust_legality_extras.py` | Duty-param blk array |
| `rule-engine-rs/ro-tests/ro_check.py` | SVG `_credit_by_day_for_hover` uses Engine, not manday credit |

Blast: `ro_check` and PBS solver share `RustRuleChecker` → `Engine.check_8002_full`. BH/DP strings must match today.

---

### Task 1: Failing Engine CH tests (BH regression included)

**Files:**
- Modify: `rule-engine-rs/py/tests/test_engine_8002_full.py`

**Interfaces:**
- Consumes: existing `eng()`, `row()`, `_metrics_day()`, `D0`, `D0_ORD`, `DAY`
- Produces: tests that fail until Task 2 implements formula CH + `pairing_duty_blk_min`

- [ ] **Step 1: Append these tests at the end of `test_engine_8002_full.py`**

Overnight duty used by the existing DP SPAN test: start `D0 + DAY + 6*3600` UTC, end `+10*3600`, crew offset `-420` → report local `2026-06-01 23:00` (ord `D0_ORD`), release local `2026-06-02 03:00`.

```python
def _overnight_duty_kw():
    return dict(
        starts=[D0 + DAY + 6 * 3600],
        blks=[400],
        fixed=[[]],
        pairing_duty_offsets=[0, 1],
        pairing_duty_start_utc=[D0 + DAY + 6 * 3600],
        pairing_duty_end_utc=[D0 + DAY + 10 * 3600],
        pairing_duty_dep_tz_min=[0],
        pairing_duty_arr_tz_min=[0],
        pairing_duty_dp_min=[480],
        pairing_duty_blk_min=[400],
        pairing_duty_crew_offset_min=[[-420]],
    )


def test_ch_whole_duty_credit_on_report_day_not_span():
    # max(240, 400, 480/2) = 400, all on report day D0_ORD. Period=1 max=350 → one hit.
    e = eng(
        cum_rules=[row(rtype="CH", period=1, max_min=350)],
        **_overnight_duty_kw(),
    )
    v = e.check_line(0, [0])
    assert len(v) == 1
    assert "type=CH" in v[0]
    assert "actual_min=400" in v[0]
    assert f"win_start_s={D0_ORD * DAY}" in v[0]


def test_ch_ignores_manday_credit_split():
    # Manday puts 9999 CH on both local days. Formula still 400 on report day only.
    e = eng(
        cum_rules=[row(rtype="CH", period=1, max_min=500)],
        crew_daily_metrics=[[
            _metrics_day(D0_ORD, credit=9999.0),
            _metrics_day(D0_ORD + 1, credit=9999.0),
        ]],
        **_overnight_duty_kw(),
    )
    assert e.check_line(0, [0]) == []
    over = eng(
        cum_rules=[row(rtype="CH", period=1, max_min=300)],
        crew_daily_metrics=[[
            _metrics_day(D0_ORD, credit=10.0),
            _metrics_day(D0_ORD + 1, credit=10.0),
        ]],
        **_overnight_duty_kw(),
    )
    v = over.check_line(0, [0])
    assert len(v) == 1
    assert "actual_min=400" in v[0]
    assert f"win_start_s={D0_ORD * DAY}" in v[0]


def test_ch_does_not_change_dp_span_or_bh_manday():
    # DP SPAN regression (same numbers as test_candidate_dp_splits_by_duty_span_local_midnight).
    dp = eng(
        cum_rules=[row(rtype="DP", period=1, max_min=80)],
        pairing_duty_dp_pct=[0.5],
        **_overnight_duty_kw(),
    )
    v = dp.check_line(0, [0])
    assert len(v) == 1
    assert "type=DP" in v[0]
    assert "actual_min=90" in v[0]
    # BH still uses manday blh + candidate pairing blk (no CH overlay leakage).
    bh = eng(
        cum_rules=[row(rtype="BH", period=28, max_min=600)],
        starts=[D0 + DAY], blks=[100], fixed=[[]],
        crew_daily_metrics=[[_metrics_day(D0_ORD, blh=550.0, credit=9999.0)]],
        pairing_duty_offsets=[0, 1],
        pairing_duty_start_utc=[D0 + DAY],
        pairing_duty_end_utc=[D0 + DAY + 8 * 3600],
        pairing_duty_dp_min=[0],
        pairing_duty_blk_min=[100],
    )
    v = bh.check_line(0, [0])
    assert len(v) == 1 and "type=BH" in v[0] and "actual_min=650" in v[0]


def test_ch_ground_non_rest_240_on_crew_base_day():
    e = eng(
        app="editor",
        cum_rules=[row(rtype="CH", period=1, max_min=200)],
        starts=[], blks=[], fixed=[[]],
        crew_offset_min=[0],
        crew_ground_start=[[D0 + 12 * 3600]],
        crew_ground_end=[[D0 + 16 * 3600]],
        crew_ground_assignment=[["SIM"]],
        crew_ground_group=[["SIM"]],
        crew_ground_is_rest=[[False]],
    )
    v = e.check_line(0, [])
    assert len(v) == 1
    assert "type=CH" in v[0]
    assert "actual_min=240" in v[0]
    assert f"win_start_s={D0_ORD * DAY}" in v[0]


def test_ch_rest_ground_is_zero():
    e = eng(
        app="editor",
        cum_rules=[row(rtype="CH", period=1, max_min=200)],
        starts=[], blks=[], fixed=[[]],
        crew_offset_min=[0],
        crew_ground_start=[[D0 + 12 * 3600]],
        crew_ground_end=[[D0 + 16 * 3600]],
        crew_ground_assignment=[["DO"]],
        crew_ground_group=[["DO"]],
        crew_ground_is_rest=[[True]],
    )
    assert e.check_line(0, []) == []
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd /home/qianggong/Documents/Crew/rois-ai/rule-engine-rs/py
/home/qianggong/.venv/bin/pytest tests/test_engine_8002_full.py::test_ch_whole_duty_credit_on_report_day_not_span tests/test_engine_8002_full.py::test_ch_ignores_manday_credit_split tests/test_engine_8002_full.py::test_ch_does_not_change_dp_span_or_bh_manday tests/test_engine_8002_full.py::test_ch_ground_non_rest_240_on_crew_base_day tests/test_engine_8002_full.py::test_ch_rest_ground_is_zero -q
```

Expected before Task 2: `TypeError: unexpected keyword argument 'pairing_duty_blk_min'` **or** CH `actual_min` still follows manday/DP (not 400 / 240).

- [ ] **Step 3: Commit** — skip unless the user asks.

---

### Task 2: Engine formula CH overlay + `daily_credit`

**Files:**
- Modify: `rule-engine-rs/py/src/lib.rs`
- Test: `rule-engine-rs/py/tests/test_engine_8002_full.py` (Task 1)

**Interfaces:**
- Consumes: existing `pairing_duty_start_utc`, `pairing_duty_dp_min`, `pairing_duty_crew_offset_min`, `crew_ground`, `crew_offset`
- Produces:
  - `pairing_duty_blk_min: Vec<i64>` (parallel to `pairing_duty_start_utc`)
  - `fn credit_daily_map(&self, idxs: &[usize], crew_idx: usize) -> BTreeMap<i64, f64>`
  - `fn ground_credit_daily_map(&self, crew_idx: usize) -> BTreeMap<i64, f64>`
  - `fn daily_credit(pairing_idxs: Vec<i64>, crew_idx: i64) -> HashMap<i64, f64>` (PyO3; pairings + that crew's ground)
  - `check_8002_full` zeros manday credit then overlays those maps

- [ ] **Step 1: GitNexus impact (if MCP available)** on `check_8002_full` and `candidate_day_metrics`. If HIGH/CRITICAL, stop and report. Then add `pairing_duty_blk_min` next to `pairing_duty_dp_min` everywhere that array is plumbed:

1. `EngineExtras` (~line 73)
2. `Engine` struct after `pairing_duty_dp_min` (~592)
3. `#[new]` kwarg default `Vec::new()` (near `pairing_duty_dp_min = Vec::new()`)
4. `#[new]` typed arg
5. extras `match` merge (empty → extras), same pattern as `pairing_duty_dp_min`
6. length check: if non-empty, `len == pd_total` (same as `pairing_duty_credit_min`)
7. `Engine { pairing_duty_blk_min, ... }`
8. `set_next_engine_extras` signature + struct fill

Leave `pairing_duty_credit_min` in the API but **do not read it** in 8002.

Replace the CH warning (~4302) with duty-array absence, not creditedMinutes:

```rust
if parsed_cum_rules.iter().any(|r| r.rtype == CumType::Ch)
    && pairing_duty_offsets.is_empty()
{
    engine_warnings.push(
        "8002 CH row(s) active without pairing duty arrays — formula credit \
         for flying duties = 0 (ground still counted)"
            .to_string(),
    );
}
```

- [ ] **Step 2: Add the formula maps on `Engine` (private), next to `candidate_day_metrics`**

```rust
fn duty_formula_credit_min(&self, di: usize) -> f64 {
    let blk = self.pairing_duty_blk_min.get(di).copied().unwrap_or(0) as f64;
    let dp = self.pairing_duty_dp_min.get(di).copied().unwrap_or(0) as f64;
    blk.max(dp / 2.0).max(240.0)
}

fn credit_daily_map(&self, idxs: &[usize], crew_idx: usize) -> BTreeMap<i64, f64> {
    let mut daily: BTreeMap<i64, f64> = BTreeMap::new();
    if self.pairing_duty_offsets.is_empty() {
        return daily;
    }
    let fallback = self.crew_offset(crew_idx);
    for &pi in idxs {
        if pi + 1 >= self.pairing_duty_offsets.len() {
            continue;
        }
        let (s, e) = (
            self.pairing_duty_offsets[pi],
            self.pairing_duty_offsets[pi + 1],
        );
        for di in s..e {
            if di >= self.pairing_duty_start_utc.len() {
                continue;
            }
            let off = self.duty_crew_offset_min(crew_idx, di).unwrap_or(fallback);
            let day = (self.pairing_duty_start_utc[di] + off * 60)
                .div_euclid(SECONDS_PER_DAY);
            *daily.entry(day).or_insert(0.0) += self.duty_formula_credit_min(di);
        }
    }
    daily
}

fn ground_credit_daily_map(&self, crew_idx: usize) -> BTreeMap<i64, f64> {
    let mut daily: BTreeMap<i64, f64> = BTreeMap::new();
    let Some(grounds) = self.crew_ground.get(crew_idx) else {
        return daily;
    };
    let off_s = self.crew_offset(crew_idx) * 60;
    for g in grounds {
        if g.is_rest {
            continue;
        }
        let day = (g.start_utc + off_s).div_euclid(SECONDS_PER_DAY);
        *daily.entry(day).or_insert(0.0) += 240.0;
    }
    daily
}
```

- [ ] **Step 3: Stop putting CH through `cum_daily_map`**

In `candidate_day_metrics`, **delete only** this block (~1719–1724). Leave BH/DP/FT/SBY/cross_tz untouched:

```rust
if !self.pairing_duty_credit_min.is_empty() && !self.pairing_duty_offsets.is_empty() {
    let (ch, _) = self.cum_daily_map(idxs, crew_idx, false, &self.pairing_duty_credit_min);
    for (d, v) in ch {
        out.entry(d).or_default().credit += v;
    }
}
```

Today that call ignores `_dp_values` and would add **DP** as credit. Removing it is the CH fix, not a DP change.

- [ ] **Step 4: Overlay in `check_8002_full` after manday/baseline/fixed load and candidate BH/DP add**

Replace the tail from `let cand_map = ...` through `cand_days.insert(d)` (~1856–1861) with:

```rust
for m in daily.values_mut() {
    m.credit = 0.0;
}
let cand_map = self.candidate_day_metrics(candidate, crew_idx);
let mut cand_days: BTreeSet<i64> = BTreeSet::new();
for (d, m) in cand_map {
    daily.entry(d).or_default().add(&m);
    cand_days.insert(d);
}
let mut line: Vec<usize> = Vec::with_capacity(fixed.len() + candidate.len());
line.extend_from_slice(fixed);
line.extend_from_slice(candidate);
for (d, v) in self.credit_daily_map(&line, crew_idx) {
    daily.entry(d).or_default().credit += v;
}
for (d, v) in self.credit_daily_map(candidate, crew_idx) {
    cand_days.insert(d);
}
for (d, v) in self.ground_credit_daily_map(crew_idx) {
    daily.entry(d).or_default().credit += v;
}
```

Zero credit **before** `add(&cand_map)` so leftover candidate credit cannot return (after Step 3, `cand_map.credit` is 0 anyway).

- [ ] **Step 5: Expose `daily_credit` next to `daily_dp` (~4838)**

```rust
/// Per-calendar-day CH: whole-duty formula on report's crew-base local day,
/// plus 240 min per non-rest ground on that crew-base start day.
fn daily_credit(
    &self,
    pairing_idxs: Vec<i64>,
    crew_idx: i64,
) -> std::collections::HashMap<i64, f64> {
    let idxs: Vec<usize> = pairing_idxs
        .into_iter()
        .filter(|&i| i >= 0 && (i as usize) < self.pairings.len())
        .map(|i| i as usize)
        .collect();
    let crew_idx = if crew_idx < 0 { 0 } else { crew_idx as usize };
    let mut daily = self.credit_daily_map(&idxs, crew_idx);
    for (d, v) in self.ground_credit_daily_map(crew_idx) {
        *daily.entry(d).or_insert(0.0) += v;
    }
    daily.into_iter().collect()
}
```

Do **not** add a `daily_blk`/`daily_dp` twin that splits credit.

- [ ] **Step 6: Rebuild the PyO3 module and re-run Task 1 tests**

```bash
cd /home/qianggong/Documents/Crew/rois-ai/rule-engine-rs/py
/home/qianggong/.venv/bin/python -m maturin develop --release
/home/qianggong/.venv/bin/pytest tests/test_engine_8002_full.py -q
```

Expected: all PASS, including pre-existing BH/DP cases (`test_dp_from_metrics_baseline_plus_candidate`, `test_candidate_dp_splits_by_duty_span_local_midnight`, `test_metrics_via_set_next_engine_extras`).

- [ ] **Step 7: Commit** — skip unless the user asks.

---

### Task 3: Extras pass `actFlightMinutes` as `pairing_duty_blk_min`

**Files:**
- Modify: `engine-server/F8/rust_legality_extras.py` (`make_duty_params`)
- Test: `engine-server/tests/test_rust_legality_extras.py`

**Interfaces:**
- Consumes: PairingDuty column `actFlightMinutes` (already in `ro_input` / `pairing.py`)
- Produces: extras key `pairing_duty_blk_min: list[int]` parallel to `pairing_duty_dp_min`
- Keep `pairing_duty_credit_min` in the dict (solver/API compat) but Engine no longer uses it for 8002

- [ ] **Step 1: Add a failing extras test**

In `engine-server/tests/test_rust_legality_extras.py`:

```python
from rust_legality_extras import make_duty_params  # noqa: E402


class _P:
    def __init__(self, pid):
        self.id = pid
        self.original_pairing_id = pid


def test_make_duty_params_blk_from_act_flight_minutes(monkeypatch):
    monkeypatch.setattr(
        "rust_legality_extras._tz_offset_min", lambda iata, at_utc: 0
    )
    monkeypatch.setattr(
        "rust_legality_extras._per_crew_offsets",
        lambda bases, ts: [[0] * len(ts) for _ in bases],
    )
    start = pd.Timestamp("2026-06-01T12:00:00Z")
    end = pd.Timestamp("2026-06-01T20:00:00Z")
    sections = {
        "PairingDuty": pd.DataFrame(
            [
                {
                    "pairingId": "10",
                    "dutySeq": 1,
                    "actStrDtUtc": start,
                    "actEndDtUtc": end,
                    "strArp": "YVR",
                    "endArp": "YYC",
                    "actualDutyMinutes": 480,
                    "actFlightMinutes": 400,
                    "creditedMinutes": 111,
                }
            ]
        )
    }
    out = make_duty_params([_P("10")], sections, ["YVR"])
    assert out["pairing_duty_blk_min"] == [400]
    assert out["pairing_duty_dp_min"] == [480]
    assert out["pairing_duty_credit_min"] == [111]
```

- [ ] **Step 2: Run — expect FAIL** (`pairing_duty_blk_min` missing)

```bash
cd /home/qianggong/Documents/Crew/rois-ai/engine-server
/home/qianggong/.venv/bin/pytest tests/test_rust_legality_extras.py::test_make_duty_params_blk_from_act_flight_minutes -q
```

- [ ] **Step 3: Extend `make_duty_params`**

In the row loop (~216–228), also parse `actFlightMinutes`. Tuple becomes `(seq, st, en, dep, arv, dp, credit, blk)`. Flatten:

```python
        try:
            blk = int(row.get("actFlightMinutes") or 0)
        except (ValueError, TypeError):
            blk = 0
        by_pid.setdefault(pid, []).append((seq, st, en, dep, arv, dp, credit, blk))
    by_pid_sorted = {
        pid: [(r[1], r[2], r[3], r[4], r[5], r[6], r[7]) for r in sorted(v, key=lambda x: x[0])]
        for pid, v in by_pid.items()
    }
    ...
    blk_min: list[int] = []
    for p in pairings:
        pid = str(getattr(p, "original_pairing_id", None) or p.id)
        for st, en, dep, arv, dp, credit, blk in by_pid_sorted.get(pid, []):
            starts.append(st)
            ends.append(en)
            dep_tz.append(_tz_offset_min(dep, st))
            arr_tz.append(_tz_offset_min(arv, en))
            dp_min.append(dp)
            credit_min.append(credit)
            blk_min.append(blk)
        offsets.append(len(starts))
    return {
        ...
        "pairing_duty_blk_min": blk_min,
        "pairing_duty_credit_min": credit_min,
        ...
    }
```

Do not change `make_segment_params` or `make_manday_params`.

- [ ] **Step 4: Re-run extras tests**

```bash
cd /home/qianggong/Documents/Crew/rois-ai/engine-server
/home/qianggong/.venv/bin/pytest tests/test_rust_legality_extras.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit** — skip unless the user asks.

---

### Task 4: SVG CR hover uses Engine `daily_credit`

**Files:**
- Modify: `rule-engine-rs/ro-tests/ro_check.py` (`_credit_by_day_for_hover` ~210–282 and its call ~3751)

**Interfaces:**
- Consumes: `engine.daily_credit(idxs, crew_idx)` from Task 2 (pairings + ground)
- Produces: per-day CR dict with no manday credit and no per-day `max(240, daily_blk, daily_dp/2)`

- [ ] **Step 1: Replace `_credit_by_day_for_hover`**

Drop `manday_credit`, `ground_tasks`, `assignment_rest_map`, `airport_zones`. Keep pairing idxs + engine:

```python
def _credit_by_day_for_hover(
    *,
    crew_idx: int,
    line_idxs: list[int],
    engine: Any,
) -> dict[date, float]:
    """Per-day CREDIT for SVG day-header hover — same CH as Engine 8002.

    Whole-duty formula on crew-base report day + 240 for non-rest ground.
    Does not use CrewMandayFd.credit or SPAN daily_blk/daily_dp.
    """
    _EPOCH = date(1970, 1, 1)
    out: dict[date, float] = {}
    raw = engine.daily_credit(line_idxs, crew_idx)
    for day_ord, credit in raw.items():
        d = _EPOCH + timedelta(days=int(day_ord))
        out[d] = out.get(d, 0.0) + float(credit)
    return out
```

At the call site (~3730–3761), BLK/DP hover **unchanged**. Credit:

```python
        line_idxs = pa_idxs + cand_idxs
        credit_by_day = _credit_by_day_for_hover(
            crew_idx=crew_idx,
            line_idxs=line_idxs,
            engine=engine,
        )
```

If `manday_credit` becomes unused, remove its `_build_manday_metric_baseline(..., "credit")` **only if** nothing else in `run_check` uses it. `manday_daily` still includes credit for the SVG legend/debug strip — **keep building `manday_credit` for `manday_daily`**. Hover must not read it.

- [ ] **Step 2: Confirm no other callers**

```bash
rg -n "_credit_by_day_for_hover" /home/qianggong/Documents/Crew/rois-ai/rule-engine-rs
```

Only `ro_check.py` should remain.

- [ ] **Step 3: Syntax check**

```bash
/home/qianggong/.venv/bin/python -m py_compile /home/qianggong/Documents/Crew/rois-ai/rule-engine-rs/ro-tests/ro_check.py
```

Expected: exit 0.

- [ ] **Step 4: Commit** — skip unless the user asks.

---

### Task 5: Full verification

**Files:** none new

- [ ] **Step 1: Rebuild PyO3 (in case Task 3 extras need the new kwarg on `set_next_engine_extras`)**

```bash
cd /home/qianggong/Documents/Crew/rois-ai/rule-engine-rs/py
/home/qianggong/.venv/bin/python -m maturin develop --release
```

- [ ] **Step 2: Engine 8002 suite**

```bash
/home/qianggong/.venv/bin/pytest /home/qianggong/Documents/Crew/rois-ai/rule-engine-rs/py/tests/test_engine_8002_full.py /home/qianggong/Documents/Crew/rois-ai/rule-engine-rs/py/tests/test_engine_8002_full_params.py -q
```

Expected: PASS. If `set_next_engine_extras` gained a required arg, extras tests that call it will fail — the kwarg must default to `Vec::new()`.

- [ ] **Step 3: Extras suite**

```bash
/home/qianggong/.venv/bin/pytest /home/qianggong/Documents/Crew/rois-ai/engine-server/tests/test_rust_legality_extras.py -q
```

Expected: PASS.

- [ ] **Step 4: Optional replay** (if `rule-engine-rs/ro-tests/ro_input.txt` exists)

```bash
cd /home/qianggong/Documents/Crew/rois-ai/rule-engine-rs/ro-tests
/home/qianggong/.venv/bin/python ro_check.py
```

Expected: completes. Spot-check an overnight duty: BLK may split two header days; **CR is a single lump on the report date**.

- [ ] **Step 5: Commit** — skip unless the user asks.

---

## Spec coverage (self-review)

| Spec item | Task |
|-----------|------|
| Formula `max(240, blk, dp/2)` | Task 2 `duty_formula_credit_min` |
| Whole duty on crew-base report day | Task 2 `credit_daily_map` |
| Ignore manday credit / creditedMinutes | Task 2 zero + overlay; extras still pass credit unused |
| Ground non-rest 240 / rest 0 | Task 2 `ground_credit_daily_map` + tests |
| SVG CR matches Engine | Task 4 |
| BH/DP frozen | Task 1 regression + Task 2 does not touch `cum_daily_map` |
| Solver CH blast | Architecture / constraints (no extra code) |
| Live check-8002 bin | Out of scope |

No TBD/placeholder steps. `pairing_duty_blk_min` is the name later tasks use.
