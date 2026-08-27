from __future__ import annotations

from .solver import SolverVariables, create_variables
from .result_extractor import ResultExtractor


def __getattr__(name: str):  # type: ignore[return]
    """Lazy import PairingOptimizer to avoid circular import with src.constraints."""
    if name == "PairingOptimizer":
        from .pairing_optimizer import PairingOptimizer
        return PairingOptimizer
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = ["PairingOptimizer", "SolverVariables", "create_variables", "ResultExtractor"]
