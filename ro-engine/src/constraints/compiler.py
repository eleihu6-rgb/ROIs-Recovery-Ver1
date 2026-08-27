"""FTL Constraint Compiler: translates RuleConfig → CompiledFTL for the DP scheduler."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from src.models.rule_config import RuleConfig


@dataclass
class CompiledFTL:
    """All FTL parameters needed by the eligibility filter and DP scheduler."""

    # Hard constraints
    fdp_limit_func: Callable[[int], int]  # (num_sectors) → max_fdp_minutes
    min_rest_minutes: int
    max_duty_flt_min: int
    max_month_flt_min: int
    max_quarter_flt_min: int
    max_year_flt_min: int
    max_consecutive_duty_days: int
    max_tafb_minutes: int

    # Soft constraint weights (used in DP profit scoring)
    preferred_base_weight: float    # penalty per base-mismatch assignment
    fairness_target_hours: float    # target monthly flight hours for fairness scoring


class FTLCompiler:
    """Compile a RuleConfig + job_params dict into a CompiledFTL."""

    def compile(self, rule_config: RuleConfig, job_params: dict) -> CompiledFTL:
        return CompiledFTL(
            fdp_limit_func=self._fdp_func(rule_config),
            min_rest_minutes=rule_config.get_min_rest_minutes(),
            max_duty_flt_min=rule_config.get_max_flight_time_per_duty_minutes(),
            max_month_flt_min=rule_config.get_max_flight_time_cumulative_minutes(28),
            max_quarter_flt_min=rule_config.get_max_flight_time_cumulative_minutes(90),
            max_year_flt_min=rule_config.get_max_flight_time_cumulative_minutes(365),
            max_consecutive_duty_days=rule_config.get_max_consecutive_duty_days(),
            max_tafb_minutes=int(job_params.get("max_tafb_hours", 72)) * 60,
            preferred_base_weight=float(job_params.get("preferred_base_weight", 50.0)),
            fairness_target_hours=float(job_params.get("fairness_target_hours", 80.0)),
        )

    @staticmethod
    def _fdp_func(rule_config: RuleConfig) -> Callable[[int], int]:
        """Return a closure: (num_sectors) → max_fdp_minutes."""

        def fdp_limit(num_sectors: int) -> int:
            return rule_config.get_fdp_limit_minutes(num_sectors)

        return fdp_limit
