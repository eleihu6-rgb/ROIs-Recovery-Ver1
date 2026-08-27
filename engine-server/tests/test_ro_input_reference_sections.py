import pytest
import psycopg2
from F8.ro_input_builder import db, registry, golden
from F8.ro_input_builder.sections import reference

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


def _emit(conn, spec, ctx=None):
    return golden.parse_text(registry.run_section(conn, spec, ctx))[spec.name
        if not spec.variant else f"{spec.name}({spec.variant})"]


def test_fleet_header_matches_golden(conn, gold):
    sec = _emit(conn, reference.FLEET)
    assert sec.columns == gold["Fleet"].columns


def test_fleet_business_keys_match_golden(conn, gold):
    sec = _emit(conn, reference.FLEET)
    got = {tuple(r[1:4]) for r in sec.rows}        # acType, fleetGrp, fleet
    want = {tuple(r[1:4]) for r in gold["Fleet"].rows}
    assert got == want


CLEAN_SPECS = [
    ("Airport", reference.AIRPORT), ("Base", reference.BASE), ("Rank", reference.RANK),
    ("RankActing", reference.RANK_ACTING), ("RankPosition", reference.RANK_POSITION),
    ("Composition", reference.COMPOSITION), ("CompositionRank", reference.COMPOSITION_RANK),
    ("Team", reference.TEAM), ("Dictionary", reference.DICTIONARY),
    ("SystemParameter", reference.SYSTEM_PARAMETER), ("Assignment", reference.ASSIGNMENT),
    ("AssignmentGroup", reference.ASSIGNMENT_GROUP),
    ("AssignmentGroupMap", reference.ASSIGNMENT_GROUP_MAP),
    ("PaneHeader", reference.PANE_HEADER), ("RosterPeriod", reference.ROSTER_PERIOD),
]


@pytest.mark.parametrize("name,spec", CLEAN_SPECS)
def test_clean_section_header_matches_golden(conn, gold, name, spec):
    sec = _emit(conn, spec)
    assert sec.columns == gold[name].columns


def test_system_parameter_includes_crew_manday_store_timezone(conn):
    sec = _emit(conn, reference.SYSTEM_PARAMETER)
    params = {r[1]: r[2] for r in sec.rows}        # paramName -> paramValues
    assert params.get("CREW_MANDAY_STORE_TIMEZONE") == "CREW_BASE"
    # A few other engine-consumed params that the PG source lacked.
    for key in ("CLIENT_DEFAULT_MAIN_TIME_ZONE_BASE", "DIVIDE_CREW_MANDAY", "SPLIT_DUTY"):
        assert key in params, f"missing operational param {key}"


def test_dictionary_excludes_system_parameters(conn):
    sec = _emit(conn, reference.DICTIONARY)
    keys = {(r[1], r[2]) for r in sec.rows}        # (parentCode, code)
    assert not any(pc == "SYS_PARAM" for pc, _ in keys)
    pc = conn.cursor()
    pc.execute("SELECT COUNT(*) FROM dictionary WHERE parent_code IS DISTINCT FROM 'SYS_PARAM'")
    pg_n = pc.fetchone()[0]
    pc.close()
    assert len(sec.rows) == pg_n


from F8.ro_input_builder import cli


def test_cli_build_p1_emits_all_sections(conn, mysql_conn, tmp_path):
    out = tmp_path / "ro_input.txt"
    cli.build(airline="f8", scenario=6, out_path=str(out), registry_name="p1")
    text = out.read_text()
    for marker in ["------Fleet(", "------Airport(", "------City(",
                   "------CalculationManday(", "------SystemParameter("]:
        assert marker in text


def test_cli_build_p2_emits_crew_sections(conn, mysql_conn, tmp_path):
    out = tmp_path / "ro_input.txt"
    cli.build(airline="f8", scenario=6, out_path=str(out), registry_name="p2")
    text = out.read_text()
    for marker in ["------Crew(", "------CrewOnFlight(", "------CrewCertificate("]:
        assert marker in text
    assert ")(COF):crewId" in text     # COF variant present


def test_cli_build_p3_emits_flight_sections(conn, mysql_conn, tmp_path):
    out = tmp_path / "ro_input.txt"
    cli.build(airline="f8", scenario=6, out_path=str(out), registry_name="p3")
    text = out.read_text()
    for marker in ["------Flight(", "------FlightComposition(", "------Crew(", "------Fleet("]:
        assert marker in text


def test_cli_build_p4_emits_rule_sections(conn, mysql_conn, tmp_path):
    out = tmp_path / "ro_input.txt"
    cli.build(airline="f8", scenario=6, out_path=str(out), registry_name="p4")
    text = out.read_text()
    for marker in ["------RuleSet(", "------Rule(", ")(ALL):", "------Cqf(",
                   "------CqfParameter(", "------Flight("]:
        assert marker in text


def test_cli_build_p5_emits_pairing_sections(conn, mysql_conn, tmp_path):
    out = tmp_path / "ro_input.txt"
    cli.build(airline="f8", scenario=6, out_path=str(out), registry_name="p5")
    text = out.read_text()
    for marker in ["------Pairing(", "------PairingComposition(", "------PairingDuty(",
                   "------PairingDutySegment(", "------PairingDutyNode(", "------Flight("]:
        assert marker in text


def test_cli_build_p6_emits_roster_sections(conn, mysql_conn, tmp_path):
    out = tmp_path / "ro_input.txt"
    cli.build(airline="f8", scenario=6, out_path=str(out), registry_name="p6")
    text = out.read_text()
    for marker in ["------Roster(", "------RosterFlight(", "------RosterGround(",
                   "------Pairing(", "------Flight("]:
        assert marker in text


def test_cli_build_p7_emits_manday_meta_sections(conn, mysql_conn, tmp_path):
    out = tmp_path / "ro_input.txt"
    cli.build(airline="f8", scenario=6, out_path=str(out), registry_name="p7")
    text = out.read_text()
    for marker in ["------CrewMandayFd(", "------CrewMonthManday(", "------Workset(",
                   "------Scenario(", "------FatigueResult(", "------Roster("]:
        assert marker in text
