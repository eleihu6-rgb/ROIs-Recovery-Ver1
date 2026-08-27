"""Pairing generator — combines duties into valid base-to-base pairings."""
from __future__ import annotations
from dataclasses import dataclass
from src.algorithm.duty_generator import DutyCandidate
from src.constraints.compiler import CompiledConstraints


@dataclass
class PairingState:
    duties: list[DutyCandidate]

    @property
    def last_duty(self) -> DutyCandidate:
        return self.duties[-1]

    @property
    def dep_arp(self) -> str:
        return self.duties[0].dep_arp

    @property
    def consecutive_days(self) -> int:
        first = self.duties[0].duty_start_utc
        last = self.duties[-1].duty_end_utc
        return (last.date() - first.date()).days + 1

    @property
    def tafb_minutes(self) -> int:
        first = self.duties[0].duty_start_utc
        last = self.duties[-1].duty_end_utc
        return int((last - first).total_seconds() / 60)


@dataclass
class PairingCandidate:
    flight_ids: list[int]
    duty_ids: list[int]           # index positions of included duties in the input list
    dep_arp: str
    arv_arp: str
    tafb_minutes: int
    total_flt_minutes: int
    total_duty_minutes: int       # sum of fdp_minutes across all duties
    deadhead_count: int = 0       # DH flights (not tracked in v2, placeholder)
    soft_violations: int = 0      # soft constraint violations (not tracked in v2, placeholder)


def generate_pairings(
    duties: list[DutyCandidate],
    cc: CompiledConstraints,
    deadline: float | None = None,
) -> list[PairingCandidate]:
    """
    Combine duties into valid pairings (base → ... → base).
    Checks: adequate rest between duties, max consecutive days, max TAFB.
    Only starts pairings from base-departing duties.
    If deadline (time.monotonic()) is set, stops early and returns candidates found so far.
    """
    import time
    results: list[PairingCandidate] = []

    # Pre-build index map to avoid repeated O(n) lookups
    duty_index: dict[int, int] = {id(d): i for i, d in enumerate(duties)}

    # Build inter-duty rest connections: duty_i → [duty_j indices] with adequate rest + airport match
    duty_connections: dict[int, list[int]] = {i: [] for i in range(len(duties))}
    for i, di in enumerate(duties):
        for j, dj in enumerate(duties):
            if i == j:
                continue
            if dj.dep_arp != di.arv_arp:
                continue
            rest = (dj.duty_start_utc - di.duty_end_utc).total_seconds() / 60
            if rest < cc.min_rest_minutes:
                continue
            duty_connections[i].append(j)

    for start_idx, start_duty in enumerate(duties):
        if deadline is not None and time.monotonic() > deadline:
            break  # time budget exhausted — return what we have

        if start_duty.dep_arp not in cc.base_airports:
            continue

        stack: list[tuple[PairingState, int]] = [
            (PairingState(duties=[start_duty]), start_idx)
        ]
        while stack:
            state, last_idx = stack.pop()

            # Valid pairing: ends at base
            if state.last_duty.arv_arp in cc.base_airports:
                all_fids = [fid for d in state.duties for fid in d.flight_ids]
                results.append(PairingCandidate(
                    flight_ids=all_fids,
                    duty_ids=[duty_index[id(d)] for d in state.duties],
                    dep_arp=state.dep_arp,
                    arv_arp=state.last_duty.arv_arp,
                    tafb_minutes=state.tafb_minutes,
                    total_flt_minutes=sum(d.flt_minutes for d in state.duties),
                    total_duty_minutes=sum(d.fdp_minutes for d in state.duties),
                ))

            # Prune: too many consecutive days
            if state.consecutive_days >= cc.max_consecutive_duty_days:
                continue
            # Prune: TAFB too long
            if state.tafb_minutes >= cc.max_tafb_minutes:
                continue

            # Extend with connected duties (guard against reuse)
            used_indices = {duty_index[id(d)] for d in state.duties}
            for next_idx in duty_connections[last_idx]:
                if next_idx in used_indices:
                    continue
                stack.append((PairingState(duties=state.duties + [duties[next_idx]]), next_idx))

    return results
