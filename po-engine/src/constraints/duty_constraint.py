"""Duty period constraints.

1. Maximum duty time per single duty
2. Maximum consecutive duty days per pairing
"""

import logging

from ortools.sat.python import cp_model

from src.models.flight import Flight
from src.models.rule_config import RuleConfig
from src.optimizer.solver import SolverVariables
from .base_constraint import BaseConstraint

logger = logging.getLogger(__name__)


class DutyConstraint(BaseConstraint):
    """Limits duty duration and consecutive duty days."""

    def add(
        self,
        model: cp_model.CpModel,
        variables: SolverVariables,
        flights: list[Flight],
        rule_config: RuleConfig,
    ) -> None:
        max_duty_min = rule_config.get_max_duty_minutes()
        max_consec_days = rule_config.get_max_consecutive_duty_days()

        for p in range(variables.max_pairings):
            # 1. Duty duration constraint
            for k in range(variables.max_duties):
                dk = (p, k)
                if dk not in variables.duty_start or dk not in variables.duty_end:
                    continue

                duty_dur = model.NewIntVar(0, max_duty_min + 1, f"dd_{p}_{k}")
                model.Add(
                    duty_dur == variables.duty_end[dk] - variables.duty_start[dk]
                )
                model.Add(duty_dur <= max_duty_min).OnlyEnforceIf(variables.d[dk])
                model.Add(duty_dur == 0).OnlyEnforceIf(variables.d[dk].Not())

            # 2. Maximum consecutive duty days (= max duties per pairing)
            duty_count = model.NewIntVar(0, variables.max_duties, f"dc_{p}")
            duty_vars = [
                variables.d[(p, k)]
                for k in range(variables.max_duties)
                if (p, k) in variables.d
            ]
            if duty_vars:
                model.Add(duty_count == sum(duty_vars))
                model.Add(duty_count <= max_consec_days)

        logger.info(
            "Added duty constraints: max_duty=%d min, max_consec=%d days",
            max_duty_min,
            max_consec_days,
        )
