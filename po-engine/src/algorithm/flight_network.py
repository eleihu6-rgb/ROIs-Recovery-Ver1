"""Flight connection graph builder — determines which flights can follow each other in the same duty."""

from src.models.flight import Flight
from src.constraints.compiler import CompiledConstraints


def build_connection_graph(
    flights: list[Flight],
    cc: CompiledConstraints,
) -> dict[int, list[int]]:
    """
    Build flight connection graph for same-duty connections.
    Returns: flight_id → list of successor flight_ids that can follow in the same duty.
    A connection is valid when:
      1. f_j.dep_arp == f_i.arv_arp  (airport match)
      2. ground_time >= MCT           (minimum connection time)
      3. ground_time < min_rest       (same duty — gaps >= min rest are between duties)
    """
    graph: dict[int, list[int]] = {f.id: [] for f in flights}

    for fi in flights:
        for fj in flights:
            if fi.id == fj.id:
                continue
            if fj.dep_arp != fi.arv_arp:
                continue
            mct = cc.mct_by_airport.get(fj.dep_arp, cc.default_mct_minutes)
            ground = (fj.sch_dep_dt_utc - fi.sch_arv_dt_utc).total_seconds() / 60
            if ground < 0:
                continue  # fj departs before fi lands — chronologically impossible
            if ground < mct:
                continue
            if ground >= cc.min_rest_minutes:
                continue
            graph[fi.id].append(fj.id)

    return graph
