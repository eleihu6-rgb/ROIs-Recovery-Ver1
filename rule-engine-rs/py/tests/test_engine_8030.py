"""Rule 8030 PILOT AGE: per physical flight, at most MAX_NUMBER crew of the
division may be >= AGE_DEFINE years old. Complement = flight COF + candidate.
"""

import rois_rule_engine_rs as rre

DAY = 86_400
# birth ordinals: someone born ~70y before 2026 is over 65; ~40y is under.
BORN_1950 = (1950 - 1970) * 365  # negative ord, ~76y at 2026
BORN_1990 = (1990 - 1970) * 365  # ~36y at 2026
AT_2026 = (2026 - 1970) * 365 + 150  # mid-2026 flight day ordinal


def _eng(crew_div, crew_birth, crew_fixed, max_number=1, age_limit=65, n_pairings=1):
    return rre.Engine(
        pairing_start_utc=[AT_2026 * DAY] * n_pairings,
        pairing_end_utc=[AT_2026 * DAY + 6 * 3600] * n_pairings,
        pairing_blk_min=[60] * n_pairings,
        crew_fixed_pairings=crew_fixed,
        crew_division=crew_div,
        crew_birth_ord=crew_birth,
        age_division="P",
        age_limit=age_limit,
        age_max_number=max_number,
    )


def test_second_over_age_pilot_fires():
    # crew0 (over-65 P) already on pairing 0 (fixed); candidate crew1 (over-65 P) added → 2 > 1.
    eng = _eng(["P", "P"], [BORN_1950, BORN_1950], crew_fixed=[[0], []])
    out = [o for o in eng.check_line(1, [0]) if o.startswith("8030")]
    assert len(out) == 1
    assert "limit=65" in out[0]


def test_under_age_candidate_passes():
    # baseline over-65 P; candidate under 65 → only 1 over-age → OK.
    eng = _eng(["P", "P"], [BORN_1950, BORN_1990], crew_fixed=[[0], []])
    assert [o for o in eng.check_line(1, [0]) if o.startswith("8030")] == []


def test_non_pilot_division_ignored():
    # both over-65 but division "C" (cabin), rule is division P → no violation.
    eng = _eng(["C", "C"], [BORN_1950, BORN_1950], crew_fixed=[[0], []])
    assert [o for o in eng.check_line(1, [0]) if o.startswith("8030")] == []


def test_age_limit_from_param():
    # With age_limit lowered to 30, the under-65 candidate (36y) now counts → 2 over-age.
    eng = _eng(["P", "P"], [BORN_1950, BORN_1990], crew_fixed=[[0], []], age_limit=30)
    out = [o for o in eng.check_line(1, [0]) if o.startswith("8030")]
    assert len(out) == 1
    assert "limit=30" in out[0]
