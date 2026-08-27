"""Connectivity constraint — adjacent flights in a duty must connect geographically.

If flight f2 follows flight f1 in the same duty, then:
  f1.arv_arp == f2.dep_arp
  AND ground_time(f1, f2) >= MCT (minimum connection time)
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from ortools.sat.python import cp_model

from src.models.flight import Flight
from src.models.rule_config import RuleConfig
from src.utils.time_utils import datetime_to_minutes
from .base_constraint import BaseConstraint

if TYPE_CHECKING:
    from src.optimizer.solver import SolverVariables

logger = logging.getLogger(__name__)


class ConnectivityConstraint(BaseConstraint):
    """Ensures flight connectivity within duties."""

    def add(
        self,
        model: cp_model.CpModel,
        variables: SolverVariables,
        flights: list[Flight],
        rule_config: RuleConfig,
    ) -> None:
        mct_minutes = rule_config.get_rule_param(
            "MIN_CONNECTION_TIME", "mctMinutes", 45
        )
        if not isinstance(mct_minutes, int):
            mct_minutes = int(mct_minutes)

        n = len(flights)

        for i in range(n):
            for j in range(n):
                if i == j:
                    continue

                key = (i, j)
                if key not in variables.y:
                    continue

                fi = flights[i]
                fj = flights[j]

                # If y[i,j] = 1 (fj follows fi in the same duty), then:
                # 1. fi.arv_arp must equal fj.dep_arp
                if fi.arv_arp != fj.dep_arp:
                    # These flights cannot be consecutive in a duty
                    model.Add(variables.y[key] == 0)
                    continue

                # 2. Ground time must be >= MCT
                arv_min = datetime_to_minutes(fi.sch_arv_dt_utc)
                dep_min = datetime_to_minutes(fj.sch_dep_dt_utc)
                ground_time = dep_min - arv_min

                if ground_time < mct_minutes:
                    model.Add(variables.y[key] == 0)

                # 3. fj must depart after fi arrives (temporal ordering)
                if dep_min <= arv_min:
                    model.Add(variables.y[key] == 0)

        logger.info(
            "Added connectivity constraints: MCT=%d min, %d flights",
            mct_minutes,
            n,
        )
