import re
from datetime import datetime, timedelta

import pytest
from F8.ro_input_builder import context

GOLDEN = "complete/F8/6_20260612_125629/ro_input.txt"


def _golden_crew_ids(variant):
    """Parse the golden Crew section crewId list for the given variant (None or 'COF')."""
    name_key = ("Crew", variant)
    ids, cur, idx = [], None, None
    for line in open(GOLDEN, encoding="utf-8").read().splitlines():
        m = re.match(r"------(\w+)\((\d+)\)(?:\((\w+)\))?:(.*)", line)
        if m:
            cur = (m.group(1), m.group(3))
            cols = m.group(4).split(",")
            idx = cols.index("crewId") if "crewId" in cols else None
        elif cur == name_key and line:
            ids.append(line.split("^")[idx])
    return {int(x) for x in ids}


@pytest.fixture(scope="module")
def conn():
    psycopg2 = pytest.importorskip("psycopg2")
    from F8.ro_input_builder import db
    try:
        c = db.connect("f8")
    except (psycopg2.OperationalError, RuntimeError) as e:
        pytest.skip(f"f8 DB unavailable: {e}")
    yield c
    c.close()


def _scenario_exists(conn, scenario_id: int) -> bool:
    cur = conn.cursor()
    cur.execute("SELECT EXISTS (SELECT 1 FROM scenario WHERE id = %s)", (scenario_id,))
    exists = bool(cur.fetchone()[0])
    cur.close()
    return exists


def _find_scenario_with_crew_bases(conn):
    cur = conn.cursor()
    cur.execute(
        """SELECT s.id, s.filter_params->'crew'->'bases', w.division
             FROM scenario s
             JOIN workset w ON w.id = s.workset_id
             WHERE jsonb_array_length(coalesce(s.filter_params->'crew'->'bases','[]'::jsonb)) > 0
             ORDER BY s.id DESC
             LIMIT 1"""
    )
    row = cur.fetchone()
    cur.close()
    return row


def test_scenario_crew_ids_match_golden_exactly(conn):
    if not _scenario_exists(conn, 6):
        pytest.skip("golden scenario 6 is not present in this database")
    ctx = {"airline": "f8", "scenario": 6}
    got = {int(x) for x in context.scenario_crew_ids(conn, ctx)}
    assert got == _golden_crew_ids(None)


def test_cof_set_is_nonempty_and_disjoint_from_scenario(conn):
    if not _scenario_exists(conn, 6):
        pytest.skip("golden scenario 6 is not present in this database")
    ctx = {"airline": "f8", "scenario": 6}
    scen = {int(x) for x in context.scenario_crew_ids(conn, ctx)}
    cof = {int(x) for x in context.cof_crew_ids(conn, ctx)}
    assert cof, "COF set must be non-empty"
    assert scen.isdisjoint(cof), "scenario and COF sets must be disjoint"


def test_context_caches_scenario(conn):
    found = _find_scenario_with_crew_bases(conn)
    if not found:
        pytest.skip("no scenario with crew bases to exercise cached context")
    sid, bases, division = found
    ctx = {"airline": "f8", "scenario": sid}
    a = context.get_scenario(conn, ctx)
    b = context.get_scenario(conn, ctx)
    assert a is b
    assert a["filter"]["crew"]["bases"] == bases
    assert a["division"] == division


def test_scenario_crew_ids_use_workset_division_not_filter_params():
    class FakeCursor:
        def __init__(self, fake_conn):
            self.fake_conn = fake_conn
            self.index = fake_conn.cursor_count
            fake_conn.cursor_count += 1

        def execute(self, sql, params=None):
            self.fake_conn.executed.append((sql, params))

        def fetchone(self):
            return (
                77,
                datetime(2026, 6, 1),
                datetime(2026, 6, 30),
                {"crew": {"bases": ["YVR"], "fleets": [], "division": "C"}},
                "P",
                207,
            )

        def fetchall(self):
            return [("101",)]

        def close(self):
            pass

    class FakeConn:
        def __init__(self):
            self.cursor_count = 0
            self.executed = []

        def cursor(self):
            return FakeCursor(self)

    fake = FakeConn()
    got = context.scenario_crew_ids(fake, {"airline": "f8", "scenario": 77})

    assert got == ["101"]
    assert fake.executed[1][1]["division"] == "P"
    assert "cb.eff_dt <= %(end)s" in fake.executed[1][0]
    assert "cf.fleet_specific" not in fake.executed[1][0]


def test_scenario_ruleset_id_reads_scenario_row():
    class FakeCursor:
        def execute(self, sql, params=None):
            pass

        def fetchone(self):
            return (
                77,
                datetime(2026, 6, 1),
                datetime(2026, 6, 30),
                {},
                "P",
                207,
            )

        def close(self):
            pass

    class FakeConn:
        def cursor(self):
            return FakeCursor()

    assert context.scenario_ruleset_id(FakeConn(), {"airline": "f8", "scenario": 77}) == 207


def test_scenario_crew_ids_applies_birthday_ranks_and_seniority():
    """Regression: engine ro_input must honor the same crew filters as live crewIdSet.
    Scenario 718 showed Gantt=8 (birthday) while optimizer still got the full base set."""
    class FakeCursor:
        def __init__(self, fake_conn):
            self.fake_conn = fake_conn
            self.index = fake_conn.cursor_count
            fake_conn.cursor_count += 1

        def execute(self, sql, params=None):
            self.fake_conn.executed.append((sql, params))

        def fetchone(self):
            return (
                718,
                datetime(2026, 8, 1),
                datetime(2026, 8, 31),
                {
                    "crew": {
                        "bases": ["YYC"],
                        "fleets": [],
                        "ranks": ["CA"],
                        "birthday": {"from": "1950-01-01", "to": "1970-01-01"},
                        "seniority": {"min": 1, "max": 50},
                    }
                },
                "P",
                103,
            )

        def fetchall(self):
            return [("113",), ("535",)]

        def close(self):
            pass

    class FakeConn:
        def __init__(self):
            self.cursor_count = 0
            self.executed = []

        def cursor(self):
            return FakeCursor(self)

    fake = FakeConn()
    got = context.scenario_crew_ids(fake, {"airline": "f8", "scenario": 718})
    assert got == ["113", "535"]
    crew_sql, crew_params = fake.executed[1]
    assert "crew_rank" in crew_sql
    assert "birthday::date >= %(birthday_from)s::date" in crew_sql
    assert "birthday::date <= %(birthday_to)s::date" in crew_sql
    assert "seniority_num >= %(seniority_min)s" in crew_sql
    assert "seniority_num <= %(seniority_max)s" in crew_sql
    assert crew_params["birthday_from"] == "1950-01-01"
    assert crew_params["birthday_to"] == "1970-01-01"
    assert crew_params["seniority_min"] == 1.0
    assert crew_params["seniority_max"] == 50.0
    assert crew_params["ranks"] == ["CA"]
    assert "fleet_specific" not in crew_sql  # empty fleets → no fleet restriction


def test_pairing_ids_applies_live_pairing_filters():
    class FakeCursor:
        def __init__(self, fake_conn):
            self.fake_conn = fake_conn
            self.index = fake_conn.cursor_count
            fake_conn.cursor_count += 1

        def execute(self, sql, params=None):
            self.fake_conn.executed.append((sql, params))

        def fetchone(self):
            return (
                718,
                datetime(2026, 8, 1),
                datetime(2026, 8, 31),
                {
                    "pairing": {
                        "bases": ["YYC"],
                        "ranks": ["CA"],
                        "fleets": ["737"],
                        "types": ["FLY"],
                        "duration": {"min": 60, "max": "900"},
                    }
                },
                "P",
                103,
            )

        def fetchall(self):
            return [(42,)] if self.index == 1 else []

        def close(self):
            pass

    class FakeConn:
        def __init__(self):
            self.cursor_count = 0
            self.executed = []

        def cursor(self):
            return FakeCursor(self)

    fake = FakeConn()
    got = context.pairing_ids(fake, {"airline": "f8", "scenario": 718})
    assert got == [42]
    pairing_sql, params = fake.executed[1]
    assert "pairing_composition" in pairing_sql
    assert "pc.scenario_id = 0" in pairing_sql
    assert "pc.acting_rank = ANY(%(ranks)s)" in pairing_sql
    assert "assignment_group = ANY(%(types)s)" in pairing_sql
    assert "tafb >= %(duration_min)s" in pairing_sql
    assert "tafb <= %(duration_max)s" in pairing_sql
    # Both duration bounds must be space-separated — regression for scenario 733,
    # where '' .join() produced "...%(duration_min)sAND tafb <= ..." (SQL syntax error).
    assert "%(duration_min)s AND tafb" in pairing_sql
    assert "sAND tafb" not in pairing_sql
    assert params["bases"] == ["YYC"]
    assert params["ranks"] == ["CA"]
    assert params["fleets"] == ["737"]
    assert params["types"] == ["FLY"]
    assert params["duration_min"] == 60.0
    assert params["duration_max"] == 900.0


def test_empty_crew_bases_means_no_base_restriction():
    class FakeCursor:
        def __init__(self, fake_conn):
            self.fake_conn = fake_conn
            self.index = fake_conn.cursor_count
            fake_conn.cursor_count += 1

        def execute(self, sql, params=None):
            self.fake_conn.executed.append((sql, params))

        def fetchone(self):
            return (1, datetime(2026, 8, 1), datetime(2026, 8, 31), {"crew": {}}, "P", 1)

        def fetchall(self):
            return []

        def close(self):
            pass

    class FakeConn:
        def __init__(self):
            self.cursor_count = 0
            self.executed = []

        def cursor(self):
            return FakeCursor(self)

    fake = FakeConn()
    context.scenario_crew_ids(fake, {"airline": "f8", "scenario": 1})
    crew_sql = fake.executed[1][0]
    assert "crew_base" not in crew_sql


def test_scenario_airports_unions_flight_and_crew_bases():
    """Airport must include CrewBase/COF bases (e.g. YKF) absent from flight dep/arv."""

    class FakeCursor:
        def __init__(self, fake_conn):
            self.fake_conn = fake_conn
            self._sql = ""

        def execute(self, sql, params=None):
            self._sql = sql
            self.fake_conn.executed.append((sql, params))

        def fetchall(self):
            if "dep_arp" in self._sql or "arv_arp" in self._sql:
                return [("YYZ",)]
            if "crew_base" in self._sql:
                return [("YKF",), ("YYZ",)]
            return []

        def close(self):
            pass

    class FakeConn:
        def __init__(self):
            self.executed = []

        def cursor(self):
            return FakeCursor(self)

    ctx = {
        "airline": "f8",
        "scenario": 746,
        "_cache": {
            "scenario": {
                "id": 746,
                "start": datetime(2026, 8, 1),
                "end": datetime(2026, 8, 31),
                "filter": {},
                "division": "P",
                "ruleset_id": 1,
            },
            "flight_section_ids": [16010],
            "scenario_crew_ids": ["100"],
            "cof_crew_ids": ["879"],
        },
    }
    fake = FakeConn()
    got = context.scenario_airports(fake, ctx)
    assert got == ["YKF", "YYZ"]
    crew_sql, crew_params = next(x for x in fake.executed if "crew_base" in x[0])
    assert "eff_dt" in crew_sql and "exp_dt" in crew_sql
    assert set(crew_params["crew_ids"]) == {"100", "879"}
    assert crew_params["end"] == datetime(2026, 8, 31)
    assert crew_params["start"] == datetime(2026, 8, 1)


def test_empty_fleets_means_no_fleet_restriction(conn):
    """Regression: filter_params.crew.fleets=[] must mean 'no fleet filter', not
    'match no fleet'. The old `cf.fleet_grp = ANY(ARRAY[])` collapsed the crew set
    to only fleet_grp-IS-NULL crews (e.g. 73 -> 5)."""
    cur = conn.cursor()
    cur.execute(
        """SELECT id FROM scenario
             WHERE coalesce(jsonb_array_length(filter_params->'crew'->'fleets'), 0) = 0
               AND filter_params->'crew'->'bases' IS NOT NULL
             ORDER BY id DESC LIMIT 1"""
    )
    row = cur.fetchone()
    if not row:
        pytest.skip("no scenario with empty crew.fleets to exercise the no-restriction path")
    sid = row[0]
    ctx = {"airline": "f8", "scenario": sid}
    got = {int(x) for x in context.scenario_crew_ids(conn, ctx)}

    # Independently compute the expected set with the same crew filters as scenario_crew_ids
    # (division + optional base/rank/seniority/birthday), NO fleet restriction.
    sc = context.get_scenario(conn, ctx)
    cf = sc["filter"].get("crew") or {}
    division = context.scenario_division(conn, ctx)
    ranks = cf.get("ranks") or []
    seniority = cf.get("seniority") or {}
    birthday = cf.get("birthday") or {}
    seniority_min = context._number_or_null(seniority.get("min"))
    seniority_max = context._number_or_null(seniority.get("max"))
    birthday_from = context._date_str(birthday.get("from"))
    birthday_to = context._date_str(birthday.get("to"))
    base_clause = (
        """
               AND EXISTS (SELECT 1 FROM crew_base cb WHERE cb.crew_id = c.crew_id
                           AND cb.base = ANY(%(bases)s)
                           AND cb.eff_dt <= %(end)s
                           AND (cb.exp_dt >= %(start)s OR cb.exp_dt IS NULL))"""
        if cf.get("bases") else ""
    )
    rank_clause = (
        """
          AND EXISTS (SELECT 1 FROM crew_rank cr WHERE cr.crew_id = c.crew_id
                      AND cr.rank = ANY(%(ranks)s)
                      AND cr.eff_dt <= %(end)s
                      AND (cr.exp_dt >= %(start)s OR cr.exp_dt IS NULL))"""
        if ranks else ""
    )
    extra = ""
    if seniority_min is not None:
        extra += " AND c.seniority_num IS NOT NULL AND c.seniority_num >= %(seniority_min)s"
    if seniority_max is not None:
        extra += " AND c.seniority_num IS NOT NULL AND c.seniority_num <= %(seniority_max)s"
    if birthday_from:
        extra += " AND c.birthday IS NOT NULL AND c.birthday::date >= %(birthday_from)s::date"
    if birthday_to:
        extra += " AND c.birthday IS NOT NULL AND c.birthday::date <= %(birthday_to)s::date"
    cur.execute(
        f"""SELECT c.crew_id FROM crew c
             WHERE c.division = %(division)s
               {base_clause}
               {rank_clause}
               {extra}""",
        {
            "division": division,
            "bases": cf.get("bases") or [],
            "ranks": ranks,
            "seniority_min": seniority_min,
            "seniority_max": seniority_max,
            "birthday_from": birthday_from,
            "birthday_to": birthday_to,
            "start": sc["start"],
            "end": sc["end"],
        },
    )
    expected = {int(r[0]) for r in cur.fetchall()}
    cur.close()
    assert got == expected, "empty fleets must select crews by division+base (+crew filters), no fleet filter"
    # Without extra crew filters, empty fleets must not collapse the set; with birthday/etc.
    # a tiny set is legitimate.
    if not (ranks or birthday_from or birthday_to or seniority_min is not None or seniority_max is not None):
        assert len(got) > 1, "empty-fleets crew set must not collapse to near-empty"


def _coverage_rows(conn, sc):
    """Replicate pairing_ids() coverage filters without division."""
    p = sc["filter"].get("pairing", {}) or {}
    bases = p.get("bases") or []
    ranks = p.get("ranks") or []
    fleets = p.get("fleets") or []
    types = p.get("types") or []
    duration = p.get("duration", {}) or {}
    duration_min = context._number_or_null(duration.get("min"))
    duration_max = context._number_or_null(duration.get("max"))
    base_clause = "AND base = ANY(%(bases)s)" if bases else ""
    rank_clause = (
        """AND EXISTS (SELECT 1 FROM pairing_composition pc
                            WHERE pc.pairing_id = pairing.id
                              AND pc.scenario_id = 0
                              AND pc.is_deleted = 0
                              AND pc.acting_rank = ANY(%(ranks)s))"""
        if ranks else ""
    )
    fleet_clause = "AND fleet = ANY(%(fleets)s)" if fleets else ""
    type_clause = "AND assignment_group = ANY(%(types)s)" if types else ""
    duration_clause = " AND tafb >= %(duration_min)s" if duration_min is not None else ""
    duration_clause += " AND tafb <= %(duration_max)s" if duration_max is not None else ""
    cur = conn.cursor()
    cur.execute(
        f"""SELECT id, division FROM pairing pairing
              WHERE scenario_id = 0 AND is_deleted = 0
                {base_clause} {rank_clause} {fleet_clause} {type_clause}
                {duration_clause}
                AND sch_end_dt_utc >= %(start)s AND sch_str_dt_utc < (%(end)s + interval '1 day')""",
        {"bases": bases, "ranks": ranks, "fleets": fleets, "types": types,
         "duration_min": duration_min, "duration_max": duration_max,
         "start": sc["start"], "end": sc["end"]},
    )
    rows = cur.fetchall()
    cur.close()
    return rows


def _find_division_scoped_scenario(conn):
    """Pick a scenario whose coverage window holds BOTH on- and off-division pairings
    so the division filter is actually exercised (not vacuously skipped). Reseed-robust
    replacement for the now-gone golden scenario 6. Returns (sid, division) or None."""
    cur = conn.cursor()
    cur.execute(
        """SELECT s.id FROM scenario s
             JOIN workset w ON w.id = s.workset_id
             WHERE w.division IN ('P','C')
               AND jsonb_array_length(coalesce(filter_params->'pairing'->'bases','[]'::jsonb)) > 0
             ORDER BY s.id DESC"""
    )
    candidates = [r[0] for r in cur.fetchall()]
    cur.close()
    for sid in candidates:
        ctx = {"airline": "f8", "scenario": sid}
        sc = context.get_scenario(conn, ctx)
        p = sc["filter"].get("pairing", {})
        division = p.get("division") or context.scenario_division(conn, ctx)
        if division in (None, "", "ALL"):
            continue
        cov = _coverage_rows(conn, sc)
        if any(d == division for _, d in cov) and any(d != division for _, d in cov):
            return sid, division
    return None


def test_coverage_pairings_are_division_scoped(conn):
    """Regression: the coverage pairing pool must be division-scoped. Before the fix
    pairing_ids() had NO division clause, so a pilot (P) scenario's coverage pool
    wrongly carried cabin (C) pairings at the same base/fleet/window (e.g. YEG/737
    June: 126 P + 148 C). Off-division pairings may still appear ONLY if a scenario
    crew is already rostered on them (part ② Roster⊆Pairing invariant) — those are
    subtracted so the assertion targets the coverage filter itself."""
    found = _find_division_scoped_scenario(conn)
    if not found:
        pytest.skip("no scenario with both on- and off-division coverage pairings")
    sid, division = found
    ctx = {"airline": "f8", "scenario": sid}
    sc = context.get_scenario(conn, ctx)
    cov = _coverage_rows(conn, sc)
    ondiv = {pid for pid, d in cov if d == division}
    offdiv = {pid for pid, d in cov if d != division}

    ids = set(context.pairing_ids(conn, ctx))
    assert ids, "pairing pool must be non-empty"
    assert ondiv <= ids, "every on-division coverage pairing must be in the pool"

    crew = [str(int(x)) for x in context.scenario_crew_ids(conn, ctx)]
    lo, hi = context.roster_window(conn, ctx)
    cur = conn.cursor()
    cur.execute(
        """SELECT DISTINCT pairing_id FROM roster_flight
             WHERE scenario_id = 0 AND is_deleted = 0 AND crew_id = ANY(%(crew)s)
               AND pairing_id IS NOT NULL
               AND ((act_str_dt_utc >= %(lo)s AND act_str_dt_utc < %(hi)s)
                    OR (flt_dt >= %(lo_iso)s AND flt_dt < %(hi_iso)s))""",
        {"crew": crew, "lo": lo, "hi": hi, "lo_iso": lo.isoformat(), "hi_iso": hi.isoformat()},
    )
    rostered = {r[0] for r in cur.fetchall()}
    cur.close()

    leaked = (offdiv & ids) - rostered
    assert not leaked, (
        f"off-division coverage pairings leaked into the pool (scenario {sid}, "
        f"division {division}): {sorted(leaked)[:10]}"
    )
