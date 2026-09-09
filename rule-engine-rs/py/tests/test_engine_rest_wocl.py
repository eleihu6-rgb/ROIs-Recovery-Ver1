"""Rules 7501 (SDFD), 7503 (consecutive WOCL), 7504 (WOCL spacing) wiring tests.

Uses offset_min=0 so local time == UTC, making the WOCL band (02:00-05:59) and
local-night band (22:30-09:30) easy to reason about. The underlying kernels are
covered by the engine crate's gtests; these assert the connector passes the right
data and surfaces violations.
"""

import pytest
import rois_rule_engine_rs as rre

DAY = 86_400
H = 3600
LOCAL_NIGHT = (22 * 60 + 30, 9 * 60 + 30, 9 * H)  # 2014
WOCL = (2 * 60, 5 * 60 + 59)                       # 02:00-05:59


def _wocl_duty(day):
    # 01:00-07:00 UTC fully covers the 02:00-05:59 WOCL band.
    return (day * DAY + 1 * H, day * DAY + 7 * H)


# ---- 7503 consecutive WOCL ----
def _eng_7503(n_consecutive_fixed, candidate_day, max_consec=3):
    spans = [_wocl_duty(d) for d in range(n_consecutive_fixed)] + [_wocl_duty(candidate_day)]
    starts = [s for s, _ in spans]
    ends = [e for _, e in spans]
    return rre.Engine(
        pairing_start_utc=starts, pairing_end_utc=ends, pairing_blk_min=[60] * len(spans),
        crew_fixed_pairings=[list(range(n_consecutive_fixed))],
        pairing_is_fly=[True] * len(spans),
        crew_offset_min=[0], local_night=LOCAL_NIGHT, wocl_window=WOCL,
        max_consecutive_wocl=max_consec,
    )


def test_7503_run_exceeds_max_fires():
    # 3 fixed consecutive WOCL + candidate on day 3 → run of 4 > max 3.
    eng = _eng_7503(3, 3)
    out = [o for o in eng.check_line(0, [3]) if o.startswith("7503")]
    assert len(out) >= 1
    assert "max=3" in out[0]


def test_7503_within_max_passes():
    # 2 fixed + candidate day2 → run of 3 == max 3 (not exceeded).
    eng = _eng_7503(2, 2)
    assert [o for o in eng.check_line(0, [2]) if o.startswith("7503")] == []


# Same-day WOCL duties with 30-min gaps (no local-night reset between them).
TIGHT_WOCL_SPANS = [
    (2 * H, 3 * H),
    (3 * H + 30 * 60, 4 * H + 30 * 60),
    (4 * H + 60 * 60, 5 * H + 60 * 60),
]


def _eng_7503_tight(fixed_count, max_consec=2, application="optimizer"):
    starts = [s for s, _ in TIGHT_WOCL_SPANS]
    ends = [e for _, e in TIGHT_WOCL_SPANS]
    return rre.Engine(
        pairing_start_utc=starts,
        pairing_end_utc=ends,
        pairing_blk_min=[60] * len(TIGHT_WOCL_SPANS),
        crew_fixed_pairings=[list(range(fixed_count))],
        pairing_is_fly=[True] * len(TIGHT_WOCL_SPANS),
        crew_offset_min=[0],
        local_night=LOCAL_NIGHT,
        wocl_window=WOCL,
        max_consecutive_wocl=max_consec,
        application=application,
    )


def test_7503_optimizer_tolerates_all_pa_fixed_run():
    # 3 fixed WOCL duties in one consecutive run > max=2, all PA → tolerated.
    eng = _eng_7503_tight(fixed_count=3, max_consec=2)
    assert [o for o in eng.check_line(0, []) if o.startswith("7503")] == []


def test_7503_optimizer_fires_when_cr_joins_run():
    # 2 fixed PA + 1 CR candidate completes an illegal run of 3.
    eng = _eng_7503_tight(fixed_count=2, max_consec=2)
    out = [o for o in eng.check_line(0, [2]) if o.startswith("7503")]
    assert len(out) >= 1
    assert "max=2" in out[0]


def test_7503_editor_reports_all_pa_run():
    eng = _eng_7503_tight(fixed_count=3, max_consec=2, application="editor")
    out = [o for o in eng.check_line(0, []) if o.startswith("7503")]
    assert len(out) >= 1
    assert "max=2" in out[0]

def _structured_7503(
    *,
    bases=("*",),
    ranks=("*",),
    fleets=("*",),
    teams=("*",),
    wocl=WOCL,
    max_consecutive=3,
):
    return [(
        (list(bases), list(ranks), list(fleets), list(teams)),
        (wocl[0], wocl[1], max_consecutive),
    )]


def test_7503_structured_rows_take_precedence_over_scalar_values():
    eng = _eng_7503(2, 2, max_consec=99)
    eng = rre.Engine(
        pairing_start_utc=[_wocl_duty(d)[0] for d in range(3)],
        pairing_end_utc=[_wocl_duty(d)[1] for d in range(3)],
        pairing_blk_min=[60, 60, 60],
        crew_fixed_pairings=[[0, 1]],
        pairing_is_fly=[True, True, True],
        crew_offset_min=[0],
        local_night=LOCAL_NIGHT,
        wocl_window=WOCL,
        max_consecutive_wocl=99,
        wocl_rules=_structured_7503(max_consecutive=2),
    )

    out = [o for o in eng.check_line(0, [2]) if o.startswith("7503")]
    assert len(out) == 1
    assert "max=2" in out[0]


def test_7503_structured_scope_matches_qualifications_and_team():
    spans = [_wocl_duty(0), _wocl_duty(1), _wocl_duty(2)]
    common = dict(
        pairing_start_utc=[s for s, _ in spans],
        pairing_end_utc=[e for _, e in spans],
        pairing_blk_min=[60, 60, 60],
        crew_fixed_pairings=[[0, 1]],
        pairing_is_fly=[True, True, True],
        crew_offset_min=[0],
        local_night=LOCAL_NIGHT,
        wocl_rules=_structured_7503(
            bases=("YVR",),
            ranks=("CA",),
            fleets=("737",),
            teams=("TEAM-A",),
            max_consecutive=2,
        ),
        crew_base_quals=[[("YVR", 0, 10)]],
        crew_rank_quals=[[("CA", 0, 10)]],
        crew_fleet_quals=[[("737", 0, 10)]],
        crew_teams=[["team-a"]],
    )

    matching = rre.Engine(**common)
    assert [o for o in matching.check_line(0, [2]) if o.startswith("7503")]

    nonmatching_kwargs = {**common, "crew_teams": [["TEAM-B"]]}
    nonmatching = rre.Engine(**nonmatching_kwargs)
    assert [o for o in nonmatching.check_line(0, [2]) if o.startswith("7503")] == []


def test_7503_structured_team_scope_requires_crew_context():
    spans = [_wocl_duty(0), _wocl_duty(1), _wocl_duty(2)]
    eng = rre.Engine(
        pairing_start_utc=[s for s, _ in spans],
        pairing_end_utc=[e for _, e in spans],
        pairing_blk_min=[60, 60, 60],
        crew_fixed_pairings=[[0, 1]],
        pairing_is_fly=[True, True, True],
        crew_offset_min=[0],
        local_night=LOCAL_NIGHT,
        wocl_rules=_structured_7503(teams=("TEAM-A",)),
    )

    with pytest.raises(ValueError, match="7503 row specifies Crew Teams"):
        eng.check_line(0, [2])


# ---- 7504 WOCL spacing ----
def test_7504_close_wocl_duties_fire():
    # two WOCL flight duties only ~18h apart < 55h min spacing.
    spans = [_wocl_duty(0), (0 * DAY + 25 * H, 0 * DAY + 31 * H)]  # day0 07:00→ next 01:00 +18h gap
    eng = rre.Engine(
        pairing_start_utc=[s for s, _ in spans], pairing_end_utc=[e for _, e in spans],
        pairing_blk_min=[60, 60], crew_fixed_pairings=[[0]], pairing_is_fly=[True, True],
        crew_offset_min=[0], local_night=LOCAL_NIGHT, wocl_window=WOCL, wocl_spacing_hours=55,
    )
    out = [o for o in eng.check_line(0, [1]) if o.startswith("7504")]
    assert len(out) >= 1
    assert "limit_min=3300" in out[0]  # 55h


def test_7504_scalar_optimizer_tolerates_all_pa_spacing_breach():
    spans = [_wocl_duty(0), (0 * DAY + 25 * H, 0 * DAY + 31 * H)]
    eng = rre.Engine(
        pairing_start_utc=[s for s, _ in spans],
        pairing_end_utc=[e for _, e in spans],
        pairing_blk_min=[60, 60],
        crew_fixed_pairings=[[0, 1]],
        pairing_is_fly=[True, True],
        crew_offset_min=[0],
        local_night=LOCAL_NIGHT,
        wocl_window=WOCL,
        wocl_spacing_hours=55,
    )
    assert [o for o in eng.check_line(0, []) if o.startswith("7504")] == []


def test_7504_scalar_optimizer_fires_when_cr_in_pair():
    spans = [_wocl_duty(0), (0 * DAY + 25 * H, 0 * DAY + 31 * H)]
    eng = rre.Engine(
        pairing_start_utc=[s for s, _ in spans],
        pairing_end_utc=[e for _, e in spans],
        pairing_blk_min=[60, 60],
        crew_fixed_pairings=[[0]],
        pairing_is_fly=[True, True],
        crew_offset_min=[0],
        local_night=LOCAL_NIGHT,
        wocl_window=WOCL,
        wocl_spacing_hours=55,
    )
    out = [o for o in eng.check_line(0, [1]) if o.startswith("7504")]
    assert len(out) >= 1
    assert "limit_min=3300" in out[0]


def _structured_7504(
    min_period=55,
    unit="RH",
    bases=None,
    ranks=None,
    fleets=None,
    teams=None,
    apply_prelabelled=False,
):
    base_filters = bases if bases is not None else ["*"]
    rank_filters = ranks if ranks is not None else ["*"]
    fleet_filters = fleets if fleets is not None else ["*"]
    team_filters = teams if teams is not None else ["*"]
    return [(
        (
            ["*"],
            ["*"],
            ["FLY"],
            ["FLY"],
            ["WOCL"],
            ["WOCL"],
        ),
        (apply_prelabelled, True),
        (base_filters, rank_filters, fleet_filters, team_filters),
        ("D", min_period, unit),
        (WOCL, 2),
    )]


def test_7504_structured_row_uses_full_parameter_payload():
    spans = [_wocl_duty(0), (25 * H, 31 * H)]
    eng = rre.Engine(
        pairing_start_utc=[s for s, _ in spans],
        pairing_end_utc=[e for _, e in spans],
        pairing_blk_min=[60, 60],
        crew_fixed_pairings=[[0]],
        pairing_is_fly=[True, True],
        pairing_assignment=["FLY", "FLY"],
        pairing_assignment_group=["FLY", "FLY"],
        crew_offset_min=[0],
        local_night=LOCAL_NIGHT,
        wocl_window=WOCL,
        wocl_spacing_rules=_structured_7504(),
    )
    out = [o for o in eng.check_line(0, [1]) if o.startswith("7504")]
    assert len(out) == 1
    assert "limit_min=3300" in out[0]


def test_7504_structured_cd_row_uses_calendar_day_kernel():
    spans = [_wocl_duty(0), (25 * H, 31 * H)]
    eng = rre.Engine(
        pairing_start_utc=[s for s, _ in spans],
        pairing_end_utc=[e for _, e in spans],
        pairing_blk_min=[60, 60],
        crew_fixed_pairings=[[0]],
        pairing_is_fly=[True, True],
        pairing_assignment=["FLY", "FLY"],
        pairing_assignment_group=["FLY", "FLY"],
        crew_offset_min=[0],
        local_night=LOCAL_NIGHT,
        wocl_window=WOCL,
        wocl_spacing_rules=_structured_7504(min_period=2, unit="CD"),
    )
    out = [o for o in eng.check_line(0, [1]) if o.startswith("7504")]
    assert len(out) == 1
    assert "limit_min=2" in out[0]


def test_7504_non_wildcard_team_matches_crew_context():
    spans = [_wocl_duty(0), (25 * H, 31 * H)]
    eng = rre.Engine(
        pairing_start_utc=[s for s, _ in spans],
        pairing_end_utc=[e for _, e in spans],
        pairing_blk_min=[60, 60],
        crew_fixed_pairings=[[0]],
        pairing_is_fly=[True, True],
        pairing_assignment=["FLY", "FLY"],
        pairing_assignment_group=["FLY", "FLY"],
        crew_offset_min=[0],
        local_night=LOCAL_NIGHT,
        wocl_window=WOCL,
        wocl_spacing_rules=_structured_7504(teams=["TEAM1"]),
        crew_teams=[["team1"]],
    )

    out = [o for o in eng.check_line(0, [1]) if o.startswith("7504")]
    assert len(out) == 1
    assert "limit_min=3300" in out[0]


def test_7504_non_wildcard_team_skips_nonmatching_crew():
    spans = [_wocl_duty(0), (25 * H, 31 * H)]
    eng = rre.Engine(
        pairing_start_utc=[s for s, _ in spans],
        pairing_end_utc=[e for _, e in spans],
        pairing_blk_min=[60, 60],
        crew_fixed_pairings=[[0]],
        pairing_is_fly=[True, True],
        pairing_assignment=["FLY", "FLY"],
        pairing_assignment_group=["FLY", "FLY"],
        crew_offset_min=[0],
        local_night=LOCAL_NIGHT,
        wocl_window=WOCL,
        wocl_spacing_rules=_structured_7504(teams=["TEAM1"]),
        crew_teams=[["TEAM2"]],
    )

    assert [o for o in eng.check_line(0, [1]) if o.startswith("7504")] == []


def test_7504_empty_team_filter_applies_to_all_crews():
    spans = [_wocl_duty(0), (25 * H, 31 * H)]
    eng = rre.Engine(
        pairing_start_utc=[s for s, _ in spans],
        pairing_end_utc=[e for _, e in spans],
        pairing_blk_min=[60, 60],
        crew_fixed_pairings=[[0]],
        pairing_is_fly=[True, True],
        pairing_assignment=["FLY", "FLY"],
        pairing_assignment_group=["FLY", "FLY"],
        crew_offset_min=[0],
        local_night=LOCAL_NIGHT,
        wocl_window=WOCL,
        wocl_spacing_rules=_structured_7504(teams=[]),
    )

    out = [o for o in eng.check_line(0, [1]) if o.startswith("7504")]
    assert len(out) == 1
    assert "limit_min=3300" in out[0]


def test_7504_non_wildcard_base_rank_fleet_scope_uses_crew_qual_context():
    spans = [_wocl_duty(2), (2 * DAY + 25 * H, 2 * DAY + 31 * H)]
    common = dict(
        pairing_start_utc=[s for s, _ in spans],
        pairing_end_utc=[e for _, e in spans],
        pairing_blk_min=[60, 60],
        crew_fixed_pairings=[[0]],
        pairing_is_fly=[True, True],
        pairing_assignment=["FLY", "FLY"],
        pairing_assignment_group=["FLY", "FLY"],
        crew_offset_min=[0],
        local_night=LOCAL_NIGHT,
        wocl_window=WOCL,
        wocl_spacing_rules=_structured_7504(bases=["YVR"], ranks=["CA"], fleets=["737"]),
        crew_rank_quals=[[("CA", 0, 10)]],
        crew_fleet_quals=[[("737", 0, 10)]],
    )
    eng = rre.Engine(
        **common,
        crew_base_quals=[[("YVR", 0, 10)]],
    )
    out = [o for o in eng.check_line(0, [1]) if o.startswith("7504")]
    assert len(out) == 1
    assert "limit_min=3300" in out[0]

    expired = rre.Engine(
        **common,
        crew_base_quals=[[("YVR", 0, 1)]],
    )
    assert [o for o in expired.check_line(0, [1]) if o.startswith("7504")] == []


def test_7504_non_wildcard_team_fails_without_crew_team_context():
    try:
        eng = rre.Engine(
            pairing_start_utc=[s for s, _ in [_wocl_duty(0), (25 * H, 31 * H)]],
            pairing_end_utc=[e for _, e in [_wocl_duty(0), (25 * H, 31 * H)]],
            pairing_blk_min=[60, 60],
            crew_fixed_pairings=[[0]],
            pairing_is_fly=[True, True],
            pairing_assignment=["FLY", "FLY"],
            pairing_assignment_group=["FLY", "FLY"],
            crew_offset_min=[0],
            local_night=LOCAL_NIGHT,
            wocl_window=WOCL,
            wocl_spacing_rules=_structured_7504(teams=["YYZ"]),
        )
        eng.check_line(0, [1])
    except ValueError as exc:
        assert "7504 row specifies Crew Teams but crew-team context is unavailable" in str(exc)
    else:
        raise AssertionError("expected non-wildcard team context to be rejected")


def test_7504_prelabelled_attribute_switch_controls_attribute_source():
    spans = [_wocl_duty(0), (25 * H, 31 * H)]
    eng = rre.Engine(
        pairing_start_utc=[s for s, _ in spans],
        pairing_end_utc=[e for _, e in spans],
        pairing_blk_min=[60, 60],
        crew_fixed_pairings=[[0]],
        pairing_is_fly=[True, True],
        pairing_assignment=["FLY", "FLY"],
        pairing_assignment_group=["FLY", "FLY"],
        pairing_attributes=["", ""],
        crew_offset_min=[0],
        local_night=LOCAL_NIGHT,
        wocl_window=WOCL,
        wocl_spacing_rules=_structured_7504(apply_prelabelled=True),
    )
    assert [o for o in eng.check_line(0, [1]) if o.startswith("7504")] == []

    eng = rre.Engine(
        pairing_start_utc=[s for s, _ in spans],
        pairing_end_utc=[e for _, e in spans],
        pairing_blk_min=[60, 60],
        crew_fixed_pairings=[[0]],
        pairing_is_fly=[True, True],
        pairing_assignment=["FLY", "FLY"],
        pairing_assignment_group=["FLY", "FLY"],
        pairing_attributes=["WOCL", "WOCL"],
        crew_offset_min=[0],
        local_night=LOCAL_NIGHT,
        wocl_window=WOCL,
        wocl_spacing_rules=_structured_7504(apply_prelabelled=True),
    )
    assert [o for o in eng.check_line(0, [1]) if o.startswith("7504")]


# ---- 7501 SDFD ----
def test_7501_no_free_day_fires():
    # crew works EVERY day of a 7-day window (no local-night rest) → SDFD 0 < min 1.
    spans = [(d * DAY, d * DAY + DAY) for d in range(7)]  # full-day duties, back to back
    eng = rre.Engine(
        pairing_start_utc=[s for s, _ in spans], pairing_end_utc=[e for _, e in spans],
        pairing_blk_min=[60] * 7, crew_fixed_pairings=[[0, 1, 2, 3, 4, 5]],
        pairing_is_fly=[True] * 7,
        crew_offset_min=[0], local_night=LOCAL_NIGHT, sdfd_rows=[(168, 1)],
        checked_window=(0, 7 * DAY),
    )
    out = [o for o in eng.check_line(0, [6]) if o.startswith("7501")]
    assert len(out) >= 1
    assert "min_limits=1" in out[0]


def test_seven_rules_count():
    eng = rre.Engine(
        pairing_start_utc=[0], pairing_end_utc=[H], pairing_blk_min=[60],
        crew_fixed_pairings=[[]], block_bands=[(28, 600.0)],
        pairing_is_fly=[True], pairing_label=["P0"], spacing_hours=10.0,
        rp_start_ord=0, rp_end_ord=9, min_days_off=7,
        crew_offset_min=[0], local_night=LOCAL_NIGHT, sdfd_rows=[(168, 1)],
        checked_window=(0, 7 * DAY), wocl_window=WOCL, max_consecutive_wocl=3,
        wocl_spacing_hours=55,
    )
    # overlap + 8002, 8056, 7505, 7501, 7503, 7504 = 7
    assert eng.n_rules == 7
