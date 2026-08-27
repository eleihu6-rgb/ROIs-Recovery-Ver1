"""Optimization request/result models."""

from datetime import datetime
from pydantic import BaseModel, Field

from .pairing import Pairing


class OptimizeWeights(BaseModel):
    """Objective function weights — all configurable."""

    w_pairings: int = Field(default=1000, description="Weight for minimizing total pairing count")
    w_deadhead: int = Field(default=500, description="Weight for minimizing deadhead legs")
    w_duty_time: int = Field(default=1, description="Weight for minimizing total duty time")
    w_penalty: int = Field(default=100, description="Weight for soft constraint penalties")


class OptimizeRequest(BaseModel):
    """Request body for POST /api/po/optimize."""

    start_date: str  # YYYY-MM-DD
    end_date: str  # YYYY-MM-DD
    rule_group_code: str = "CAAC_FTL"
    base_airports: list[str] = Field(
        default=["PEK"],
        description="List of crew base airports (IATA codes)",
    )
    fleet: str | None = None  # filter flights by fleet
    division: str = "P"  # P=pilot, C=cabin
    weights: OptimizeWeights = OptimizeWeights()
    time_limit_seconds: int | None = None
    workset_id: int | None = None


class OptimizeKpi(BaseModel):
    """Key performance indicators for an optimization result."""

    total_flights: int = 0
    total_pairings: int = 0
    total_duties: int = 0
    total_deadheads: int = 0
    avg_duty_time_min: float = 0.0
    avg_tafb_min: float = 0.0
    total_flight_time_min: int = 0
    total_duty_time_min: int = 0
    coverage_pct: float = 100.0
    solver_status: str = ""
    solve_time_seconds: float = 0.0


class OptimizeResult(BaseModel):
    """Response body for the optimization endpoint."""

    status: str  # success / infeasible / timeout / error
    message: str = ""
    scenario_id: int | None = None
    pairings: list[Pairing] = []
    kpi: OptimizeKpi = OptimizeKpi()
