# src/models/pairing.py
"""Pairing data models — populated from PAIRINGS, PAIRING_DUTIES,
and PAIRING_COMPOSITIONS sections of input.gz."""
from __future__ import annotations
from dataclasses import dataclass, field


@dataclass
class PairingDuty:
    """One duty period within a pairing."""
    duty_seq: int
    duty_start_min: int   # epoch minutes
    duty_end_min: int     # epoch minutes
    fdp_min: int          # flight duty period duration
    flt_min: int          # block time within this duty
    rest_after_min: int   # scheduled rest after this duty (0 for last duty)


@dataclass
class PairingComposition:
    """Required crew count per rank for this pairing."""
    rank: str
    required_count: int


@dataclass
class Pairing:
    """A complete pairing (multi-day trip) to be assigned to crew."""
    pairing_id: int
    pairing_label: str
    division: str
    base: str
    fleet: str
    start_min: int        # epoch minutes (first duty start)
    end_min: int          # epoch minutes (last duty end)
    tafb_min: int         # time away from base
    total_flt_min: int    # total block time across all duties
    duty_count: int
    seg_count: int
    duties: list[PairingDuty] = field(default_factory=list)
    compositions: list[PairingComposition] = field(default_factory=list)

    def required_for_rank(self, rank: str) -> int:
        """Return required crew count for a given rank (0 if rank not in composition)."""
        for comp in self.compositions:
            if comp.rank == rank:
                return comp.required_count
        return 0

    @property
    def eligible_ranks(self) -> frozenset[str]:
        """Set of ranks that have non-zero required count."""
        return frozenset(c.rank for c in self.compositions if c.required_count > 0)
