import pytest
import psycopg2
from F8.ro_input_builder import db, registry, golden, context
from F8.ro_input_builder.sections import roster

GOLDEN = "complete/F8/6_20260612_125629/ro_input.txt"


@pytest.fixture(scope="module")
def conn():
    try:
        c = db.connect("f8")
    except psycopg2.OperationalError as e:
        pytest.skip(f"f8 DB unavailable: {e}")
    yield c
    c.close()


@pytest.fixture(scope="module")
def gold():
    return golden.parse_file(GOLDEN)


def _emit(conn, spec):
    text = registry.run_section(conn, spec, {"airline": "f8", "scenario": 6})
    return golden.parse_text(text)[spec.name]


def test_roster_flight_header_matches_golden(conn, gold):
    assert _emit(conn, roster.ROSTER_FLIGHT).columns == gold["RosterFlight"].columns


def test_roster_flight_scoped_to_scenario_crew_with_pairing(conn):
    ctx = {"airline": "f8", "scenario": 6}
    scen = {int(x) for x in context.scenario_crew_ids(conn, ctx)}
    sec = _emit(conn, roster.ROSTER_FLIGHT)
    ci = sec.columns.index("crewId")
    pi = sec.columns.index("pairingId")
    assert sec.rows
    assert all(int(r[ci]) in scen for r in sec.rows)
    assert all(r[pi] not in ("", "0") for r in sec.rows)   # flight rows have a pairing


def test_roster_ground_header_includes_credited_minutes(conn):
    sec = _emit(conn, roster.ROSTER_GROUND)
    assert "creditedMinutes" in sec.columns
    assert "dpMin" in sec.columns
    assert sec.columns.index("creditedMinutes") > sec.columns.index("dpMin")


def test_roster_ground_credited_minutes_matches_actual_credit(conn):
    sec = _emit(conn, roster.ROSTER_GROUND)
    ci = sec.columns.index("creditedMinutes")
    di = sec.columns.index("dpMin")
    assert sec.rows
    assert all(r[ci] == r[di] for r in sec.rows)


def test_roster_ground_scoped_to_scenario_crew(conn):
    ctx = {"airline": "f8", "scenario": 6}
    scen = {int(x) for x in context.scenario_crew_ids(conn, ctx)}
    sec = _emit(conn, roster.ROSTER_GROUND)
    ci = sec.columns.index("crewId")
    assert sec.rows and all(int(r[ci]) in scen for r in sec.rows)


def test_roster_header_matches_golden(conn, gold):
    assert _emit(conn, roster.ROSTER).columns == gold["Roster"].columns


def test_roster_one_row_per_crew_pairing(conn):
    sec = _emit(conn, roster.ROSTER)
    ci = sec.columns.index("crewId")
    pi = sec.columns.index("pairingId")
    keys = [(r[ci], r[pi]) for r in sec.rows]
    assert sec.rows and len(keys) == len(set(keys))


def test_roster_act_start_le_act_end(conn):
    sec = _emit(conn, roster.ROSTER)
    si = sec.columns.index("actStrDtUtc")
    ei = sec.columns.index("actEndDtUtc")
    pairs = [(r[si], r[ei]) for r in sec.rows if r[si] and r[ei]]
    assert pairs and all(s <= e for s, e in pairs)   # ISO strings compare lexically


def test_roster_window_filter_uses_flight_date(monkeypatch):
    class Cursor:
        query = ""
        params = {}

        def execute(self, query, params):
            self.query = query
            self.params = params

        def fetchall(self):
            return []

        def close(self):
            pass

    class Conn:
        cursor_obj = Cursor()

        def cursor(self):
            return self.cursor_obj

    conn = Conn()
    monkeypatch.setattr(context, "scenario_crew_ids", lambda _conn, _ctx: ["13441"])
    monkeypatch.setattr(
        context,
        "roster_window",
        lambda _conn, _ctx: (
            __import__("datetime").date(2026, 7, 1),
            __import__("datetime").date(2026, 8, 1),
        ),
    )

    assert roster._roster(conn, {"airline": "f8", "scenario": 702}) == []
    assert "AND flt_dt >= %(lo)s AND flt_dt < %(hi)s" in conn.cursor_obj.query
    assert "AND act_str_dt_utc >= %(lo)s" not in conn.cursor_obj.query
    assert conn.cursor_obj.params["lo"] == "2026-07-01"
    assert conn.cursor_obj.params["hi"] == "2026-08-01"
