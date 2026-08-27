"""Extract pairing results from a solved CP-SAT model."""

import logging
from datetime import timedelta

from ortools.sat.python import cp_model

from src.config import settings
from src.models.flight import Flight
from src.models.pairing import Pairing, PairingDuty, PairingSegment
from src.utils.time_utils import minutes_to_datetime
from .solver import SolverVariables

logger = logging.getLogger(__name__)


class ResultExtractor:
    """Extracts structured Pairing objects from a solved CP-SAT model."""

    def extract(
        self,
        solver: cp_model.CpSolver,
        variables: SolverVariables,
        flights: list[Flight],
        base_airports: list[str],
    ) -> list[Pairing]:
        """Extract all pairings from the solution."""
        n = len(flights)
        pairings: list[Pairing] = []

        for p in range(variables.max_pairings):
            if not solver.Value(variables.pairing_used[p]):
                continue

            # Collect flights assigned to this pairing, grouped by duty
            duty_flights: dict[int, list[int]] = {}
            for k in range(variables.max_duties):
                dk = (p, k)
                if dk not in variables.d:
                    continue
                if not solver.Value(variables.d[dk]):
                    continue
                duty_flights[k] = []
                for f in range(n):
                    fk = (f, p, k)
                    if fk in variables.flight_in_duty and solver.Value(
                        variables.flight_in_duty[fk]
                    ):
                        duty_flights[k].append(f)

            if not duty_flights:
                continue

            # Build duties
            duties: list[PairingDuty] = []
            total_seg_count = 0
            total_flt_min = 0

            for k in sorted(duty_flights.keys()):
                flt_indices = duty_flights[k]
                if not flt_indices:
                    continue

                # Sort flights within duty by departure time
                flt_indices.sort(
                    key=lambda fi: flights[fi].sch_dep_dt_utc
                )

                segments: list[PairingSegment] = []
                duty_flt_min = 0

                for seq, fi in enumerate(flt_indices, start=1):
                    flt = flights[fi]
                    segments.append(
                        PairingSegment(
                            seg_seq=seq,
                            flt_id=flt.id,
                            flt_dt=flt.flt_dt,
                            flt_num=flt.flt_num,
                            airline=flt.airline,
                            dep_arp=flt.dep_arp,
                            arv_arp=flt.arv_arp,
                            fleet_seg=flt.fleet,
                            sch_str_dt_utc=flt.sch_dep_dt_utc,
                            sch_end_dt_utc=flt.sch_arv_dt_utc,
                            seg_assignment="DH" if flt.is_deadhead else "OPR",
                        )
                    )
                    duty_flt_min += flt.blk_min

                total_seg_count += len(segments)
                total_flt_min += duty_flt_min

                # Duty times
                first_flt = flights[flt_indices[0]]
                last_flt = flights[flt_indices[-1]]
                brief = settings.default_brief_minutes
                debrief = settings.default_debrief_minutes

                duty_str = first_flt.sch_dep_dt_utc - timedelta(minutes=brief)
                duty_end = last_flt.sch_arv_dt_utc + timedelta(minutes=debrief)
                duty_min = int((duty_end - duty_str).total_seconds() / 60)

                # FDP = from report to release
                fdp_min = int(
                    (last_flt.sch_arv_dt_utc - first_flt.sch_dep_dt_utc).total_seconds() / 60
                ) + brief + debrief

                duties.append(
                    PairingDuty(
                        duty_seq=len(duties) + 1,
                        duty_str_arp=first_flt.dep_arp,
                        duty_end_arp=last_flt.arv_arp,
                        duty_sch_str_dt_utc=duty_str,
                        duty_sch_end_dt_utc=duty_end,
                        duty_brief_min=brief,
                        duty_debrief_min=debrief,
                        duty_sch_duty_min=duty_min,
                        duty_sch_fdp_min=fdp_min,
                        duty_sch_flt_min=duty_flt_min,
                        duty_sch_rest_min=0,  # filled below
                        segments=segments,
                    )
                )

            if not duties:
                continue

            # Calculate rest between duties
            for i in range(len(duties) - 1):
                rest = int(
                    (
                        duties[i + 1].duty_sch_str_dt_utc
                        - duties[i].duty_sch_end_dt_utc
                    ).total_seconds()
                    / 60
                )
                duties[i].duty_sch_rest_min = rest

            # Build pairing
            pairing_start = duties[0].duty_sch_str_dt_utc
            pairing_end = duties[-1].duty_sch_end_dt_utc
            tafb = int((pairing_end - pairing_start).total_seconds() / 60)
            duration_days = (pairing_end.date() - pairing_start.date()).days + 1

            # Determine base and fleet from first flight
            first_flight = flights[duty_flights[sorted(duty_flights.keys())[0]][0]]
            base = first_flight.dep_arp if first_flight.dep_arp in base_airports else (
                base_airports[0] if base_airports else first_flight.dep_arp
            )

            pairings.append(
                Pairing(
                    pairing_label=f"PO-{len(pairings) + 1:04d}",
                    base=base,
                    fleet=first_flight.fleet,
                    sch_str_dt_utc=pairing_start,
                    sch_end_dt_utc=pairing_end,
                    duration_days=duration_days,
                    tafb=tafb,
                    duty_count=len(duties),
                    seg_count=total_seg_count,
                    duties=duties,
                )
            )

        logger.info("Extracted %d pairings from solution", len(pairings))
        return pairings
