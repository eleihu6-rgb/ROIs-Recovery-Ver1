"""Rule configuration models — received from the rule-engine HTTP API."""

from typing import Any
from pydantic import BaseModel


class ResolvedRule(BaseModel):
    """A single resolved rule from the rule engine."""

    template_code: str
    instance_code: str
    name: str
    category: str  # FDP / REST / FLIGHT_TIME / DUTY / FATIGUE / QUALIFICATION
    check_type: str  # CHECK / CALC / BOTH
    severity: str  # ERROR / WARNING / INFO
    overridable: bool
    params: dict[str, Any]
    conditions: dict[str, Any] | None = None
    constraint_type: str | None = None  # LINEAR / BOOL / TABLE / ELEMENT / CALC
    ccar_reference: str | None = None
    sort_order: int = 0


class RuleGroup(BaseModel):
    """A rule group header."""

    id: int
    group_code: str
    name: str
    description: str | None = None
    usage: str  # GANTT / PO / RO / PBS / ALL
    filiale: str
    division: str
    is_default: bool


class RuleConfig(BaseModel):
    """Complete rule configuration for an optimization run."""

    group: RuleGroup
    rules: list[ResolvedRule]

    def get_rules_by_category(self, category: str) -> list[ResolvedRule]:
        """Get all rules for a given category."""
        return [r for r in self.rules if r.category == category]

    def get_rule_param(
        self, template_code: str, param_key: str, default: Any = None
    ) -> Any:
        """Get a specific parameter value from a rule by template code."""
        for r in self.rules:
            if r.template_code == template_code:
                return r.params.get(param_key, default)
        return default

    def get_fdp_limit_minutes(self, num_sectors: int) -> int:
        """Get maximum FDP in minutes for a given number of sectors.

        Looks up the FDP table from rule params. Falls back to a
        conservative default of 780 minutes (13 hours).
        """
        for r in self.rules:
            if r.category == "FDP" and r.check_type in ("CHECK", "BOTH"):
                fdp_table = r.params.get("fdpTable")
                if isinstance(fdp_table, dict):
                    # fdpTable is keyed by sector count string
                    val = fdp_table.get(str(num_sectors))
                    if val is not None:
                        return int(val)
                # Flat maxFdpMinutes param
                max_fdp = r.params.get("maxFdpMinutes")
                if max_fdp is not None:
                    return int(max_fdp)
        return 780  # conservative fallback: 13 hours

    def get_min_rest_minutes(self) -> int:
        """Get minimum rest period between duties in minutes."""
        for r in self.rules:
            if r.category == "REST":
                val = r.params.get("minRestMinutes")
                if val is not None:
                    return int(val)
        return 600  # fallback: 10 hours

    def get_max_duty_minutes(self) -> int:
        """Get maximum single duty period in minutes."""
        for r in self.rules:
            if r.category == "DUTY":
                val = r.params.get("maxDutyMinutes")
                if val is not None:
                    return int(val)
        return 840  # fallback: 14 hours

    def get_max_consecutive_duty_days(self) -> int:
        """Get maximum consecutive duty days."""
        for r in self.rules:
            if r.category == "DUTY":
                val = r.params.get("maxConsecutiveDutyDays")
                if val is not None:
                    return int(val)
        return 7  # fallback

    def get_max_flight_time_per_duty_minutes(self) -> int:
        """Get maximum cumulative flight time per duty in minutes."""
        for r in self.rules:
            if r.category == "FLIGHT_TIME":
                val = r.params.get("maxFlightTimePerDutyMinutes")
                if val is not None:
                    return int(val)
        return 600  # fallback: 10 hours

    def get_max_flight_time_cumulative_minutes(self, period_days: int = 28) -> int:
        """Get maximum cumulative flight time over a period."""
        for r in self.rules:
            if r.category == "FLIGHT_TIME":
                cum = r.params.get("cumulativeLimits")
                if isinstance(cum, dict):
                    val = cum.get(str(period_days))
                    if val is not None:
                        return int(val)
        # Fallback values
        defaults = {7: 2100, 28: 6000, 90: 16200, 365: 60000}
        return defaults.get(period_days, 6000)
