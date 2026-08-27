import gzip, io
from src.io.job_io import read_input_gz, write_output_gz


def _make_gz(text: str) -> io.BytesIO:
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb") as gz:
        gz.write(text.encode())
    buf.seek(0)
    return buf


def test_read_single_section():
    gz = _make_gz("## CREWS\ncrew_id,rank\nC001,CA\nC002,FO\n")
    sections = read_input_gz(gz)
    assert "CREWS" in sections
    assert len(sections["CREWS"]) == 2
    assert sections["CREWS"][0]["crew_id"] == "C001"
    assert sections["CREWS"][1]["rank"] == "FO"


def test_read_multiple_sections():
    gz = _make_gz("## CREWS\ncrew_id\nC001\n## PAIRINGS\npairing_id\n1\n")
    sections = read_input_gz(gz)
    assert set(sections.keys()) == {"CREWS", "PAIRINGS"}


def test_read_skips_comments():
    gz = _make_gz("## CREWS\n# comment\ncrew_id\nC001\n")
    sections = read_input_gz(gz)
    assert sections["CREWS"][0]["crew_id"] == "C001"


def test_write_roundtrip():
    original = {
        "RESULT_META": [{"status": "DONE", "solve_time_sec": "12.3"}],
        "ASSIGNMENTS": [{"crew_id": "C001", "pairing_id": "42"}],
    }
    buf = io.BytesIO()
    write_output_gz(buf, original)
    buf.seek(0)
    recovered = read_input_gz(buf)
    assert recovered["RESULT_META"][0]["status"] == "DONE"
    assert recovered["ASSIGNMENTS"][0]["pairing_id"] == "42"


def test_empty_section_roundtrip():
    original = {"KPI": [], "ASSIGNMENTS": [{"crew_id": "X", "pairing_id": "1"}]}
    buf = io.BytesIO()
    write_output_gz(buf, original)
    buf.seek(0)
    recovered = read_input_gz(buf)
    assert recovered.get("KPI", []) == []
    assert len(recovered["ASSIGNMENTS"]) == 1
