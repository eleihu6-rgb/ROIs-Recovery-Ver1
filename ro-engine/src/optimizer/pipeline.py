# src/optimizer/pipeline.py
"""AllocationPipeline — orchestrates all RO optimization stages.

Input sections (from input.gz):
  JOB_PARAMS, RULE_CONFIG_META, RULES,
  CREWS, CREW_QUALIFICATIONS, CREW_FTL_STATE, LOCKED_ASSIGNMENTS,
  PAIRINGS, PAIRING_DUTIES, PAIRING_COMPOSITIONS

Output sections (to out.gz):
  RESULT_META, KPI, ASSIGNMENTS
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from typing import Callable

from src.algorithm.cpsat_polish import polish
from src.algorithm.eligibility import build_eligibility
from src.algorithm.lagrangian import LagrangianResult, run_lagrangian
from src.algorithm.primal_recovery import Assignment, recover_primal
from src.constraints.compiler import FTLCompiler
from src.models.crew import Crew, LockedAssignment
from src.models.pairing import Pairing, PairingComposition, PairingDuty
from src.models.rule_config import ResolvedRule, RuleConfig, RuleGroup
from src.utils.progress import progress


class AllocationPipeline:
    """Orchestrates all RO optimization stages from parsed input sections to output sections."""

    def run(
        self,
        sections: dict[str, list[dict]],
        is_stop: Callable[[], bool] = lambda: False,
    ) -> dict[str, list[dict]]:
        start = time.monotonic()
        job = sections.get("JOB_PARAMS", [{}])[0]
        time_limit = float(job.get("time_limit_sec", 300))

        # Stage 1: Compile FTL constraints
        progress("loading", 2, "Compiling FTL constraints")
        rule_config = _parse_rule_config(sections)
        ftl = FTLCompiler().compile(rule_config, job)

        # Stage 2: Parse crews
        progress("loading", 5, "Parsing crews")
        crews = _parse_crews(sections)

        # Stage 3: Parse pairings
        n_pairing_rows = len(sections.get("PAIRINGS", []))
        progress("loading", 8, f"Parsing {n_pairing_rows} pairings")
        pairings = _parse_pairings(sections)

        progress("loading", 10, f"Loaded {len(crews)} crews, {len(pairings)} pairings")

        if not pairings:
            return _make_output([], crews, pairings, 0.0, "INFEASIBLE", "No pairings found", None)

        if not crews:
            return _make_output([], crews, pairings, 0.0, "INFEASIBLE", "No crews found", None)

        # Stage 4: Eligibility pre-filter
        progress("eligibility", 12, "Building eligibility index")
        eligibility = build_eligibility(crews, pairings, ftl)

        # Stage 5: Lagrangian relaxation (~60% of time budget)
        lag_budget = time_limit * 0.60
        lag_params = dict(job)
        lag_params["time_limit_sec"] = lag_budget
        progress("lagrangian", 15, f"Starting Lagrangian ({lag_budget:.0f}s budget)")
        lag_result = run_lagrangian(crews, pairings, eligibility, ftl, lag_params, is_stop)

        # Stage 6: Primal recovery
        progress("primal_recovery", 75, "Recovering primal solution")
        assignments = recover_primal(
            crews, pairings, lag_result.selected_by_crew, lag_result.lambdas, ftl
        )
        progress("primal_recovery", 82, f"Primal recovery: {len(assignments)} assignments")

        # Stage 7: CP-SAT polish (use remaining budget × 0.85)
        elapsed = time.monotonic() - start
        remaining = time_limit - elapsed
        if not is_stop() and remaining > 5:
            polish_budget = remaining * 0.85
            progress("cpsat_polish", 84, f"CP-SAT polish ({polish_budget:.0f}s budget)")
            assignments = polish(assignments, crews, pairings, ftl, polish_budget, is_stop)

        elapsed = time.monotonic() - start
        status = _determine_status(assignments, pairings, elapsed, time_limit)
        progress("done", 98, f"status={status}, assignments={len(assignments)}")

        return _make_output(assignments, crews, pairings, elapsed, status, "", lag_result)


# ---------------------------------------------------------------------------
# Section parsers
# ---------------------------------------------------------------------------

def _parse_rule_config(sections: dict) -> RuleConfig:
    meta_rows = sections.get("RULE_CONFIG_META", [{}])
    meta = meta_rows[0] if meta_rows else {}
    group = RuleGroup(
        id=1,
        group_code=meta.get("group_code", "CAAC_FTL"),
        name=meta.get("group_name", meta.get("name", "CAAC FTL")),
        usage=meta.get("usage", "RO"),
        filiale=meta.get("filiale", ""),
        division=meta.get("division", "P"),
        is_default=True,
    )
    rules: list[ResolvedRule] = []
    for row in sections.get("RULES", []):
        params = json.loads(row.get("params_json", "{}"))
        rules.append(ResolvedRule(
            template_code=row["template_code"],
            instance_code=row["instance_code"],
            name=row.get("name", ""),
            category=row.get("category", ""),
            check_type=row.get("check_type", "CHECK"),
            severity=row.get("severity", "ERROR"),
            overridable=row.get("overridable", "false").lower() == "true",
            constraint_type=row.get("constraint_type") or None,
            params=params,
        ))
    return RuleConfig(group=group, rules=rules)


def _parse_crews(sections: dict) -> list[Crew]:
    # Fleet and airport qualifications indexed by crew_id
    fleet_quals: dict[str, list[str]] = {}
    airport_quals: dict[str, list[str]] = {}
    for row in sections.get("CREW_QUALIFICATIONS", []):
        cid = row["crew_id"]
        qual_type = row.get("qual_type", "FLEET").upper()
        qual_code = row.get("qual_code", row.get("fleet_code", ""))
        if not qual_code:
            continue
        if qual_type == "AIRPORT":
            airport_quals.setdefault(cid, []).append(qual_code)
        else:
            fleet_quals.setdefault(cid, []).append(qual_code)

    # FTL state indexed by crew_id
    ftl_state: dict[str, dict] = {
        row["crew_id"]: row for row in sections.get("CREW_FTL_STATE", [])
    }

    # Locked assignments indexed by crew_id
    locked_map: dict[str, list[LockedAssignment]] = {}
    for row in sections.get("LOCKED_ASSIGNMENTS", []):
        cid = row["crew_id"]
        locked_map.setdefault(cid, []).append(LockedAssignment(
            crew_id=cid,
            entry_type=row.get("entry_type", "LEAVE"),
            ref_id=row.get("ref_id", ""),
            start_min=int(row["start_min"]),
            end_min=int(row["end_min"]),
            flt_min=int(row.get("flt_min", 0)),
        ))

    crews: list[Crew] = []
    for row in sections.get("CREWS", []):
        cid = row["crew_id"]
        fs = ftl_state.get(cid, {})
        primary_fleet = row.get("fleet", "")
        # Ensure crew's primary fleet is in their fleet_codes even if no qual row
        quals = fleet_quals.get(cid)
        if quals is None:
            quals = [primary_fleet] if primary_fleet else []
        crews.append(Crew(
            crew_id=cid,
            first_name=row.get("first_name", ""),
            last_name=row.get("last_name", ""),
            division=row["division"],
            rank=row["rank"],
            base=row["base"],
            fleet=primary_fleet,
            team=row.get("team", ""),
            status=int(row.get("status", 1)),
            filiale=row.get("filiale", ""),
            fleet_codes=quals,
            airport_quals=airport_quals.get(cid, []),
            month_flt_min_used=int(fs.get("month_flt_min_used", 0)),
            quarter_flt_min_used=int(fs.get("quarter_flt_min_used", 0)),
            year_flt_min_used=int(fs.get("year_flt_min_used", 0)),
            last_duty_end_min=int(fs.get("last_duty_end_min", 0)),
            last_rest_end_min=int(fs.get("last_rest_end_min", 0)),
            consecutive_duty_days=int(fs.get("consecutive_duty_days", 0)),
            locked=locked_map.get(cid, []),
        ))
    return crews


def _parse_pairings(sections: dict) -> list[Pairing]:
    # Duties indexed by pairing_id
    duties_map: dict[int, list[PairingDuty]] = {}
    for row in sections.get("PAIRING_DUTIES", []):
        pid = int(row["pairing_id"])
        duties_map.setdefault(pid, []).append(PairingDuty(
            duty_seq=int(row["duty_seq"]),
            duty_start_min=int(row["duty_start_min"]),
            duty_end_min=int(row["duty_end_min"]),
            fdp_min=int(row["fdp_min"]),
            flt_min=int(row["flt_min"]),
            rest_after_min=int(row.get("rest_after_min", 0)),
        ))
    for duties in duties_map.values():
        duties.sort(key=lambda d: d.duty_seq)

    # Compositions indexed by pairing_id
    comps_map: dict[int, list[PairingComposition]] = {}
    for row in sections.get("PAIRING_COMPOSITIONS", []):
        pid = int(row["pairing_id"])
        comps_map.setdefault(pid, []).append(PairingComposition(
            rank=row["rank"],
            required_count=int(row["required_count"]),
        ))

    pairings: list[Pairing] = []
    for row in sections.get("PAIRINGS", []):
        pid = int(row["pairing_id"])
        pairings.append(Pairing(
            pairing_id=pid,
            pairing_label=row.get("pairing_label", f"P{pid:05d}"),
            division=row["division"],
            base=row["base"],
            fleet=row.get("fleet", ""),
            start_min=int(row["start_min"]),
            end_min=int(row["end_min"]),
            tafb_min=int(row["tafb_min"]),
            total_flt_min=int(row["total_flt_min"]),
            duty_count=int(row.get("duty_count", 0)),
            seg_count=int(row.get("seg_count", 0)),
            duties=duties_map.get(pid, []),
            compositions=comps_map.get(pid, []),
        ))
    return pairings


# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------

def _determine_status(
    assignments: list[Assignment],
    pairings: list[Pairing],
    elapsed: float,
    time_limit: float,
) -> str:
    if not pairings:
        return "INFEASIBLE"

    covered_by_pid: dict[int, dict[str, int]] = {}
    for a in assignments:
        covered_by_pid.setdefault(a.pairing_id, {})[a.acting_rank] = (
            covered_by_pid.setdefault(a.pairing_id, {}).get(a.acting_rank, 0) + 1
        )

    fully_covered = sum(
        1 for p in pairings
        if all(
            covered_by_pid.get(p.pairing_id, {}).get(c.rank, 0) >= c.required_count
            for c in p.compositions
        )
    )
    coverage_pct = fully_covered / len(pairings) * 100

    if coverage_pct >= 99.0:
        return "DONE"
    if elapsed >= time_limit * 0.95:
        return "TIMEOUT"
    return "INFEASIBLE"


def _make_output(
    assignments: list[Assignment],
    crews: list[Crew],
    pairings: list[Pairing],
    elapsed: float,
    status: str,
    error_msg: str,
    lag_result: LagrangianResult | None,
) -> dict[str, list[dict]]:
    covered_by_pid: dict[int, dict[str, int]] = {}
    for a in assignments:
        d = covered_by_pid.setdefault(a.pairing_id, {})
        d[a.acting_rank] = d.get(a.acting_rank, 0) + 1

    fully_covered = sum(
        1 for p in pairings
        if all(
            covered_by_pid.get(p.pairing_id, {}).get(c.rank, 0) >= c.required_count
            for c in p.compositions
        )
    )
    coverage_pct = (fully_covered / len(pairings) * 100) if pairings else 0.0
    pairing_flt: dict[int, int] = {p.pairing_id: p.total_flt_min for p in pairings}
    total_flt_min = sum(pairing_flt.get(a.pairing_id, 0) for a in assignments)

    result_meta = [{
        "status": status,
        "solve_time_sec": f"{elapsed:.2f}",
        "total_assignments": str(len(assignments)),
        "total_pairings": str(len(pairings)),
        "total_crews": str(len(crews)),
        "total_iterations": str(lag_result.total_iterations) if lag_result else "0",
        "dual_bound": f"{lag_result.dual_bound:.4f}" if lag_result else "0.0000",
        "primal_obj": f"{lag_result.best_primal_profit:.4f}" if lag_result else "0.0000",
        "error": error_msg,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }]
    kpi = [{
        "total_pairings": str(len(pairings)),
        "fully_covered": str(fully_covered),
        "coverage_pct": f"{coverage_pct:.1f}",
        "total_crews": str(len(crews)),
        "total_assignments": str(len(assignments)),
        "total_flt_min": str(total_flt_min),
    }]
    assignment_rows = [
        {
            "crew_id": a.crew_id,
            "pairing_id": str(a.pairing_id),
            "acting_rank": a.acting_rank,
            "base_match": "1" if a.base_match else "0",
        }
        for a in assignments
    ]
    return {
        "RESULT_META": result_meta,
        "KPI": kpi,
        "ASSIGNMENTS": assignment_rows,
    }
