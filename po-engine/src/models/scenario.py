"""Scenario models — for creating and tracking optimization scenarios."""

from datetime import datetime
from typing import Any
from pydantic import BaseModel


class ScenarioInput(BaseModel):
    """Input for creating an optimization scenario in live-server."""

    name: str | None = None
    workset_id: int
    status: str = "DRAFT"
    str_dt_loc: datetime
    end_dt_loc: datetime
    ruleset_id: str
    cqfset_id: str = ""
    file_type: str = "PO"
    filter_params: dict[str, Any] = {}
    comments: str | None = None


class ScenarioResult(BaseModel):
    """Result of scenario creation/update from live-server."""

    id: int
    status: str
    name: str | None = None
