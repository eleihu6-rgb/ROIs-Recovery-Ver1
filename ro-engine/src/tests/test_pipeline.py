# src/tests/test_pipeline.py
"""Integration tests for AllocationPipeline."""
import json

from src.optimizer.pipeline import (
    AllocationPipeline,
    _determine_status,
    _make_output,
    _parse_crews,
    _parse_pairings,
    _parse_rule_config,
)
from src.algorithm.primal_recovery import Assignment
from src.models.crew import Crew
from src.models.pairing import Pairing, PairingComposition


# ---------------------------------------------------------------------------
# Minimal valid sections fixture
# ---------------------------------------------------------------------------

def _sections(n_crews: int = 2, n_pairings: int = 2) -> dict[str, list[dict]]:
    """Build minimal input sections for pipeline testing."""
    rules = [{
        "template_code": "FDP_LIMIT",
        "instance_code": "FDP_LIMIT_01",
        "name": "FDP limit",
        "category": "FDP",
        "check_type": "CHECK",
        "severity": "ERROR",
        "overridable": "false",
        "constraint_type": "HARD",
        "params_json": json.dumps({"maxFdpMinutes": 720}),
    }, {
        "template_code": "MIN_REST",
        "instance_code": "MIN_REST_01",
        "name": "Minimum rest",
        "category": "REST",
        "check_type": "CHECK",
        "severity": "ERROR",
        "overridable": "false",
        "constraint_type": "HARD",
        "params_json": json.dumps({"minRestMinutes": 600}),
    }]

    crews = [
        {
            "crew_id": f"C{i:03d}",
            "first_name": "Test",
            "last_name": f"Crew{i}",
            "division": "P",
            "rank": "CA",
            "base": "PEK",
            "fleet": "B738",
            "team": "",
            "status": "1",
            "filiale": "",
        }
        for i in range(1, n_crews + 1)
    ]
    crew_quals = [
        {"crew_id": f"C{i:03d}", "qual_type": "FLEET", "qual_code": "B738"}
        for i in range(1, n_crews + 1)
    ]
    ftl_states = [
        {
            "crew_id": f"C{i:03d}",
            "month_flt_min_used": "0",
            "quarter_flt_min_used": "0",
            "year_flt_min_used": "0",
            "last_duty_end_min": "0",
            "last_rest_end_min": "0",
            "consecutive_duty_days": "0",
        }
        for i in range(1, n_crews + 1)
    ]

    # Non-overlapping pairings: each 300 minutes apart
    pairings = [
        {
            "pairing_id": str(i),
            "pairing_label": f"P{i:05d}",
            "division": "P",
            "base": "PEK",
            "fleet": "B738",
            "start_min": str(i * 2000),
            "end_min": str(i * 2000 + 300),
            "tafb_min": "300",
            "total_flt_min": "180",
            "duty_count": "1",
            "seg_count": "2",
        }
        for i in range(1, n_pairings + 1)
    ]
    pairing_duties = [
        {
            "pairing_id": str(i),
            "duty_seq": "1",
            "duty_start_min": str(i * 2000),
            "duty_end_min": str(i * 2000 + 300),
            "fdp_min": "300",
            "flt_min": "180",
            "rest_after_min": "0",
        }
        for i in range(1, n_pairings + 1)
    ]
    pairing_compositions = [
        {"pairing_id": str(i), "rank": "CA", "required_count": "1"}
        for i in range(1, n_pairings + 1)
    ]

    return {
        "JOB_PARAMS": [{"time_limit_sec": "10", "max_iterations": "5"}],
        "RULE_CONFIG_META": [{"group_code": "CAAC_FTL", "group_name": "CAAC FTL", "usage": "RO"}],
        "RULES": rules,
        "CREWS": crews,
        "CREW_QUALIFICATIONS": crew_quals,
        "CREW_FTL_STATE": ftl_states,
        "LOCKED_ASSIGNMENTS": [],
        "PAIRINGS": pairings,
        "PAIRING_DUTIES": pairing_duties,
        "PAIRING_COMPOSITIONS": pairing_compositions,
    }


# ---------------------------------------------------------------------------
# Unit tests for section parsers
# ---------------------------------------------------------------------------

def test_parse_rule_config_defaults():
    rc = _parse_rule_config({})
    assert rc.group.group_code == "CAAC_FTL"
    assert rc.get_min_rest_minutes() == 600   # fallback default
    assert rc.get_fdp_limit_minutes(2) == 780  # fallback default


def test_parse_rule_config_from_sections():
    secs = _sections()
    rc = _parse_rule_config(secs)
    assert rc.get_fdp_limit_minutes(2) == 720
    assert rc.get_min_rest_minutes() == 600


def test_parse_crews_basic():
    secs = _sections(n_crews=3)
    crews = _parse_crews(secs)
    assert len(crews) == 3
    assert all(c.rank == "CA" for c in crews)
    assert all("B738" in c.fleet_codes for c in crews)


def test_parse_crews_defaults_fleet_code_from_fleet_field():
    """If no CREW_QUALIFICATIONS, fleet_codes falls back to crew.fleet."""
    secs = _sections(n_crews=1)
    secs["CREW_QUALIFICATIONS"] = []
    crews = _parse_crews(secs)
    assert "B738" in crews[0].fleet_codes


def test_parse_crews_ftl_state():
    secs = _sections(n_crews=1)
    secs["CREW_FTL_STATE"][0]["month_flt_min_used"] = "1500"
    crews = _parse_crews(secs)
    assert crews[0].month_flt_min_used == 1500


def test_parse_crews_locked_assignments():
    secs = _sections(n_crews=1)
    secs["LOCKED_ASSIGNMENTS"] = [{
        "crew_id": "C001",
        "entry_type": "LEAVE",
        "ref_id": "L001",
        "start_min": "1000",
        "end_min": "2000",
        "flt_min": "0",
    }]
    crews = _parse_crews(secs)
    assert len(crews[0].locked) == 1
    assert crews[0].locked[0].entry_type == "LEAVE"


def test_parse_pairings_basic():
    secs = _sections(n_pairings=3)
    pairings = _parse_pairings(secs)
    assert len(pairings) == 3
    assert all(p.fleet == "B738" for p in pairings)
    assert all(len(p.duties) == 1 for p in pairings)
    assert all(len(p.compositions) == 1 for p in pairings)


def test_parse_pairings_composition():
    secs = _sections(n_pairings=1)
    pairings = _parse_pairings(secs)
    comp = pairings[0].compositions[0]
    assert comp.rank == "CA"
    assert comp.required_count == 1


# ---------------------------------------------------------------------------
# Unit tests for output helpers
# ---------------------------------------------------------------------------

def _pairing(pid: int) -> Pairing:
    return Pairing(
        pairing_id=pid, pairing_label=f"P{pid}", division="P",
        base="PEK", fleet="B738", start_min=pid * 2000, end_min=pid * 2000 + 300,
        tafb_min=300, total_flt_min=180, duty_count=1, seg_count=1,
        compositions=[PairingComposition(rank="CA", required_count=1)],
    )


def _crew(cid: str) -> Crew:
    return Crew(
        crew_id=cid, first_name="A", last_name="B", division="P",
        rank="CA", base="PEK", fleet="B738", fleet_codes=["B738"],
        airport_quals=[], month_flt_min_used=0, quarter_flt_min_used=0,
        year_flt_min_used=0, last_duty_end_min=0, last_rest_end_min=0,
        consecutive_duty_days=0, locked=[],
    )


def test_determine_status_done():
    pairings = [_pairing(1)]
    assignments = [Assignment(crew_id="C1", pairing_id=1, acting_rank="CA", base_match=True)]
    assert _determine_status(assignments, pairings, 5.0, 300.0) == "DONE"


def test_determine_status_timeout():
    pairings = [_pairing(1), _pairing(2)]
    # Only pairing 1 covered — but time nearly exhausted
    assignments = [Assignment(crew_id="C1", pairing_id=1, acting_rank="CA", base_match=True)]
    assert _determine_status(assignments, pairings, 285.0, 300.0) == "TIMEOUT"


def test_determine_status_infeasible():
    pairings = [_pairing(1), _pairing(2)]
    assignments = [Assignment(crew_id="C1", pairing_id=1, acting_rank="CA", base_match=True)]
    # Only 50% coverage, not near time limit
    assert _determine_status(assignments, pairings, 10.0, 300.0) == "INFEASIBLE"


def test_make_output_structure():
    pairings = [_pairing(1), _pairing(2)]
    crews = [_crew("C1")]
    assignments = [
        Assignment(crew_id="C1", pairing_id=1, acting_rank="CA", base_match=True),
        Assignment(crew_id="C1", pairing_id=2, acting_rank="CA", base_match=False),
    ]
    out = _make_output(assignments, crews, pairings, 5.0, "DONE", "", None)
    assert out["RESULT_META"][0]["status"] == "DONE"
    assert out["KPI"][0]["fully_covered"] == "2"
    assert out["KPI"][0]["coverage_pct"] == "100.0"
    assert len(out["ASSIGNMENTS"]) == 2
    assert out["ASSIGNMENTS"][0]["base_match"] in ("0", "1")
    # lag_result=None → dual fields default to zero strings
    assert out["RESULT_META"][0]["total_iterations"] == "0"
    assert out["RESULT_META"][0]["dual_bound"] == "0.0000"
    assert out["RESULT_META"][0]["primal_obj"] == "0.0000"


# ---------------------------------------------------------------------------
# Pipeline integration test
# ---------------------------------------------------------------------------

def test_pipeline_run_returns_valid_structure():
    """Pipeline returns RESULT_META, KPI, ASSIGNMENTS sections with correct shapes."""
    secs = _sections(n_crews=3, n_pairings=3)
    result = AllocationPipeline().run(secs)

    assert "RESULT_META" in result
    assert "KPI" in result
    assert "ASSIGNMENTS" in result

    meta = result["RESULT_META"][0]
    assert meta["status"] in ("DONE", "INFEASIBLE", "TIMEOUT", "FAILED")
    assert "solve_time_sec" in meta
    assert "total_iterations" in meta
    assert "dual_bound" in meta
    assert "primal_obj" in meta

    kpi = result["KPI"][0]
    assert int(kpi["total_pairings"]) == 3
    assert int(kpi["total_crews"]) == 3
    assert float(kpi["coverage_pct"]) >= 0.0


def test_pipeline_empty_pairings_returns_infeasible():
    secs = _sections()
    secs["PAIRINGS"] = []
    secs["PAIRING_DUTIES"] = []
    secs["PAIRING_COMPOSITIONS"] = []
    result = AllocationPipeline().run(secs)
    assert result["RESULT_META"][0]["status"] == "INFEASIBLE"


def test_pipeline_empty_crews_returns_infeasible():
    secs = _sections()
    secs["CREWS"] = []
    secs["CREW_QUALIFICATIONS"] = []
    secs["CREW_FTL_STATE"] = []
    result = AllocationPipeline().run(secs)
    assert result["RESULT_META"][0]["status"] == "INFEASIBLE"


def test_pipeline_assignments_reference_valid_crews_and_pairings():
    """Every assignment crew_id and pairing_id must exist in the input."""
    secs = _sections(n_crews=4, n_pairings=4)
    result = AllocationPipeline().run(secs)

    crew_ids = {row["crew_id"] for row in secs["CREWS"]}
    pairing_ids = {row["pairing_id"] for row in secs["PAIRINGS"]}

    for row in result["ASSIGNMENTS"]:
        assert row["crew_id"] in crew_ids, f"Unknown crew_id: {row['crew_id']}"
        assert row["pairing_id"] in pairing_ids, f"Unknown pairing_id: {row['pairing_id']}"
