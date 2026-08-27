from F8.ro_input_builder.sections.roster import _RF_COLS, _RG_COLS, _ROSTER_COLS
from F8.ro_input_builder import registry as _reg

def test_flying_section_emits_PA_for_source():
    sql = _reg.select_list(_RF_COLS)
    assert "'PA'" in sql
    # ensure we no longer read the raw source column for the source header
    assert "source" not in sql.split("'PA'")[0].split(",")[-1]

def test_ground_and_reconstructed_emit_PA_for_source():
    assert "'PA'" in _reg.select_list(_RG_COLS)
    assert "'PA'" in _reg.select_list(_ROSTER_COLS)

class _FakeCursor:
    """Captures the SQL executed by a section's custom query (no DB round-trip)."""
    def __init__(self):
        self.sql = None
        self.params = None
    def execute(self, sql, params=None):
        self.sql = sql
        self.params = params
        return self
    def fetchall(self):
        return []
    def close(self):
        pass

class _FakeConn:
    def __init__(self, cursor):
        self._cursor = cursor
    def cursor(self):
        return self._cursor

def test_crew_on_flight_excludes_soft_deleted_rows(monkeypatch):
    """CrewOnFlight reads live roster_flight rows by flt_id; it MUST filter
    is_deleted = 0 like the other roster_flight sections, otherwise soft-deleted
    tasks (e.g. a Live bulk delete) leak into the optimizer input as PA."""
    from F8.ro_input_builder.sections import crew as crew_section
    from F8.ro_input_builder import context as ctx

    cursor = _FakeCursor()
    conn = _FakeConn(cursor)

    monkeypatch.setattr(ctx, "get_scenario", lambda _c, _x: {
        "id": 6, "start": None, "end": None, "filter": {"crew": {"fleets": ["737"]}},
        "division": "C", "ruleset_id": None,
    })
    monkeypatch.setattr(ctx, "flight_pool_ids", lambda _c, _x: [78107, 78134])

    rows = crew_section._crew_on_flight(conn, {"airline": "f8", "scenario": 6})

    assert cursor.sql is not None, "_crew_on_flight must execute a query"
    assert "is_deleted = 0" in cursor.sql
    assert "assignment_group = 'FLY'" in cursor.sql
    assert "division =" not in cursor.sql.replace("assignment_group = 'FLY'", "")
    # regression guard: soft-deleted rows must never reach the optimizer
    assert rows == []
