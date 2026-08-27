"""
Output 接口测试 — 测试向 Live Server 提交 output.gz

覆盖所有 6 种优化器类型:
- PO, RO, TO
- Rule/change_flight, Rule/manday, Rule/manday_byCrew

验证:
- HTTP 请求正确发送到 Mock Live Server 的 output 端点
- 请求 URL 正确
- 请求 body 为 gzip 压缩的二进制数据
- 提交成功后返回 True
- 输出文件不存在时抛出 OutputSubmitError
"""
import gzip
import json
import os
import time

import pytest


def _create_mock_output_gz(working_dir: str, content: str = "mock output data") -> str:
    """在工作目录中创建模拟的 output.gz 文件"""
    output_path = os.path.join(working_dir, "output.gz")
    with gzip.open(output_path, 'wb') as f:
        f.write(content.encode('utf-8'))
    return output_path


class TestPOOutput:
    """PO 优化器 output.gz 提交测试"""

    @pytest.mark.parametrize("airline", ["BR", "F8"])
    def test_po_output_submit_success(self, test_config, airline):
        """PO: 成功提交 output.gz"""
        from src.tasks.task_manager import Task

        task = Task(
            task_id="test-po-out-001",
            airline=airline,
            optimizer_type="PO",
            parameters={"scenarioId": "3896"},
            url=test_config['live_server_url'],
            token="test_token",
        )

        # 创建模拟的 output.gz
        _create_mock_output_gz(task.working_dir, f"PO output for {airline}")

        result = task._submit_output_data()
        assert result is True

        # 验证请求发送到正确端点
        req = test_config['mock_requests'][0]
        assert req['path'].endswith('/api/orengine/po/solution')

        # 验证发送的是二进制数据
        assert isinstance(req['body'], bytes)
        assert len(req['body']) > 0


def _create_scenario_output_gz(working_dir: str) -> str:
    """在工作目录写入有效的 ro-engine output.gz（## SECTION CSV）"""
    output_path = os.path.join(working_dir, "output.gz")
    content = (
        "## RESULT_META\n"
        "status,assignments\n"
        "DONE,412\n"
        "## KPI\n"
        "code,value\n"
        "coverage,0.99\n"
        "## ASSIGNMENTS\n"
        "crew_id,pairing_id\n"
        "F8001,5001\n"
    )
    with gzip.open(output_path, 'wb') as f:
        f.write(content.encode('utf-8'))
    return output_path


def test_parse_output_sections_extracts_kpi_and_meta(tmp_path):
    from src.tasks.task_manager import parse_output_sections

    gz = _create_scenario_output_gz(str(tmp_path))
    sections = parse_output_sections(gz)

    assert sections["RESULT_META"] == [{"status": "DONE", "assignments": "412"}]
    assert sections["KPI"] == [{"code": "coverage", "value": "0.99"}]
    assert sections["ASSIGNMENTS"][0]["crew_id"] == "F8001"


def test_compact_credit_hour_report_matches_report_fields():
    from src.tasks.task_manager import _compact_credit_hour_report

    rows = _compact_credit_hour_report({
        "final_credit_hour_report": [{
            "crew_id": "C001",
            "rank": "FO",
            "credited_hours": 82.5,
            "target_min": 75,
            "target_max": 92,
            "credit_period": "2026RP07",
            "in_range": True,
        }],
        "initial_generator_summary": {
            "credit_hour_report": [{
                "crew_id": "C001",
                "rank": "FO",
                "credited_hours": 80,
                "target_min": 74,
                "target_max": 91,
                "credit_period": "2026RP07",
                "in_range": False,
                "available_days": 31,
                "per_day_rate": 3,
                "period_credit_target": 90,
                "target_gap": 7.5,
                "preassign_rest_days": 2,
                "required_dayoff": 8,
                "actual_dayoff": 9,
                "dayoff_ok": True,
            }],
        },
        "crew_info": {
            "C001": {
                "base": "YVR",
                "preassign_tasks": [
                    {
                        "label": "GDO",
                        "start_time_utc": 1782867600,
                        "end_time_utc": 1782871200,
                    },
                    {
                        "label": "SIM",
                        "start_time_utc": 1783296000,
                        "end_time_utc": 1783299600,
                    },
                    {
                        "label": "OUTSIDE",
                        "start_time_utc": 1785542400,
                        "end_time_utc": 1785546000,
                    },
                ],
            },
        },
    })

    assert rows == [{
        "crew_id": "C001",
        "rank": "FO",
        "credited_hours": 82.5,
        "target_min": 75,
        "target_max": 92,
        "credit_period": "2026RP07",
        "in_range": True,
        "available_days": 31,
        "per_day_rate": 3,
        "period_credit_target": 90,
        "target_gap": 7.5,
        "preassign_rest_days": 2,
        "required_dayoff": 8,
        "actual_dayoff": 9,
        "dayoff_ok": True,
        "base": "YVR",
        "credit_min": 75,
        "credit_max": 92,
        "pre_assigned_types": "GDO ×1, SIM ×1",
    }]


class TestROOutput:
    """RO 优化器结果提交测试（新场景流：metadata JSON + 归档 complete）"""

    def test_legacy_ro_result_notification_includes_credit_report(
        self, test_config, tmp_path
    ):
        """LegacyRO: notify the complete result with the Report credit fields."""
        import json
        from src.tasks.task_manager import Task

        complete_dir = tmp_path / "complete" / "f8" / "623" / "v0" / "run"
        result_dir = complete_dir / "output"
        result_dir.mkdir(parents=True)
        output_path = complete_dir / "output.gz"
        output_path.write_bytes(b"legacy output")
        with gzip.open(complete_dir / "input.gz", 'wb') as f:
            f.write((
                "## scenario\nstr_dt_loc,end_dt_loc\n2026-07-01 00:00:00,2026-07-31 00:00:00\n"
                "## pairing\nid,pairing_label,base,assignment_group,sch_str_dt_utc,sch_end_dt_utc\n"
                "P1,P1 FLY,YVR,FLY,2026-07-01 10:00:00,2026-07-03 04:00:00\n"
            ).encode('utf-8'))
        (result_dir / "result.json").write_text(json.dumps({
            "initial_generator_summary": {
                "credit_hour_report": [{
                    "crew_id": "C001",
                    "rank": "FO",
                    "credited_hours": 80,
                    "target_min": 75,
                    "target_max": 92,
                    "available_days": 31,
                    "period_credit_target": 90,
                    "target_gap": -10,
                    "required_dayoff": 8,
                    "actual_dayoff": 9,
                    "dayoff_ok": True,
                }],
            },
            "final_credit_hour_report": [],
            "crew_info": {"C001": {"base": "YVR", "preassign_tasks": []}},
            "pairing_info": {
                "P1_CA_0": {
                    "original_pairing_id": "P1", "base": "YVR", "assignment_group": "FLY",
                    "rank_composition": {"CA": 1},
                    "start_time_utc": 1751382000.0,
                    "end_time_utc": 1751515200.0,
                },
            },
            "assignment": {"C001": ["P1_CA_0"]},
        }))

        task = Task(
            task_id="test-legacy-ro-credit-001",
            airline="F8",
            optimizer_type="LegacyRO",
            parameters={"scenarioId": "623"},
            url=test_config['live_server_url'],
            token="test_token",
        )
        task.output_file_path = str(output_path)
        task.input_file_path = str(complete_dir / "input.gz")

        task._notify_live_server_result("623")

        payload = json.loads(test_config['mock_requests'][-1]['body_text'])
        row = payload['resultMeta']['credit_hour_report'][0]
        assert row['crew_id'] == 'C001'
        assert row['base'] == 'YVR'
        assert row['credit_min'] == 75
        assert row['available_days'] == 31
        assert row['actual_dayoff'] == 9
        # report-shaped sections ride the LegacyRO callback too, so the gantt
        # Uncovered tab renders the report's exact rows
        assert payload['generalKpi']['credit_hour_report']
        assert payload['schedulingDetails']['pairing_complement']
        assert payload['schedulingDetails']['pairing_complement'][0]['coverage_status'] == 'assigned'

    @pytest.mark.parametrize("airline", ["BR", "F8"])
    def test_ro_output_submit_metadata(self, test_config, temp_workspace, monkeypatch, airline):
        """RO: 解析 output.gz → 归档 complete → 提交 metadata JSON"""
        import json
        from src.tasks.task_manager import Task
        from src.files.file_manager import file_manager as fm_singleton

        monkeypatch.setattr(fm_singleton.paths, "complete_dir", temp_workspace['complete'])

        task = Task(
            task_id="test-ro-out-001",
            airline=airline,
            optimizer_type="RO",
            parameters={"scenarioId": "5432"},
            url=test_config['live_server_url'],
            token="test_token",
        )

        _create_scenario_output_gz(task.working_dir)

        result = task._submit_output_data()
        assert result is True

        req = test_config['mock_requests'][-1]
        assert req['path'].endswith('/api/scenario/result')
        payload = json.loads(req['body_text'])
        assert payload['scenarioId'] == 5432
        assert payload['status'] == 'DONE'
        assert payload['taskId'] == 'test-ro-out-001'
        assert payload['checksum']
        assert payload['kpi'] == [{"code": "coverage", "value": "0.99"}]
        assert payload['resultMeta'] == {"status": "DONE", "assignments": "412"}
        # 归档到 complete，file_path 指向归档后的 output.gz
        assert payload['filePath'].endswith('output.gz')
        assert os.path.isfile(payload['filePath'])

    def test_ro_result_notification_includes_report_shaped_sections(
        self, test_config, temp_workspace, monkeypatch
    ):
        """RO: result.json + input.gz 构建 report-shaped generalKpi/schedulingDetails 回调"""
        import gzip
        from datetime import datetime, timezone
        from src.tasks.task_manager import Task
        from src.files.file_manager import file_manager as fm_singleton

        def _epoch(iso_str):
            return datetime.strptime(iso_str, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc).timestamp()

        monkeypatch.setattr(fm_singleton.paths, "complete_dir", temp_workspace['complete'])

        task = Task(
            task_id="test-ro-report-001",
            airline="F8",
            optimizer_type="RO",
            parameters={"scenarioId": "999"},
            url=test_config['live_server_url'],
            token="test_token",
        )

        _create_scenario_output_gz(task.working_dir)
        # ro_input.gz：## scenario / pairing / crew / pairing_segment
        input_content = (
            "## scenario\n"
            "str_dt_loc,end_dt_loc\n"
            "2026-07-01 00:00:00,2026-07-31 00:00:00\n"
            "## pairing\n"
            "id,pairing_label,base,assignment_group,sch_str_dt_utc,sch_end_dt_utc\n"
            "P1,P1 FLY,YVR,FLY,2026-07-01 10:00:00,2026-07-03 04:00:00\n"
            "R1,R1 RES,YEG,RES,2026-07-02 10:00:00,2026-07-02 20:00:00\n"
            "## crew\n"
            "crew_id,first_name,last_name,seniority_num\n"
            "C001,Jane,Doe,5\n"
            "C002,John,Smith,10\n"
            "## pairing_segment\n"
            "pairing_id,duty_seq,duty_act_str_dt_utc,duty_act_credited_minutes\n"
            "P1,1,2026-07-01 10:00:00,480\n"
            "R1,1,2026-07-02 10:00:00,240\n"
        )
        with gzip.open(os.path.join(task.working_dir, "input.gz"), 'wb') as f:
            f.write(input_content.encode('utf-8'))
        # result.json：带 pairing_info / assignment / crew_info / credit_hour_report
        result_dir = os.path.join(task.working_dir, "output")
        os.makedirs(result_dir, exist_ok=True)
        with open(os.path.join(result_dir, "result.json"), 'w') as f:
            json.dump({
                "pairing_info": {
                    "P1_CA_0": {
                        "original_pairing_id": "P1", "base": "YVR", "assignment_group": "FLY",
                        "rank_composition": {"CA": 1},
                        "start_time_utc": _epoch("2026-07-01 10:00:00"),
                        "end_time_utc": _epoch("2026-07-03 04:00:00"),
                    },
                    "P1_CA_1": {
                        "original_pairing_id": "P1", "base": "YVR", "assignment_group": "FLY",
                        "rank_composition": {"CA": 1},
                        "start_time_utc": _epoch("2026-07-01 10:00:00"),
                        "end_time_utc": _epoch("2026-07-03 04:00:00"),
                    },
                    "R1_FO_0": {
                        "original_pairing_id": "R1", "base": "YEG", "assignment_group": "RES",
                        "rank_composition": {"FO": 1},
                        "start_time_utc": _epoch("2026-07-02 10:00:00"),
                        "end_time_utc": _epoch("2026-07-02 20:00:00"),
                    },
                    "R1_FO_1": {
                        "original_pairing_id": "R1", "base": "YEG", "assignment_group": "RES",
                        "rank_composition": {"FO": 1},
                        "start_time_utc": _epoch("2026-07-02 10:00:00"),
                        "end_time_utc": _epoch("2026-07-02 20:00:00"),
                    },
                },
                "assignment": {"C001": ["P1_CA_0"], "C002": ["R1_FO_0"]},
                "crew_info": {
                    "C001": {"base": "YVR", "rank": "CA", "preassign_tasks": []},
                    "C002": {"base": "YEG", "rank": "FO", "preassign_tasks": []},
                },
                "initial_generator_summary": {
                    "credit_hour_report": [{
                        "crew_id": "C001", "rank": "CA", "credited_hours": 80.0,
                        "target_min": 75, "target_max": 92, "in_range": True,
                    }],
                },
            }, f)

        result = task._submit_output_data()
        assert result is True

        req = test_config['mock_requests'][-1]
        payload = json.loads(req['body_text'])
        # report-shaped sections ride the callback, aligned with the legacy report
        assert payload['generalKpi']['credit_hour_report']
        complement = payload['schedulingDetails']['pairing_complement']
        assert len(complement) == 4
        statuses = {r['coverage_status'] for r in complement}
        assert statuses == {'assigned', 'unassigned'}
        # backward compat: the compact resultMeta.credit_hour_report still flows
        assert payload['resultMeta']['credit_hour_report']

    def test_report_export_cleans_scenario_materials_older_than_three_days(
        self, test_config, tmp_path, monkeypatch
    ):
        """RO report export: copy current materials, then clean old report scenario dirs."""
        from src.tasks.task_manager import Task

        report_dir = tmp_path / "report"
        old_dir = report_dir / "111_20260710_010101"
        recent_dir = report_dir / "222_20260715_010101"
        old_file = report_dir / "legacy-note.txt"
        old_dir.mkdir(parents=True)
        recent_dir.mkdir(parents=True)
        old_file.write_text("do not delete files")
        (old_dir / "stale.txt").write_text("old")
        (recent_dir / "keep.txt").write_text("recent")

        old_time = time.time() - (4 * 24 * 3600)
        recent_time = time.time() - (1 * 24 * 3600)
        os.utime(old_dir, (old_time, old_time))
        os.utime(recent_dir, (recent_time, recent_time))
        os.utime(old_file, (old_time, old_time))

        complete_dir = tmp_path / "complete" / "f8" / "777"
        result_dir = complete_dir / "output"
        result_dir.mkdir(parents=True)
        (complete_dir / "DAYSOFF.csv").write_text("days")
        (complete_dir / "LINE_RULES.csv").write_text("rules")
        (complete_dir / "PAIRING_SCORE.csv").write_text("pairing")
        (complete_dir / "RESERVE_SCORE.csv").write_text("reserve")
        (complete_dir / "ro_input.txt").write_text("ro input")
        (result_dir / "result.json").write_text('{"status":"DONE"}')

        monkeypatch.setenv("PBS_REPORT_SCENARIO_DIR", str(report_dir))

        task = Task(
            task_id="test-report-cleanup-001",
            airline="F8",
            optimizer_type="RO",
            parameters={"scenarioId": "777"},
            url=test_config['live_server_url'],
            token="test_token",
        )

        task._export_to_report_scenario(str(complete_dir), "777")

        exported = [p for p in report_dir.iterdir() if p.name.startswith("777_")]
        assert len(exported) == 1
        assert (exported[0] / "DAYSOFF.csv").read_text() == "days"
        assert (exported[0] / "result.json").read_text() == '{"status":"DONE"}'
        assert not old_dir.exists()
        assert recent_dir.exists()
        assert old_file.exists()


class TestTOOutput:
    """TO 优化器 output.gz 提交测试"""

    @pytest.mark.parametrize("airline", ["BR", "F8"])
    def test_to_output_submit_success(self, test_config, airline):
        """TO: 成功提交 output.gz"""
        from src.tasks.task_manager import Task

        task = Task(
            task_id="test-to-out-001",
            airline=airline,
            optimizer_type="TO",
            parameters={"scenarioId": "9999"},
            url=test_config['live_server_url'],
            token="test_token",
        )

        _create_mock_output_gz(task.working_dir, f"TO output for {airline}")

        result = task._submit_output_data()
        assert result is True

        req = test_config['mock_requests'][0]
        assert req['path'].endswith('/api/orengine/to/solution')


class TestRuleChangeFlightOutput:
    """Rule/change_flight output.gz 提交测试"""

    @pytest.mark.parametrize("airline", ["BR", "F8"])
    def test_change_flight_output_success(self, test_config, airline):
        """Rule/change_flight: 成功提交 output.gz"""
        from src.tasks.task_manager import Task

        task = Task(
            task_id="test-cf-out-001",
            airline=airline,
            optimizer_type="Rule",
            parameters={
                "category": "change_flight",
                "airline": airline,
                "division": "P",
                "fltId": "162906,162218",
            },
            url=test_config['live_server_url'],
            token="test_token",
        )

        _create_mock_output_gz(task.working_dir, f"change_flight output for {airline}")

        result = task._submit_output_data()
        assert result is True

        req = test_config['mock_requests'][0]
        assert req['path'].endswith('/api/orengine/byFlight/save/csv')


class TestRuleMandayOutput:
    """Rule/manday output.gz 提交测试"""

    @pytest.mark.parametrize("airline", ["BR", "F8"])
    def test_manday_output_success(self, test_config, airline):
        """Rule/manday: 成功提交 output.gz"""
        from src.tasks.task_manager import Task

        task = Task(
            task_id="test-md-out-001",
            airline=airline,
            optimizer_type="Rule",
            parameters={
                "category": "manday",
                "startDt": "2025-02-01",
                "endDt": "2025-03-30",
                "division": "P",
            },
            url=test_config['live_server_url'],
            token="test_token",
        )

        _create_mock_output_gz(task.working_dir, f"manday output for {airline}")

        result = task._submit_output_data()
        assert result is True

        req = test_config['mock_requests'][0]
        assert req['path'].endswith('/api/crewMandayFd/partlySave/csv/comp')


class TestRuleMandayByCrewOutput:
    """Rule/manday_byCrew output.gz 提交测试"""

    @pytest.mark.parametrize("airline", ["BR", "F8"])
    def test_manday_byCrew_output_success(self, test_config, airline):
        """Rule/manday_byCrew: 成功提交 output.gz"""
        from src.tasks.task_manager import Task

        task = Task(
            task_id="test-mbc-out-001",
            airline=airline,
            optimizer_type="Rule",
            parameters={
                "category": "manday_byCrew",
                "startDt": "2024-09-12",
                "endDt": "2024-09-30",
                "division": "P",
                "crewIds": "I73313,H47887",
            },
            url=test_config['live_server_url'],
            token="test_token",
        )

        _create_mock_output_gz(task.working_dir, f"manday_byCrew output for {airline}")

        result = task._submit_output_data()
        assert result is True

        req = test_config['mock_requests'][0]
        assert req['path'].endswith('/api/crewMandayFd/partlySave/csv/comp')


class TestOutputErrorPaths:
    """Output 提交错误路径测试"""

    def test_output_file_not_exists(self, test_config):
        """output.gz 文件不存在时应抛出 OutputSubmitError"""
        from src.tasks.task_manager import Task
        from src.exceptions import OutputSubmitError

        task = Task(
            task_id="test-out-err-001",
            airline="BR",
            optimizer_type="PO",
            parameters={"scenarioId": "1234"},
            url=test_config['live_server_url'],
            token="test_token",
        )
        # 不创建 output.gz 文件

        with pytest.raises(OutputSubmitError, match="Output file does not exist"):
            task._submit_output_data()

    def test_server_integration_disabled_skips_submit(self, test_config):
        """server_integration=False 时应跳过提交"""
        from src.tasks.task_manager import Task
        from src.config.config import config_manager

        po_config = config_manager.get_optimizer_config("BR", "PO")
        original = po_config.server_integration
        po_config.server_integration = False

        try:
            task = Task(
                task_id="test-out-skip-001",
                airline="BR",
                optimizer_type="PO",
                parameters={"scenarioId": "1234"},
                url=test_config['live_server_url'],
                token="test_token",
            )

            result = task._submit_output_data()
            assert result is False
            assert len(test_config['mock_requests']) == 0
        finally:
            po_config.server_integration = original

    def test_output_submit_to_unreachable_server(self, test_config):
        """Live Server 不可达时应抛出 OutputSubmitError"""
        from src.tasks.task_manager import Task
        from src.exceptions import OutputSubmitError

        task = Task(
            task_id="test-out-err-002",
            airline="BR",
            optimizer_type="PO",
            parameters={"scenarioId": "1234"},
            url="http://127.0.0.1:1",  # 不可达
            token="test_token",
        )
        _create_mock_output_gz(task.working_dir)

        with pytest.raises(OutputSubmitError, match="Failed to submit output.gz"):
            task._submit_output_data()


class TestOutputDataIntegrity:
    """Output 数据完整性测试"""

    def test_output_data_is_gzip(self, test_config):
        """验证提交到 Live Server 的数据确实是 gzip 格式"""
        from src.tasks.task_manager import Task

        task = Task(
            task_id="test-integrity-001",
            airline="BR",
            optimizer_type="PO",
            parameters={"scenarioId": "1234"},
            url=test_config['live_server_url'],
            token="test_token",
        )

        original_content = "This is test output data with special chars: 中文测试"
        _create_mock_output_gz(task.working_dir, original_content)
        task._submit_output_data()

        req = test_config['mock_requests'][0]
        # gzip magic number: 0x1f 0x8b
        assert req['body'][:2] == b'\x1f\x8b'

        # 解压验证内容完整
        decompressed = gzip.decompress(req['body']).decode('utf-8')
        assert decompressed == original_content
