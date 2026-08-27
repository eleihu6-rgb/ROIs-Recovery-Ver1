import pytest
import psycopg2
from F8.ro_input_builder import db, registry, golden, context
from F8.ro_input_builder.sections import manday

GOLDEN = "complete/F8/6_20260612_125629/ro_input.txt"


@pytest.fixture(scope="module")
def conn():
    try:
        c = db.connect("f8")
    except (psycopg2.OperationalError, RuntimeError) as e:
        pytest.skip(f"f8 DB unavailable: {e}")
    yield c
    c.close()


@pytest.fixture(scope="module")
def gold():
    return golden.parse_file(GOLDEN)


def _emit(conn, spec):
    text = registry.run_section(conn, spec, {"airline": "f8", "scenario": 6})
    return golden.parse_text(text)[spec.name]


def test_crew_manday_fd_header_matches_golden(conn, gold):
    assert _emit(conn, manday.CREW_MANDAY_FD).columns == gold["CrewMandayFd"].columns


def test_crew_manday_fd_scoped_to_scenario_crew(conn):
    ctx = {"airline": "f8", "scenario": 6}
    scen = {int(x) for x in context.scenario_crew_ids(conn, ctx)}
    sec = _emit(conn, manday.CREW_MANDAY_FD)
    ci = sec.columns.index("crewId")
    assert sec.rows and all(int(r[ci]) in scen for r in sec.rows)


def test_crew_month_manday_header_matches_golden(conn, gold):
    assert _emit(conn, manday.CREW_MONTH_MANDAY).columns == gold["CrewMonthManday"].columns


def test_fatigue_result_header_matches_golden(conn, gold):
    assert _emit(conn, manday.FATIGUE_RESULT).columns == gold["FatigueResult"].columns


from F8.ro_input_builder.sections import meta


def test_workset_header_matches_golden(conn, gold):
    assert _emit(conn, meta.WORKSET).columns == gold["Workset"].columns


def test_workset_one_row(conn):
    sec = _emit(conn, meta.WORKSET)
    assert len(sec.rows) == 1                    # the scenario's workset


def _first_scenario_with_distinct_workset(conn):
    """Pick a scenario whose id differs from its workset id, so the Workset.id /
    worksetId == scenario.id assertions below actually catch a regression to
    workset.id."""
    cur = conn.cursor()
    cur.execute(
        "SELECT id FROM scenario WHERE workset_id IS NOT NULL AND id <> workset_id "
        "ORDER BY id LIMIT 1"
    )
    row = cur.fetchone()
    cur.close()
    return row[0] if row else None


def test_workset_id_uses_scenario_id(conn):
    sid = _first_scenario_with_distinct_workset(conn)
    if sid is None:
        pytest.skip("no scenario whose id differs from its workset id")
    text = registry.run_section(conn, meta.WORKSET, {"airline": "f8", "scenario": sid})
    sec = golden.parse_text(text)["Workset"]
    assert sec.rows[0][sec.columns.index("id")] == str(sid)   # scenario id, not workset.id


def test_scenario_workset_id_uses_scenario_id(conn):
    sid = _first_scenario_with_distinct_workset(conn)
    if sid is None:
        pytest.skip("no scenario whose id differs from its workset id")
    text = registry.run_section(conn, meta.SCENARIO, {"airline": "f8", "scenario": sid})
    sec = golden.parse_text(text)["Scenario"]
    assert sec.rows[0][sec.columns.index("worksetId")] == str(sid)   # scenario id, not workset_id


def test_scenario_header_matches_golden(conn, gold):
    assert _emit(conn, meta.SCENARIO).columns == gold["Scenario"].columns


def test_scenario_one_row_with_window(conn):
    sec = _emit(conn, meta.SCENARIO)
    assert len(sec.rows) == 1
    si = sec.columns.index("strDtLoc")
    assert sec.rows[0][si].startswith("2026-06-01")   # scenario 6 start


def test_scenario_name_comes_from_workset():
    name_col = next(c for c in meta._SCENARIO_COLS if c.legacy == "name")
    assert name_col.db == "(SELECT w.name FROM workset w WHERE w.id = scenario.workset_id)"


def test_scenario_rule_set_id_matches_scenario_row(conn):
    sec = _emit(conn, meta.SCENARIO)
    ri = sec.columns.index("ruleSetId")
    cur = conn.cursor()
    cur.execute("SELECT ruleset_id FROM scenario WHERE id = %s", (6,))
    row = cur.fetchone()
    cur.close()
    assert row and row[0] is not None
    assert sec.rows[0][ri] == str(row[0])
