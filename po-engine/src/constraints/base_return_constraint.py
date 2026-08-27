"""Base return constraint.

A pairing must start from a base airport and end at the same
(or an allowed) base airport. The first flight's departure and
the last flight's arrival must be at a base airport.
"""

import logging

from ortools.sat.python import cp_model

from src.models.flight import Flight
from src.models.rule_config import RuleConfig
from src.optimizer.solver import SolverVariables
from .base_constraint import BaseConstraint

logger = logging.getLogger(__name__)


class BaseReturnConstraint(BaseConstraint):
    """Ensures pairings depart from and return to a base airport."""

    def __init__(self, base_airports: list[str]) -> None:
        self.base_airports = set(base_airports)

    def add(
        self,
        model: cp_model.CpModel,
        variables: SolverVariables,
        flights: list[Flight],
        rule_config: RuleConfig,
    ) -> None:
        n = len(flights)
        base_set = self.base_airports

        for p in range(variables.max_pairings):
            # Identify first-in-pairing and last-in-pairing flights.
            # A flight f is first in pairing p if:
            #   x[f,p] = 1 AND no other flight g has y[g,f] = 1
            # A flight f is last in pairing p if:
            #   x[f,p] = 1 AND no other flight g has y[f,g] = 1

            for f in range(n):
                fp = (f, p)
                if fp not in variables.x:
                    continue

                flight = flights[f]

                # Check if this flight could be first in pairing
                is_first = variables.first_in_pairing.get((f, p))
                if is_first is not None:
                    # If flight f is first in pairing p, dep_arp must be base
                    if flight.dep_arp not in base_set:
                        model.Add(is_first == 0)

                # Check if this flight could be last in pairing
                is_last = variables.last_in_pairing.get((f, p))
                if is_last is not None:
                    # If flight f is last in pairing p, arv_arp must be base
                    if flight.arv_arp not in base_set:
                        model.Add(is_last == 0)

        logger.info(
            "Added base return constraints: bases=%s", sorted(base_set)
        )
