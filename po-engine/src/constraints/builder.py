"""ConstraintBuilder — orchestrates adding all constraints to the model."""

import logging

from ortools.sat.python import cp_model

from src.models.flight import Flight
from src.models.rule_config import RuleConfig
from src.optimizer.solver import SolverVariables
from .connectivity_constraint import ConnectivityConstraint
from .fdp_constraint import FdpConstraint
from .flight_time_constraint import FlightTimeConstraint
from .rest_constraint import RestConstraint
from .duty_constraint import DutyConstraint
from .base_return_constraint import BaseReturnConstraint

logger = logging.getLogger(__name__)


class ConstraintBuilder:
    """Builds and adds all constraints from a rule configuration."""

    def __init__(
        self,
        rule_config: RuleConfig,
        base_airports: list[str],
    ) -> None:
        self.rule_config = rule_config
        self.base_airports = base_airports

    def add_all(
        self,
        model: cp_model.CpModel,
        variables: SolverVariables,
        flights: list[Flight],
    ) -> None:
        """Add all constraints to the model."""
        constraints = [
            ConnectivityConstraint(),
            FdpConstraint(),
            FlightTimeConstraint(),
            RestConstraint(),
            DutyConstraint(),
            BaseReturnConstraint(self.base_airports),
        ]

        for constraint in constraints:
            logger.info("Adding constraint: %s", constraint.__class__.__name__)
            constraint.add(model, variables, flights, self.rule_config)

        logger.info("All %d constraints added", len(constraints))
