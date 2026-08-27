"""Constraint compiler — translates RuleConfig JSON into CompiledConstraints for graph search."""
from __future__ import annotations

from dataclasses import dataclass

from src.models.rule_config import RuleConfig
from src.constraints.fdp_table import FdpLimitCalculator, DEFAULT_FDP_TABLE


@dataclass
class CompiledConstraints:
    """Compiled constraint functions and parameters for graph search.
    All fields are picklable — CompiledConstraints can be passed to worker processes.
    """

    fdp_limit_func: FdpLimitCalculator  # (segments, report_local_hhmm) → max_fdp_minutes
    min_rest_minutes: int
    max_duty_minutes: int
    max_consecutive_duty_days: int
    max_flt_per_duty_minutes: int
    cumulative_flt_limits: dict[int, int]
    mct_by_airport: dict[str, int]
    default_mct_minutes: int
    brief_minutes: int
    debrief_minutes: int
    base_airports: frozenset[str]
    max_pairing_days: int
    max_tafb_minutes: int


class ConstraintCompiler:
    def compile(
        self,
        rule_config: RuleConfig,
        base_airports: list[str],
        operational_params: dict[str, object] | None = None,
    ) -> CompiledConstraints:
        p = operational_params or {}
        return CompiledConstraints(
            fdp_limit_func=self._compile_fdp(rule_config),
            min_rest_minutes=self._compile_rest(rule_config),
            max_duty_minutes=self._compile_duty_time(rule_config),
            max_consecutive_duty_days=self._compile_consec_days(rule_config),
            max_flt_per_duty_minutes=self._compile_max_flt_duty(rule_config),
            cumulative_flt_limits=self._compile_cumulative_flt(rule_config),
            mct_by_airport=p.get("mctByAirport", {}),
            default_mct_minutes=int(p.get("defaultMctMinutes", 60)),
            brief_minutes=int(p.get("briefMinutes", 60)),
            debrief_minutes=int(p.get("debriefMinutes", 30)),
            base_airports=frozenset(base_airports),
            max_pairing_days=int(p.get("maxPairingDays", 5)),
            max_tafb_minutes=int(p.get("maxTafbMinutes", 72 * 60)),
        )

    def _compile_fdp(self, rule_config: RuleConfig) -> FdpLimitCalculator:
        fdp_table: list[dict] = list(DEFAULT_FDP_TABLE)
        for rule in rule_config.rules:
            if rule.template_code == "fdp_calculator":
                raw = rule.params.get("fdp_table")
                if isinstance(raw, list) and raw:
                    fdp_table = raw
                break
        return FdpLimitCalculator(fdp_table)

    def _compile_rest(self, rule_config: RuleConfig) -> int:
        for rule in rule_config.rules:
            if rule.template_code == "rest_calculator":
                val = rule.params.get("minRestMinutes")
                if val is not None:
                    return int(val)
        return 600

    def _compile_duty_time(self, rule_config: RuleConfig) -> int:
        for rule in rule_config.rules:
            if rule.template_code == "duty_time_calculator":
                return int(rule.params.get("maxDutyMinutes", 840))
        return 840

    def _compile_consec_days(self, rule_config: RuleConfig) -> int:
        for rule in rule_config.rules:
            if rule.template_code == "duty_time_calculator":
                return int(rule.params.get("maxConsecutiveDutyDays", 7))
        return 7

    def _compile_max_flt_duty(self, rule_config: RuleConfig) -> int:
        for rule in rule_config.rules:
            if rule.template_code == "flight_time_calculator":
                return int(rule.params.get("maxFlightTimePerDutyMinutes", 600))
        return 600

    def _compile_cumulative_flt(self, rule_config: RuleConfig) -> dict[int, int]:
        defaults = {7: 2400, 28: 6000, 90: 16200, 365: 60000}
        for rule in rule_config.rules:
            if rule.template_code == "flight_time_calculator":
                raw = rule.params.get("cumulativeLimits")
                if isinstance(raw, dict):
                    return {int(k): int(v) for k, v in raw.items()}
        return defaults
