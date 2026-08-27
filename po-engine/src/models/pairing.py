"""Pairing output models — structured result from the optimizer."""

from datetime import datetime
from pydantic import BaseModel


class PairingSegment(BaseModel):
    """A single flight segment within a duty."""

    seg_seq: int
    flt_id: int
    flt_dt: str | None = None
    flt_num: str
    airline: str
    dep_arp: str
    arv_arp: str
    fleet_seg: str
    sch_str_dt_utc: datetime
    sch_end_dt_utc: datetime
    seg_assignment: str = "OPR"


class PairingDuty(BaseModel):
    """A duty period containing one or more flight segments."""

    duty_seq: int
    duty_str_arp: str
    duty_end_arp: str
    duty_sch_str_dt_utc: datetime
    duty_sch_end_dt_utc: datetime
    duty_brief_min: int = 60
    duty_debrief_min: int = 30
    duty_sch_duty_min: int = 0
    duty_sch_fdp_min: int = 0
    duty_sch_flt_min: int = 0
    duty_sch_rest_min: int = 0
    segments: list[PairingSegment] = []


class Pairing(BaseModel):
    """A complete pairing (sequence of duties from base and back)."""

    pairing_label: str | None = None
    base: str
    fleet: str
    division: str = "P"
    assignment_group: str = "FO"
    assignment: str = "FO"
    sch_str_dt_utc: datetime
    sch_end_dt_utc: datetime
    duration_days: int
    tafb: int  # time away from base in minutes
    duty_count: int
    seg_count: int
    duties: list[PairingDuty] = []
    source: str = "PO"
