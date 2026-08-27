"""Unit tests for constraint building and small-scale solving."""

from datetime import datetime, timezone, timedelta

from ortools.sat.python import cp_model

from src.models.flight import Flight
from src.models.rule_config import RuleConfig, RuleGroup, ResolvedRule
from src.optimizer.solver import create_variables, SolverVariables
from src.constraints.connectivity_constraint import ConnectivityConstraint
from src.constraints.builder import ConstraintBuilder


def _make_flight(
    fid: int,
    dep: str,
    arv: str,
    dep_time: datetime,
    blk_min: int = 120,
    flt_num: str = "F8001",
) -> Flight:
    """Helper to create a test flight."""
    arv_time = dep_time + timedelta(minutes=blk_min)
    return Flight(
        id=fid,
        airline="F8",
        flt_dt=dep_time.strftime("%Y-%m-%d"),
        flt_num=flt_num,
        dep_arp=dep,
        arv_arp=arv,
        sch_dep_dt_utc=dep_time,
        sch_arv_dt_utc=arv_time,
        blk_min=blk_min,
        fleet="320",
        flt_type="J",
    )


def _make_rule_config() -> RuleConfig:
    """Create a minimal rule config for testing."""
    return RuleConfig(
        group=RuleGroup(
            id=1,
            group_code="TEST",
            name="Test Rules",
            usage="PO",
            filiale="F8",
            division="P",
            is_default=True,
        ),
        rules=[
            ResolvedRule(
                template_code="MAX_FDP",
                instance_code="MAX_FDP_CAAC",
                name="Max FDP",
                category="FDP",
                check_type="CHECK",
                severity="ERROR",
                overridable=False,
                params={
                    "fdpTable": {"1": 780, "2": 750, "3": 720, "4": 690},
                    "maxFdpMinutes": 780,
                },
                constraint_type="TABLE",
                sort_order=1,
            ),
            ResolvedRule(
                template_code="MIN_REST",
                instance_code="MIN_REST_CAAC",
                name="Min Rest",
                category="REST",
                check_type="CHECK",
                severity="ERROR",
                overridable=False,
                params={"minRestMinutes": 600},
                constraint_type="LINEAR",
                sort_order=2,
            ),
            ResolvedRule(
                template_code="MAX_DUTY",
                instance_code="MAX_DUTY_CAAC",
                name="Max Duty",
                category="DUTY",
                check_type="CHECK",
                severity="ERROR",
                overridable=False,
                params={"maxDutyMinutes": 840, "maxConsecutiveDutyDays": 7},
                constraint_type="LINEAR",
                sort_order=3,
            ),
            ResolvedRule(
                template_code="MAX_FLIGHT_TIME",
                instance_code="MAX_FLT_CAAC",
                name="Max Flight Time",
                category="FLIGHT_TIME",
                check_type="CHECK",
                severity="ERROR",
                overridable=False,
                params={"maxFlightTimePerDutyMinutes": 600},
                constraint_type="LINEAR",
                sort_order=4,
            ),
            ResolvedRule(
                template_code="MIN_CONNECTION_TIME",
                instance_code="MCT_DEFAULT",
                name="Min Connection Time",
                category="CONNECTIVITY",
                check_type="CHECK",
                severity="ERROR",
                overridable=False,
                params={"mctMinutes": 45},
                constraint_type="LINEAR",
                sort_order=5,
            ),
        ],
    )


class TestRuleConfig:
    """Tests for RuleConfig parameter extraction."""

    def test_fdp_limit(self):
        rc = _make_rule_config()
        assert rc.get_fdp_limit_minutes(1) == 780
        assert rc.get_fdp_limit_minutes(2) == 750
        assert rc.get_fdp_limit_minutes(3) == 720

    def test_min_rest(self):
        rc = _make_rule_config()
        assert rc.get_min_rest_minutes() == 600

    def test_max_duty(self):
        rc = _make_rule_config()
        assert rc.get_max_duty_minutes() == 840

    def test_max_consecutive_days(self):
        rc = _make_rule_config()
        assert rc.get_max_consecutive_duty_days() == 7

    def test_max_flight_time(self):
        rc = _make_rule_config()
        assert rc.get_max_flight_time_per_duty_minutes() == 600


class TestConnectivityConstraint:
    """Tests for connectivity constraint logic."""

    def test_non_connecting_flights_blocked(self):
        """Two flights that don't connect geographically cannot be consecutive."""
        t0 = datetime(2026, 4, 1, 6, 0, tzinfo=timezone.utc)
        flights = [
            _make_flight(1, "PEK", "SHA", t0, 120),
            _make_flight(2, "CAN", "PEK", t0 + timedelta(hours=4), 150),  # CAN != SHA
        ]

        model = cp_model.CpModel()
        variables = create_variables(model, flights, max_pairings=2, max_duties=2, max_flights_per_duty=3)

        # y[(0,1)] should not exist because airports don't connect
        assert (0, 1) not in variables.y

    def test_connecting_flights_allowed(self):
        """Two flights that connect geographically can be consecutive."""
        t0 = datetime(2026, 4, 1, 6, 0, tzinfo=timezone.utc)
        flights = [
            _make_flight(1, "PEK", "SHA", t0, 120),
            _make_flight(2, "SHA", "CAN", t0 + timedelta(hours=3), 150),  # SHA connects
        ]

        model = cp_model.CpModel()
        variables = create_variables(model, flights, max_pairings=2, max_duties=2, max_flights_per_duty=3)

        # y[(0,1)] should exist
        assert (0, 1) in variables.y


class TestSmallScaleSolve:
    """Integration test: solve a small 2-flight problem."""

    def test_two_flight_round_trip(self):
        """Two flights forming a round trip from base should yield one pairing."""
        t0 = datetime(2026, 4, 1, 6, 0, tzinfo=timezone.utc)
        flights = [
            _make_flight(1, "PEK", "SHA", t0, 120, "F8001"),
            _make_flight(2, "SHA", "PEK", t0 + timedelta(hours=4), 120, "F8002"),
        ]

        model = cp_model.CpModel()
        variables = create_variables(
            model, flights, max_pairings=2, max_duties=2, max_flights_per_duty=3
        )

        rule_config = _make_rule_config()
        builder = ConstraintBuilder(rule_config, ["PEK"])
        builder.add_all(model, variables, flights)

        # Objective: minimize pairings
        pairing_terms = [
            variables.pairing_used[p] for p in range(variables.max_pairings)
        ]
        model.Minimize(sum(pairing_terms))

        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 30
        status = solver.Solve(model)

        assert status in (cp_model.OPTIMAL, cp_model.FEASIBLE)

        # Count used pairings
        used = sum(
            1
            for p in range(variables.max_pairings)
            if solver.Value(variables.pairing_used[p])
        )
        # Should be exactly 1 pairing for a simple round trip
        assert used == 1

        # Both flights should be in the same pairing
        for p in range(variables.max_pairings):
            if solver.Value(variables.pairing_used[p]):
                assert solver.Value(variables.x[(0, p)]) == 1
                assert solver.Value(variables.x[(1, p)]) == 1

    def test_four_flights_two_bases(self):
        """Four flights: two round trips from PEK should yield two pairings."""
        t0 = datetime(2026, 4, 1, 6, 0, tzinfo=timezone.utc)
        flights = [
            _make_flight(1, "PEK", "SHA", t0, 120, "F8001"),
            _make_flight(2, "SHA", "PEK", t0 + timedelta(hours=4), 120, "F8002"),
            _make_flight(3, "PEK", "CAN", t0 + timedelta(hours=8), 180, "F8003"),
            _make_flight(4, "CAN", "PEK", t0 + timedelta(hours=14), 180, "F8004"),
        ]

        model = cp_model.CpModel()
        variables = create_variables(
            model, flights, max_pairings=4, max_duties=2, max_flights_per_duty=3
        )

        rule_config = _make_rule_config()
        builder = ConstraintBuilder(rule_config, ["PEK"])
        builder.add_all(model, variables, flights)

        pairing_terms = [
            variables.pairing_used[p] for p in range(variables.max_pairings)
        ]
        model.Minimize(1000 * sum(pairing_terms))

        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 60
        status = solver.Solve(model)

        assert status in (cp_model.OPTIMAL, cp_model.FEASIBLE)

        used = sum(
            1
            for p in range(variables.max_pairings)
            if solver.Value(variables.pairing_used[p])
        )
        # 2 separate round trips = 2 pairings
        assert used == 2
