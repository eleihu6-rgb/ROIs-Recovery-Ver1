"""CLI: build ro_input.txt (and optional gz) from PostgreSQL."""
from __future__ import annotations

import argparse
import gzip
import json
import logging
import os
import sys
from concurrent.futures import ThreadPoolExecutor

from . import context, db, registry

logger = logging.getLogger(__name__)

# Section queries are independent once the shared context sets are computed, so we
# run them concurrently — the same trick live-server's buildRoInputGz uses
# (Promise.all). Over the remote WAN PG this turns a ~40-section sequential build
# (sum of per-section round-trips, minutes) into ~max-section wall-clock. Each
# worker gets its OWN psycopg2 connection (connections are not thread-safe); the
# shared ctx cache is pre-warmed first so workers only READ it.
_BUILD_CONCURRENCY = int(os.environ.get("RO_BUILD_CONCURRENCY", "10"))


def _prewarm_context(conn, ctx) -> None:
    """Compute every cached context set ONCE on a single connection so the parallel
    section workers only read ctx['_cache'] (never lazily query off their own conn)."""
    context.get_scenario(conn, ctx)
    context.scenario_crew_ids(conn, ctx)
    context.flight_pool_ids(conn, ctx)
    context.flight_section_ids(conn, ctx)
    context.pairing_ids(conn, ctx)
    context.cof_crew_ids(conn, ctx)
    context.scenario_airports(conn, ctx)


def _run_sections_parallel(specs, ctx, airline, db_url) -> list[str]:
    """Run each section on its own PG connection, concurrently, preserving order."""
    def _one(spec) -> str:
        c = db.connect(airline, db_url)
        try:
            return registry.run_section(c, spec, ctx)
        finally:
            c.close()

    workers = max(1, min(_BUILD_CONCURRENCY, len(specs)))
    with ThreadPoolExecutor(max_workers=workers) as ex:
        return list(ex.map(_one, specs))  # ex.map preserves input order


def build(airline: str, scenario: int, out_path: str,
          registry_name: str = "p1", gz_path: str | None = None,
          db_url: str | None = None) -> None:
    specs = {"p1": registry.p1_registry, "p2": registry.p2_registry,
             "p3": registry.p3_registry, "p4": registry.p4_registry,
             "p5": registry.p5_registry, "p6": registry.p6_registry,
             "p7": registry.p7_registry, "full": registry.full_registry}[registry_name]()
    conn = db.connect(airline, db_url)
    ctx = {"airline": airline, "scenario": scenario}
    try:
        _prewarm_context(conn, ctx)
        parts = _run_sections_parallel(specs, ctx, airline, db_url)
    finally:
        conn.close()
    text = "".join(parts)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(text)
    if gz_path:
        with gzip.open(gz_path, "wb") as f:
            f.write(text.encode("utf-8"))


def scenario_crew_ids(airline: str, scenario: int,
                      db_url: str | None = None) -> list[str]:
    """Return the raw crew_id values a scenario covers (its filter.crew scope over
    base/fleet/division within the window) — the SAME set the ro_input Crew section
    is built from. Used at run kick-off to request a scenario-scoped crew-bid package
    so the solver's preference CSVs match the optimized roster crew.

    crew_id is returned verbatim (no int-normalization) so it matches pbs_bid.crew_id.
    """
    conn = db.connect(airline, db_url)
    ctx = {"airline": airline, "scenario": scenario}
    try:
        return [str(x) for x in context.scenario_crew_ids(conn, ctx)]
    finally:
        conn.close()


def scenario_pairing_window(airline: str, scenario: int,
                            db_url: str | None = None) -> tuple[str, str] | None:
    """Return the scenario's (start, end) local calendar dates as YYYY-MM-DD strings.

    Used at run kick-off to bound the scenario-scoped PAIRING_SCORE bid package to the
    scenario's own date range (pbs-server then pads ±7d) instead of scoring bids against
    every live pairing across all months. Returns None when the window is unresolved so
    the caller simply omits the date filter (crew-only scope).
    """
    conn = db.connect(airline, db_url)
    ctx = {"airline": airline, "scenario": scenario}
    try:
        sc = context.get_scenario(conn, ctx)
        start, end = sc.get("start"), sc.get("end")
        if start is None or end is None:
            return None
        return (start.date().isoformat(), end.date().isoformat())
    except Exception:  # noqa: BLE001 — window lookup is best-effort
        return None
    finally:
        conn.close()


def scenario_crew_division(airline: str, scenario: int,
                           db_url: str | None = None) -> str | None:
    """Return the scenario's workset-owned crew division code (e.g. 'P' pilot,
    'C' cabin), or None when unset.

    The pbs-engine solver filters crews by ``problem.crew_type`` (== crew division); the
    deploy experiment hardcodes 'P', so a cabin-crew (division 'C') scenario would
    otherwise be filtered to 0 crews and fail. The engine passes this through to
    ``ro_rust.sh`` (RO_CREW_TYPE) so each scenario solves its OWN division — zero code
    per new division, per the parameterization rule.
    """
    conn = db.connect(airline, db_url)
    ctx = {"airline": airline, "scenario": scenario}
    try:
        return context.scenario_division(conn, ctx)
    except Exception:  # noqa: BLE001 — best-effort; caller defaults to pilot 'P'
        return None
    finally:
        conn.close()


def scenario_workset_id(airline: str, scenario: int,
                        db_url: str | None = None) -> int | None:
    """Resolve the workset id for the SCENARIO's ruleset — direct lookup via
    scenario.ruleset_id (bigint = workset.id, set at scenario creation).
    Returns None when unresolved (connector then keeps its 103 default).
    """
    conn = db.connect(airline, db_url)
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT ruleset_id FROM scenario WHERE id = %s",
            (scenario,),
        )
        row = cur.fetchone()
        cur.close()
        return int(row[0]) if row and row[0] is not None else None
    finally:
        conn.close()


def scenario_algorithm_parameters(airline: str, scenario: int,
                                  db_url: str | None = None,
                                  division: str | None = None) -> dict:
    """Return effective Algorithm Param settings from scenario_parameter.

    Mirrors live-server's scenario_parameter export contract: scenario_id=0 rows
    are templates/defaults; scenario rows store param_val.value overrides.
    """
    conn = db.connect(airline, db_url)
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT scenario_id, code, param_val
              FROM scenario_parameter
             WHERE scenario_id IN (0, %s)
             ORDER BY scenario_id, idx NULLS LAST, code
            """,
            (scenario,),
        )
        rows = cur.fetchall()
        cur.close()
    finally:
        conn.close()

    by_code: dict[str, dict] = {}
    for scenario_id, code, raw in rows:
        data = raw
        if isinstance(raw, str):
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                data = {}
        if not isinstance(data, dict):
            data = {}
        if int(scenario_id) == 0:
            by_code[str(code)] = data.get("defaultValue") if isinstance(data.get("defaultValue"), dict) else {}
        else:
            by_code[str(code)] = data.get("value") if isinstance(data.get("value"), dict) else {}

    division_code = str(division or "").strip().upper()
    if division_code == "P" or division_code.startswith("PILOT"):
        ranks = ("CA", "FO")
    elif division_code == "C" or division_code.startswith("CABIN"):
        ranks = ("IFD", "FA")
    else:
        ranks = ("CA", "FO", "IFD", "FA")
    default_credit_min = {"CA": 75.0, "FO": 80.0, "IFD": 80.0, "FA": 80.0}
    default_credit_max = {"CA": 92.0, "FO": 85.0, "IFD": 85.0, "FA": 85.0}
    weekdays = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
    credit = by_code.get("credit_range", {})
    credit_min = {
        rank: _positive_number((credit.get("min") or {}).get(rank)) or default_credit_min[rank]
        for rank in ranks
    }
    credit_max = {
        rank: _positive_number((credit.get("max") or {}).get(rank)) or default_credit_max[rank]
        for rank in ranks
    }

    floor_defaults = {
        "reserve_single_days": False,
        "reserve_day_balance": True,
        "avoid_pairing_bids": True,
        "requested_days_off": True,
        "avoid_reserve_bids": True,
        "avoid_reserve_line_rules": True,
        "award_reserve_and_commuter_blocks": True,
        "min_base_layover_bids": True,
    }
    floor_src = by_code.get("floor_rescue_rules", {})
    floor_rescue_rules = {
        key: floor_src[key] if isinstance(floor_src.get(key), bool) else default
        for key, default in floor_defaults.items()
    }

    prio_src = by_code.get("reserve_weekday_priority", {})
    reserve_weekday_priority = {}
    if all(_priority(prio_src.get(day)) is not None for day in weekdays):
        reserve_weekday_priority = {day: int(prio_src[day]) for day in weekdays}

    pct = _percent((by_code.get("min_reserve_covered_pct") or {}).get("pct"))
    if pct is None:
        pct = 0.0
    day_pressure = (by_code.get("day_pressure_spread") or {}).get("enabled") is True
    include_crew_bids = (by_code.get("crew_bids") or {}).get("enabled") is not False
    team_rules = by_code.get("team_rules", {})
    if not isinstance(team_rules.get("teams"), list) or not isinstance(team_rules.get("rules"), list):
        team_rules = {"teams": [], "rules": []}

    hydra_args: list[str] = []
    for side, values in (("max", credit_max), ("min", credit_min)):
        for rank, value in values.items():
            group = "pilot" if rank in ("CA", "FO") else "cabin"
            hydra_args.append(f"++solver.rank_groups.{group}.credit_targets.{rank}.{side}={value}")
    hydra_args.append(f"++solver.min_reserve_covered_percentage={pct}")
    for day in weekdays:
        if day in reserve_weekday_priority:
            hydra_args.append(f"++solver.reserve_weekday_priority.{day}={reserve_weekday_priority[day]}")
    if day_pressure:
        hydra_args.append("++solver.day_pressure_spread=true")

    return {
        "meta": {
            "credit_max": credit_max,
            "credit_min": credit_min,
            **({"reserve_weekday_priority": reserve_weekday_priority} if reserve_weekday_priority else {}),
            "min_reserve_covered_pct": pct,
            **({"day_pressure_spread": True} if day_pressure else {}),
            **({"team_rules": team_rules} if team_rules.get("teams") or team_rules.get("rules") else {}),
            "include_crew_bids": include_crew_bids,
        },
        "floor_rescue_rules": floor_rescue_rules,
        "hydra_args": hydra_args,
    }


_TEAM_RULE_MODES = ("only_do", "not_do")


def resolve_team_rules_for_solver(
    airline: str, scenario: int, team_rules: dict,
    db_url: str | None = None,
) -> list[dict]:
    """Convert stored team rules into the solver's TEAM_RULES.json ``rules`` list.

    The gantt already resolved each rule's pairing_ids and each team's crew_ids at
    save time; this helper re-checks them against the ACTUAL crew/pairing id sets the
    ro_input.txt was just built from (``context.scenario_crew_ids`` / ``pairing_ids``),
    so a filter or scope change since save cannot leak stale ids into the run.
    Disabled rules and rules naming a missing team are dropped — the same contract as
    the Report app's ``write_team_rules_file``. Returns the list for ``{"rules": [...]}``,
    or ``[]`` when nothing resolves (caller then writes no TEAM_RULES.json).

    Raises when the run-scope intersection cannot be resolved. The task manager catches
    that failure and continues the optimization without a solver Team Rules handoff.
    """
    src = team_rules if isinstance(team_rules, dict) else {}
    teams_by_id: dict[str, dict] = {}
    for raw in src.get("teams") or []:
        if not isinstance(raw, dict):
            continue
        tid = str(raw.get("id") or "").strip()
        tname = str(raw.get("name") or "").strip()
        if tid and tname and tid not in teams_by_id:
            teams_by_id[tid] = {
                "id": tid,
                "name": tname,
                "crew_ids": list(dict.fromkeys(str(x) for x in (raw.get("crew_ids") or []))),
            }

    raw_rules = src.get("rules") or []
    if not teams_by_id or not raw_rules:
        return []

    conn = db.connect(airline, db_url)
    ctx = {"airline": airline, "scenario": scenario}
    try:
        actual_crew = {str(x) for x in context.scenario_crew_ids(conn, ctx)}
        actual_pairing = {str(x) for x in context.pairing_ids(conn, ctx)}
    finally:
        conn.close()

    def _intersect(values, actual: set[str]) -> list[str]:
        return list(dict.fromkeys(str(v) for v in values if str(v) in actual))

    resolved: list[dict] = []
    for raw in raw_rules:
        if not isinstance(raw, dict) or raw.get("enabled") is False:
            continue
        rule_id = str(raw.get("id") or "").strip()
        mode = str(raw.get("mode") or "").strip()
        team = teams_by_id.get(str(raw.get("team_id") or "").strip())
        if not rule_id or mode not in _TEAM_RULE_MODES or team is None:
            continue
        resolved.append({
            "id": rule_id,
            "name": str(raw.get("name") or rule_id),
            "mode": mode,
            "team": {"id": team["id"], "name": team["name"]},
            "crew_ids": _intersect(team["crew_ids"], actual_crew),
            "pairing_ids": _intersect(raw.get("pairing_ids") or [], actual_pairing),
        })
    return resolved


def _positive_number(value) -> float | None:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    return n if n > 0 else None


def _percent(value) -> float | None:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    return n if 0 <= n <= 100 else None


def _priority(value) -> int | None:
    try:
        n = int(value)
    except (TypeError, ValueError):
        return None
    return n if 1 <= n <= 9 else None


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="F8.ro_input_builder")
    p.add_argument("--airline", required=True)
    p.add_argument("--scenario", type=int, required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--gz")
    p.add_argument("--registry", default="p1")
    p.add_argument("--db-url")
    a = p.parse_args(argv)
    build(a.airline, a.scenario, a.out, a.registry, a.gz, a.db_url)
    return 0


if __name__ == "__main__":
    sys.exit(main())
