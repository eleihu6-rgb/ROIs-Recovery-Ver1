from pathlib import Path

import pytest
import psycopg2

from F8.ro_input_builder import db, registry, golden
from F8.ro_input_builder.sections import crew

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
    if not Path(GOLDEN).exists():
        pytest.skip(f"golden ro_input fixture missing: {GOLDEN}")
    return golden.parse_file(GOLDEN)


def _scenario_exists(conn, scenario_id: int) -> bool:
    cur = conn.cursor()
    cur.execute("SELECT EXISTS (SELECT 1 FROM scenario WHERE id = %s)", (scenario_id,))
    exists = bool(cur.fetchone()[0])
    cur.close()
    return exists


def _emit(conn, spec):
    if not _scenario_exists(conn, 6):
        pytest.skip("golden scenario 6 is not present in this database")
    ctx = {"airline": "f8", "scenario": 6}
    text = registry.run_section(conn, spec, ctx)
    key = spec.name if not spec.variant else f"{spec.name}({spec.variant})"
    return golden.parse_text(text)[key]


HEADER_CASES = [
    ("Crew", crew.CREW_SCEN), ("Crew(COF)", crew.CREW_COF),
    ("CrewRank", crew.CREW_RANK_SCEN), ("CrewRank(COF)", crew.CREW_RANK_COF),
    ("CrewBase", crew.CREW_BASE_SCEN), ("CrewBase(COF)", crew.CREW_BASE_COF),
    ("CrewFleet", crew.CREW_FLEET_SCEN), ("CrewFleet(COF)", crew.CREW_FLEET_COF),
    ("CrewQualification", crew.CREW_QUAL_SCEN), ("CrewQualification(COF)", crew.CREW_QUAL_COF),
    ("CrewStatus", crew.CREW_STATUS_SCEN), ("CrewStatus(COF)", crew.CREW_STATUS_COF),
    ("CrewCertificate", crew.CREW_CERT_SCEN), ("CrewCertificate(COF)", crew.CREW_CERT_COF),
]


@pytest.mark.parametrize("gkey,spec", HEADER_CASES)
def test_crew_section_header_matches_golden(conn, gold, gkey, spec):
    assert _emit(conn, spec).columns == gold[gkey].columns


def test_scenario_crew_section_emits_exactly_the_26(conn, gold):
    sec = _emit(conn, crew.CREW_SCEN)
    ci = sec.columns.index("crewId")
    got = {int(r[ci]) for r in sec.rows}
    want = {int(r[ci]) for r in gold["Crew"].rows}
    assert got == want


def test_scenario_subtable_rows_belong_to_scenario_crew(conn):
    if not _scenario_exists(conn, 6):
        pytest.skip("golden scenario 6 is not present in this database")
    from F8.ro_input_builder import context
    ctx = {"airline": "f8", "scenario": 6}
    scen = {int(x) for x in context.scenario_crew_ids(conn, ctx)}
    sec = _emit(conn, crew.CREW_RANK_SCEN)
    ci = sec.columns.index("crewId")
    assert sec.rows, "scenario CrewRank must be non-empty"
    assert all(int(r[ci]) in scen for r in sec.rows)


def _emit_scen(conn, spec, scenario_id):
    """Like _emit() but with an explicit scenario id."""
    if not _scenario_exists(conn, scenario_id):
        pytest.skip(f"scenario {scenario_id} is not present in this database")
    ctx = {"airline": "f8", "scenario": scenario_id}
    text = registry.run_section(conn, spec, ctx)
    key = spec.name if not spec.variant else f"{spec.name}({spec.variant})"
    return golden.parse_text(text)[key]


def test_crew_rank_excludes_future_rank(conn):
    """Crew 1873 (YVR/P, scenario 540) has FA (eff 2022) and CA (eff 2026-07-01).
    A June 2026 scenario must export only the FA record — the CA rank must be
    absent because its eff_dt falls after the scenario end."""
    sec = _emit_scen(conn, crew.CREW_RANK_SCEN, 540)
    ci_crew = sec.columns.index("crewId")
    ci_rank = sec.columns.index("rank")
    rows_1873 = [r for r in sec.rows if r[ci_crew] == "1873"]
    if not rows_1873:
        pytest.skip("fixture crew 1873 is not in scenario 540 in this database")
    assert rows_1873, "crew 1873 must have at least one CrewRank row in scenario 540"
    ranks = {r[ci_rank] for r in rows_1873}
    assert "FA" in ranks, "crew 1873's active FA rank must be present"
    assert "CA" not in ranks, "crew 1873's future CA rank (eff 2026-07-01) must be excluded"


def test_crew_base_excludes_out_of_window_bases(conn):
    """Crew 1334 (YYZ/P, scenario 539) has three base records:
    YYC (exp 2025-11), YYZ (2025-11 → 2026-07-01), YVR (eff 2026-07-01 onward).
    Only YYZ overlaps the June 2026 scenario window."""
    sec = _emit_scen(conn, crew.CREW_BASE_SCEN, 539)
    ci_crew = sec.columns.index("crewId")
    ci_base = sec.columns.index("base")
    rows_1334 = [r for r in sec.rows if r[ci_crew] == "1334"]
    assert rows_1334, "crew 1334 must have at least one CrewBase row in scenario 539"
    bases = {r[ci_base] for r in rows_1334}
    assert "YYZ" in bases, "crew 1334's June-valid YYZ base must be present"
    assert "YVR" not in bases, "crew 1334's future YVR base (eff 2026-07-01) must be excluded"
    assert "YYC" not in bases, "crew 1334's expired YYC base (exp 2025-11) must be excluded"


def test_crew_on_flight_header_matches_golden(conn, gold):
    sec = _emit(conn, crew.CREW_ON_FLIGHT)
    assert sec.columns == gold["CrewOnFlight"].columns


def test_crew_on_flight_nonempty_and_scoped(conn):
    if not _scenario_exists(conn, 6):
        pytest.skip("golden scenario 6 is not present in this database")
    from F8.ro_input_builder import context
    ctx = {"airline": "f8", "scenario": 6}
    pool = set(context.flight_pool_ids(conn, ctx))
    sec = _emit(conn, crew.CREW_ON_FLIGHT)
    assert sec.rows, "CrewOnFlight must be non-empty"
    fi = sec.columns.index("fltId")
    assert all(int(r[fi]) in pool for r in sec.rows)
