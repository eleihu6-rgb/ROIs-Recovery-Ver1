"""Flight time cumulative constraint.

Total flight time (block hours) within each duty must not exceed
the regulatory maximum.
"""

import logging

from ortools.sat.python import cp_model

from src.models.flight import Flight
from src.models.rule_config import RuleConfig
from src.optimizer.solver import SolverVariables
from .base_constraint import BaseConstraint

logger = logging.getLogger(__name__)


class FlightTimeConstraint(BaseConstraint):
    """Limits cumulative flight time per duty."""

    def add(
        self,
        model: cp_model.CpModel,
        variables: SolverVariables,
        flights: list[Flight],
        rule_config: RuleConfig,
    ) -> None:
        max_flt_per_duty = rule_config.get_max_flight_time_per_duty_minutes()
        n = len(flights)

        for p in range(variables.max_pairings):
            for k in range(variables.max_duties):
                dk = (p, k)
                if dk not in variables.d:
                    continue

                # Sum of block minutes for flights in this duty
                flight_time_terms: list[cp_model.LinearExpr] = []
                for f in range(n):
                    fk = (f, p, k)
                    if fk in variables.flight_in_duty:
                        flight_time_terms.append(
                            flights[f].blk_min * variables.flight_in_duty[fk]
                        )

                if flight_time_terms:
                    total_flt = model.NewIntVar(
                        0, max_flt_per_duty + 1, f"flt_time_{p}_{k}"
                    )
                    model.Add(total_flt == sum(flight_time_terms))
                    # Hard constraint: flight time <= max
                    model.Add(total_flt <= max_flt_per_duty).OnlyEnforceIf(
                        variables.d[dk]
                    )

        logger.info(
            "Added flight time constraints: max %d min/duty", max_flt_per_duty
        )
