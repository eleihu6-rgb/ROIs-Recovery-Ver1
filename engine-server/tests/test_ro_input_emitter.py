import os
import pytest
from F8.ro_input_builder import db


def test_resolve_dsn_prefers_explicit_arg():
    dsn = db.resolve_dsn("f8", explicit="postgresql://x/y")
    assert dsn == "postgresql://x/y"


def test_resolve_dsn_uses_env(monkeypatch):
    monkeypatch.setenv("LEGACY_RO_DB_URL", "postgresql://env/db")
    assert db.resolve_dsn("f8") == "postgresql://env/db"


def test_resolve_dsn_requires_env_without_explicit_arg(monkeypatch):
    monkeypatch.delenv("LEGACY_RO_DB_URL", raising=False)
    with pytest.raises(RuntimeError, match="LEGACY_RO_DB_URL is required"):
        db.resolve_dsn("f8")


from datetime import datetime, date
from decimal import Decimal
from F8.ro_input_builder import emitter


def test_format_value_handles_types():
    assert emitter.format_value(None) == ""
    assert emitter.format_value(datetime(2026, 6, 29, 16, 35, 0)) == "2026-06-29T16:35:00"
    assert emitter.format_value(date(2026, 6, 29)) == "2026-06-29"
    assert emitter.format_value(Decimal("4.50")) == "4.50"
    assert emitter.format_value(0) == "0"
    assert emitter.format_value("YEG") == "YEG"


def test_format_value_bool01():
    assert emitter.format_value(1, fmt="bool01") == "true"
    assert emitter.format_value(0, fmt="bool01") == "false"
    assert emitter.format_value(None, fmt="bool01") == ""


def test_emit_section_header_and_rows():
    out = emitter.emit_section("Fleet", None, ["id", "fleet"], [[1, "737"], [2, "320"]])
    lines = out.splitlines()
    assert lines[0] == "------Fleet(2):id,fleet"
    assert lines[1] == "1^737"
    assert lines[2] == "2^320"


def test_emit_section_with_variant():
    out = emitter.emit_section("Crew", "COF", ["crewId"], [[5]])
    assert out.splitlines()[0] == "------Crew(1)(COF):crewId"


def test_emit_section_empty():
    out = emitter.emit_section("City", None, ["id", "city"], [])
    assert out.rstrip("\n") == "------City(0):id,city"


from F8.ro_input_builder import registry


def test_col_select_expr_maps_and_nulls():
    cols = [registry.Col("id", "id"), registry.Col("acType", "ac_type"),
            registry.Col("ccRestFacility", None)]
    assert registry.select_list(cols) == "id, ac_type, NULL"


def test_build_query_simple():
    spec = registry.SectionSpec(
        name="Fleet", table="fleet",
        cols=[registry.Col("id", "id"), registry.Col("fleet", "fleet")],
        order_by="id",
    )
    assert registry.build_query(spec) == "SELECT id, fleet FROM fleet ORDER BY id"


def test_build_query_with_where():
    spec = registry.SectionSpec(
        name="SystemParameter", table="dictionary",
        cols=[registry.Col("id", "id")],
        where="parent_code = 'SYS_PARAM'", order_by="id",
    )
    assert registry.build_query(spec) == (
        "SELECT id FROM dictionary WHERE parent_code = 'SYS_PARAM' ORDER BY id"
    )


def test_apply_formats_bool01():
    cols = [registry.Col("id", "id"), registry.Col("isActingRank", "is_acting_rank", fmt="bool01")]
    raw_rows = [(7, 1), (8, 0)]
    assert registry.apply_formats(cols, raw_rows) == [[7, "true"], [8, "false"]]


from F8.ro_input_builder import golden

GOLDEN = "complete/F8/6_20260612_125629/ro_input.txt"


def test_parse_golden_extracts_known_sections():
    secs = golden.parse_file(GOLDEN)
    # variant-qualified keys
    assert "Fleet" in secs
    assert secs["Fleet"].columns[0] == "id"
    assert secs["Fleet"].count == 2
    assert "Crew(COF)" in secs        # the (COF) variant
    assert "RuleParameter(ALL)" in secs


def test_parsed_section_rows_match_count():
    secs = golden.parse_file(GOLDEN)
    fleet = secs["Fleet"]
    assert len(fleet.rows) == fleet.count


from F8.ro_input_builder.sections import passthrough


def test_passthrough_returns_golden_rows():
    rows = passthrough.snapshot_rows("CalculationManday")
    assert len(rows) == 9          # golden CalculationManday(9)
    assert all(isinstance(r, list) for r in rows)


def test_passthrough_city_count():
    assert len(passthrough.snapshot_rows("City")) == 55
