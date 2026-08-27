"""FDP (Flight Duty Period) constraint.

For each duty in a pairing, the FDP must not exceed the maximum
allowed value which depends on the number of sectors in the duty.

FDP = time from report to release (duty_end - duty_start).
The maximum FDP is looked up from a table in the rule config
keyed by sector count.
"""

import logging

from ortools.sat.python import cp_model

from src.models.flight import Flight
from src.models.rule_config import RuleConfig
from src.optimizer.solver import SolverVariables
from .base_constraint import BaseConstraint

logger = logging.getLogger(__name__)


class FdpConstraint(BaseConstraint):
    """Ensures each duty's FDP does not exceed the regulatory limit."""

    def add(
        self,
        model: cp_model.CpModel,
        variables: SolverVariables,
        flights: list[Flight],
        rule_config: RuleConfig,
    ) -> None:
        max_duties = variables.max_duties
        n = len(flights)

        for p in range(variables.max_pairings):
            for k in range(max_duties):
                dk = (p, k)
                if dk not in variables.d:
                    continue

                # Count sectors in this duty: sum of flights assigned to
                # pairing p that are in duty k
                sector_counts: list[cp_model.LinearExpr] = []
                for f in range(n):
                    fp = (f, p)
                    fk = (f, p, k)
                    if fp in variables.x and fk in variables.flight_in_duty:
                        sector_counts.append(variables.flight_in_duty[fk])

                if not sector_counts:
                    continue

                duty_flight_count = model.NewIntVar(0, n, f"dfc_{p}_{k}")
                model.Add(duty_flight_count == sum(sector_counts))

                # FDP = duty_end - duty_start (both in minutes)
                if dk in variables.duty_start and dk in variables.duty_end:
                    fdp = model.NewIntVar(0, 24 * 60, f"fdp_{p}_{k}")
                    model.Add(
                        fdp == variables.duty_end[dk] - variables.duty_start[dk]
                    )

                    # Apply FDP limit for each possible sector count
                    for s in range(1, variables.max_flights_per_duty + 1):
                        max_fdp = rule_config.get_fdp_limit_minutes(s)
                        # If duty has exactly s sectors, FDP <= max_fdp
                        b = model.NewBoolVar(f"fdp_sec_{p}_{k}_{s}")
                        model.Add(duty_flight_count == s).OnlyEnforceIf(b)
                        model.Add(duty_flight_count != s).OnlyEnforceIf(b.Not())
                        model.Add(fdp <= max_fdp).OnlyEnforceIf(b)

                    # If duty is not used (d[p,k] = 0), FDP must be 0
                    model.Add(fdp == 0).OnlyEnforceIf(variables.d[dk].Not())

        logger.info("Added FDP constraints for %d pairings", variables.max_pairings)
