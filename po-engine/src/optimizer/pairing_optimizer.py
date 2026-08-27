"""Main pairing optimizer — orchestrates the entire optimization flow."""

import logging
import time

from ortools.sat.python import cp_model

from src.config import settings
from src.models.flight import Flight
from src.models.optimize import OptimizeRequest, OptimizeResult, OptimizeKpi, OptimizeWeights
from src.models.pairing import Pairing
from src.models.rule_config import RuleConfig
from src.constraints.builder import ConstraintBuilder
from src.services.flight_service import FlightService
from src.services.rule_service import RuleService
from src.services.result_service import ResultService
from .solver import SolverVariables, create_variables
from .result_extractor import ResultExtractor

logger = logging.getLogger(__name__)


class PairingOptimizer:
    """Coordinates constraint building, solving, and result extraction."""

    def __init__(
        self,
        flight_service: FlightService | None = None,
        rule_service: RuleService | None = None,
        result_service: ResultService | None = None,
    ) -> None:
        self.flight_service = flight_service or FlightService()
        self.rule_service = rule_service or RuleService()
        self.result_service = result_service or ResultService()
        self.result_extractor = ResultExtractor()

    async def optimize(self, request: OptimizeRequest) -> OptimizeResult:
        """Run the full pairing optimization pipeline."""
        start_time = time.monotonic()

        try:
            # 1. Fetch flight data
            logger.info(
                "Fetching flights for %s to %s", request.start_date, request.end_date
            )
            flights = await self.flight_service.get_flights(
                request.start_date, request.end_date, fleet=request.fleet
            )
            if not flights:
                return OptimizeResult(
                    status="error",
                    message="No flights found in the specified date range",
                    kpi=OptimizeKpi(total_flights=0, solver_status="NO_DATA"),
                )

            logger.info("Loaded %d flights", len(flights))

            # 2. Fetch rule configuration (one-time call to rule-engine)
            logger.info("Fetching rule config: %s", request.rule_group_code)
            rule_config = await self.rule_service.get_rule_config(
                request.rule_group_code
            )

            # 3. Run the solver
            result = self._solve(flights, rule_config, request)
            elapsed = time.monotonic() - start_time
            result.kpi.solve_time_seconds = round(elapsed, 2)

            # 4. Save results if we have a workset_id
            if result.status == "success" and request.workset_id:
                try:
                    scenario_id = await self.result_service.create_scenario(
                        workset_id=request.workset_id,
                        start_date=request.start_date,
                        end_date=request.end_date,
                        rule_group_code=request.rule_group_code,
                    )
                    await self.result_service.save_pairings(
                        result.pairings, scenario_id
                    )
                    await self.result_service.update_scenario_status(
                        scenario_id, "DONE"
                    )
                    # Save KPIs
                    kpi_data = {
                        "totalFlights": str(result.kpi.total_flights),
                        "totalPairings": str(result.kpi.total_pairings),
                        "totalDuties": str(result.kpi.total_duties),
                        "totalDeadheads": str(result.kpi.total_deadheads),
                        "avgDutyTimeMin": str(result.kpi.avg_duty_time_min),
                        "avgTafbMin": str(result.kpi.avg_tafb_min),
                        "totalFlightTimeMin": str(result.kpi.total_flight_time_min),
                        "solveTimeSeconds": str(result.kpi.solve_time_seconds),
                    }
                    await self.result_service.save_kpis(scenario_id, kpi_data)
                    result.scenario_id = scenario_id
                    logger.info("Saved results to scenario %d", scenario_id)
                except Exception:
                    logger.exception("Failed to save results to live-server")
                    # Don't fail the entire optimization if saving fails
                    result.message += " (warning: failed to save to live-server)"

            return result

        except Exception as e:
            logger.exception("Optimization failed")
            elapsed = time.monotonic() - start_time
            return OptimizeResult(
                status="error",
                message=str(e),
                kpi=OptimizeKpi(
                    solver_status="ERROR",
                    solve_time_seconds=round(elapsed, 2),
                ),
            )

    def _solve(
        self,
        flights: list[Flight],
        rule_config: RuleConfig,
        request: OptimizeRequest,
    ) -> OptimizeResult:
        """Build and solve the CP-SAT model."""
        n = len(flights)

        # 3. Build CP-SAT model
        model = cp_model.CpModel()

        # 4. Create decision variables
        logger.info("Creating variables for %d flights", n)
        variables = create_variables(model, flights)

        # 5. Add constraints
        logger.info("Adding constraints")
        builder = ConstraintBuilder(rule_config, request.base_airports)
        builder.add_all(model, variables, flights)

        # 6. Set objective function
        self._set_objective(model, variables, flights, request.weights)

        # 7. Solve
        solver = cp_model.CpSolver()
        time_limit = request.time_limit_seconds or settings.default_time_limit
        solver.parameters.max_time_in_seconds = time_limit
        solver.parameters.num_workers = 8
        solver.parameters.log_search_progress = True

        logger.info("Solving with time limit %d seconds", time_limit)
        status = solver.Solve(model)

        status_name = solver.StatusName(status)
        logger.info("Solver status: %s", status_name)

        # 8. Extract results
        if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            pairings = self.result_extractor.extract(
                solver, variables, flights, request.base_airports
            )

            kpi = self._compute_kpi(flights, pairings, status_name)

            return OptimizeResult(
                status="success",
                message=f"Solver found {'optimal' if status == cp_model.OPTIMAL else 'feasible'} solution",
                pairings=pairings,
                kpi=kpi,
            )
        else:
            return OptimizeResult(
                status="infeasible" if status == cp_model.INFEASIBLE else "timeout",
                message=f"Solver status: {status_name}",
                kpi=OptimizeKpi(
                    total_flights=n,
                    solver_status=status_name,
                ),
            )

    @staticmethod
    def _set_objective(
        model: cp_model.CpModel,
        variables: SolverVariables,
        flights: list[Flight],
        weights: OptimizeWeights,
    ) -> None:
        """Set the multi-objective function.

        minimize(
          w1 * total_pairings
          + w2 * total_deadhead
          + w3 * total_duty_time
          + w4 * penalty_terms
        )
        """
        objective_terms: list[cp_model.LinearExpr] = []

        # 1. Minimize total number of pairings
        for p in range(variables.max_pairings):
            if p in variables.pairing_used:
                objective_terms.append(
                    weights.w_pairings * variables.pairing_used[p]
                )

        # 2. Minimize deadhead flights (flights with flt_type == 'D')
        n = len(flights)
        for f in range(n):
            if flights[f].is_deadhead:
                for p in range(variables.max_pairings):
                    fp = (f, p)
                    if fp in variables.x:
                        objective_terms.append(weights.w_deadhead * variables.x[fp])

        # 3. Minimize total duty time
        for p in range(variables.max_pairings):
            for k in range(variables.max_duties):
                dk = (p, k)
                if dk in variables.duty_start and dk in variables.duty_end:
                    # duty_time = duty_end - duty_start (when duty used)
                    # We use duty_end - duty_start directly; when d = 0
                    # the constraint forces both to same value (or 0 duration)
                    dt = model.NewIntVar(0, 24 * 60, f"dt_{p}_{k}")
                    model.Add(
                        dt == variables.duty_end[dk] - variables.duty_start[dk]
                    ).OnlyEnforceIf(variables.d[dk])
                    model.Add(dt == 0).OnlyEnforceIf(variables.d[dk].Not())
                    objective_terms.append(weights.w_duty_time * dt)

        # 4. Soft constraint penalties
        # Penalty for long ground waits (> 3 hours) within a duty
        long_wait_threshold = 180  # 3 hours in minutes
        for (i, j), y_var in variables.y.items():
            from src.utils.time_utils import datetime_to_minutes

            arv_i = datetime_to_minutes(flights[i].sch_arv_dt_utc)
            dep_j = datetime_to_minutes(flights[j].sch_dep_dt_utc)
            wait = dep_j - arv_i
            if wait > long_wait_threshold:
                excess = wait - long_wait_threshold
                objective_terms.append(weights.w_penalty * excess * y_var)

        if objective_terms:
            model.Minimize(sum(objective_terms))

    @staticmethod
    def _compute_kpi(
        flights: list[Flight],
        pairings: list["Pairing"],
        solver_status: str,
    ) -> OptimizeKpi:
        """Compute KPIs from the optimization result."""
        total_duties = sum(p.duty_count for p in pairings)
        total_duty_min = sum(
            d.duty_sch_duty_min for p in pairings for d in p.duties
        )
        total_flt_min = sum(
            d.duty_sch_flt_min for p in pairings for d in p.duties
        )
        total_deadheads = sum(
            1
            for p in pairings
            for d in p.duties
            for s in d.segments
            if s.seg_assignment == "DH"
        )
        covered_flights = set()
        for p in pairings:
            for d in p.duties:
                for s in d.segments:
                    covered_flights.add(s.flt_id)

        n = len(flights)
        coverage = (len(covered_flights) / n * 100) if n > 0 else 0.0

        avg_duty = (total_duty_min / total_duties) if total_duties > 0 else 0.0
        avg_tafb = (
            sum(p.tafb for p in pairings) / len(pairings)
            if pairings
            else 0.0
        )

        return OptimizeKpi(
            total_flights=n,
            total_pairings=len(pairings),
            total_duties=total_duties,
            total_deadheads=total_deadheads,
            avg_duty_time_min=round(avg_duty, 1),
            avg_tafb_min=round(avg_tafb, 1),
            total_flight_time_min=total_flt_min,
            total_duty_time_min=total_duty_min,
            coverage_pct=round(coverage, 1),
            solver_status=solver_status,
        )
