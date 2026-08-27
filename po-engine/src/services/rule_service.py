"""Service for fetching rule configurations from the rule-engine HTTP API."""

import logging

import httpx

from src.config import settings
from src.models.rule_config import RuleConfig, ResolvedRule, RuleGroup

logger = logging.getLogger(__name__)


class RuleService:
    """Fetches rule group configuration from live-server (port 3000)."""

    def __init__(self, base_url: str | None = None) -> None:
        self.base_url = base_url or settings.rule_engine_url

    async def get_rule_config(self, group_code: str) -> RuleConfig:
        """Fetch a complete rule group with all resolved rules.

        Calls GET /api/rule/groups/:code on live-server.
        The response shape is:
        {
          "code": 200,
          "data": {
            "group": { ... },
            "rules": [ { templateCode, instanceCode, name, ... }, ... ]
          }
        }
        """
        url = f"{self.base_url}/api/rule/groups/{group_code}"
        logger.info("Fetching rule config from %s", url)

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            body = resp.json()

        data = body.get("data", body)
        group_raw = data["group"]
        rules_raw = data["rules"]

        group = RuleGroup(
            id=group_raw["id"],
            group_code=group_raw["groupCode"],
            name=group_raw["name"],
            description=group_raw.get("description"),
            usage=group_raw["usage"],
            filiale=group_raw["filiale"],
            division=group_raw["division"],
            is_default=group_raw["isDefault"],
        )

        rules: list[ResolvedRule] = []
        for r in rules_raw:
            rules.append(
                ResolvedRule(
                    template_code=r["templateCode"],
                    instance_code=r["instanceCode"],
                    name=r["name"],
                    category=r["category"],
                    check_type=r["checkType"],
                    severity=r["severity"],
                    overridable=r["overridable"],
                    params=r["params"],
                    conditions=r.get("conditions"),
                    constraint_type=r.get("constraintType"),
                    ccar_reference=r.get("ccarReference"),
                    sort_order=r.get("sortOrder", 0),
                )
            )

        logger.info(
            "Loaded rule config: group=%s, %d rules", group.group_code, len(rules)
        )
        return RuleConfig(group=group, rules=rules)
