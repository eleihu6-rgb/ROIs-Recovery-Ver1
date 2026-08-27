import gzip
import io
import pytest
from src.io.job_io import read_input_gz, write_output_gz


SAMPLE_INPUT = b"""\
# PO Engine Input Snapshot
## JOB_PARAMS
workset_id,run_id,engine,airline,start_date,end_date,fleet,division,rule_group_code,base_airports,time_limit_sec,w_pairings,w_deadhead,w_duty_time,w_penalty
99,001,po,f8,2026-05-01,2026-05-31,320,P,CAAC_FTL,"PEK,SHA",300,1000,500,1,100

## RULES
template_code,instance_code,name,category,check_type,severity,overridable,constraint_type,params_json
rest_calculator,REST_STD,Rest Standard,REST,CALC,ERROR,false,LINEAR,"{""minRestMinutes"":600}"

## FLIGHTS
id,airline,flt_dt,flt_num,dep_arp,arv_arp,sch_dep_dt_utc,sch_arv_dt_utc,blk_min,fleet,flt_type,seg_type,is_locked
1001,F8,2026-05-01,F8001,PEK,SHA,2026-05-01T06:00:00Z,2026-05-01T08:00:00Z,120,320,J,,0
"""


def _make_gz(content: bytes) -> bytes:
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb") as f:
        f.write(content)
    return buf.getvalue()


def test_read_input_gz_sections():
    gz_bytes = _make_gz(SAMPLE_INPUT)
    sections = read_input_gz(io.BytesIO(gz_bytes))
    assert "JOB_PARAMS" in sections
    assert "FLIGHTS" in sections
    assert "RULES" in sections


def test_job_params_parsed():
    gz_bytes = _make_gz(SAMPLE_INPUT)
    sections = read_input_gz(io.BytesIO(gz_bytes))
    job = sections["JOB_PARAMS"][0]
    assert job["workset_id"] == "99"
    assert job["airline"] == "f8"
    assert job["rule_group_code"] == "CAAC_FTL"


def test_flights_count():
    gz_bytes = _make_gz(SAMPLE_INPUT)
    sections = read_input_gz(io.BytesIO(gz_bytes))
    assert len(sections["FLIGHTS"]) == 1
    assert sections["FLIGHTS"][0]["flt_num"] == "F8001"


def test_write_output_gz_roundtrip():
    result_sections = {
        "RESULT_META": [{"status": "DONE", "solve_time_sec": "12.3", "total_pairings": "1"}],
        "KPI": [{"total_flights": "2", "coverage_pct": "100.0"}],
        "PAIRINGS": [{"pairing_id": "1", "dep_arp": "PEK", "arv_arp": "PEK"}],
    }
    buf = io.BytesIO()
    write_output_gz(buf, result_sections)
    buf.seek(0)
    back = read_input_gz(buf)
    assert set(back.keys()) == set(result_sections.keys())
    for section, rows in result_sections.items():
        assert len(back[section]) == len(rows)
        for i, expected_row in enumerate(rows):
            assert back[section][i] == expected_row


def test_empty_section_roundtrip():
    """Empty sections must survive write → read roundtrip."""
    sections = {
        "RESULT_META": [{"status": "INFEASIBLE"}],
        "PAIRINGS": [],   # empty
    }
    buf = io.BytesIO()
    write_output_gz(buf, sections)
    buf.seek(0)
    back = read_input_gz(buf)
    assert "PAIRINGS" in back
    assert back["PAIRINGS"] == []
