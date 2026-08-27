"""Flight data model — mirrors the live-server flight table."""

from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class Flight(BaseModel):
    """A single flight leg used as input to the pairing optimizer."""

    model_config = ConfigDict(populate_by_name=True)

    id: int
    airline: str
    flt_dt: str  # YYYY-MM-DD
    flt_num: str
    dep_arp: str = Field(max_length=3)
    arv_arp: str = Field(max_length=3)
    sch_dep_dt_utc: datetime
    sch_arv_dt_utc: datetime
    blk_min: int
    fleet: str
    flt_type: str = "J"  # J=regular, D=deadhead, etc.
    seg_type: str | None = None
    is_locked: int = 0

    @property
    def block_minutes(self) -> int:
        """Block time in minutes (chock-to-chock)."""
        return self.blk_min

    @property
    def is_deadhead(self) -> bool:
        return self.flt_type == "D"
