"""Phase 2: rule 7505 MIN # GDOs (days-off floor) enforced in check_line.

Roster period = a 10-day window [day0..day9]; require >= 7 days off (i.e. a crew
may work at most 3 of the 10 days). Optimizer PA-ignore: a shortfall already
present in the fixed rosters is tolerated; the candidate is flagged only when it
turns a compliant period non-compliant.
"""

import pytest
import rois_rule_engine_rs as rre

DAY = 86_400


def _structured_7505_row(bases=("*",), ranks=("*",), fleets=("*",), teams=("*",), min_do=7, count_layover=False):
    return (
        (list(bases), list(ranks), list(fleets), list(teams)),
        (
            ["DO"],
            min_do,
            "1",
            "RP",
            (10, 10),
            True,
            True,
            count_layover,
            ["VAC"],
            (0, 0),
        ),
    )


def _eng(pairing_days, crew_fixed, rp=(0, 9), min_off=7, application="optimizer"):
    # one pairing per day (single-day duties); block/labels irrelevant here.
    starts = [d * DAY for d in pairing_days]
    ends = [s + 3600 for s in starts]
    return rre.Engine(
        pairing_start_utc=starts,
        pairing_end_utc=ends,
        pairing_blk_min=[60] * len(pairing_days),
        crew_fixed_pairings=crew_fixed,
        block_bands=[],
        spacing_hours=None,
        rp_start_ord=rp[0],
        rp_end_ord=rp[1],
        min_days_off=min_off,
        application=application,
    )


def test_candidate_pushes_below_floor_violates():
    # fixed works days 0,1,2 (3 working → 7 off = OK). Candidate adds day3 →
    # 4 working → 6 off < 7 → violation created by the candidate.
    eng = _eng([0, 1, 2, 3], crew_fixed=[[0, 1, 2]])
    out = eng.check_line(0, [3])
    assert len(out) == 1
    assert out[0].startswith("7505|")
    assert "days_off=6" in out[0]
    assert "min_days_off=7" in out[0]


def test_candidate_within_floor_passes():
    # fixed works days 0,1 (8 off). Candidate adds day2 → 7 off == floor → OK.
    eng = _eng([0, 1, 2], crew_fixed=[[0, 1]])
    assert eng.check_line(0, [2]) == []


def test_fixed_only_shortfall_tolerated():
    # fixed already works 4 days (6 off < 7) — pre-existing. Empty candidate is
    # not blamed.
    eng = _eng([0, 1, 2, 3], crew_fixed=[[0, 1, 2, 3]])
    assert eng.check_line(0, []) == []


def test_pre_existing_shortfall_candidate_also_tolerated():
    # fixed works 4 days (6 off < 7, pre-existing). Candidate adds day5; fixed
    # alone already below floor → tolerated (optimizer PA-ignore).
    eng = _eng([0, 1, 2, 3, 5], crew_fixed=[[0, 1, 2, 3]])
    assert eng.check_line(0, [4]) == []


def test_layover_middle_days_count_as_working():
    # one 3-day pairing (day0..day2) + candidate 3-day pairing (day3..day5) →
    # 6 working days → 4 off < 7 → violation. (COUNT LAYOVER=N.)
    starts = [0 * DAY, 3 * DAY]
    ends = [2 * DAY + 3600, 5 * DAY + 3600]
    eng = rre.Engine(
        pairing_start_utc=starts, pairing_end_utc=ends, pairing_blk_min=[60, 60],
        crew_fixed_pairings=[[0]], rp_start_ord=0, rp_end_ord=9, min_days_off=7,
    )
    out = eng.check_line(0, [1])
    assert len(out) == 1 and "days_off=4" in out[0]


def test_structured_count_layover_y_synthesizes_duty_gaps():
    # One pairing with duties on day0 and day3 → middle days 1–2.
    # N: span fill keeps middles working → 4 working → days_off=6.
    # Y: middles become LAYOVER/DO → 2 working → days_off=8.
    duty_starts = [0, 3 * DAY]
    duty_ends = [3600, 3 * DAY + 3600]
    common = dict(
        pairing_start_utc=[0],
        pairing_end_utc=[3 * DAY + 3600],
        pairing_blk_min=[60],
        crew_fixed_pairings=[[0]],
        rp_start_ord=0,
        rp_end_ord=9,
        application="editor",
        pairing_duty_offsets=[0, 2],
        pairing_duty_start_utc=duty_starts,
        pairing_duty_end_utc=duty_ends,
        pairing_duty_dep_tz_min=[0, 0],
        pairing_duty_arr_tz_min=[0, 0],
    )
    out_n = rre.Engine(
        days_off_rules=[_structured_7505_row(min_do=99, count_layover=False)],
        **common,
    ).check_line(0, [])
    out_y = rre.Engine(
        days_off_rules=[_structured_7505_row(min_do=99, count_layover=True)],
        **common,
    ).check_line(0, [])
    assert len(out_n) == 1 and "days_off=6" in out_n[0]
    assert len(out_y) == 1 and "days_off=8" in out_y[0]


def test_three_rules_count():
    eng = rre.Engine(
        pairing_start_utc=[0], pairing_end_utc=[3600], pairing_blk_min=[60],
        crew_fixed_pairings=[[]], block_bands=[(28, 600.0)],
        pairing_is_fly=[True], pairing_label=["P0"], spacing_hours=10.0,
        rp_start_ord=0, rp_end_ord=9, min_days_off=7,
    )
    assert eng.n_rules == 4
    assert repr(eng) == "Engine(phase=2, app=optimizer, pairings=1, crews=1, rules=4)"


def test_editor_reports_pre_existing_7505_shortfall():
    eng = _eng([0, 1, 2, 3], crew_fixed=[[0, 1, 2, 3]], application="editor")
    out = eng.check_line(0, [])
    assert len(out) == 1
    assert out[0].startswith("7505|")
    assert "days_off=6" in out[0]


def test_structured_7505_rows_are_used_without_legacy_scalar():
    eng = rre.Engine(
        pairing_start_utc=[0, DAY, 2 * DAY, 3 * DAY],
        pairing_end_utc=[3600, DAY + 3600, 2 * DAY + 3600, 3 * DAY + 3600],
        pairing_blk_min=[60] * 4,
        crew_fixed_pairings=[[0, 1, 2]],
        days_off_rules=[_structured_7505_row()],
        rp_start_ord=0,
        rp_end_ord=9,
    )

    assert eng.n_rules == 2
    out = eng.check_line(0, [3])
    assert len(out) == 1
    assert "min_days_off=7" in out[0]
    assert "days_off=6" in out[0]


def test_structured_7505_non_wildcard_team_matches_crew_context():
    eng = rre.Engine(
        pairing_start_utc=[0, DAY, 2 * DAY, 3 * DAY],
        pairing_end_utc=[3600, DAY + 3600, 2 * DAY + 3600, 3 * DAY + 3600],
        pairing_blk_min=[60] * 4,
        crew_fixed_pairings=[[0, 1, 2]],
        days_off_rules=[_structured_7505_row(teams=("TEAM1",))],
        crew_teams=[["TEAM1"]],
        rp_start_ord=0,
        rp_end_ord=9,
    )

    out = eng.check_line(0, [3])
    assert len(out) == 1
    assert "min_days_off=7" in out[0]
    assert "days_off=6" in out[0]


def test_structured_7505_non_wildcard_team_skips_nonmatching_crew():
    eng = rre.Engine(
        pairing_start_utc=[0, DAY, 2 * DAY, 3 * DAY],
        pairing_end_utc=[3600, DAY + 3600, 2 * DAY + 3600, 3 * DAY + 3600],
        pairing_blk_min=[60] * 4,
        crew_fixed_pairings=[[0, 1, 2]],
        days_off_rules=[_structured_7505_row(teams=("TEAM1",))],
        crew_teams=[["TEAM2"]],
        rp_start_ord=0,
        rp_end_ord=9,
    )

    assert eng.check_line(0, [3]) == []


def test_structured_7505_empty_team_filter_applies_to_all_crews():
    eng = rre.Engine(
        pairing_start_utc=[0, DAY, 2 * DAY, 3 * DAY],
        pairing_end_utc=[3600, DAY + 3600, 2 * DAY + 3600, 3 * DAY + 3600],
        pairing_blk_min=[60] * 4,
        crew_fixed_pairings=[[0, 1, 2]],
        days_off_rules=[_structured_7505_row(teams=())],
        rp_start_ord=0,
        rp_end_ord=9,
    )

    out = eng.check_line(0, [3])
    assert len(out) == 1
    assert "min_days_off=7" in out[0]
    assert "days_off=6" in out[0]


def test_structured_7505_non_wildcard_team_fails_without_crew_team_context():
    eng = rre.Engine(
        pairing_start_utc=[0, DAY, 2 * DAY, 3 * DAY],
        pairing_end_utc=[3600, DAY + 3600, 2 * DAY + 3600, 3 * DAY + 3600],
        pairing_blk_min=[60] * 4,
        crew_fixed_pairings=[[0, 1, 2]],
        days_off_rules=[_structured_7505_row(teams=("TEAM1",))],
        rp_start_ord=0,
        rp_end_ord=9,
    )

    with pytest.raises(ValueError, match="7505 row specifies Crew Teams"):
        eng.check_line(0, [3])


def test_structured_7505_base_rank_fleet_scope_matches_crew_context():
    eng = rre.Engine(
        pairing_start_utc=[0, DAY, 2 * DAY, 3 * DAY],
        pairing_end_utc=[3600, DAY + 3600, 2 * DAY + 3600, 3 * DAY + 3600],
        pairing_blk_min=[60] * 4,
        crew_fixed_pairings=[[0, 1, 2]],
        days_off_rules=[
            _structured_7505_row(bases=("YVR",), ranks=("CA",), fleets=("A320",)),
        ],
        crew_base_quals=[[("YVR", 0, -1)]],
        crew_rank_quals=[[("CA", 0, -1)]],
        crew_fleet_quals=[[("A320", 0, -1)]],
        rp_start_ord=0,
        rp_end_ord=9,
    )

    out = eng.check_line(0, [3])
    assert len(out) == 1
    assert "min_days_off=7" in out[0]
    assert "days_off=6" in out[0]


def test_structured_7505_base_rank_fleet_scope_skips_nonmatching_crew():
    eng = rre.Engine(
        pairing_start_utc=[0, DAY, 2 * DAY, 3 * DAY],
        pairing_end_utc=[3600, DAY + 3600, 2 * DAY + 3600, 3 * DAY + 3600],
        pairing_blk_min=[60] * 4,
        crew_fixed_pairings=[[0, 1, 2]],
        days_off_rules=[
            _structured_7505_row(bases=("YVR",), ranks=("CA",), fleets=("A320",)),
        ],
        crew_base_quals=[[("YYZ", 0, -1)]],
        crew_rank_quals=[[("FO", 0, -1)]],
        crew_fleet_quals=[[("B737", 0, -1)]],
        rp_start_ord=0,
        rp_end_ord=9,
    )

    assert eng.check_line(0, [3]) == []
