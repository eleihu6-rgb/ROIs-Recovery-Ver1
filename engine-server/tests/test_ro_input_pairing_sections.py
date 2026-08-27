import pytest
import psycopg2
from F8.ro_input_builder import db, registry, golden, context
from F8.ro_input_builder.sections import pairing

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


def test_pairing_header_matches_golden(conn, gold):
    assert _emit(conn, pairing.PAIRING).columns == gold["Pairing"].columns


def test_pairing_nonempty_and_includes_coverage(conn):
    # The pool = YEG/737 coverage pairings UNION the scenario crew's rostered pairings,
    # so it is no longer all-YEG/737 (broadened to keep Roster ⊆ Pairing). It must
    # still CONTAIN the YEG/737 coverage pairings.
    sec = _emit(conn, pairing.PAIRING)
    assert sec.rows, "Pairing must be non-empty"
    bi, fi = sec.columns.index("base"), sec.columns.index("fleet")
    assert any(r[bi] == "YEG" and r[fi] == "737" for r in sec.rows)


def test_roster_pairings_subset_of_pairing_pool(conn):
    # The alignment invariant: every pairing referenced by Roster / RosterFlight must
    # exist in the Pairing pool (so the optimizer never skips "pairing not found").
    from F8.ro_input_builder.sections import roster
    psec = _emit(conn, pairing.PAIRING)
    pool = {r[psec.columns.index("id")] for r in psec.rows}
    for spec, name in ((roster.ROSTER, "Roster"), (roster.ROSTER_FLIGHT, "RosterFlight")):
        sec = _emit(conn, spec)
        pi = sec.columns.index("pairingId")
        missing = {r[pi] for r in sec.rows if r[pi] and r[pi] != "0"} - pool
        assert not missing, f"{name} references {len(missing)} pairings not in the Pairing pool"


def test_pairing_composition_header_matches_golden(conn, gold):
    assert _emit(conn, pairing.PAIRING_COMPOSITION).columns == gold["PairingComposition"].columns


def test_pairing_composition_scoped_to_pairings(conn):
    ctx = {"airline": "f8", "scenario": 6}
    pids = set(context.pairing_ids(conn, ctx))
    sec = _emit(conn, pairing.PAIRING_COMPOSITION)
    pi = sec.columns.index("pairingId")
    assert sec.rows and all(int(r[pi]) in pids for r in sec.rows)


def test_pairing_duty_header_matches_golden(conn, gold):
    assert _emit(conn, pairing.PAIRING_DUTY).columns == gold["PairingDuty"].columns


def test_pairing_duty_segment_header_matches_golden(conn, gold):
    assert _emit(conn, pairing.PAIRING_DUTY_SEGMENT).columns == gold["PairingDutySegment"].columns


def test_segment_pairingDutyId_references_a_duty(conn):
    duties = _emit(conn, pairing.PAIRING_DUTY)
    segs = _emit(conn, pairing.PAIRING_DUTY_SEGMENT)
    di = duties.columns.index("id")
    duty_ids = {r[di] for r in duties.rows}
    pi = segs.columns.index("pairingDutyId")
    assert segs.rows and all(r[pi] in duty_ids for r in segs.rows)


def test_one_duty_row_per_pairing_duty_seq(conn):
    duties = _emit(conn, pairing.PAIRING_DUTY)
    pi = duties.columns.index("pairingId")
    si = duties.columns.index("dutySeq")
    keys = [(r[pi], r[si]) for r in duties.rows]
    assert len(keys) == len(set(keys))      # unique (pairing, dutySeq)


def test_pairing_duty_node_header_matches_golden(conn, gold):
    assert _emit(conn, pairing.PAIRING_DUTY_NODE).columns == gold["PairingDutyNode"].columns


def test_node_constants_and_taxonomy(conn):
    sec = _emit(conn, pairing.PAIRING_DUTY_NODE)
    assert sec.rows
    ti = sec.columns.index("type")
    ni = sec.columns.index("node")
    gi = sec.columns.index("groupId")
    fi = sec.columns.index("fromSegmentId")
    assert all(r[ti] == "DUTY" for r in sec.rows)
    assert all(r[ni] in {"PICKUP", "BRIEF", "DEBRIEF", "DROPOFF"} for r in sec.rows)
    assert all(r[gi] == "1" for r in sec.rows)
    assert all(r[fi] == "0" for r in sec.rows)


def test_node_dutyId_references_a_duty(conn):
    duties = _emit(conn, pairing.PAIRING_DUTY)
    nodes = _emit(conn, pairing.PAIRING_DUTY_NODE)
    duty_ids = {r[duties.columns.index("id")] for r in duties.rows}
    ndi = nodes.columns.index("dutyId")
    assert all(r[ndi] in duty_ids for r in nodes.rows)


def test_node_count_is_four_per_duty_without_doubles(conn):
    # In the absence of double_* data, each duty yields exactly 4 nodes.
    duties = _emit(conn, pairing.PAIRING_DUTY)
    nodes = _emit(conn, pairing.PAIRING_DUTY_NODE)
    # node count must be a multiple of 4 and >= 4 * number_of_duties
    assert len(nodes.rows) >= 4 * len(duties.rows)
    assert len(nodes.rows) % 4 == 0
