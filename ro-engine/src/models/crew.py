# src/models/crew.py
"""Crew data models — populated from CREWS, CREW_QUALIFICATIONS,
CREW_FTL_STATE, and LOCKED_ASSIGNMENTS sections of input.gz."""
from __future__ import annotations
from dataclasses import dataclass, field


@dataclass
class LockedAssignment:
    """A time-blocking entry that prevents crew from taking free pairings."""
    crew_id: str
    entry_type: str    # LEAVE | TRAINING | LOCKED_PAIRING | GROUND_DUTY
    ref_id: str
    start_min: int     # epoch minutes (since 2000-01-01 00:00 UTC)
    end_min: int       # epoch minutes
    flt_min: int       # flight minutes contributed (0 for leave/training)


@dataclass
class Crew:
    """Complete crew record for one optimization run."""
    crew_id: str
    first_name: str
    last_name: str
    division: str      # P=pilot, C=cabin
    rank: str          # CA, FO, FP, ...
    base: str          # IATA airport code
    fleet: str         # primary fleet code e.g. B738
    team: str = ""
    status: int = 1
    filiale: str = ""

    # From CREW_QUALIFICATIONS
    fleet_codes: list[str] = field(default_factory=list)   # all qualified fleets
    airport_quals: list[str] = field(default_factory=list)  # special airport qualifications

    # From CREW_FTL_STATE (state at START of optimization window)
    month_flt_min_used: int = 0
    quarter_flt_min_used: int = 0
    year_flt_min_used: int = 0
    last_duty_end_min: int = 0    # epoch minutes; 0 = no prior duty
    last_rest_end_min: int = 0    # epoch minutes; 0 = no prior rest
    consecutive_duty_days: int = 0

    # From LOCKED_ASSIGNMENTS
    locked: list[LockedAssignment] = field(default_factory=list)

    @property
    def display_name(self) -> str:
        return f"{self.first_name} {self.last_name}"
