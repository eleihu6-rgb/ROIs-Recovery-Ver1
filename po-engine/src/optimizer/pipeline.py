"""Pipeline orchestrator — runs all optimization stages from parsed input sections to output sections."""
import json
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Callable

from src.models.flight import Flight
from src.models.rule_config import RuleConfig, RuleGroup, ResolvedRule
from src.constraints.compiler import ConstraintCompiler, CompiledConstraints
from src.algorithm.flight_network import build_connection_graph
from src.algorithm.duty_generator import DutyCandidate, generate_duties, generate_duties_parallel
from src.algorithm.pairing_generator import PairingCandidate, generate_pairings
from src.algorithm.mip_solver import (
    SolverResult,
    solve_set_partitioning,
    solve_set_partitioning_with_cg,
)
from src.utils.progress import progress

MAX_CANDIDATES = 50_000
PARALLEL_DUTY_THRESHOLD = 200   # flights above this use parallel duty generation
CG_THRESHOLD = 5_000            # candidates above this use column generation


class OptimizationPipeline:
    """Orchestrates all optimization stages from parsed sections → output sections."""

    def run(
        self,
        sections: dict[str, list[dict]],
        is_stop_requested: Callable[[], bool] = lambda: False,
    ) -> dict[str, list[dict]]:
        job = sections["JOB_PARAMS"][0]
        time_limit = int(job.get("time_limit_sec", 300))
        t_start = time.monotonic()
        base_airports = [a.strip() for a in job.get("base_airports", "PEK").split(",")]
        weights = {
            "w_pairings": float(job.get("w_pairings", 1000)),
            "w_deadhead": float(job.get("w_deadhead", 500)),
            "w_duty_time": float(job.get("w_duty_time", 1)),
            "w_penalty": float(job.get("w_penalty", 100)),
        }

        # Phase time budgets (P2)
        t_duty_gen = min(time_limit * 0.20, 60.0)
        t_pairing_gen = min(time_limit * 0.20, 60.0)

        # Stage 1: Parse flights
        progress("loading", 5, f"Parsing {len(sections.get('FLIGHTS', []))} flights")
        flights = [self._parse_flight(row) for row in sections.get("FLIGHTS", [])]
        flights_by_id = {f.id: f for f in flights}

        # Stage 2: Compile constraints
        progress("compiling", 10, "Compiling rule constraints")
        rule_config = self._parse_rule_config(sections)
        op_params: dict[str, object] = {
            row["param_key"]: row["param_value"]
            for row in sections.get("OPERATIONAL_PARAMS", [])
        }
        cc = ConstraintCompiler().compile(rule_config, base_airports, op_params)

        # Stage 3: Build flight network
        progress("building_graph", 20, f"Building connection graph for {len(flights)} flights")
        graph = build_connection_graph(flights, cc)

        # Stage 4: Generate duty candidates (parallel for large flight sets)
        progress("generating_duties", 35, "Generating duty candidates")
        duty_deadline = time.monotonic() + t_duty_gen
        if len(flights) >= PARALLEL_DUTY_THRESHOLD:
            duties = generate_duties_parallel(flights, graph, cc, deadline=duty_deadline)
        else:
            duties = generate_duties(flights, graph, cc, deadline=duty_deadline)
        progress("generating_duties", 50, f"Generated {len(duties)} duty candidates")

        # Stage 5: Generate pairing candidates (with deadline)
        progress("generating_pairings", 60, "Generating pairing candidates")
        pairing_deadline = time.monotonic() + t_pairing_gen
        pairings = generate_pairings(duties, cc, deadline=pairing_deadline)
        progress("generating_pairings", 70, f"Generated {len(pairings)} pairing candidates")

        # Candidate pool pruning: trim if > MAX_CANDIDATES before entering MIP (P2)
        if len(pairings) > MAX_CANDIDATES:
            progress("pruning", 72, f"Pruning {len(pairings)} → {MAX_CANDIDATES} candidates")
            pairings = _prune_candidates(pairings, weights)
            progress("pruning", 74, f"Pruned to {len(pairings)} candidates")

        # Compute remaining MIP budget (at least 30s, reserve 5s for output writing)
        elapsed = time.monotonic() - t_start
        mip_budget = max(time_limit - elapsed - 5, 30.0)
        if is_stop_requested():
            mip_budget = 1.0  # SIGTERM — give CBC 1 second to return current best

        # Stage 6: Solve set partitioning (strategy depends on candidate pool size)
        all_flight_ids = [f.id for f in flights]
        if len(pairings) > CG_THRESHOLD:
            progress("solving", 75, f"Solving via column generation ({len(pairings)} candidates, "
                                    f"{len(flights)} flights)")
            solver_result = solve_set_partitioning_with_cg(
                pairings, all_flight_ids, weights, int(mip_budget)
            )
        else:
            progress("solving", 75, f"Solving MIP ({len(pairings)} candidates, {len(flights)} flights)")
            solver_result = solve_set_partitioning(pairings, all_flight_ids, weights, int(mip_budget))
        progress("solving", 90, f"MIP done: status={solver_result.status}, "
                                f"pairings={len(solver_result.selected_pairings)}")

        # Stage 7: Build output sections
        progress("extracting", 95, "Building output sections")
        return _build_output_sections(job, flights, flights_by_id, duties, cc, solver_result)

    @staticmethod
    def _parse_flight(row: dict) -> Flight:
        return Flight(
            id=int(row["id"]),
            airline=row["airline"],
            flt_dt=row["flt_dt"],
            flt_num=row["flt_num"],
            dep_arp=row["dep_arp"],
            arv_arp=row["arv_arp"],
            sch_dep_dt_utc=datetime.fromisoformat(row["sch_dep_dt_utc"].replace("Z", "+00:00")),
            sch_arv_dt_utc=datetime.fromisoformat(row["sch_arv_dt_utc"].replace("Z", "+00:00")),
            blk_min=int(row["blk_min"]),
            fleet=row["fleet"],
            flt_type=row.get("flt_type", "J"),
            seg_type=row.get("seg_type") or None,
            is_locked=int(row.get("is_locked", 0)),
        )

    @staticmethod
    def _parse_rule_config(sections: dict) -> RuleConfig:
        meta_rows = sections.get("RULE_CONFIG_META", [{}])
        meta = meta_rows[0] if meta_rows else {}
        group = RuleGroup(
            id=1,
            group_code=meta.get("group_code", "CAAC_FTL"),
            name=meta.get("group_name", "CAAC FTL"),
            usage=meta.get("usage", "PO"),
            filiale=meta.get("filiale", "F8"),
            division=meta.get("division", "P"),
            is_default=True,
        )
        rules = []
        for row in sections.get("RULES", []):
            params = json.loads(row.get("params_json", "{}"))
            rules.append(ResolvedRule(
                template_code=row["template_code"],
                instance_code=row["instance_code"],
                name=row["name"],
                category=row["category"],
                check_type=row["check_type"],
                severity=row["severity"],
                overridable=row.get("overridable", "false").lower() == "true",
                constraint_type=row.get("constraint_type"),
                params=params,
            ))
        return RuleConfig(group=group, rules=rules)


# ── Candidate pruning (P2) ────────────────────────────────────────────────────

def _prune_candidates(
    candidates: list[PairingCandidate],
    weights: dict[str, float],
    target: int = MAX_CANDIDATES,
) -> list[PairingCandidate]:
    """
    Trim candidate pool to `target` size while ensuring each flight retains
    at least MIN_COVERAGE candidates (to preserve MIP feasibility).
    Candidates are sorted cheapest-first before selection.
    """
    MIN_COVERAGE = 3
    w1 = float(weights.get("w_pairings", 1000))
    w3 = float(weights.get("w_duty_time", 1))

    # Sort by approximate cost (use only deterministic scalar fields)
    scored = sorted(candidates, key=lambda p: w1 + w3 * p.total_duty_minutes)

    kept: list[PairingCandidate] = []
    coverage: dict[int, int] = defaultdict(int)

    for p in scored:
        # Keep if still under hard limit, or if a flight still needs coverage
        if len(kept) >= target and all(coverage[fid] >= MIN_COVERAGE for fid in p.flight_ids):
            continue
        kept.append(p)
        for fid in p.flight_ids:
            coverage[fid] += 1
        if len(kept) >= int(target * 1.2):  # allow 20% slack to finish coverage pass
            break

    return kept


# ── Output section builder ────────────────────────────────────────────────────

def _build_output_sections(
    job: dict,
    flights: list[Flight],
    flights_by_id: dict[int, Flight],
    duties: list[DutyCandidate],
    cc: CompiledConstraints,
    solver_result: SolverResult,
) -> dict[str, list[dict]]:
    selected = solver_result.selected_pairings
    fleet = job.get("fleet", "")
    division = job.get("division", "P")

    # ── RESULT_META ──────────────────────────────────────────────────────────
    result_meta = [{
        "workset_id": job.get("workset_id", ""),
        "run_id": job.get("run_id", ""),
        "engine": job.get("engine", "po"),
        "airline": job.get("airline", ""),
        "status": solver_result.status,
        "solver_status": solver_result.solver_status,
        "solve_time_sec": f"{solver_result.solve_time_sec:.2f}",
        "writeback_scenario_id": "",
    }]

    # ── KPI (key-value rows) ─────────────────────────────────────────────────
    coverage = (len(solver_result.covered_flight_ids) / len(flights) * 100) if flights else 0.0
    total_deadheads = sum(p.deadhead_count for p in selected)
    all_duty_fdps = [duties[i].fdp_minutes for p in selected for i in p.duty_ids]
    avg_duty_min = sum(all_duty_fdps) / len(all_duty_fdps) if all_duty_fdps else 0.0
    avg_tafb_min = sum(p.tafb_minutes for p in selected) / len(selected) if selected else 0.0

    kpi_rows = [
        ("total_flights",   str(len(flights)),                                 "count"),
        ("total_pairings",  str(len(selected)),                                "count"),
        ("coverage_pct",    f"{coverage:.1f}",                                 "pct"),
        ("total_deadheads", str(total_deadheads),                              "count"),
        ("avg_duty_min",    f"{avg_duty_min:.1f}",                             "minutes"),
        ("avg_tafb_min",    f"{avg_tafb_min:.1f}",                             "minutes"),
        ("total_flt_min",   str(sum(p.total_flt_minutes for p in selected)),   "minutes"),
        ("solve_time_sec",  f"{solver_result.solve_time_sec:.2f}",             "seconds"),
    ]
    kpi = [{"metric_name": k, "metric_value": v, "metric_unit": u} for k, v, u in kpi_rows]

    # ── PAIRINGS, DUTIES, SEGMENTS ───────────────────────────────────────────
    pairing_rows: list[dict] = []
    duty_rows: list[dict] = []
    segment_rows: list[dict] = []

    brief = timedelta(minutes=cc.brief_minutes)
    debrief = timedelta(minutes=cc.debrief_minutes)

    for pairing_seq, pairing in enumerate(selected, start=1):
        pairing_duties = [duties[i] for i in pairing.duty_ids]
        first_duty = pairing_duties[0]
        last_duty = pairing_duties[-1]

        sch_str = (first_duty.duty_start_utc - brief).isoformat()
        sch_end = (last_duty.duty_end_utc + debrief).isoformat()
        duration_days = (last_duty.duty_end_utc.date() - first_duty.duty_start_utc.date()).days + 1
        seg_count = sum(len(d.flight_ids) for d in pairing_duties)

        pairing_rows.append({
            "pairing_id":     str(pairing_seq),
            "pairing_label":  f"PO-{pairing_seq:04d}",
            "base":           pairing.dep_arp,
            "fleet":          fleet,
            "division":       division,
            "sch_str_dt_utc": sch_str,
            "sch_end_dt_utc": sch_end,
            "duration_days":  str(duration_days),
            "tafb_minutes":   str(pairing.tafb_minutes),
            "duty_count":     str(len(pairing_duties)),
            "seg_count":      str(seg_count),
            "source":         "PO",
        })

        for duty_seq, duty in enumerate(pairing_duties, start=1):
            # rest between this duty and the next (0 for the last duty)
            if duty_seq < len(pairing_duties):
                next_duty = pairing_duties[duty_seq]   # duty_seq is 1-based → next index is duty_seq
                rest_after = int((next_duty.duty_start_utc - duty.duty_end_utc).total_seconds() / 60)
            else:
                rest_after = 0

            duty_rows.append({
                "pairing_id":         str(pairing_seq),
                "duty_seq":           str(duty_seq),
                "dep_arp":            duty.dep_arp,
                "arv_arp":            duty.arv_arp,
                "duty_start_utc":     (duty.duty_start_utc - brief).isoformat(),
                "duty_end_utc":       (duty.duty_end_utc + debrief).isoformat(),
                "flt_minutes":        str(duty.flt_minutes),
                "fdp_minutes":        str(duty.fdp_minutes),
                "rest_after_minutes": str(rest_after),
            })

            for seg_seq, flt_id in enumerate(duty.flight_ids, start=1):
                flt = flights_by_id[flt_id]
                segment_rows.append({
                    "pairing_id":    str(pairing_seq),
                    "duty_seq":      str(duty_seq),
                    "seg_seq":       str(seg_seq),
                    "flt_id":        str(flt.id),
                    "flt_num":       flt.flt_num,
                    "dep_arp":       flt.dep_arp,
                    "arv_arp":       flt.arv_arp,
                    "sch_dep_dt_utc": flt.sch_dep_dt_utc.isoformat(),
                    "sch_arv_dt_utc": flt.sch_arv_dt_utc.isoformat(),
                })

    return {
        "RESULT_META": result_meta,
        "KPI":         kpi,
        "PAIRINGS":    pairing_rows,
        "DUTIES":      duty_rows,
        "SEGMENTS":    segment_rows,
    }
