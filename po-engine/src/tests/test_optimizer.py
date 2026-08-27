"""Integration tests for the PairingOptimizer with mocked services."""

from datetime import datetime, timezone, timedelta

import pytest

from src.models.flight import Flight
from src.models.rule_config import RuleConfig, RuleGroup, ResolvedRule
from src.models.optimize import OptimizeRequest, OptimizeWeights
from src.optimizer.pairing_optimizer import PairingOptimizer
from src.optimizer.result_extractor import ResultExtractor
from src.optimizer.solver import create_variables
from src.constraints.builder import ConstraintBuilder
from ortools.sat.python import cp_model


def _make_flights() -> list[Flight]:
    """Create a set of test flights forming valid round trips."""
    t0 = datetime(2026, 4, 1, 6, 0, tzinfo=timezone.utc)
    return [
        Flight(
            id=1, airline="F8", flt_dt="2026-04-01", flt_num="F8001",
            dep_arp="PEK", arv_arp="SHA",
            sch_dep_dt_utc=t0,
            sch_arv_dt_utc=t0 + timedelta(hours=2),
            blk_min=120, fleet="320", flt_type="J",
        ),
        Flight(
            id=2, airline="F8", flt_dt="2026-04-01", flt_num="F8002",
            dep_arp="SHA", arv_arp="PEK",
            sch_dep_dt_utc=t0 + timedelta(hours=4),
            sch_arv_dt_utc=t0 + timedelta(hours=6),
            blk_min=120, fleet="320", flt_type="J",
        ),
    ]


def _make_rule_config() -> RuleConfig:
    return RuleConfig(
        group=RuleGroup(
            id=1, group_code="TEST", name="Test",
            usage="PO", filiale="F8", division="P", is_default=True,
        ),
        rules=[
            ResolvedRule(
                template_code="MAX_FDP", instance_code="FDP1", name="FDP",
                category="FDP", check_type="CHECK", severity="ERROR",
                overridable=False,
                params={"maxFdpMinutes": 780},
                constraint_type="LINEAR", sort_order=1,
            ),
            ResolvedRule(
                template_code="MIN_REST", instance_code="REST1", name="Rest",
                category="REST", check_type="CHECK", severity="ERROR",
                overridable=False,
                params={"minRestMinutes": 600},
                constraint_type="LINEAR", sort_order=2,
            ),
            ResolvedRule(
                template_code="MAX_DUTY", instance_code="DUTY1", name="Duty",
                category="DUTY", check_type="CHECK", severity="ERROR",
                overridable=False,
                params={"maxDutyMinutes": 840, "maxConsecutiveDutyDays": 7},
                constraint_type="LINEAR", sort_order=3,
            ),
            ResolvedRule(
                template_code="MAX_FLIGHT_TIME", instance_code="FLT1", name="FltTime",
                category="FLIGHT_TIME", check_type="CHECK", severity="ERROR",
                overridable=False,
                params={"maxFlightTimePerDutyMinutes": 600},
                constraint_type="LINEAR", sort_order=4,
            ),
        ],
    )


class TestResultExtractor:
    """Test result extraction from a solved model."""

    def test_extract_single_pairing(self):
        flights = _make_flights()
        rule_config = _make_rule_config()

        model = cp_model.CpModel()
        variables = create_variables(
            model, flights, max_pairings=2, max_duties=2, max_flights_per_duty=3
        )

        builder = ConstraintBuilder(rule_config, ["PEK"])
        builder.add_all(model, variables, flights)

        model.Minimize(
            sum(variables.pairing_used[p] for p in range(variables.max_pairings))
        )

        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 30
        status = solver.Solve(model)

        assert status in (cp_model.OPTIMAL, cp_model.FEASIBLE)

        extractor = ResultExtractor()
        pairings = extractor.extract(solver, variables, flights, ["PEK"])

        assert len(pairings) == 1
        p = pairings[0]
        assert p.base == "PEK"
        assert p.fleet == "320"
        assert p.duty_count >= 1
        assert p.seg_count == 2
        assert p.duration_days >= 1
        assert p.tafb > 0

        # Check duties have segments
        total_segs = sum(len(d.segments) for d in p.duties)
        assert total_segs == 2

    def test_extract_preserves_flight_ids(self):
        flights = _make_flights()
        rule_config = _make_rule_config()

        model = cp_model.CpModel()
        variables = create_variables(
            model, flights, max_pairings=2, max_duties=2, max_flights_per_duty=3
        )

        builder = ConstraintBuilder(rule_config, ["PEK"])
        builder.add_all(model, variables, flights)

        model.Minimize(
            sum(variables.pairing_used[p] for p in range(variables.max_pairings))
        )

        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 30
        solver.Solve(model)

        extractor = ResultExtractor()
        pairings = extractor.extract(solver, variables, flights, ["PEK"])

        flight_ids = set()
        for p in pairings:
            for d in p.duties:
                for s in d.segments:
                    flight_ids.add(s.flt_id)

        # All flights should be covered
        assert flight_ids == {1, 2}


class TestTimeUtils:
    """Test time utility functions."""

    def test_datetime_to_minutes_roundtrip(self):
        from src.utils.time_utils import datetime_to_minutes, minutes_to_datetime

        dt = datetime(2026, 4, 1, 12, 30, tzinfo=timezone.utc)
        minutes = datetime_to_minutes(dt)
        roundtrip = minutes_to_datetime(minutes)
        assert roundtrip == dt

    def test_flight_block_minutes(self):
        from src.utils.time_utils import flight_block_minutes

        dep = datetime(2026, 4, 1, 6, 0, tzinfo=timezone.utc)
        arv = datetime(2026, 4, 1, 8, 30, tzinfo=timezone.utc)
        assert flight_block_minutes(dep, arv) == 150

    def test_ground_time(self):
        from src.utils.time_utils import compute_ground_time_minutes

        arv = datetime(2026, 4, 1, 8, 0, tzinfo=timezone.utc)
        dep = datetime(2026, 4, 1, 10, 0, tzinfo=timezone.utc)
        assert compute_ground_time_minutes(arv, dep) == 120
