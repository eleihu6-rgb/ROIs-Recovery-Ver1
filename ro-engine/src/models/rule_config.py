"""Rule configuration models — from rule-engine API."""

from pydantic import BaseModel, Field


class ResolvedRule(BaseModel):
    """A resolved rule combining template + instance + group overrides."""
    template_code: str = Field(alias="templateCode")
    instance_code: str = Field(alias="instanceCode")
    name: str = ""
    category: str = ""
    check_type: str = Field(default="CHECK", alias="checkType")
    severity: str = "ERROR"
    overridable: bool = False
    params: dict = Field(default_factory=dict)
    conditions: dict | None = None
    constraint_type: str | None = Field(default=None, alias="constraintType")
    ccar_reference: str | None = Field(default=None, alias="ccarReference")
    sort_order: int = Field(default=0, alias="sortOrder")

    model_config = {"populate_by_name": True}


class RuleGroup(BaseModel):
    """Rule group metadata."""
    id: int
    group_code: str = Field(alias="groupCode")
    name: str = ""
    description: str | None = None
    usage: str = "RO"
    filiale: str = ""
    division: str = ""
    is_default: bool = Field(default=False, alias="isDefault")

    model_config = {"populate_by_name": True}


class RuleConfig(BaseModel):
    """Complete rule configuration for an optimization run."""
    group: RuleGroup
    rules: list[ResolvedRule] = Field(default_factory=list)

    def rules_by_category(self, category: str) -> list[ResolvedRule]:
        """Return rules filtered by category (e.g. FDP, REST, FLIGHT_TIME)."""
        return [r for r in self.rules if r.category == category]

    def get_param(self, category: str, param_key: str, default: int = 0) -> int:
        """Get a numeric parameter from the first rule in a category."""
        for rule in self.rules_by_category(category):
            value = rule.params.get(param_key)
            if value is not None:
                return int(value)
        return default

    def get_rule_param(self, template_code: str, param_key: str, default: object = None) -> object:
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
                    val = fdp_table.get(str(num_sectors))
                    if val is not None:
                        return int(val)
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
        defaults = {7: 2100, 28: 6000, 90: 16200, 365: 60000}
        return defaults.get(period_days, 6000)
