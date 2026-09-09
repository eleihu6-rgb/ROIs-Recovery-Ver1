"""Rule 8002 manday: block split at crew-base-local midnight (SPAN).

Cross-midnight segments allocate block minutes proportionally by local-time
overlap per calendar day in the crew's prime base timezone (DST-aware offsets).
"""

import rois_rule_engine_rs as rre

DAY = 86_400
BANDS_10H_28D = [(28, 600.0)]


def test_span_splits_block_at_crew_base_local_midnight():
    # UTC: STD day0 22:00 → STA day1 02:00 (4h / 240 min). Base offset 0 → same local times.
    std, sta, blk = 22 * 3600, 26 * 3600, 240
    eng = rre.Engine(
        pairing_start_utc=[std],
        pairing_end_utc=[sta],
        pairing_blk_min=[blk],
        crew_fixed_pairings=[[]],
        block_bands=BANDS_10H_28D,
        pairing_seg_offsets=[0, 1],
        pairing_seg_std_utc=[std],
        pairing_seg_sta_utc=[sta],
        pairing_seg_blk_min=[blk],
        pairing_seg_crew_offset_min=[[0]],
        pairing_seg_crew_sta_offset_min=[[0]],
        crew_offset_min=[0],
    )
    daily = eng.daily_blk([0], 0)
    assert daily.get(0) == 120.0  # 22:00–24:00 local
    assert daily.get(1) == 120.0  # 00:00–02:00 local


def test_span_uses_dst_offsets_at_std_and_sta():
    # Crew base UTC-2: local STD day0 20:00, local STA day1 00:00 (4h, all before/at midnight).
    std, sta, blk = 22 * 3600, 26 * 3600, 240
    off = -120
    eng = rre.Engine(
        pairing_start_utc=[std],
        pairing_end_utc=[sta],
        pairing_blk_min=[blk],
        crew_fixed_pairings=[[]],
        block_bands=BANDS_10H_28D,
        pairing_seg_offsets=[0, 1],
        pairing_seg_std_utc=[std],
        pairing_seg_sta_utc=[sta],
        pairing_seg_blk_min=[blk],
        pairing_seg_crew_offset_min=[[off]],
        pairing_seg_crew_sta_offset_min=[[off]],
        crew_offset_min=[off],
    )
    daily = eng.daily_blk([0], 0)
    std_local_day = (std + off * 60) // DAY
    assert daily.get(std_local_day) == 240.0
    assert len(daily) == 1


def test_daily_dp_uses_duty_start_local_day():
    std0, sta0 = 22 * 3600, 26 * 3600
    std1, sta1 = DAY + 3 * 3600, DAY + 5 * 3600
    eng = rre.Engine(
        pairing_start_utc=[std0],
        pairing_end_utc=[sta1],
        pairing_blk_min=[0],
        crew_fixed_pairings=[[]],
        block_bands=BANDS_10H_28D,
        pairing_duty_offsets=[0, 2],
        pairing_duty_start_utc=[std0, std1],
        pairing_duty_end_utc=[sta0, sta1],
        pairing_duty_dp_min=[240, 120],
        pairing_duty_dep_tz_min=[0, 0],
        pairing_duty_arr_tz_min=[0, 0],
        pairing_duty_crew_offset_min=[[0, 0]],
        crew_offset_min=[0],
    )
    daily = eng.daily_dp([0], 0)
    assert daily.get(0) == 240.0
    assert daily.get(1) == 120.0


def test_cum_window_sums_spanned_days():
    # Two 4h segments each spanning local midnight (120+120 per day) → 480 min/day.
    std, sta, blk = 22 * 3600, 26 * 3600, 240
    eng = rre.Engine(
        pairing_start_utc=[std, std + DAY],
        pairing_end_utc=[sta, sta + DAY],
        pairing_blk_min=[blk, blk],
        crew_fixed_pairings=[[0]],
        block_bands=BANDS_10H_28D,
        pairing_seg_offsets=[0, 1, 2],
        pairing_seg_std_utc=[std, std + DAY],
        pairing_seg_sta_utc=[sta, sta + DAY],
        pairing_seg_blk_min=[blk, blk],
        pairing_seg_crew_offset_min=[[0, 0]],
        pairing_seg_crew_sta_offset_min=[[0, 0]],
        crew_offset_min=[0],
    )
    # Fixed day0 seg (120 on day0) + candidate day1 seg (120 on day1) = 240 in 28d window.
    assert eng.check_line(0, [1]) == []

def test_cum_window_breach_when_spanned_days_exceed_limit():
    eng = rre.Engine(
        pairing_start_utc=[8 * 3600, 16 * 3600],
        pairing_end_utc=[13 * 3600, 16 * 3600 + 400 * 60],
        pairing_blk_min=[300, 400],
        crew_fixed_pairings=[[0]],
        block_bands=BANDS_10H_28D,
        pairing_seg_offsets=[0, 1, 2],
        pairing_seg_std_utc=[8 * 3600, 16 * 3600],
        pairing_seg_sta_utc=[13 * 3600, 16 * 3600 + 400 * 60],
        pairing_seg_blk_min=[300, 400],
        pairing_seg_crew_offset_min=[[0, 0]],
        pairing_seg_crew_sta_offset_min=[[0, 0]],
        crew_offset_min=[0],
    )
    out = eng.check_line(0, [1])
    assert len(out) == 1
    assert out[0].startswith("8002|window_days=28|")
    assert "actual_h=11:40" in out[0]  # 300 + 400 = 700 min on day 0


def test_crew_daily_baseline_covers_365d_history():
    # Simulate: 365 days before the RO window, crew accumulated 400 min BLK on day -300.
    # Candidate pairing assigned on day 0 adds 300 min.
    # Without baseline the 365d window only sees 300 < 600 → no violation.
    # With baseline, cumulative = 400 + 300 = 700 > 600 in the 365d band → violation.
    BANDS_10H_365D = [(365, 600.0)]
    # day -300 relative to epoch: candidate is on day 0 (epoch)
    hist_day_ord = -300  # 300 days before epoch

    eng_no_baseline = rre.Engine(
        pairing_start_utc=[0],
        pairing_end_utc=[3600],
        pairing_blk_min=[300],
        crew_fixed_pairings=[[]],
        block_bands=BANDS_10H_365D,
    )
    assert eng_no_baseline.check_line(0, [0]) == [], "Without history: 300 < 600, no violation"

    eng_with_baseline = rre.Engine(
        pairing_start_utc=[0],
        pairing_end_utc=[3600],
        pairing_blk_min=[300],
        crew_fixed_pairings=[[]],
        block_bands=BANDS_10H_365D,
        crew_daily_baseline=[[(hist_day_ord, 400.0)]],
    )
    out = eng_with_baseline.check_line(0, [0])
    assert len(out) == 1, "With 365d history: 400+300=700 > 600 should fire"
    assert "8002|window_days=365|" in out[0]
    assert "actual_h=11:40" in out[0]  # 700 min = 11h40


def test_baseline_replaces_fixed_pairing_blk_for_8002():
    # When crew_daily_baseline is provided, PA pairings' BLK comes from baseline,
    # NOT recomputed from crew_fixed_pairings. The baseline value wins.
    # Here fixed pairing has 300 blk_min but baseline says 500 on that day.
    eng = rre.Engine(
        pairing_start_utc=[0, DAY],
        pairing_end_utc=[3600, DAY + 3600],
        pairing_blk_min=[300, 100],
        crew_fixed_pairings=[[0]],
        block_bands=[(28, 550.0)],
        crew_daily_baseline=[[(0, 500.0)]],  # baseline overrides fixed: 500 not 300
    )
    out = eng.check_line(0, [1])
    assert len(out) == 1, "500 (baseline) + 100 (candidate) = 600 > 550 → violation"
    assert "8002|window_days=28|" in out[0]
