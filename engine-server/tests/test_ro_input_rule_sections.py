import pytest
import psycopg2
from F8.ro_input_builder import db, registry, golden
from F8.ro_input_builder.sections import rules

GOLDEN = "complete/F8/6_20260612_125629/ro_input.txt"


@pytest.fixture(autouse=True)
def _pg_rule_source(monkeypatch):
    monkeypatch.delenv("RO_RULE_SOURCE", raising=False)


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
    key = spec.name if not spec.variant else f"{spec.name}({spec.variant})"
    return golden.parse_text(text)[key]


HEADER_CASES = [
    ("RuleSet", rules.RULE_SET), ("Rule", rules.RULE_SCEN), ("Rule(ALL)", rules.RULE_ALL),
    ("RuleParameter", rules.RULE_PARAM_SCEN), ("RuleParameter(ALL)", rules.RULE_PARAM_ALL),
]


@pytest.mark.parametrize("gkey,spec", HEADER_CASES)
def test_rule_section_header_matches_golden(conn, gold, gkey, spec):
    assert _emit(conn, spec).columns == gold[gkey].columns


def test_scenario_rule_ids_equal_rule_set_members(conn):
    # Scenario Rule = rules referenced by this scenario's selected ruleset.
    cur = conn.cursor()
    cur.execute("SELECT ruleset_id FROM scenario WHERE id = %s", (6,))
    row = cur.fetchone()
    if not row or row[0] is None:
        pytest.skip("scenario 6 has no ruleset_id")
    cur.execute("SELECT DISTINCT rule_id FROM rule_set WHERE workset_id = %s", (row[0],))
    want = {str(r[0]) for r in cur.fetchall()}
    cur.close()
    sec = _emit(conn, rules.RULE_SCEN)
    ii = sec.columns.index("id")
    got = {r[ii] for r in sec.rows}
    assert got == want


def test_pg_scenario_rule_sql_scopes_to_scenario_ruleset(monkeypatch):
    class FakeCursor:
        def __init__(self, conn):
            self.conn = conn
            self.sql = ""

        def execute(self, sql, params=None):
            self.sql = sql
            self.conn.sqls.append(sql)

        def fetchone(self):
            return (77, "2026-06-01", "2026-06-30", {}, "P", 207)

        def fetchall(self):
            return []

        def close(self):
            pass

    class FakeConn:
        def __init__(self):
            self.sqls = []

        def cursor(self):
            return FakeCursor(self)

    pg = FakeConn()
    registry.run_section(pg, rules.RULE_SCEN, {"airline": "f8", "scenario": 77})
    assert "WHERE workset_id = 207" in pg.sqls[-1]


def test_scenario_rules_subset_of_all(conn):
    s = _emit(conn, rules.RULE_SCEN)
    a = _emit(conn, rules.RULE_ALL)
    ii = s.columns.index("id")
    sset = {r[ii] for r in s.rows}
    aset = {r[ii] for r in a.rows}
    assert sset and sset <= aset


def test_cqf_header_matches_golden(conn, gold):
    assert _emit(conn, rules.CQF).columns == gold["Cqf"].columns


def test_cqf_parameter_header_matches_golden(conn, gold):
    assert _emit(conn, rules.CQF_PARAMETER).columns == gold["CqfParameter"].columns
