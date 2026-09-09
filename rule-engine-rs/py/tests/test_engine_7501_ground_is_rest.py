"""crew_ground_is_rest wiring: rule 7501 must exclude is_rest=true ground duties
(VAC/GDO/ILL) from the SDFD work list, and count is_rest=false ones (SBY/RES) as
duty. Covers both call paths: (a) direct Engine(crew_ground_is_rest=...) kwarg,
(b) merged from set_next_engine_extras() when the kwarg is omitted (mirrors the
production wrapper, which never passes crew_ground_is_rest directly).

Contract (see tests/rule_7501_tests.rs): an SDFD requires a True Rest covering
TWO CONSECUTIVE local nights. Daily 08:00-18:00 duties leave only a ~14h rest
(one local night) between them — never enough for an SDFD on their own. Day 2
here is a ground duty: excluding it (is_rest=True) merges the ~14h gaps on
either side into one ~38h rest spanning two local nights around the empty
day 2 -> 1 SDFD, satisfying 168/1. Counting it as work (is_rest=False) keeps
every gap at ~14h -> 0 SDFD -> violation (mirrors rejects_missing_sdfd_in_168_hours
in tests/rule_7501_tests.rs).
"""

import rois_rule_engine_rs as rre

DAY = 86_400
H = 3600
LOCAL_NIGHT = (22 * 60 + 30, 9 * 60 + 30, 9 * H)

# Fixed FLY duties (PA=true) on days 0,1,3,4,5 + candidate (PA=false) on day 6,
# all 08:00-18:00. Day 2 is the ground duty under test (VAC or SBY, toggled).
_FIXED_DAYS = [0, 1, 3, 4, 5]
_CANDIDATE_DAY = 6
_GROUND_DAY = 2


def _day_span(d):
    return (d * DAY + 8 * H, d * DAY + 18 * H)


def _eng(assignment, **extra_kwargs):
    days = _FIXED_DAYS + [_CANDIDATE_DAY]
    spans = [_day_span(d) for d in days]
    return rre.Engine(
        pairing_start_utc=[s for s, _ in spans],
        pairing_end_utc=[e for _, e in spans],
        pairing_blk_min=[60] * len(spans),
        crew_fixed_pairings=[list(range(len(_FIXED_DAYS)))],
        pairing_is_fly=[True] * len(spans),
        crew_offset_min=[0], local_night=LOCAL_NIGHT, sdfd_rows=[(168, 1)],
        checked_window=(0, 7 * DAY),
        crew_ground_start=[[_GROUND_DAY * DAY + 8 * H]],
        crew_ground_end=[[_GROUND_DAY * DAY + 18 * H]],
        crew_ground_assignment=[[assignment]],
        crew_ground_group=[["GRD"]],
        **extra_kwargs,
    )


_CANDIDATE_IDX = len(_FIXED_DAYS)  # candidate is the last pairing


# ---- (a) direct kwarg ----
def test_7501_ground_is_rest_true_direct_kwarg_opens_free_day():
    eng = _eng("VAC", crew_ground_is_rest=[[True]])
    out = [o for o in eng.check_line(0, [_CANDIDATE_IDX]) if o.startswith("7501")]
    assert out == [], f"VAC (is_rest=True) must free up day {_GROUND_DAY}, got {out}"


def test_7501_ground_is_rest_false_direct_kwarg_counts_as_work():
    eng = _eng("SBY", crew_ground_is_rest=[[False]])
    out = [o for o in eng.check_line(0, [_CANDIDATE_IDX]) if o.startswith("7501")]
    assert len(out) >= 1, "SBY (is_rest=False) must count as work (no free day)"


# ---- (b) merged from set_next_engine_extras(), kwarg omitted ----
def test_7501_ground_is_rest_merged_true_from_extras():
    rre.set_next_engine_extras(crew_ground_is_rest=[[True]])
    eng = _eng("VAC")  # no crew_ground_is_rest kwarg — must come from NEXT_EXTRAS
    out = [o for o in eng.check_line(0, [_CANDIDATE_IDX]) if o.startswith("7501")]
    assert out == [], f"extras merge for is_rest=True failed, got {out}"


def test_7501_ground_is_rest_merged_false_from_extras():
    rre.set_next_engine_extras(crew_ground_is_rest=[[False]])
    eng = _eng("SBY")
    out = [o for o in eng.check_line(0, [_CANDIDATE_IDX]) if o.startswith("7501")]
    assert len(out) >= 1, "extras merge for is_rest=False failed"
