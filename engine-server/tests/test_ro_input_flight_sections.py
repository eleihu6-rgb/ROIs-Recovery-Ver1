import pytest
import psycopg2
from F8.ro_input_builder import db, registry, golden, context
from F8.ro_input_builder.sections import flight

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
    ctx = {"airline": "f8", "scenario": 6}
    text = registry.run_section(conn, spec, ctx)
    return golden.parse_text(text)[spec.name]


def test_flight_header_matches_golden(conn, gold):
    assert _emit(conn, flight.FLIGHT).columns == gold["Flight"].columns


def test_flight_nonempty_and_scoped_to_pairing_legs(conn):
    # Flight section is now a DEPENDENT query: exactly the flights referenced by the
    # in-scope pairings' legs (pairing -> pairing_segment.flt_id -> flight), NOT an
    # independent all-fleet window scan. Boundary legs of window-overlapping pairings
    # may fall just outside [str-9d, end+9d), so the old window assertion no longer
    # holds; the real invariant is "every emitted flight is flown by an in-scope pairing".
    ctx = {"airline": "f8", "scenario": 6}
    pairings = context.pairing_ids(conn, ctx)
    cur = conn.cursor()
    cur.execute(
        "SELECT DISTINCT flt_id FROM pairing_segment "
        "WHERE pairing_id = ANY(%s) AND is_deleted = 0 AND flt_id IS NOT NULL",
        (pairings,),
    )
    leg_flt_ids = {r[0] for r in cur.fetchall()}
    cur.close()
    sec = _emit(conn, flight.FLIGHT)
    assert sec.rows, "Flight section must be non-empty (flights flown by in-scope pairings)"
    ii = sec.columns.index("id")
    emitted = {int(r[ii]) for r in sec.rows}
    assert emitted == leg_flt_ids, (
        f"Flight section must equal the distinct flt_ids of in-scope pairing legs; "
        f"only-in-section={sorted(emitted - leg_flt_ids)[:10]} "
        f"only-in-legs={sorted(leg_flt_ids - emitted)[:10]}"
    )


def test_flight_composition_header_matches_golden(conn, gold):
    sec = _emit(conn, flight.FLIGHT_COMPOSITION)
    assert sec.columns == gold["FlightComposition"].columns


def test_flight_composition_rows_scoped_to_flight_set(conn):
    # flight_composition is currently empty (data gap); if/when populated, every
    # emitted row's fltId must be within the Flight window set. Passes (vacuously)
    # while empty; becomes a real guard once seeded.
    ctx = {"airline": "f8", "scenario": 6}
    pool = set(context.flight_section_ids(conn, ctx))
    sec = _emit(conn, flight.FLIGHT_COMPOSITION)
    fi = sec.columns.index("fltId")
    assert all(int(r[fi]) in pool for r in sec.rows)
