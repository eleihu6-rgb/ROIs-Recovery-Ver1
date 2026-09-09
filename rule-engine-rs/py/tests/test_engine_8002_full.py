"""Rule 8002 full-port PyO3 wiring (cum_rules path).

Covers: legacy kwargs unchanged (byte-compatible strings), cum_rules simple row
equivalence, qualification gating, min-limits editor-only, extras injection of
crew_daily_metrics, validation errors, and warnings().

Row helper mirrors the nested-tuple FFI shape:
  ((bases, ranks, fleets, teams), (period, unit, max, min, type),
   (int_lo, int_hi, aug_lo, aug_hi, aloft_lo, aloft_hi), sby_flag, reduction)
"""
import pytest
import rois_rule_engine_rs as rre

DAY = 86_400
# 2026-06-01 (day ord 20605) 00:00 UTC.
D0_ORD = 20605
D0 = D0_ORD * DAY


def row(rtype="BH", period=7, unit="CD", max_min=600, min_min=0,
        bases=("*",), ranks=("*",), fleets=("*",), teams=("*",),
        bands=(-1, -1, -1, -1, -1, -1), sby=-1, reduction=0):
    return ((list(bases), list(ranks), list(fleets), list(teams)),
            (period, unit, max_min, min_min, rtype),
            tuple(bands), sby, reduction)


def eng(*, cum_rules=(), starts=(), blks=(), fixed=((),), app="optimizer", **kw):
    starts = list(starts)
    return rre.Engine(
        pairing_start_utc=starts,
        pairing_end_utc=[s + 8 * 3600 for s in starts],
        pairing_blk_min=list(blks),
        crew_fixed_pairings=[list(f) for f in fixed],
        cum_rules=list(cum_rules),
        scenario_window=(D0, D0 + 27 * DAY),
        application=app,
        **kw,
    )


# ── legacy kwargs stay byte-compatible ────────────────────────────────────────

def test_legacy_block_bands_message_unchanged():
    e = rre.Engine(
        pairing_start_utc=[D0, D0 + DAY],
        pairing_end_utc=[D0 + 8 * 3600, D0 + DAY + 8 * 3600],
        pairing_blk_min=[400, 300],
        crew_fixed_pairings=[[0]],
        block_bands=[(28, 600.0)],
    )
    v = e.check_line(0, [1])
    assert v == [
        "8002|window_days=28|limit_h=10:00|actual_h=11:40|window_start_ord=%d" % D0_ORD
    ]


def test_legacy_dp_bands_kwarg_is_removed():
    with pytest.raises(TypeError, match="dp_bands"):
        rre.Engine(
            pairing_start_utc=[D0],
            pairing_end_utc=[D0 + 8 * 3600],
            pairing_blk_min=[0],
            crew_fixed_pairings=[[]],
            dp_bands=[(7, 600.0)],
        )


def test_cum_rules_supersede_legacy_bands():
    # cum_rules is the only 8002 execution path.
    e = eng(
        cum_rules=[row(rtype="BH", period=28, max_min=600)],
        starts=[D0, D0 + DAY], blks=[400, 300], fixed=[[0]],
        block_bands=[(28, 600.0)],
    )
    v = e.check_line(0, [1])
    assert len(v) == 1
    assert v[0].startswith("8002|type=BH|period=28|unit=CD|")
    assert "actual_min=700" in v[0]


# ── cum_rules basic equivalence ───────────────────────────────────────────────

def test_cum_rule_bh_over_and_exact_limit_legal():
    over = eng(cum_rules=[row(max_min=600, period=28)],
               starts=[D0, D0 + DAY], blks=[400, 201], fixed=[[0]])
    assert len(over.check_line(0, [1])) == 1
    exact = eng(cum_rules=[row(max_min=601, period=28)],
                starts=[D0, D0 + DAY], blks=[400, 201], fixed=[[0]])
    assert exact.check_line(0, [1]) == []


def test_min_limit_editor_only():
    kw = dict(cum_rules=[row(max_min=999_999, min_min=600, period=1)],
              starts=[D0], blks=[30], fixed=[[]])
    ed = eng(app="editor", **kw)
    v = ed.check_line(0, [0])
    assert v and all("min_min=600" in s for s in v)
    op = eng(app="optimizer", **kw)
    assert op.check_line(0, [0]) == []


# ── qualification gating ──────────────────────────────────────────────────────

def test_rank_gate_skips_unqualified_crew():
    kw = dict(
        cum_rules=[row(ranks=("CA",), max_min=100, period=28)],
        starts=[D0], blks=[500],
        fixed=[[], []],
        crew_rank_quals=[
            [("CA", 0, -1)],        # crew 0: CA, open-ended → gated in
            [("FO", 0, -1)],        # crew 1: FO → gated out
        ],
    )
    e = eng(**kw)
    assert len(e.check_line(0, [0])) == 1, "CA crew checked"
    assert e.check_line(1, [0]) == [], "FO crew skipped by rank gate"


def test_fleet_gate_effective_dates():
    e = eng(
        cum_rules=[row(fleets=("B737",), max_min=100, period=28)],
        starts=[D0], blks=[500], fixed=[[]],
        crew_fleet_quals=[[("B737", 0, D0_ORD - 100)]],  # expired before window
    )
    assert e.check_line(0, [0]) == [], "expired fleet qualification → skipped"


def test_team_gated_row_never_fires():
    e = eng(
        cum_rules=[row(teams=("T1",), max_min=100, period=28)],
        starts=[D0], blks=[500], fixed=[[]],
    )
    assert e.check_line(0, [0]) == []
    assert any("teams" in w for w in e.warnings())


# ── multi-metric baseline (kwarg + extras path) ──────────────────────────────

def _metrics_day(ord_, blh=0.0, ft=0.0, dp=0.0, credit=0.0, sby=0.0,
                 int_blh=0.0, aug_blh=0.0, aloft=0.0, cross=0.0):
    return (ord_, [blh, ft, dp, credit, sby, int_blh, aug_blh, aloft, cross])


def test_dp_from_metrics_baseline_plus_candidate():
    # Baseline holds 100 DP min on day 0; candidate pairing adds its dp_min.
    e = eng(
        cum_rules=[row(rtype="DP", period=7, max_min=150)],
        starts=[D0 + DAY], blks=[0], fixed=[[]],
        pairing_dp_min=[60],
        crew_daily_metrics=[[_metrics_day(D0_ORD, dp=100.0)]],
    )
    v = e.check_line(0, [0])
    assert len(v) == 1 and "type=DP" in v[0] and "actual_min=160" in v[0]


def test_candidate_dp_splits_by_duty_span_local_midnight():
    # 2026-06-02 06:00Z..10:00Z = 2026-06-01 23:00..2026-06-02 03:00 YVR.
    # Raw duty 240 min is split 60/180 first; dpPct=0.5 then yields 30/90.
    e = eng(
        cum_rules=[row(rtype="DP", period=1, max_min=80)],
        starts=[D0 + DAY + 6 * 3600], blks=[0], fixed=[[]],
        pairing_duty_offsets=[0, 1],
        pairing_duty_start_utc=[D0 + DAY + 6 * 3600],
        pairing_duty_end_utc=[D0 + DAY + 10 * 3600],
        pairing_duty_dep_tz_min=[0],
        pairing_duty_arr_tz_min=[0],
        pairing_duty_dp_min=[240],
        pairing_duty_dp_pct=[0.5],
        pairing_duty_crew_offset_min=[[-420]],
    )

    v = e.check_line(0, [0])
    assert len(v) == 1
    assert "type=DP" in v[0]
    assert "actual_min=90" in v[0]
    assert f"win_start_s={(D0_ORD + 1) * DAY}" in v[0]


def test_metrics_via_set_next_engine_extras():
    rre.set_next_engine_extras(
        crew_daily_metrics=[[_metrics_day(D0_ORD, blh=550.0)]],
    )
    e = eng(cum_rules=[row(rtype="BH", period=28, max_min=600)],
            starts=[D0 + DAY], blks=[100], fixed=[[]])
    v = e.check_line(0, [0])
    assert len(v) == 1 and "actual_min=650" in v[0]


def test_blk_baseline_fallback_feeds_bh():
    e = eng(cum_rules=[row(rtype="BH", period=28, max_min=600)],
            starts=[D0 + DAY], blks=[100], fixed=[[]],
            crew_daily_baseline=[[(D0_ORD, 550.0)]])
    v = e.check_line(0, [0])
    assert len(v) == 1 and "actual_min=650" in v[0]
    assert any("crew_daily_metrics" in w for w in e.warnings())


def test_optimizer_pa_only_window_tolerated():
    # All activity in the baseline (PA); candidate list empty → no violation.
    e = eng(cum_rules=[row(rtype="BH", period=28, max_min=100)],
            starts=[D0], blks=[0], fixed=[[]],
            crew_daily_metrics=[[_metrics_day(D0_ORD, blh=500.0)]])
    assert e.check_line(0, []) == []


# ── validation & warnings ─────────────────────────────────────────────────────

def test_bad_metrics_row_length_rejected():
    with pytest.raises(ValueError, match="9 metric values"):
        eng(cum_rules=[row()], starts=[D0], blks=[0], fixed=[[]],
            crew_daily_metrics=[[(D0_ORD, [1.0, 2.0])]])


def test_unsupported_type_rejected():
    with pytest.raises(ValueError, match="unsupported type"):
        eng(cum_rules=[row(rtype="COSMIC")], starts=[D0], blks=[0], fixed=[[]])


def test_unknown_unit_rejected():
    with pytest.raises(ValueError, match="unknown unit"):
        eng(cum_rules=[row(unit="XX")], starts=[D0], blks=[0], fixed=[[]])


def test_ft_row_warns_approximation():
    e = eng(cum_rules=[row(rtype="FT", period=28, max_min=600)],
            starts=[D0], blks=[500], fixed=[[]])
    assert any("FT candidate contribution" in w for w in e.warnings())
    # FT candidate ≈ segment/pairing block minutes.
    assert e.check_line(0, [0]) == []
    e2 = eng(cum_rules=[row(rtype="FT", period=28, max_min=400)],
             starts=[D0], blks=[500], fixed=[[]])
    assert len(e2.check_line(0, [0])) == 1


def test_n_rules_counts_cum_rules_once():
    e = eng(cum_rules=[row(), row(rtype="DP")], starts=[D0], blks=[0], fixed=[[]])
    base = rre.Engine()
    assert e.n_rules == base.n_rules + 1


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
    # DP SPAN regression — same fixture as test_candidate_dp_splits_by_duty_span_local_midnight
    # (dp_min=240, pct=0.5 → 60/180 split then 30/90; do not reuse CH overnight dp_min=480).
    dp = eng(
        cum_rules=[row(rtype="DP", period=1, max_min=80)],
        starts=[D0 + DAY + 6 * 3600], blks=[0], fixed=[[]],
        pairing_duty_offsets=[0, 1],
        pairing_duty_start_utc=[D0 + DAY + 6 * 3600],
        pairing_duty_end_utc=[D0 + DAY + 10 * 3600],
        pairing_duty_dep_tz_min=[0],
        pairing_duty_arr_tz_min=[0],
        pairing_duty_dp_min=[240],
        pairing_duty_dp_pct=[0.5],
        pairing_duty_crew_offset_min=[[-420]],
    )
    v = dp.check_line(0, [0])
    assert len(v) == 1
    assert "type=DP" in v[0]
    assert "actual_min=90" in v[0]
    assert f"win_start_s={(D0_ORD + 1) * DAY}" in v[0]
    # BH still uses manday blh + candidate pairing blk (no CH overlay leakage).
    bh = eng(
        cum_rules=[row(rtype="BH", period=28, max_min=600)],
        starts=[D0 + DAY], blks=[100], fixed=[[]],
        crew_daily_metrics=[[_metrics_day(D0_ORD, blh=550.0, credit=9999.0)]],
        pairing_duty_offsets=[0, 1],
        pairing_duty_start_utc=[D0 + DAY],
        pairing_duty_end_utc=[D0 + DAY + 8 * 3600],
        pairing_duty_dep_tz_min=[0],
        pairing_duty_arr_tz_min=[0],
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


def test_check_line_8002_repeatable_does_not_mutate_manday():
    """Overlay must not write back into stored metrics; a second call is identical."""
    e = eng(
        cum_rules=[row(rtype="BH", period=28, max_min=600)],
        starts=[D0 + DAY], blks=[100], fixed=[[]],
        crew_daily_metrics=[[_metrics_day(D0_ORD, blh=550.0, credit=9999.0)]],
    )
    first = e.check_line(0, [0])
    second = e.check_line(0, [0])
    assert first == second
    assert len(first) == 1 and "actual_min=650" in first[0]


def test_check_line_8002_rank_gate_still_uses_open_ended_exp():
    kw = dict(
        cum_rules=[row(ranks=("CA",), max_min=100, period=28)],
        starts=[D0], blks=[500],
        fixed=[[], []],
        crew_rank_quals=[
            [("CA", 0, -1)],
            [("FO", 0, -1)],
        ],
    )
    e = eng(**kw)
    assert e.check_line(0, [0]) == e.check_line(0, [0])
    assert len(e.check_line(0, [0])) == 1
    assert e.check_line(1, [0]) == []
