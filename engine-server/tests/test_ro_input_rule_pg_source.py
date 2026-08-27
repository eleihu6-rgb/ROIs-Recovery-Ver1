"""Deterministic tests for PostgreSQL-sourced rule-config sections."""
from datetime import datetime

from F8.ro_input_builder import registry
from F8.ro_input_builder.sections import rules


class _FakeCursor:
    def __init__(self, rows_by_needle):
        self._rows_by_needle = rows_by_needle
        self.sql = None
        self._rows = []

    def execute(self, sql, params=None):
        self.sql = sql
        self._rows = next((rows for needle, rows in self._rows_by_needle.items()
                           if needle in sql), [])

    def fetchone(self):
        return self._rows[0] if self._rows else None

    def fetchall(self):
        return self._rows

    def close(self):
        pass


class _FakeConn:
    def __init__(self, rows_by_needle=None):
        self._rows_by_needle = rows_by_needle or {}
        self.cursors = []

    def cursor(self):
        cur = _FakeCursor(self._rows_by_needle)
        self.cursors.append(cur)
        return cur

    @property
    def last_sql(self):
        return self.cursors[-1].sql


def _scenario_conn(ruleset_id=207):
    return _FakeConn({
        "FROM scenario s": [(77, datetime(2026, 6, 1), datetime(2026, 6, 30),
                             {"crew": {"bases": ["YVR"]}}, "P", ruleset_id)],
    })


def test_ruleset_pg_sql_scopes_to_scenario_ruleset():
    pg = _scenario_conn(207)
    registry.run_section(pg, rules.RULE_SET, {"airline": "f8", "scenario": 77})
    sql = pg.last_sql
    assert "FROM rule_set" in sql
    assert "WHERE workset_id = 207" in sql
    assert sql.strip().endswith("ORDER BY id")


def test_rule_scen_pg_sql_scopes_to_scenario_ruleset():
    pg = _scenario_conn(207)
    registry.run_section(pg, rules.RULE_SCEN, {"airline": "f8", "scenario": 77})
    sql = pg.last_sql
    assert "FROM rule" in sql
    assert "rule_id IN (SELECT rule_id FROM rule_set WHERE workset_id = 207)" in sql


def test_rule_param_scen_pg_sql_scopes_to_scenario_ruleset():
    pg = _scenario_conn(207)
    registry.run_section(pg, rules.RULE_PARAM_SCEN, {"airline": "f8", "scenario": 77})
    sql = pg.last_sql
    assert "FROM rule r" in sql
    assert "FROM rule_set WHERE workset_id = 207" in sql


def test_rule_param_blanks_last_modified_and_modified_by():
    pg = _FakeConn({
        "FROM rule r": [("2004001", {
            "tables": [{"header": ["paramA", "paramB"], "rows": [[1, 2]]}],
        })],
    })
    text = registry.run_section(pg, rules.RULE_PARAM_ALL, {"airline": "f8", "scenario": 77})
    lines = text.splitlines()
    assert lines[0] == ("------RuleParameter(2)(ALL):"
                        "id,ruleId,phaseId,paramNames,paramValues,paramExtra,lastModified,modifiedBy")
    assert lines[1] == "1^2004001^1^tableRow1^1,2^^^"
    assert lines[2] == "2^2004001^1^tableHeader^paramA,paramB^^^"


def test_default_workset_fallback_scopes_scenario_sections():
    pg = _FakeConn()
    registry.run_section(pg, rules.RULE_SCEN, None)
    assert "workset_id = 103" in pg.last_sql
