from src.algorithm.eligibility import build_eligibility
from src.models.crew import Crew, LockedAssignment
from src.models.pairing import Pairing, PairingComposition
from src.constraints.compiler import CompiledFTL


def _ftl(**overrides) -> CompiledFTL:
    defaults = dict(
        fdp_limit_func=lambda s: 720,
        min_rest_minutes=600,
        max_duty_flt_min=480,
        max_month_flt_min=6000,
        max_quarter_flt_min=16200,
        max_year_flt_min=60000,
        max_consecutive_duty_days=7,
        max_tafb_minutes=72 * 60,
        preferred_base_weight=50.0,
        fairness_target_hours=80.0,
    )
    defaults.update(overrides)
    return CompiledFTL(**defaults)


def _crew(**overrides) -> Crew:
    defaults = dict(
        crew_id="C001", first_name="A", last_name="B", division="P",
        rank="CA", base="PEK", fleet="B738", fleet_codes=["B738"],
        airport_quals=[], month_flt_min_used=0, quarter_flt_min_used=0,
        year_flt_min_used=0, last_duty_end_min=0, last_rest_end_min=0,
        consecutive_duty_days=0, locked=[],
    )
    defaults.update(overrides)
    return Crew(**defaults)


def _pairing(**overrides) -> Pairing:
    defaults = dict(
        pairing_id=1, pairing_label="P001", division="P", base="PEK",
        fleet="B738", start_min=10000, end_min=10300, tafb_min=300,
        total_flt_min=200, duty_count=1, seg_count=2,
        compositions=[PairingComposition(rank="CA", required_count=1)],
    )
    defaults.update(overrides)
    return Pairing(**defaults)


def test_eligible_crew_pairing_included():
    crews = [_crew()]
    pairings = [_pairing()]
    result = build_eligibility(crews, pairings, _ftl())
    assert 0 in result[0]


def test_wrong_division_excluded():
    crews = [_crew(division="P")]
    pairings = [_pairing(division="C")]
    result = build_eligibility(crews, pairings, _ftl())
    assert result[0] == []


def test_wrong_rank_excluded():
    crews = [_crew(rank="FO")]
    pairings = [_pairing(compositions=[PairingComposition(rank="CA", required_count=1)])]
    result = build_eligibility(crews, pairings, _ftl())
    assert result[0] == []


def test_fleet_mismatch_excluded():
    crews = [_crew(fleet_codes=["A320"])]
    pairings = [_pairing(fleet="B738")]
    result = build_eligibility(crews, pairings, _ftl())
    assert result[0] == []


def test_tafb_over_limit_excluded():
    ftl = _ftl(max_tafb_minutes=60)
    crews = [_crew()]
    pairings = [_pairing(tafb_min=120)]
    result = build_eligibility(crews, pairings, ftl)
    assert result[0] == []


def test_month_flt_exhausted_excluded():
    ftl = _ftl(max_month_flt_min=6000)
    crews = [_crew(month_flt_min_used=5900)]
    pairings = [_pairing(total_flt_min=200)]  # 5900 + 200 > 6000
    result = build_eligibility(crews, pairings, ftl)
    assert result[0] == []


def test_locked_overlap_excluded():
    lock = LockedAssignment(
        crew_id="C001", entry_type="LEAVE", ref_id="L1",
        start_min=10100, end_min=10200, flt_min=0,
    )
    crews = [_crew(locked=[lock])]
    pairings = [_pairing(start_min=10050, end_min=10300)]  # overlaps lock
    result = build_eligibility(crews, pairings, _ftl())
    assert result[0] == []
