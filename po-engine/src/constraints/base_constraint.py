"""Base class for all CP-SAT constraints."""

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

from ortools.sat.python import cp_model

if TYPE_CHECKING:
    from src.models.flight import Flight
    from src.models.rule_config import RuleConfig
    from src.optimizer.solver import SolverVariables


class BaseConstraint(ABC):
    """Abstract base class for optimization constraints.

    Each constraint reads its parameters from the RuleConfig
    (which was fetched once from the rule-engine before optimization)
    and adds corresponding constraints to the CP-SAT model.
    """

    @abstractmethod
    def add(
        self,
        model: cp_model.CpModel,
        variables: "SolverVariables",
        flights: list["Flight"],
        rule_config: "RuleConfig",
    ) -> None:
        """Add this constraint to the CP-SAT model."""
        ...
