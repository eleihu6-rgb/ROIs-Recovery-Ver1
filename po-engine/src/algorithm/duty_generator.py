"""DFS duty generator — enumerates all valid duty candidates from a flight connection graph."""
from __future__ import annotations
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass
from datetime import datetime
from src.models.flight import Flight
from src.constraints.compiler import CompiledConstraints


@dataclass
class DutyState:
    flights: list[Flight]
    flt_minutes: int = 0    # total block time so far

    @property
    def last_flight(self) -> Flight:
        return self.flights[-1]

    @property
    def dep_arp(self) -> str:
        return self.flights[0].dep_arp

    @property
    def arv_arp(self) -> str:
        return self.flights[-1].arv_arp

    @property
    def duty_start_utc(self) -> datetime:
        return self.flights[0].sch_dep_dt_utc

    @property
    def sector_count(self) -> int:
        return len(self.flights)

    def fdp_minutes(self, brief: int, debrief: int) -> int:
        """FDP = brief + elapsed_from_first_dep_to_last_arv + debrief."""
        elapsed = (self.flights[-1].sch_arv_dt_utc - self.flights[0].sch_dep_dt_utc).total_seconds() / 60
        return int(brief + elapsed + debrief)


@dataclass
class DutyCandidate:
    flight_ids: list[int]
    dep_arp: str
    arv_arp: str
    fdp_minutes: int
    flt_minutes: int
    duty_start_utc: datetime
    duty_end_utc: datetime

    @classmethod
    def from_state(cls, state: DutyState, brief: int, debrief: int) -> "DutyCandidate":
        return cls(
            flight_ids=[f.id for f in state.flights],
            dep_arp=state.dep_arp,
            arv_arp=state.arv_arp,
            fdp_minutes=state.fdp_minutes(brief, debrief),
            flt_minutes=state.flt_minutes,
            duty_start_utc=state.duty_start_utc,
            duty_end_utc=state.flights[-1].sch_arv_dt_utc,
        )


def generate_duties(
    flights: list[Flight],
    connection_graph: dict[int, list[int]],
    cc: CompiledConstraints,
    deadline: float | None = None,
    start_flights: list[Flight] | None = None,
) -> list[DutyCandidate]:
    """
    DFS from each start_flight (defaults to all flights), generate all valid duty candidates.
    `flights` is used to build flights_by_id for successor lookup — must include all flights
    reachable via connection_graph, not just start_flights.
    Prunes branches that exceed FDP, flight time, or duty-time limits.
    If deadline (time.monotonic()) is set, stops early and returns candidates found so far.
    """
    import time
    flights_by_id = {f.id: f for f in flights}
    results: list[DutyCandidate] = []

    for start_flight in (start_flights if start_flights is not None else flights):
        if deadline is not None and time.monotonic() > deadline:
            break  # time budget exhausted — return what we have
        stack: list[DutyState] = [
            DutyState(flights=[start_flight], flt_minutes=start_flight.blk_min)
        ]
        while stack:
            state = stack.pop()

            # Report time = duty start in local hours (simplified: UTC hour as proxy)
            report_hour = state.duty_start_utc.hour
            report_local = f"{report_hour:02d}:00"
            current_fdp = state.fdp_minutes(cc.brief_minutes, cc.debrief_minutes)
            max_fdp = cc.fdp_limit_func(state.sector_count, report_local)

            # Prune: FDP limit exceeded
            if current_fdp > max_fdp:
                continue
            # Prune: absolute duty time ceiling exceeded
            if current_fdp > cc.max_duty_minutes:
                continue
            # Prune: flight time per duty exceeded
            if state.flt_minutes > cc.max_flt_per_duty_minutes:
                continue

            # Valid duty — record it
            results.append(DutyCandidate.from_state(state, cc.brief_minutes, cc.debrief_minutes))

            # Explore successors (skip already-visited flights to guard against accidental cycles)
            visited_ids = {f.id for f in state.flights}
            for next_id in connection_graph.get(state.last_flight.id, []):
                if next_id in visited_ids:
                    continue
                next_flt = flights_by_id[next_id]
                stack.append(DutyState(
                    flights=state.flights + [next_flt],
                    flt_minutes=state.flt_minutes + next_flt.blk_min,
                ))

    return results


# ── Module-level worker (must be importable for ProcessPoolExecutor pickling) ──

def _duties_worker(
    args: tuple[list[Flight], list[Flight], dict[int, list[int]], CompiledConstraints, float | None],
) -> list[DutyCandidate]:
    """
    Module-level worker for ProcessPoolExecutor.
    start_flights: the DFS origin flights for this shard.
    all_flights:   complete flight list needed for flights_by_id successor lookup.
    """
    start_flights, all_flights, connection_graph, cc, deadline = args
    return generate_duties(all_flights, connection_graph, cc, deadline=deadline,
                           start_flights=start_flights)


def generate_duties_parallel(
    flights: list[Flight],
    connection_graph: dict[int, list[int]],
    cc: CompiledConstraints,
    deadline: float | None = None,
    min_flights: int = 200,
    max_workers: int = 4,
) -> list[DutyCandidate]:
    """
    Parallel duty generation for large flight sets (> min_flights).
    Flights are sharded by departure airport — each shard starts DFS only from its flights
    but has access to the full flights list for successor lookup.
    Uses ProcessPoolExecutor for true CPU parallelism.

    CompiledConstraints must be picklable — ensured by FdpLimitCalculator replacing
    the fdp_limit closure.  Falls back to sequential for small sets or single airport.
    """
    if len(flights) < min_flights:
        return generate_duties(flights, connection_graph, cc, deadline=deadline)

    by_dep: dict[str, list[Flight]] = defaultdict(list)
    for f in flights:
        by_dep[f.dep_arp].append(f)

    groups = list(by_dep.values())
    if len(groups) <= 1:
        return generate_duties(flights, connection_graph, cc, deadline=deadline)

    n_workers = min(max_workers, len(groups))
    # Each worker gets its shard as start_flights but all flights for lookup
    args_list = [(g, flights, connection_graph, cc, deadline) for g in groups]

    results: list[DutyCandidate] = []
    with ProcessPoolExecutor(max_workers=n_workers) as pool:
        for group_result in pool.map(_duties_worker, args_list):
            results.extend(group_result)

    return results
