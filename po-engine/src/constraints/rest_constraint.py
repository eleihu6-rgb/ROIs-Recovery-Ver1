"""Minimum rest time constraint between consecutive duties.

Between duty k and duty k+1 in the same pairing, the rest period
(start of next duty - end of previous duty) must be >= minimum rest.
"""

import logging

from ortools.sat.python import cp_model

from src.models.flight import Flight
from src.models.rule_config import RuleConfig
from src.optimizer.solver import SolverVariables
from .base_constraint import BaseConstraint

logger = logging.getLogger(__name__)


class RestConstraint(BaseConstraint):
    """Ensures minimum rest between consecutive duties in a pairing."""

    def add(
        self,
        model: cp_model.CpModel,
        variables: SolverVariables,
        flights: list[Flight],
        rule_config: RuleConfig,
    ) -> None:
        min_rest = rule_config.get_min_rest_minutes()

        for p in range(variables.max_pairings):
            for k in range(variables.max_duties - 1):
                dk_curr = (p, k)
                dk_next = (p, k + 1)

                if (
                    dk_curr not in variables.duty_end
                    or dk_next not in variables.duty_start
                ):
                    continue

                # Both duties must be used for rest constraint to apply
                both_used = model.NewBoolVar(f"both_duty_{p}_{k}")
                model.AddBoolAnd(
                    [variables.d[dk_curr], variables.d[dk_next]]
                ).OnlyEnforceIf(both_used)
                model.AddBoolOr(
                    [variables.d[dk_curr].Not(), variables.d[dk_next].Not()]
                ).OnlyEnforceIf(both_used.Not())

                # rest = duty_start[p,k+1] - duty_end[p,k] >= min_rest
                model.Add(
                    variables.duty_start[dk_next] - variables.duty_end[dk_curr]
                    >= min_rest
                ).OnlyEnforceIf(both_used)

        logger.info("Added rest constraints: min %d min", min_rest)
