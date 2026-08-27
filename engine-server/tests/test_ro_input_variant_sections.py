import pytest
import psycopg2
from F8.ro_input_builder import db, registry, golden, context
from F8.ro_input_builder.sections import reference

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
    key = spec.name if not spec.variant else f"{spec.name}({spec.variant})"
    return golden.parse_text(text)[key]


def test_airport_client_header_matches_golden(conn, gold):
    assert _emit(conn, reference.AIRPORT_CLIENT).columns == gold["Airport(Client)"].columns


def test_airport_client_is_scenario_subset(conn):
    full = _emit(conn, reference.AIRPORT)
    client = _emit(conn, reference.AIRPORT_CLIENT)
    ai = full.columns.index("airport")
    full_set = {r[ai] for r in full.rows}
    client_set = {r[ai] for r in client.rows}
    assert client.rows and client_set <= full_set        # subset of the full master
    assert len(client_set) < len(full_set)               # genuinely a subset


def test_assignment_read_matches_plain_assignment(conn, gold):
    read = _emit(conn, reference.ASSIGNMENT_READ)
    assert read.columns == gold["Assignment(Read)"].columns
    plain = _emit(conn, reference.ASSIGNMENT)
    assert {tuple(r) for r in read.rows} == {tuple(r) for r in plain.rows}   # same data
