"""Scenario filter loading + crew-id set computation for ro_input generation.

The scenario's base/fleet/rank/seniority/birthday scoping comes from
`scenario.filter_params` (JSON), its division comes from
`scenario.workset_id -> workset.division`, and its date scope comes from
`str_dt_loc`/`end_dt_loc`. Crew selection must stay aligned with live-server
`crewIdSet` so Gantt scope and optimizer `ro_input` use the same crew set.
Computed sets are cached on the ctx dict.
"""
from __future__ import annotations

import json
from datetime import timedelta

# Flight-pool buffer around the scenario window for the COF set (lead-in / lead-out).
_COF_LEAD_DAYS = 14
_COF_TAIL_DAYS = 9


def _cache(ctx) -> dict:
    return ctx.setdefault("_cache", {})


def _date_str(value) -> str | None:
    """YYYY-MM-DD from a non-empty string; blank/None → no bound (live dateStringOrNull)."""
    if isinstance(value, str) and value.strip():
        return value.strip()[:10]
    return None


def _number_or_null(value) -> float | None:
    if value is None or value == "":
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number else None  # NaN → None


def get_scenario(conn, ctx) -> dict:
    c = _cache(ctx)
    if "scenario" in c:
        return c["scenario"]
    sid = ctx["scenario"]
    cur = conn.cursor()
    cur.execute(
        """
        SELECT s.id, s.str_dt_loc, s.end_dt_loc, s.filter_params, w.division,
               s.ruleset_id
        FROM scenario s
        JOIN workset w ON w.id = s.workset_id
        WHERE s.id = %s
        """,
        (sid,),
    )
    row = cur.fetchone()
    cur.close()
    if row is None:
        raise ValueError(f"scenario {sid} not found")
    _id, start, end, fp, division, ruleset_id = row
    if isinstance(fp, str):
        fp = json.loads(fp)
    sc = {"id": _id, "start": start, "end": end, "filter": fp or {},
          "division": _normalize_division(division), "ruleset_id": ruleset_id}
    c["scenario"] = sc
    return sc


def _normalize_division(division) -> str | None:
    div = str(division).strip() if division is not None else ""
    return None if div in ("", "ALL") else div


def scenario_division(conn, ctx) -> str | None:
    """Return the scenario's workset-owned division."""
    return get_scenario(conn, ctx).get("division")


def scenario_ruleset_id(conn, ctx) -> int | None:
    """Return the ruleset/workset id selected on the scenario row."""
    raw = get_scenario(conn, ctx).get("ruleset_id")
    return int(raw) if raw is not None else None


def scenario_crew_ids(conn, ctx) -> list[str]:
    """Crew matching filter_params.crew (base/fleet/rank/seniority/birthday) plus
    workset division within the window. Parity with live-server `crewIdSet`.
    Returns the stored varchar crew_id values, ordered numerically."""
    c = _cache(ctx)
    if "scenario_crew_ids" in c:
        return c["scenario_crew_ids"]
    sc = get_scenario(conn, ctx)
    cf = sc["filter"].get("crew", {}) or {}
    bases = cf.get("bases") or []
    fleets = cf.get("fleets") or []
    ranks = cf.get("ranks") or []
    seniority = cf.get("seniority") or {}
    birthday = cf.get("birthday") or {}
    seniority_min = _number_or_null(seniority.get("min"))
    seniority_max = _number_or_null(seniority.get("max"))
    birthday_from = _date_str(birthday.get("from"))
    birthday_to = _date_str(birthday.get("to"))
    division = scenario_division(conn, ctx)
    base_clause = (
        """
          AND EXISTS (SELECT 1 FROM crew_base cb WHERE cb.crew_id = c.crew_id
                      AND cb.base = ANY(%(bases)s)
                      AND cb.eff_dt <= %(end)s
                      AND (cb.exp_dt >= %(start)s OR cb.exp_dt IS NULL))"""
        if bases else ""
    )
    fleet_clause = (
        """
          AND EXISTS (SELECT 1 FROM crew_fleet cf WHERE cf.crew_id = c.crew_id
                      AND cf.fleet_specific = ANY(%(fleets)s)
                      AND cf.eff_dt <= %(end)s
                      AND (cf.exp_dt >= %(start)s OR cf.exp_dt IS NULL))"""
        if fleets else ""
    )
    rank_clause = (
        """
          AND EXISTS (SELECT 1 FROM crew_rank cr WHERE cr.crew_id = c.crew_id
                      AND cr.rank = ANY(%(ranks)s)
                      AND cr.eff_dt <= %(end)s
                      AND (cr.exp_dt >= %(start)s OR cr.exp_dt IS NULL))"""
        if ranks else ""
    )
    seniority_clauses = []
    if seniority_min is not None:
        seniority_clauses.append(
            " AND c.seniority_num IS NOT NULL AND c.seniority_num >= %(seniority_min)s"
        )
    if seniority_max is not None:
        seniority_clauses.append(
            " AND c.seniority_num IS NOT NULL AND c.seniority_num <= %(seniority_max)s"
        )
    birthday_clauses = []
    if birthday_from:
        birthday_clauses.append(
            " AND c.birthday IS NOT NULL AND c.birthday::date >= %(birthday_from)s::date"
        )
    if birthday_to:
        birthday_clauses.append(
            " AND c.birthday IS NOT NULL AND c.birthday::date <= %(birthday_to)s::date"
        )
    cur = conn.cursor()
    cur.execute(
        f"""
        SELECT c.crew_id FROM crew c
        WHERE c.division = %(division)s
          {base_clause}
          {fleet_clause}
          {rank_clause}
          {''.join(seniority_clauses)}
          {''.join(birthday_clauses)}
        ORDER BY c.crew_id::bigint
        """,
        {
            "division": division,
            "bases": bases,
            "fleets": fleets,
            "ranks": ranks,
            "seniority_min": seniority_min,
            "seniority_max": seniority_max,
            "birthday_from": birthday_from,
            "birthday_to": birthday_to,
            "start": sc["start"],
            "end": sc["end"],
        },
    )
    ids = [r[0] for r in cur.fetchall()]
    cur.close()
    c["scenario_crew_ids"] = ids
    return ids


def flight_pool_ids(conn, ctx) -> list[int]:
    """Flight ids in scope: fleet in filter_params.crew.fleets, flt_dt within the
    buffered window, live (scenario_id=0), not deleted."""
    c = _cache(ctx)
    if "flight_pool_ids" in c:
        return c["flight_pool_ids"]
    sc = get_scenario(conn, ctx)
    fleets = sc["filter"].get("crew", {}).get("fleets") or []
    lo = sc["start"] - timedelta(days=_COF_LEAD_DAYS)
    hi = sc["end"] + timedelta(days=_COF_TAIL_DAYS)
    # Empty fleets → no fleet restriction (else `= ANY(ARRAY[])` yields 0 flights).
    fleet_clause = "f.fleet = ANY(%(fleets)s) AND " if fleets else ""
    cur = conn.cursor()
    cur.execute(
        f"""
        SELECT f.id FROM flight f
        WHERE {fleet_clause}f.flt_dt >= %(lo)s AND f.flt_dt < %(hi)s
          AND (f.scenario_id = 0 OR f.scenario_id IS NULL)
          AND (f.is_deleted = 0 OR f.is_deleted IS NULL)
        """,
        {"fleets": fleets, "lo": lo, "hi": hi},
    )
    ids = [r[0] for r in cur.fetchall()]
    cur.close()
    c["flight_pool_ids"] = ids
    return ids


def flight_section_ids(conn, ctx) -> list[int]:
    """Flight ids for the Flight SECTION: exactly the flights referenced by the
    in-scope pairings' legs (pairing -> pairing_segment.flt_id -> flight).

    Dependent query driven by `pairing_ids()`, NOT an independent all-fleet window
    scan. The legacy exporter pulled every fleet's flights in [str-9d, end+9d),
    which over-fetched massively (e.g. 4,809 all-fleet flights vs ~3,134 actually
    flown by the YEG/737 pairing set). Scoping by the pairing set keeps Flight in
    lockstep with Pairing: every leg the optimizer can roster has its flight, and
    nothing else is shipped.

    Distinct from flight_pool_ids (fleet-filtered window scan, for the COF crew set)."""
    c = _cache(ctx)
    if "flight_section_ids" in c:
        return c["flight_section_ids"]
    pairings = pairing_ids(conn, ctx)
    if not pairings:
        c["flight_section_ids"] = []
        return []
    cur = conn.cursor()
    cur.execute(
        """
        SELECT DISTINCT f.id
        FROM pairing_segment ps
        JOIN flight f ON f.id = ps.flt_id
        WHERE ps.pairing_id = ANY(%(pairings)s)
          AND ps.is_deleted = 0
          AND ps.flt_id IS NOT NULL
          AND (f.scenario_id = 0 OR f.scenario_id IS NULL)
          AND (f.is_deleted = 0 OR f.is_deleted IS NULL)
        ORDER BY f.id
        """,
        {"pairings": pairings},
    )
    ids = [r[0] for r in cur.fetchall()]
    cur.close()
    c["flight_section_ids"] = ids
    return ids


def pairing_ids(conn, ctx) -> list[int]:
    """In-scope pairing ids = the coverage pairings (workset division plus
    filter_params base/fleet, live, overlapping the window) UNION the pairings the scenario
    crew are already rostered on within the roster window.

    The union keeps Roster ⊆ Pairing: every pairing a scenario crew is rostered on
    exists in the Pairing pool, so the optimizer never skips a roster ("pairing not
    found in pairing pool"). The crew's out-of-base/fleet commitments are preserved
    as fixed pairings rather than dropped — so the division/base/fleet scoping only
    applies to the coverage query, NOT to the rostered set."""
    c = _cache(ctx)
    if "pairing_ids" in c:
        return c["pairing_ids"]
    sc = get_scenario(conn, ctx)
    p = sc["filter"].get("pairing", {}) or {}
    bases = p.get("bases") or []
    ranks = p.get("ranks") or []
    fleets = p.get("fleets") or []
    types = p.get("types") or []
    duration = p.get("duration", {}) or {}
    duration_min = _number_or_null(duration.get("min"))
    duration_max = _number_or_null(duration.get("max"))
    # Division scopes the coverage pool so a pilot (P) scenario never surfaces cabin
    # (C) pairings and vice-versa. Division is workset-owned; a pairing-specific
    # override is kept for old material where it was explicitly set.
    division = _normalize_division(p.get("division")) or scenario_division(conn, ctx)
    base_clause = "AND base = ANY(%(bases)s)" if bases else ""
    fleet_clause = "AND fleet = ANY(%(fleets)s)" if fleets else ""
    rank_clause = (
        """
          AND EXISTS (
              SELECT 1 FROM pairing_composition pc
              WHERE pc.pairing_id = pairing.id
                AND pc.scenario_id = 0
                AND pc.is_deleted = 0
                AND pc.acting_rank = ANY(%(ranks)s))"""
        if ranks else ""
    )
    type_clause = "AND assignment_group = ANY(%(types)s)" if types else ""
    duration_clauses = []
    if duration_min is not None:
        duration_clauses.append("AND tafb >= %(duration_min)s")
    if duration_max is not None:
        duration_clauses.append("AND tafb <= %(duration_max)s")
    cur = conn.cursor()
    # 1) Coverage pairings: same filters as live-server pairingIdSet.
    cur.execute(
        f"""
        SELECT id FROM pairing pairing
        WHERE scenario_id = 0 AND is_deleted = 0
          AND division = %(division)s
          {base_clause} {rank_clause} {fleet_clause} {type_clause}
          {' '.join(duration_clauses)}
          AND sch_end_dt_utc >= %(start)s AND sch_str_dt_utc < (%(end)s + interval '1 day')
        """,
        {
            "bases": bases,
            "ranks": ranks,
            "fleets": fleets,
            "types": types,
            "duration_min": duration_min,
            "duration_max": duration_max,
            "division": division,
            "start": sc["start"],
            "end": sc["end"],
        },
    )
    ids = {r[0] for r in cur.fetchall()}
    # 2) Pairings the scenario crew are rostered on within the roster window (so
    #    Roster / RosterFlight always reference an existing pairing).
    crew = [str(int(x)) for x in scenario_crew_ids(conn, ctx)]
    if crew:
        lo, hi = roster_window(conn, ctx)
        # Cover both roster sections' windows: Roster scopes by act_str_dt_utc,
        # RosterFlight by flt_dt (varchar) — include a pairing if either is in window.
        cur.execute(
            """
            SELECT DISTINCT rf.pairing_id FROM roster_flight rf
            WHERE rf.scenario_id = 0 AND rf.is_deleted = 0
              AND rf.crew_id = ANY(%(crew)s) AND rf.pairing_id IS NOT NULL
              AND ((rf.act_str_dt_utc >= %(lo)s AND rf.act_str_dt_utc < %(hi)s)
                   OR (rf.flt_dt >= %(lo_iso)s AND rf.flt_dt < %(hi_iso)s))
            """,
            {"crew": crew, "lo": lo, "hi": hi,
             "lo_iso": lo.isoformat(), "hi_iso": hi.isoformat()},
        )
        ids.update(r[0] for r in cur.fetchall())
    cur.close()
    c["pairing_ids"] = sorted(ids)
    return c["pairing_ids"]


def roster_window(conn, ctx):
    """(lo_date, hi_date) for roster scoping: [str-9d, end+9d)."""
    sc = get_scenario(conn, ctx)
    return sc["start"] - timedelta(days=9), sc["end"] + timedelta(days=9)


def cof_crew_ids(conn, ctx) -> list[str]:
    """Distinct Live FLY crew on the scenario flight pool, minus the scenario set.

    Always includes both Pilot (P) and Cabin (C): 8030/8072 need the full physical-flight
    team even when the scenario optimizes only one division. division=None historically
    meant “no filter”; we no longer scope by scenario_division here.
    """
    c = _cache(ctx)
    if "cof_crew_ids" in c:
        return c["cof_crew_ids"]
    pool = flight_pool_ids(conn, ctx)
    scen = set(scenario_crew_ids(conn, ctx))
    if not pool:
        c["cof_crew_ids"] = []
        return []
    cur = conn.cursor()
    cur.execute(
        """
        SELECT DISTINCT rf.crew_id FROM roster_flight rf
        WHERE rf.scenario_id = 0 AND rf.flt_id = ANY(%(pool)s)
          AND rf.crew_id IS NOT NULL
          AND rf.is_deleted = 0
          AND rf.pairing_id IS NOT NULL
          AND rf.assignment_group = 'FLY'
        """,
        {"pool": pool},
    )
    ids = sorted(
        (r[0] for r in cur.fetchall() if r[0] not in scen),
        key=lambda x: int(x),
    )
    cur.close()
    c["cof_crew_ids"] = ids
    return ids


def scenario_airports(conn, ctx) -> list[str]:
    """Distinct airport codes for the Airport section.

    Union of (1) scenario flight dep/arv and (2) dated crew_base.base for
    scenario + COF crews — so CrewBase rows never reference a missing Airport.
    """
    c = _cache(ctx)
    if "scenario_airports" in c:
        return c["scenario_airports"]
    codes: set[str] = set()
    fids = flight_section_ids(conn, ctx)
    crew_ids = list(
        dict.fromkeys([*scenario_crew_ids(conn, ctx), *cof_crew_ids(conn, ctx)])
    )
    sc = get_scenario(conn, ctx) if crew_ids else None
    cur = conn.cursor()
    if fids:
        cur.execute(
            "SELECT DISTINCT a FROM ("
            "  SELECT dep_arp AS a FROM flight WHERE id = ANY(%(f)s) "
            "  UNION SELECT arv_arp AS a FROM flight WHERE id = ANY(%(f)s)"
            ") t WHERE a IS NOT NULL",
            {"f": fids},
        )
        codes.update(r[0] for r in cur.fetchall() if r[0])
    if crew_ids:
        cur.execute(
            "SELECT DISTINCT base FROM crew_base "
            "WHERE crew_id = ANY(%(crew_ids)s) "
            "  AND (eff_dt IS NULL OR eff_dt <= %(end)s) "
            "  AND (exp_dt IS NULL OR exp_dt >= %(start)s) "
            "  AND base IS NOT NULL",
            {"crew_ids": crew_ids, "end": sc["end"], "start": sc["start"]},
        )
        codes.update(r[0] for r in cur.fetchall() if r[0])
    cur.close()
    aps = sorted(codes)
    c["scenario_airports"] = aps
    return aps
