"""
End-to-end integration test: 4 flights forming 2 round trips → 2 pairings, 100% coverage.
This test verifies the full pipeline without any HTTP calls.
"""
import gzip
import io
from src.optimizer.pipeline import OptimizationPipeline
from src.io.job_io import read_input_gz


SAMPLE_INPUT_GZ_TEXT = """\
## JOB_PARAMS
workset_id,run_id,engine,airline,start_date,end_date,fleet,division,rule_group_code,base_airports,time_limit_sec,w_pairings,w_deadhead,w_duty_time,w_penalty
99,001,po,f8,2026-05-01,2026-05-01,320,P,CAAC_FTL,PEK,60,1000,500,1,100

## RULE_CONFIG_META
group_code,group_name,usage,filiale,division
CAAC_FTL,CCAR-121 FTL,PO,F8,P

## RULES
template_code,instance_code,name,category,check_type,severity,overridable,constraint_type,params_json
rest_calculator,REST_STD,Rest,REST,CALC,ERROR,false,LINEAR,"{""minRestMinutes"":600}"
duty_time_calculator,DUTY_STD,Duty,DUTY,CALC,ERROR,false,LINEAR,"{""maxDutyMinutes"":840,""maxConsecutiveDutyDays"":7}"
flight_time_calculator,FLT_STD,FltTime,FLIGHT_TIME,CALC,ERROR,false,LINEAR,"{""maxFlightTimePerDutyMinutes"":600,""cumulativeLimits"":{""7"":2400}}"

## OPERATIONAL_PARAMS
param_key,param_value
defaultMctMinutes,60
briefMinutes,60
debriefMinutes,30
maxPairingDays,5
maxTafbMinutes,4320

## FLIGHTS
id,airline,flt_dt,flt_num,dep_arp,arv_arp,sch_dep_dt_utc,sch_arv_dt_utc,blk_min,fleet,flt_type,seg_type,is_locked
1,F8,2026-05-01,F8001,PEK,SHA,2026-05-01T06:00:00Z,2026-05-01T08:00:00Z,120,320,J,,0
2,F8,2026-05-01,F8002,SHA,PEK,2026-05-01T10:00:00Z,2026-05-01T12:00:00Z,120,320,J,,0
3,F8,2026-05-01,F8003,PEK,CTU,2026-05-01T07:00:00Z,2026-05-01T09:30:00Z,150,320,J,,0
4,F8,2026-05-01,F8004,CTU,PEK,2026-05-01T11:00:00Z,2026-05-01T13:30:00Z,150,320,J,,0
"""


def _make_input_gz(text: str) -> bytes:
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb") as f:
        f.write(text.encode("utf-8"))
    return buf.getvalue()


def test_pipeline_full_coverage():
    gz_bytes = _make_input_gz(SAMPLE_INPUT_GZ_TEXT)
    sections = read_input_gz(io.BytesIO(gz_bytes))

    pipeline = OptimizationPipeline()
    result = pipeline.run(sections)

    assert result["RESULT_META"][0]["status"] in ("DONE", "TIMEOUT")
    kpi = {row["metric_name"]: row["metric_value"] for row in result["KPI"]}
    assert float(kpi["coverage_pct"]) == 100.0


def test_pipeline_produces_output_sections():
    gz_bytes = _make_input_gz(SAMPLE_INPUT_GZ_TEXT)
    sections = read_input_gz(io.BytesIO(gz_bytes))

    pipeline = OptimizationPipeline()
    result = pipeline.run(sections)

    assert "RESULT_META" in result
    assert "KPI" in result
    assert "PAIRINGS" in result
    assert "DUTIES" in result
    assert "SEGMENTS" in result


def test_pipeline_correct_pairing_count():
    gz_bytes = _make_input_gz(SAMPLE_INPUT_GZ_TEXT)
    sections = read_input_gz(io.BytesIO(gz_bytes))

    pipeline = OptimizationPipeline()
    result = pipeline.run(sections)

    kpi = {row["metric_name"]: row["metric_value"] for row in result["KPI"]}
    assert int(kpi["total_pairings"]) == 2  # PEK-SHA-PEK and PEK-CTU-PEK
