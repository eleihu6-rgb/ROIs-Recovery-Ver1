import gzip
import os
import psycopg2
import pytest


@pytest.fixture(autouse=True)
def _pg_rule_source(monkeypatch):
    monkeypatch.delenv("RO_RULE_SOURCE", raising=False)


def test_generate_input_from_db_writes_61_section_gz(tmp_path):
    # Unit test of the DB generation path, independent of the full TaskManager wiring.
    try:
        import psycopg2
        psycopg2.connect("postgresql://f8:Pier2026AIf8@localhost:5432/rois?options=-c%20search_path%3Df8").close()
    except psycopg2.OperationalError as e:
        pytest.skip(f"f8 DB unavailable: {e}")
    from F8.ro_input_builder import cli
    txt = tmp_path / "ro_input.txt"
    gz = tmp_path / "input.gz"
    cli.build(airline="f8", scenario=6, out_path=str(txt), registry_name="full", gz_path=str(gz))
    assert gz.exists()
    with gzip.open(gz, "rb") as f:
        body = f.read().decode("utf-8")
    assert body.count("\n------") + body.startswith("------") >= 60   # ~61 sections
